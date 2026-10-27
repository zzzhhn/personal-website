export type IbdUnit = 'coil' | 'piece' | 'carton';
export type IbdTool = 'visual' | 'tag-reader' | 'gauge' | 'flashlight' | 'scale' | 'opener' | 'crane' | 'trolley' | 'turntable';
export type IbdQuality = 'quality-front' | 'quality-rear' | 'quality-contents';
export type IbdAspect = 'identity' | 'quantity' | 'specification' | IbdQuality;
export interface IbdItem {
  readonly id: string; readonly lotId: string; readonly kind: 'coil' | 'hardware-pack';
  readonly specId: string; readonly quantity: number; readonly unit: Exclude<IbdUnit, 'carton'>;
  readonly grossKg: number; readonly blockedBy: readonly string[];
  readonly package?: { readonly outerId: string; readonly declaredUnits: number; readonly declaredSpecId: string };
  readonly qualityChecks: readonly IbdQuality[];
  readonly defects: Readonly<Partial<Record<IbdQuality, string>>>;
}
export interface IbdLine { readonly lotId: string; readonly specId: string; readonly quantity: number; readonly unit: IbdUnit }
export interface IbdCase {
  readonly id: string; readonly items: readonly IbdItem[];
  readonly inventory: readonly IbdLine[]; readonly waybill: readonly IbdLine[];
}
export interface IbdState {
  readonly caseId: string; readonly moved: readonly string[]; readonly turned: readonly string[];
  readonly opened: readonly string[]; readonly weighed: readonly string[]; readonly loaded: readonly string[];
  readonly proofs: Readonly<Record<string, readonly IbdAspect[]>>; readonly shipmentConfirmed: boolean;
}
export type IbdEvent =
  | { readonly type: 'inspect'; readonly itemId: string; readonly aspect: IbdAspect; readonly tool: IbdTool; readonly viewpoint: 'floor' | 'catwalk' }
  | { readonly type: 'move'; readonly itemId: string; readonly tool: IbdTool; readonly destination: 'inspection-bay' | 'storage' }
  | { readonly type: 'open' | 'turn' | 'weigh' | 'load'; readonly itemId: string; readonly tool: IbdTool }
  | { readonly type: 'unload'; readonly itemId: string }
  | { readonly type: 'confirm-shipment' };
export interface IbdTransition { readonly state: IbdState; readonly code: string; readonly readingKg?: number }

export function createIbdState(scenario: IbdCase): IbdState {
  const ids = new Set(scenario.items.map(item => item.id));
  const cartons = scenario.items.flatMap(item => item.package ? [item.package.outerId] : []);
  // Pilot scope: each hardware pack is one outer carton containing counted pieces.
  if (new Set(cartons).size !== cartons.length) throw new TypeError('Duplicate physical carton');
  if (!scenario.id || ids.size !== scenario.items.length || scenario.items.some(item =>
    !item.id || !Number.isInteger(item.quantity) || item.quantity < 0 || !Number.isFinite(item.grossKg) || item.grossKg < 0 ||
    item.blockedBy.some(id => id === item.id || !ids.has(id)) || item.qualityChecks.length === 0))
    throw new TypeError('Invalid IBD case items');
  for (const lines of [scenario.inventory, scenario.waybill]) {
    const keys = lines.map(line => `${line.lotId}|${line.specId}|${line.unit}`);
    if (new Set(keys).size !== keys.length || lines.some(line => !Number.isInteger(line.quantity) || line.quantity < 0))
      throw new TypeError('Invalid IBD manifest');
  }
  return { caseId: scenario.id, moved: [], turned: [], opened: [], weighed: [], loaded: [], proofs: {}, shipmentConfirmed: false };
}
const add = <T>(values: readonly T[], value: T): readonly T[] => values.includes(value) ? values : [...values, value];
const without = (values: readonly string[], value: string): readonly string[] => values.filter(id => id !== value);
const visible = (item: IbdItem, state: IbdState, viewpoint: 'floor' | 'catwalk') =>
  state.loaded.includes(item.id) || viewpoint === 'catwalk' || item.blockedBy.every(id => state.moved.includes(id) || state.loaded.includes(id));
const required = (item: IbdItem): readonly IbdAspect[] => ['identity', 'quantity', 'specification', ...item.qualityChecks];

// Events describe completed, reachable world interactions. This module does not verify physical contact.
export function transitionIbd(scenario: IbdCase, state: IbdState, event: IbdEvent): IbdTransition {
  const fail = (code: string): IbdTransition => ({ state, code });
  if (state.caseId !== scenario.id) return fail('case-mismatch');
  if (event.type === 'confirm-shipment') return { state: { ...state, shipmentConfirmed: true }, code: 'shipment-confirmed' };
  const item = scenario.items.find(item => item.id === event.itemId);
  if (!item) return fail('unknown-item');
  if (event.type === 'unload') {
    if (!state.loaded.includes(item.id)) return fail('not-loaded');
    return { state: { ...state, loaded: without(state.loaded, item.id), moved: add(state.moved, item.id), shipmentConfirmed: false }, code: 'unloaded' };
  }
  const viewpoint = event.type === 'inspect' ? event.viewpoint : 'floor';
  if (!visible(item, state, viewpoint)) return fail('occluded');
  if (event.type === 'inspect') {
    if (!required(item).includes(event.aspect)) return fail('irrelevant-aspect');
    if ((event.aspect === 'identity' && !['tag-reader', 'flashlight'].includes(event.tool)) ||
        (event.aspect === 'quantity' && event.tool !== 'visual') ||
        (event.aspect === 'specification' && event.tool !== 'gauge') ||
        (event.aspect.startsWith('quality-') && event.tool !== 'flashlight')) return fail('wrong-tool');
    if (item.package && event.aspect !== 'identity' && !state.opened.includes(item.id)) return fail('package-sealed');
    if (event.aspect === 'quality-rear' && viewpoint !== 'catwalk' && !state.turned.includes(item.id)) return fail('turn-or-change-view');
    const proofs = { ...state.proofs, [item.id]: add(state.proofs[item.id] ?? [], event.aspect) };
    return { state: { ...state, proofs }, code: 'observed' };
  }
  if (event.type === 'weigh') {
    if (event.tool !== 'scale') return fail('wrong-tool');
    return { state: { ...state, weighed: add(state.weighed, item.id) }, code: 'weight-is-clue', readingKg: item.grossKg };
  }
  if (event.type === 'open') {
    if (!item.package) return fail('not-a-package');
    if (event.tool !== 'opener') return fail('wrong-tool');
    return { state: { ...state, opened: add(state.opened, item.id) }, code: 'package-opened' };
  }
  if (event.type === 'turn') {
    if (event.tool !== 'turntable' || item.kind !== 'coil') return fail('wrong-tool');
    if (state.loaded.includes(item.id)) return fail('unload-first');
    return { state: { ...state, turned: add(state.turned, item.id) }, code: 'turned' };
  }
  if (event.tool !== (item.kind === 'coil' ? 'crane' : 'trolley')) return fail('wrong-tool');
  if (event.type === 'move') {
    if (state.loaded.includes(item.id)) return fail('unload-first');
    return { state: { ...state, moved: event.destination === 'inspection-bay' ? add(state.moved, item.id) : without(state.moved, item.id) }, code: 'moved' };
  }
  if (state.loaded.includes(item.id)) return fail('already-loaded');
  return { state: { ...state, loaded: add(state.loaded, item.id), shipmentConfirmed: false }, code: 'loaded' };
}

export interface IbdFinding {
  readonly code: 'quantity-difference' | 'unexpected-specification' | 'condition-difference';
  readonly itemId?: string; readonly specId?: string; readonly unit?: IbdUnit;
  readonly expected?: number; readonly actual?: number; readonly detail?: string;
}
export interface IbdAssessment {
  readonly status: 'insufficient' | 'in-progress' | 'clear' | 'different';
  readonly missing: readonly { readonly itemId: string; readonly aspects: readonly IbdAspect[] }[];
  readonly findings: readonly IbdFinding[];
}
// Cartons and their contents are separate units, never summed into one number.
export function measureIbd(items: readonly IbdItem[], line: IbdLine): number {
  const matching = items.filter(item => item.lotId === line.lotId && item.specId === line.specId);
  if (line.unit === 'carton') return new Set(matching.flatMap(item => item.package ? [item.package.outerId] : [])).size;
  return matching.filter(item => item.unit === line.unit).reduce((sum, item) => sum + item.quantity, 0);
}

function assessItems(items: readonly IbdItem[], lines: readonly IbdLine[], state: IbdState): IbdAssessment {
  const missing = items.map(item => ({ itemId: item.id,
    aspects: required(item).filter(aspect => !(state.proofs[item.id] ?? []).includes(aspect)) })).filter(entry => entry.aspects.length);
  if (missing.length) return { status: 'insufficient', missing, findings: [] };
  const findings: IbdFinding[] = [];
  for (const line of lines) {
    const actual = measureIbd(items, line);
    if (actual !== line.quantity) findings.push({ code: 'quantity-difference', specId: line.specId, unit: line.unit, expected: line.quantity, actual });
  }
  for (const item of items) {
    if (!lines.some(line => line.lotId === item.lotId && line.specId === item.specId &&
        (line.unit === item.unit || (line.unit === 'carton' && item.package))))
      findings.push({ code: 'unexpected-specification', itemId: item.id, specId: item.specId });
    for (const aspect of item.qualityChecks) {
      const detail = item.defects[aspect];
      if (detail) findings.push({ code: 'condition-difference', itemId: item.id, detail });
    }
  }
  return { status: findings.length ? 'different' : 'clear', missing, findings };
}
export function assessIbd(scenario: IbdCase, state: IbdState) {
  if (scenario.id !== state.caseId) throw new TypeError('IBD case mismatch');
  const inventory = assessItems(scenario.items, scenario.inventory, state);
  const loaded = scenario.items.filter(item => state.loaded.includes(item.id));
  const shipment: IbdAssessment = state.shipmentConfirmed ? assessItems(loaded, scenario.waybill, state) :
    { status: 'in-progress', missing: [], findings: [] };
  const status = inventory.status === 'different' || shipment.status === 'different' ? 'different' :
    inventory.status === 'clear' && shipment.status === 'clear' ? 'clear' : 'insufficient';
  return { status, inventory, shipment } as const;
}
