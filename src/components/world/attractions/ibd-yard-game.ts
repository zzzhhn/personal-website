import { IBD_ALL_CLEAR, IBD_CASES } from './ibd-cases.ts';
import { assessIbd, createIbdState, transitionIbd, type IbdCase, type IbdItem, type IbdState, type IbdEvent, type IbdAspect } from './ibd-model.ts';
import { IBD_STOCK_KEYS, isIbdStockKey, ibdReach, ibdStation, type IbdPackStation, type IbdSlot, type IbdStationId } from './ibd-yard-layout.ts';
import { createIbdPackInspection, ibdPackInspectionComplete, reduceIbdPackInspection, type IbdPackInspection, type IbdPackInspectionEvent } from './ibd-pack-inspection.ts';
import { createIbdStock, ibdStockItem, type IbdStockState } from './ibd-stock.ts';

export type IbdVerdict = 'matches' | 'short' | 'wrong-spec' | 'sound' | 'rear-damage';
export type IbdActionKind = 'brief' | 'kit' | 'crane' | 'scan' | 'rear' | 'survey' | 'turn' | 'weigh' | 'open' | 'contents' | 'judge'
  | 'load' | 'unload' | 'replace' | 'select-stock' | 'return-stock' | 'verify' | 'release' | 'reset' | 'next';
export interface IbdAction { kind: IbdActionKind; station: IbdStationId; slot?: IbdSlot; itemId?: string; round?: number; verdict?: IbdVerdict }
export interface IbdExchange { slot: IbdSlot; original: IbdItem; proofs: readonly IbdAspect[]; replacementId: string }
export interface IbdYardGame {
  caseIndex: number; round: number; revision: number; started: boolean; equipped: boolean;
  core: IbdState; exchanges: readonly IbdExchange[]; stock: IbdStockState; released: boolean;
  judgements: Readonly<Record<string, IbdVerdict>>;
  packInspections: Readonly<Record<string, IbdPackInspection>>;
  pending: { action: IbdAction; token: number; seconds: number } | null;
  notice: string; reading?: number; completedAction?: IbdAction;
}
export interface IbdActor { local: readonly number[]; active: boolean; paused?: boolean; hidden?: boolean; driving?: boolean }
export function createIbdYardGame(caseIndex = 0, round = 1): IbdYardGame {
  const index = ((caseIndex % IBD_CASES.length) + IBD_CASES.length) % IBD_CASES.length;
  return { caseIndex: index, round, revision: 0, started: false, equipped: false, core: createIbdState(IBD_CASES[index]),
    exchanges: [], stock: createIbdStock(), judgements: {}, packInspections: {}, released: false, pending: null, notice: 'welcome' };
}
export function yardItemId(game: IbdYardGame, slot: IbdSlot): string {
  if (slot === 'parts-b' && game.stock.assigned) return ibdStockItem(game.round, game.caseIndex, game.stock.assigned).id;
  return game.exchanges.find(e => e.slot === slot)?.replacementId ?? slot;
}
/** Main shipment facts follow the assigned physical carton; quarantined originals keep their evidence. */
export function yardCase(game: IbdYardGame): IbdCase {
  const source = IBD_CASES[game.caseIndex];
  return { ...source, items: source.items.map(original => {
    const slot = original.id as IbdSlot, exchange = game.exchanges.find(e => e.slot === slot);
    const selected = slot === 'parts-b' && game.stock.assigned ? ibdStockItem(game.round, game.caseIndex, game.stock.assigned) : undefined;
    const item = selected ?? (exchange ? IBD_ALL_CLEAR.items.find(i => i.id === slot)! : original);
    return { ...item, id: yardItemId(game, slot), blockedBy: item.blockedBy.map(id => yardItemId(game, id as IbdSlot)),
      package: item.package && { ...item.package, outerId: exchange ? `${item.package.outerId}:replacement` : item.package.outerId } };
  }) };
}
/** A reserve has one physical location: its home bench until assigned to the shipment bench. */
export function yardPackItem(game: IbdYardGame, station: IbdPackStation): IbdItem | undefined {
  if (isIbdStockKey(station)) return game.stock.assigned === station ? undefined : ibdStockItem(game.round, game.caseIndex, station);
  if (station === 'parts-b' && game.stock.requested) return undefined;
  return yardCase(game).items.find(item => item.id === yardItemId(game, station));
}
export function yardItemComplete(game: IbdYardGame, slot: IbdSlot): boolean {
  if (slot === 'parts-b' && game.stock.requested) return false;
  const item = yardCase(game).items.find(i => i.id === yardItemId(game, slot))!;
  return ['identity', 'quantity', 'specification', ...item.qualityChecks].every(p => (game.core.proofs[item.id] ?? []).includes(p as IbdAspect));
}
export function yardItemDifferent(game: IbdYardGame, slot: IbdSlot): boolean {
  if (slot === 'parts-b' && game.stock.requested) return false;
  const verdict = game.judgements?.[yardItemId(game, slot)];
  return !!verdict && !['matches', 'sound'].includes(verdict);
}
export function yardItemJudged(game: IbdYardGame, slot: IbdSlot): boolean {
  return yardItemComplete(game, slot) && !!game.judgements?.[yardItemId(game, slot)];
}
/** Truth is derived from the cargo fixtures, never persisted as a second case state. */
function yardExpectedVerdict(game: IbdYardGame, slot: IbdSlot): IbdVerdict {
  const item = yardCase(game).items.find(i => i.id === yardItemId(game, slot))!;
  const expected = IBD_ALL_CLEAR.items.find(i => i.id === slot)!;
  if (item.kind === 'coil') return item.defects['quality-rear'] ? 'rear-damage' : 'sound';
  return item.specId !== expected.specId ? 'wrong-spec' : item.quantity < expected.quantity ? 'short' : 'matches';
}
export function yardActions(game: IbdYardGame, id: IbdStationId): IbdAction[] {
  if(id==='stock-room')return [];
  const s = ibdStation(id, game.core.moved), slot = s.slot, itemId = slot ? yardItemId(game, slot) : '';
  const action = (kind: IbdActionKind): IbdAction => ({ kind, station: id, ...(slot ? { slot } : {}),
    ...(kind === 'judge' ? { itemId, round: game.round } : {}) });
  if (id === 'manifest') return [action('brief'), ...(game.started ? [action('reset'), action('next')] : [])];
  if (id === 'dispatch' && game.released) return [action('next')];
  if (!game.started || game.released) return [];
  if (id === 'kit') return game.equipped ? [] : [action('kit')];
  if (!game.equipped) return [];
  if (id === 'crane') return game.core.moved.includes(yardItemId(game, 'coil-front')) ? [] : [action('crane')];
  if (isIbdStockKey(id)) {
    const item = yardPackItem(game, id);
    if (!game.stock.requested || !item) return [];
    return [{ kind: game.core.opened.includes(item.id) ? 'contents' : 'open', station: id, itemId: item.id, round: game.round },
      { kind: 'select-stock', station: id, slot: 'parts-b', itemId: item.id, round: game.round }];
  }
  if (slot === 'parts-b' && game.stock.requested) return [];
  if (id.startsWith('gallery')) return [action('survey')];
  if (id.startsWith('turn')) return game.core.turned.includes(itemId) ? [] : [action('turn')];
  if (id.startsWith('scale')) return game.core.loaded.includes(itemId) ? [] : [action('weigh')];
  if (id.startsWith('load')) return game.core.loaded.includes(itemId) ? [] : [action('load')];
  if (id.startsWith('truck')) return game.core.loaded.includes(itemId) ? [action('unload')] : [];
  if (id === 'dispatch') return [action(yardAllJudged(game) && assessIbd(yardCase(game), game.core).status === 'clear' ? 'release' : 'verify')];
  if (slot && game.core.loaded.includes(itemId)) return [];
  if (slot && yardItemComplete(game, slot) && !yardItemJudged(game, slot)) return [action('judge')];
  if (slot && yardItemJudged(game, slot)) return yardItemDifferent(game, slot)
    ? [game.stock.assigned && slot === 'parts-b' ? { ...action('return-stock'), itemId, round: game.round } : action('replace')] : [];
  const primary: IbdActionKind = id.startsWith('parts') ? game.core.opened.includes(itemId) ? 'contents' : 'open'
    : game.core.turned.includes(itemId) || ((game.core.proofs[itemId] ?? []).includes('quality-front') && !yardItemComplete(game, slot!)) ? 'rear' : 'scan';
  return [action(primary)];
}
const duration: Record<IbdActionKind, number> = { brief: 0, kit: .65, crane: 6.6, scan: 3.1, rear: 3.1, survey: 1.3,
  turn: 1.4, weigh: .8, open: .9, contents: 1.2, judge: 0, load: 3, unload: 3, replace: 2.4, 'select-stock': 5, 'return-stock': 5,
  verify: .7, release: 3.5, reset: 0, next: 0 };
const yardAllJudged = (game: IbdYardGame) => !game.stock.requested && yardCase(game).items.every(item => !!game.judgements?.[item.id]);
const observations = new Set<IbdActionKind>(['scan', 'rear', 'survey', 'contents', 'weigh', 'open', 'kit', 'verify']);
/** Transport invalidates every local observation of this same carton. */
function clearPackEvidence(game: IbdYardGame, itemId: string): Pick<IbdYardGame, 'core' | 'packInspections' | 'judgements'> {
  const proofs = { ...game.core.proofs }, packInspections = { ...game.packInspections }, judgements = { ...game.judgements };
  delete proofs[itemId]; delete packInspections[itemId]; delete judgements[itemId];
  return { core: { ...game.core, proofs, opened: game.core.opened.filter(id => id !== itemId),
    weighed: game.core.weighed.filter(id => id !== itemId), moved: game.core.moved.filter(id => id !== itemId),
    turned: game.core.turned.filter(id => id !== itemId), loaded: game.core.loaded.filter(id => id !== itemId), shipmentConfirmed: false },
    packInspections, judgements };
}
/** User cancellation is for unfinished local work; moving cargo keeps its existing interlock. */
export function canCancelIbdObservation(game: IbdYardGame): boolean {
  return Object.values(game.packInspections).some(inspection => inspection.held !== null)
    || (!!game.pending && observations.has(game.pending.action.kind));
}
function perform(game: IbdYardGame, action: IbdAction): { game: IbdYardGame; ok: boolean } {
  const scenario = yardCase(game), itemId = isIbdStockKey(action.station) ? yardPackItem(game, action.station)?.id ?? ''
    : action.slot ? yardItemId(game, action.slot) : '';
  const fail = (notice: string) => ({ game: { ...game, notice }, ok: false });
  const done = (notice: string, change: Partial<IbdYardGame> = {}) => ({ game: { ...game, ...change, notice, completedAction: action }, ok: true });
  if (action.kind === 'reset' || action.kind === 'next') {
    const next = action.kind === 'next';
    return { game: { ...createIbdYardGame(game.caseIndex + (next ? 1 : 0), game.round + 1), revision: game.revision + 1,
      ...(next ? { started: true, equipped: game.equipped, notice: 'manifest', completedAction: action } : {}) }, ok: true };
  }
  if (action.kind === 'brief') return done('manifest', { started: true });
  if (action.kind === 'kit') return done('equipped', { equipped: true });
  if (action.kind === 'select-stock') {
    if (!isIbdStockKey(action.station) || !game.stock.requested || !itemId || action.itemId !== itemId || action.round !== game.round)
      return fail('action-unavailable');
    return done('stock-selected', { ...clearPackEvidence(game, itemId),
      stock: { ...game.stock, requested: false, assigned: action.station } });
  }
  if (action.kind === 'return-stock') {
    if (action.slot !== 'parts-b' || !game.stock.assigned || action.itemId !== itemId || action.round !== game.round
      || !yardItemJudged(game, 'parts-b') || !yardItemDifferent(game, 'parts-b')) return fail('no-proven-difference');
    if (game.core.loaded.includes(itemId)) return fail('unload-first');
    return done('stock-returned', { ...clearPackEvidence(game, itemId),
      stock: { ...game.stock, requested: true, assigned: null } });
  }
  if (isIbdStockKey(action.station)) {
    if (!game.stock.requested || !itemId) return fail('action-unavailable');
    if (action.kind === 'open') return done('open', { core: { ...game.core, opened: [...new Set([...game.core.opened, itemId])] } });
    if (action.kind === 'contents') return game.packInspections[itemId] && ibdPackInspectionComplete(game.packInspections[itemId])
      ? done('contents') : fail('pack-inspection-incomplete');
    return fail('action-unavailable');
  }
  if (action.kind === 'judge') {
    if (!action.slot || !yardItemComplete(game, action.slot)) return fail('judgement-evidence-missing');
    if (!action.verdict) return fail('judgement-needed');
    const expected = yardExpectedVerdict(game, action.slot);
    if (action.verdict !== expected) return fail(`judgement-retry-${expected}`);
    return done(['matches', 'sound'].includes(expected) ? 'judgement-clear' : 'judgement-different',
      { judgements: { ...game.judgements, [itemId]: action.verdict } });
  }
  if (action.kind === 'turn' && !(game.core.proofs[itemId] ?? []).includes('quality-front')) return fail('front-first');
  if (action.kind === 'release') return yardAllJudged(game) && assessIbd(scenario, game.core).status === 'clear' ? done('released', { released: true }) : fail('not-cleared');
  if (action.kind === 'verify' && !yardAllJudged(game)) return done('judgement-missing');
  if (action.kind === 'replace') {
    if (!action.slot || !yardItemJudged(game, action.slot) || !yardItemDifferent(game, action.slot)) return fail('no-proven-difference');
    if (game.core.loaded.includes(itemId)) return fail('unload-first');
    if (action.slot === 'parts-b') {
      if (game.stock.originalReturned || game.stock.assigned) return fail('action-unavailable');
      const packInspections = { ...game.packInspections }; delete packInspections[itemId];
      return done('stock-requested', { stock: { originalReturned: true, requested: true, assigned: null },
        core: { ...game.core, shipmentConfirmed: false, opened: game.core.opened.filter(id => id !== itemId) }, packInspections });
    }
    if (action.slot === 'coil-rear' && !game.core.moved.includes(yardItemId(game, 'coil-front'))) return fail('clear-exchange-lane');
    const original = scenario.items.find(i => i.id === itemId)!;
    const replacementId = `${action.slot}:replacement`;
    const exchanges = [...game.exchanges, { slot: action.slot, original, proofs: game.core.proofs[itemId], replacementId }];
    const core = { ...game.core, shipmentConfirmed: false, moved: game.core.moved.map(id => id === itemId ? replacementId : id) };
    const packInspections = { ...game.packInspections }; delete packInspections[itemId]; delete packInspections[replacementId];
    return done('replaced', { exchanges, core, packInspections });
  }
  if (action.kind === 'contents' && (!game.packInspections[itemId] || !ibdPackInspectionComplete(game.packInspections[itemId])))
    return fail('pack-inspection-incomplete');
  const events: IbdEvent[] = [];
  const observe = (aspect: IbdAspect, tool: 'visual' | 'tag-reader' | 'gauge' | 'flashlight') =>
    events.push({ type: 'inspect', itemId, aspect, tool, viewpoint: action.kind === 'survey' ? 'catwalk' : 'floor' });
  if (action.kind === 'scan' || action.kind === 'contents' || action.kind === 'survey') {
    observe('identity', 'tag-reader'); observe('quantity', 'visual'); observe('specification', 'gauge');
    observe(action.kind === 'contents' ? 'quality-contents' : 'quality-front', 'flashlight');
    if (action.kind === 'survey') observe('quality-rear', 'flashlight');
  } else if (action.kind === 'rear') observe('quality-rear', 'flashlight');
  else if (action.kind === 'crane') events.push({ type: 'move', itemId: yardItemId(game, 'coil-front'), tool: 'crane', destination: 'inspection-bay' });
  else if (action.kind === 'verify') events.push({ type: 'confirm-shipment' });
  else if (action.kind === 'unload') events.push({ type: 'unload', itemId });
  else if (['turn', 'weigh', 'open', 'load'].includes(action.kind)) events.push({ type: action.kind as 'turn' | 'weigh' | 'open' | 'load', itemId,
    tool: action.kind === 'turn' ? 'turntable' : action.kind === 'weigh' ? 'scale' : action.kind === 'open' ? 'opener' : 'trolley' });
  let core = game.core, reading: number | undefined;
  for (const event of events) {
    const result = transitionIbd(scenario, core, event);
    if (result.state === core) return fail(result.code);
    core = result.state; reading = result.readingKg ?? reading;
  }
  const notice = action.kind === 'verify' ? `check-${assessIbd(scenario, core).status}`
    : action.slot && !game.judgements?.[itemId] && ['scan', 'rear', 'survey', 'contents'].includes(action.kind)
      && yardItemComplete({ ...game, core }, action.slot) ? 'evidence-ready' : action.kind;
  return done(notice, { core, reading });
}

/** Machine commands require local physical reach. DOM buttons use the same gate as E/gamepad. */
export function requestIbdYardAction(game: IbdYardGame, action: IbdAction, actor: IbdActor): IbdYardGame {
  if (!actor.active || actor.paused || actor.hidden || actor.driving) return game;
  if (game.pending) return { ...game, notice: 'busy' };
  if (!ibdReach(actor.local, ibdStation(action.station, game.core.moved))) return { ...game, notice: 'out-of-reach' };
  if (!['reset', 'next'].includes(action.kind) && Object.values(game.packInspections).some(inspection => inspection.held !== null))
    return { ...game, notice: 'pack-return-first' };
  if (!yardActions(game, action.station).some(a => a.kind === action.kind && a.slot === action.slot && a.itemId === action.itemId && a.round === action.round))
    return { ...game, notice: 'action-unavailable' };
  const preview = perform(game, action);
  if (!preview.ok || duration[action.kind] === 0) return preview.game;
  const token = game.revision + 1;
  const seconds = action.kind === 'replace' && action.slot === 'parts-b' ? 3 : duration[action.kind];
  return { ...game, revision: token, pending: { action, token, seconds }, notice: `doing-${action.kind}` };
}
/** Called after the scene animation finishes; stale callbacks cannot complete a newer round. */
export function finishIbdYardAction(game: IbdYardGame, token: number, actor: IbdActor): IbdYardGame {
  const pending = game.pending;
  if (!pending || token !== pending.token || !actor.active || actor.paused || actor.hidden) return game;
  const observing = canCancelIbdObservation(game);
  const stockTransfer = pending.action.kind === 'select-stock' || pending.action.kind === 'return-stock'
    || (pending.action.kind === 'replace' && pending.action.slot === 'parts-b');
  if ((observing || stockTransfer) && (!ibdReach(actor.local, ibdStation(pending.action.station, game.core.moved)) || actor.driving))
    return { ...game, pending: null, notice: 'walked-away' };
  if (stockTransfer && Object.values(game.packInspections).some(inspection => inspection.held !== null))
    return { ...game, pending: null, notice: 'pack-return-first' };
  return { ...perform(game, pending.action).game, pending: null };
}
export function cancelIbdYardAction(game: IbdYardGame): IbdYardGame {
  let changed = false;
  const packInspections = Object.fromEntries(Object.entries(game.packInspections).map(([id, state]) => {
    const next = reduceIbdPackInspection(state, { type: 'cancel', itemId: id });
    changed ||= next !== state; return [id, next];
  }));
  return game.pending || changed ? { ...game, packInspections, pending: null, revision: game.revision + 1, notice: 'interrupted' } : game;
}

export type IbdPackYardEvent = IbdPackInspectionEvent & { readonly round: number; readonly revision: number };

/** Narrow physical-event bridge. Contact geometry is verified by the character/tool controller. */
export function inspectIbdYardPack(game: IbdYardGame, event: IbdPackYardEvent, actor: IbdActor): IbdYardGame {
  if (event.round !== game.round || event.revision !== game.revision) return game;
  if (!actor.active || actor.paused || actor.hidden || actor.driving) return game;
  if (game.pending) return { ...game, notice: 'busy' };
  const station = (['parts-a', 'parts-b', ...IBD_STOCK_KEYS] as const).find(candidate => yardPackItem(game, candidate)?.id === event.itemId);
  const item = station ? yardPackItem(game, station) : undefined;
  if (!station || !item || item.kind !== 'hardware-pack') return { ...game, notice: 'unknown-item' };
  if (!game.started || !game.equipped || game.released || game.core.loaded.includes(item.id)) return { ...game, notice: 'action-unavailable' };
  if (isIbdStockKey(station) && !game.stock.requested) return { ...game, notice: 'action-unavailable' };
  if (!game.core.opened.includes(item.id)) return { ...game, notice: 'package-sealed' };
  if (event.type === 'cancel') return cancelIbdYardAction(game);
  if (!ibdReach(actor.local, ibdStation(station, game.core.moved))) {
    const restored = cancelIbdYardAction(game);
    return { ...restored, notice: 'walked-away' };
  }
  if (Object.values(game.packInspections).some(inspection => inspection.itemId !== item.id && inspection.held !== null))
    return { ...game, notice: 'pack-return-first' };
  const current = game.packInspections[item.id] ?? createIbdPackInspection(item);
  const inspection = reduceIbdPackInspection(current, event);
  if (inspection === current && game.packInspections[item.id]) return game;
  const updated = { ...game, packInspections: { ...game.packInspections, [item.id]: inspection },
    revision: game.revision + 1, notice: `pack-${inspection.notice}` };
  if (isIbdStockKey(station)) return updated;
  const slot = station as 'parts-a' | 'parts-b';
  if (!ibdPackInspectionComplete(inspection) || yardItemComplete(updated, slot)) return updated;
  // Existing inspect events still own identity/quantity/specification/quality semantics and sealed-pack rules.
  return perform(updated, { kind: 'contents', station: slot, slot }).game;
}
