/** Pure, immutable factory state. Animation/simulation owns motion and measured data. */
export const FACTORY_MODULES = ['frame', 'wheels', 'shell'] as const;
export const FACTORY_LIMITS = { trials: 24, samples: 256, history: 48, configurations: 12, observations: 12, archives: 3 } as const;
export type FactoryModule = typeof FACTORY_MODULES[number];
export type FactoryConfig = 'nimble' | 'steady';
export type FactoryTestMode = 'single' | 'comparison';
export interface FactoryConditions {
  testKind: 'slope' | 'rumble' | 'load';
  loadKg: number;
  courseVersion: string;
  seed: number;
  durationLimitS: number;
}
export interface FactoryMeasurement {
  progress: number;
  speedMps: number;
  tiltDeg: number;
  loadKg: number;
}
export interface FactoryTrialSample {
  elapsedS: number;
  player: FactoryMeasurement;
  reference?: FactoryMeasurement;
}
export interface FactoryConfiguration {
  id: string;
  revision: number;
  kind: FactoryConfig;
  parts: Record<FactoryModule, string | null>;
}
export interface FactoryMaterial {
  id: string;
  status: 'source' | 'extracted' | 'grouped' | 'routed' | 'consumed';
  line: FactoryModule | null;
}
export interface FactoryPart {
  id: string;
  module: FactoryModule;
  materialId: string;
  manufacturedFor: FactoryConfig;
}
export interface FactoryTrial {
  id: string;
  batchId: string;
  configuration: FactoryConfiguration;
  mode: FactoryTestMode;
  conditions: FactoryConditions;
  reference: { id: 'factory-reference-v1'; role: 'benchmark' } | null;
  status: 'running' | 'completed' | 'incomplete' | 'interrupted';
  reason: string | null;
  samples: FactoryTrialSample[];
  observations: Array<'smooth' | 'shaky' | 'review'>;
}
export type FactoryAction =
  | { type: 'extract'; module: FactoryModule }
  | { type: 'group'; config: FactoryConfig }
  | { type: 'route'; module: FactoryModule; line: FactoryModule | null }
  | { type: 'process'; module: FactoryModule }
  | { type: 'trial-assemble' }
  | { type: 'test'; mode: FactoryTestMode; conditions: FactoryConditions }
  | { type: 'rework'; module: FactoryModule; config?: FactoryConfig }
  | { type: 'final-assemble' }
  | { type: 'inspect' }
  | { type: 'release' };
export interface FactoryTicket {
  token: string;
  batchId: string | null;
  configurationId: string | null;
  configurationRevision: number | null;
  revision: number;
}
export interface FactoryPending extends FactoryTicket {
  action: FactoryAction;
  trialId: string | null;
}
export interface FactoryInspection {
  configurationId: string;
  checkedPartIds: Record<FactoryModule, string>;
  checks: { frameSecured: boolean; wheelsSecured: boolean; shellSecured: boolean; safetyStop: boolean; markings: boolean };
}
export interface FactoryReport {
  id: string;
  batchId: string;
  configuration: FactoryConfiguration;
  trialIds: string[];
  inspection: FactoryInspection;
}
export interface FactoryGame {
  version: 1;
  gameId: string;
  sequence: number;
  revision: number;
  batchId: string | null;
  configuration: FactoryConfiguration | null;
  configurations: FactoryConfiguration[];
  materials: Record<FactoryModule, FactoryMaterial>;
  parts: Record<FactoryModule, FactoryPart | null>;
  trialAssembled: boolean;
  finalAssembled: boolean;
  released: boolean;
  trials: FactoryTrial[];
  report: FactoryReport | null;
  pending: FactoryPending | null;
  history: Array<{ token: string; action: FactoryAction['type']; outcome: 'completed' | 'failed' | 'cancelled' }>;
  archives: FactoryBatchArchive[];
}
/** A committed released batch, including original measurements and rework history. */
export type FactoryBatchArchive = Omit<FactoryGame, 'archives'>;
export interface FactoryActionResult {
  ok?: boolean;
  outcome?: 'completed' | 'incomplete';
  reason?: string;
  inspection?: FactoryInspection;
}

const copy = <T>(value: T): T => structuredClone(value);
/** Archives are append-only snapshots. High-frequency samples clone the active run only. */
const copyGame = (state: FactoryGame): FactoryGame => {
  const { archives, ...active } = state;
  return { ...copy(active), archives };
};
const isModule = (value: unknown): value is FactoryModule => FACTORY_MODULES.includes(value as FactoryModule);
const isConfig = (value: unknown): value is FactoryConfig => value === 'nimble' || value === 'steady';
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_./-]{1,160}$/.test(value);
const boundedReason = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const modules = <T>(fn: (module: FactoryModule) => T): Record<FactoryModule, T> => ({ frame: fn('frame'), wheels: fn('wheels'), shell: fn('shell') });
const completeParts = (state: FactoryGame) => FACTORY_MODULES.every(module => state.parts[module] !== null);
const matchingTrials = (state: FactoryGame, mode: FactoryTestMode) => state.trials.filter(trial => trial.status === 'completed' && trial.mode === mode && trial.configuration.id === state.configuration?.id && sameParts(trial.configuration.parts, state.configuration.parts));
const tested = (state: FactoryGame) => matchingTrials(state, 'single').length > 0 && matchingTrials(state, 'comparison').length > 0;
const sameParts = (a: Record<FactoryModule, string | null>, b: Record<FactoryModule, string | null>) => FACTORY_MODULES.every(module => a[module] === b[module]);

/** Caller supplies a stable unique game id (for example crypto.randomUUID()). */
export function createFactoryGame(gameId = 'factory'): FactoryGame {
  if (!id(gameId) || gameId.length > 64) throw new TypeError('Invalid factory game id');
  return {
    version: 1, gameId, sequence: 0, revision: 0, batchId: null, configuration: null,
    configurations: [], materials: modules(module => ({ id: `${gameId}:raw:${module}`, status: 'source', line: null })),
    parts: modules(() => null), trialAssembled: false, finalAssembled: false, released: false,
    trials: [], report: null, pending: null, history: [], archives: [],
  };
}

/** World/station authorization belongs to the store; this only checks production state. */
export function canStartNextFactoryBatch(state: FactoryGame): boolean {
  return !state.pending && state.released && state.finalAssembled && state.trialAssembled && completeParts(state) && !!state.batchId && !!state.configuration
    && !!state.report && state.report.batchId === state.batchId && state.report.configuration.id === state.configuration.id
    && state.report.configuration.kind === state.configuration.kind && state.report.configuration.revision === state.configuration.revision
    && sameParts(state.report.configuration.parts, state.configuration.parts)
    && inspectionValid(state.report.inspection, state.configuration) && tested(state)
    && state.sequence < Number.MAX_SAFE_INTEGER - 1 && state.revision < Number.MAX_SAFE_INTEGER - 1;
}

/** Starting another batch never replays or invents measurements for the finished product. */
export function startNextFactoryBatch(state: FactoryGame): FactoryGame {
  if (!canStartNextFactoryBatch(state)) return state;
  const { archives, ...completed } = copyGame(state);
  const next = createFactoryGame(state.gameId);
  next.sequence = state.sequence + 1;
  next.revision = state.revision + 1;
  next.materials = modules(module => ({ id: `${state.gameId}:action:${next.sequence}:raw:${module}`, status: 'source', line: null }));
  next.archives = [...archives, completed].slice(-FACTORY_LIMITS.archives);
  return next;
}

function conditionsValid(value: FactoryConditions): boolean {
  return !!value && ['slope', 'rumble', 'load'].includes(value.testKind) && finite(value.loadKg, 0, 1000)
    && id(value.courseVersion) && integer(value.seed) && finite(value.durationLimitS, 1, 3600);
}

function allowed(state: FactoryGame, action: FactoryAction): boolean {
  if (!action || state.pending || state.released || state.sequence >= Number.MAX_SAFE_INTEGER - 1 || state.revision >= Number.MAX_SAFE_INTEGER - 1) return false;
  switch (action.type) {
    case 'extract': return isModule(action.module) && !state.batchId && state.materials[action.module].status === 'source';
    case 'group': return !state.batchId && isConfig(action.config) && FACTORY_MODULES.every(module => state.materials[module].status === 'extracted');
    case 'route': return !!state.batchId && isModule(action.module) && (action.line === null || isModule(action.line))
      && ['grouped', 'routed'].includes(state.materials[action.module].status) && state.materials[action.module].line !== action.line;
    case 'process': return !!state.configuration && isModule(action.module) && !state.parts[action.module]
      && state.materials[action.module].status === 'routed' && state.materials[action.module].line === action.module;
    case 'trial-assemble': return completeParts(state) && !state.trialAssembled && !state.finalAssembled;
    case 'test': return state.trialAssembled && !state.finalAssembled && (action.mode === 'single' || action.mode === 'comparison') && conditionsValid(action.conditions);
    case 'rework': return !!state.configuration && isModule(action.module) && !!state.parts[action.module]
      && (action.config === undefined || (isConfig(action.config) && (action.config === state.configuration.kind || action.module === 'wheels')));
    case 'final-assemble': return state.trialAssembled && !state.finalAssembled && completeParts(state) && tested(state);
    case 'inspect': return state.finalAssembled && !state.report && tested(state);
    case 'release': return state.finalAssembled && !!state.report && state.report.configuration.id === state.configuration?.id && tested(state);
    default: return false;
  }
}

/** Available concrete actions. Tests use default conditions; callers can request their own validated conditions. */
export function factoryActions(state: FactoryGame): FactoryAction[] {
  const actions: FactoryAction[] = [
    ...FACTORY_MODULES.map(module => ({ type: 'extract' as const, module })),
    { type: 'group', config: 'nimble' }, { type: 'group', config: 'steady' },
    ...FACTORY_MODULES.flatMap(module => [
      { type: 'route' as const, module, line: module }, { type: 'route' as const, module, line: null }, { type: 'process' as const, module },
      { type: 'rework' as const, module },
    ]),
    { type: 'rework', module: 'wheels', config: state.configuration?.kind === 'steady' ? 'nimble' : 'steady' },
    { type: 'trial-assemble' },
    ...(['single', 'comparison'] as const).flatMap(mode => (['slope', 'rumble', 'load'] as const).map(testKind => ({
      type: 'test' as const, mode, conditions: { testKind, loadKg: testKind === 'load' ? 2 : 0, courseVersion: 'factory-course-v1', seed: 1, durationLimitS: 60 },
    }))),
    { type: 'final-assemble' }, { type: 'inspect' }, { type: 'release' },
  ];
  return actions.filter(action => allowed(state, action));
}

export function requestFactoryAction(state: FactoryGame, action: FactoryAction): FactoryGame {
  if (!allowed(state, action)) return state;
  const next = copyGame(state);
  next.sequence += 1;
  const token = `${state.gameId}:action:${next.sequence}`;
  next.pending = {
    token, batchId: state.batchId, configurationId: state.configuration?.id ?? null,
    configurationRevision: state.configuration?.revision ?? null, revision: state.revision,
    action: copy(action), trialId: action.type === 'test' ? `${token}:trial` : null,
  };
  if (action.type === 'test') {
    const trial: FactoryTrial = {
      id: next.pending.trialId!, batchId: next.batchId!, configuration: copy(next.configuration!),
      mode: action.mode, conditions: copy(action.conditions),
      reference: action.mode === 'comparison' ? { id: 'factory-reference-v1', role: 'benchmark' } : null,
      status: 'running', reason: null, samples: [], observations: [],
    };
    next.trials = [...next.trials, trial].slice(-FACTORY_LIMITS.trials);
  }
  return next;
}

function matches(state: FactoryGame, ticket: FactoryTicket): boolean {
  const pending = state.pending;
  return !!pending && !!ticket && pending.token === ticket.token && pending.revision === ticket.revision
    && state.revision === ticket.revision && pending.batchId === ticket.batchId && state.batchId === ticket.batchId
    && pending.configurationId === ticket.configurationId && (state.configuration?.id ?? null) === ticket.configurationId
    && pending.configurationRevision === ticket.configurationRevision && (state.configuration?.revision ?? null) === ticket.configurationRevision;
}

function measurementValid(value: FactoryMeasurement): boolean {
  return !!value && finite(value.progress, 0, 1) && finite(value.speedMps, 0, 100)
    && finite(value.tiltDeg, -180, 180) && finite(value.loadKg, 0, 1000);
}
function sampleValid(sample: FactoryTrialSample, trial: FactoryTrial): boolean {
  return !!sample && finite(sample.elapsedS, 0, trial.conditions.durationLimitS) && measurementValid(sample.player)
    && sample.player.loadKg === trial.conditions.loadKg
    && (trial.mode === 'comparison' ? measurementValid(sample.reference!) && sample.reference!.loadKg === trial.conditions.loadKg : sample.reference === undefined);
}

/** Samples are actual simulation output. No grade, time, or success is synthesized here. */
export function appendFactoryTrialSample(state: FactoryGame, ticket: FactoryTicket, sample: FactoryTrialSample): FactoryGame {
  if (!matches(state, ticket) || state.pending!.action.type !== 'test') return state;
  const trial = state.trials.find(entry => entry.id === state.pending!.trialId);
  if (!trial || trial.status !== 'running' || !sampleValid(sample, trial)) return state;
  const previous = trial.samples.at(-1);
  if (previous && sample.elapsedS <= previous.elapsedS) return state;
  // A measurement stream starts at the shared start line, not at a fabricated finish line.
  if (!previous && (sample.player.progress !== 0 || (trial.mode === 'comparison' && sample.reference!.progress !== 0))) return state;
  const next = copyGame(state);
  const target = next.trials.find(entry => entry.id === trial.id)!;
  target.samples.push(copy(sample));
  if (target.samples.length > FACTORY_LIMITS.samples) target.samples.splice(1, target.samples.length - FACTORY_LIMITS.samples);
  return next;
}

/** Subjective observations stay separate from measurements and may annotate historical trials. */
export function addFactoryObservation(state: FactoryGame, trialId: string, observation: 'smooth' | 'shaky' | 'review'): FactoryGame {
  const trial = state.trials.find(entry => entry.id === trialId);
  if (!trial || !['smooth', 'shaky', 'review'].includes(observation) || trial.observations.length >= FACTORY_LIMITS.observations) return state;
  const next = copyGame(state);
  next.trials.find(entry => entry.id === trialId)!.observations.push(observation);
  return next;
}

function arrived(trial: FactoryTrial): boolean {
  const last = trial.samples.at(-1);
  return trial.samples.length >= 2 && !!last && last.player.progress === 1
    && (trial.mode !== 'comparison' || last.reference?.progress === 1);
}

function inspectionValid(value: FactoryInspection | undefined, config: FactoryConfiguration): value is FactoryInspection {
  return !!value && value.configurationId === config.id && !!value.checkedPartIds
    && FACTORY_MODULES.every(module => value.checkedPartIds[module] === config.parts[module] && id(value.checkedPartIds[module]))
    && !!value.checks && ['frameSecured', 'wheelsSecured', 'shellSecured', 'safetyStop', 'markings'].every(key => value.checks[key as keyof FactoryInspection['checks']] === true);
}

function settle(state: FactoryGame, outcome: 'completed' | 'failed' | 'cancelled'): void {
  const pending = state.pending!;
  state.history = [...state.history, { token: pending.token, action: pending.action.type, outcome }].slice(-FACTORY_LIMITS.history);
  state.pending = null;
  state.revision += 1;
}

export function finishFactoryAction(state: FactoryGame, ticket: FactoryTicket, result: FactoryActionResult = {}): FactoryGame {
  if (!matches(state, ticket)) return state;
  const pending = state.pending!;
  const action = pending.action;
  if (action.type === 'inspect' && result.ok !== false && !inspectionValid(result.inspection, state.configuration!)) return state;
  if (action.type === 'test' && result.ok !== false && result.outcome !== 'completed' && result.outcome !== 'incomplete') return state;
  if (action.type === 'test' && result.outcome === 'completed' && result.ok !== false && !arrived(state.trials.find(trial => trial.id === pending.trialId)!)) return state;
  if (action.type === 'test' && result.outcome === 'incomplete' && !boundedReason(result.reason)) return state;
  const next = copyGame(state);
  if (result.ok === false) {
    if (action.type === 'test') {
      const trial = next.trials.find(entry => entry.id === pending.trialId)!;
      trial.status = 'incomplete'; trial.reason = boundedReason(result.reason) ? result.reason : 'simulation-failed';
    }
    settle(next, 'failed');
    return next;
  }
  switch (action.type) {
    case 'extract': next.materials[action.module].status = 'extracted'; break;
    case 'group':
      next.batchId = `${pending.token}:batch`;
      next.configuration = { id: `${pending.token}:config`, revision: 1, kind: action.config, parts: modules(() => null) };
      for (const module of FACTORY_MODULES) next.materials[module].status = 'grouped';
      break;
    case 'route':
      next.materials[action.module].line = action.line;
      next.materials[action.module].status = action.line === null ? 'grouped' : 'routed';
      break;
    case 'process': {
      const part: FactoryPart = { id: `${pending.token}:part`, module: action.module, materialId: next.materials[action.module].id, manufacturedFor: next.configuration!.kind };
      next.parts[action.module] = part;
      next.materials[action.module].status = 'consumed'; next.materials[action.module].line = null;
      next.configuration!.parts[action.module] = part.id;
      break;
    }
    case 'trial-assemble': next.trialAssembled = true; break;
    case 'test': {
      const trial = next.trials.find(entry => entry.id === pending.trialId)!;
      trial.status = result.outcome!; trial.reason = result.outcome === 'incomplete' ? result.reason! : null;
      break;
    }
    case 'rework': {
      next.configurations = [...next.configurations, copy(next.configuration!)].slice(-FACTORY_LIMITS.configurations);
      next.configuration = { ...copy(next.configuration!), id: `${pending.token}:config`, revision: next.configuration!.revision + 1, kind: action.config ?? next.configuration!.kind };
      next.configuration.parts[action.module] = null;
      next.parts[action.module] = null;
      next.materials[action.module].status = 'grouped'; next.materials[action.module].line = null;
      next.trialAssembled = false; next.finalAssembled = false; next.report = null;
      break;
    }
    case 'final-assemble': next.finalAssembled = true; break;
    case 'inspect': next.report = {
      id: `${pending.token}:report`, batchId: next.batchId!, configuration: copy(next.configuration!),
      trialIds: [matchingTrials(next, 'single').at(-1)!.id, matchingTrials(next, 'comparison').at(-1)!.id],
      inspection: copy(result.inspection!),
    }; break;
    case 'release': next.released = true; break;
  }
  settle(next, 'completed');
  return next;
}

export function cancelFactoryAction(state: FactoryGame, ticket: FactoryTicket): FactoryGame {
  if (!matches(state, ticket)) return state;
  const next = copyGame(state);
  if (next.pending!.trialId) {
    const trial = next.trials.find(entry => entry.id === next.pending!.trialId)!;
    trial.status = 'interrupted'; trial.reason = 'operator-cancelled';
  }
  settle(next, 'cancelled');
  return next;
}

/** Save only committed physical state; interrupted trials retain measurements already received. */
export function saveFactoryGame(state: FactoryGame): string {
  const saved = copyGame(state);
  if (saved.pending) {
    const trial = saved.trials.find(entry => entry.id === saved.pending!.trialId);
    if (trial?.status === 'running') { trial.status = 'interrupted'; trial.reason = 'session-interrupted'; }
    saved.pending = null;
    saved.revision += 1;
  }
  return JSON.stringify(saved);
}

function configurationValid(value: FactoryConfiguration): boolean {
  return !!value && id(value.id) && integer(value.revision) && value.revision > 0 && isConfig(value.kind)
    && !!value.parts && FACTORY_MODULES.every(module => value.parts[module] === null || id(value.parts[module]));
}

/** Reject inconsistent saves wholesale instead of manufacturing material or passing evidence. */
function savedStateValid(state: FactoryGame): boolean {
  if (!state || state.version !== 1 || !id(state.gameId) || state.gameId.length > 64 || !integer(state.sequence) || !integer(state.revision)
    || state.pending !== null || (state.batchId !== null && !id(state.batchId))
    || typeof state.trialAssembled !== 'boolean' || typeof state.finalAssembled !== 'boolean' || typeof state.released !== 'boolean'
    || !state.materials || !state.parts || !Array.isArray(state.trials) || state.trials.length > FACTORY_LIMITS.trials
    || !Array.isArray(state.configurations) || state.configurations.length > FACTORY_LIMITS.configurations
    || !Array.isArray(state.history) || state.history.length > FACTORY_LIMITS.history
    || !Array.isArray(state.archives) || state.archives.length > FACTORY_LIMITS.archives) return false;
  // Every generated identity carries its issuing action number. A lowered counter must
  // never let an old animation callback match a newly issued action after recovery.
  const issued = (identity: unknown, suffix = ''): boolean => {
    if (!id(identity) || !identity.startsWith(`${state.gameId}:action:`) || (suffix && !identity.endsWith(suffix))) return false;
    const digits = identity.slice(`${state.gameId}:action:`.length, suffix ? -suffix.length : undefined);
    const number = Number(digits);
    return /^[1-9][0-9]*$/.test(digits) && Number.isSafeInteger(number) && number <= state.sequence
      && number > (state.archives.at(-1)?.sequence ?? 0);
  };
  if ((state.configuration === null) !== (state.batchId === null) || (state.batchId && !issued(state.batchId, ':batch'))
    || (state.configuration && (!configurationValid(state.configuration) || !issued(state.configuration.id, ':config') || state.configuration.revision > state.sequence))) return false;
  if (!state.configurations.every((config, index) => configurationValid(config) && issued(config.id, ':config')
    && config.revision === state.configuration!.revision - state.configurations.length + index)
    || (state.configuration ? state.configurations.length !== Math.min(state.configuration.revision - 1, FACTORY_LIMITS.configurations) : state.configurations.length !== 0)) return false;
  const knownConfigurations = new Map<string, FactoryConfiguration>();
  const coherentConfig = (config: FactoryConfiguration) => {
    const previous = knownConfigurations.get(config.id);
    if (previous && (previous.kind !== config.kind || previous.revision !== config.revision || !sameParts(previous.parts, config.parts))) return false;
    knownConfigurations.set(config.id, config);
    return true;
  };
  if (state.configuration && !coherentConfig(state.configuration)) return false;
  if (!state.configurations.every(coherentConfig)) return false;
  const identities = new Set<string>();
  const unique = (identity: string) => { if (identities.has(identity)) return false; identities.add(identity); return true; };
  const rawPrefix = state.materials.frame?.id?.slice(0, -':raw:frame'.length);
  const previousBatch = state.archives.at(-1);
  if (previousBatch && (rawPrefix === state.gameId || !id(rawPrefix)
    || Number(rawPrefix.slice(`${state.gameId}:action:`.length)) <= previousBatch.sequence)) return false;
  for (const module of FACTORY_MODULES) {
    const material = state.materials[module]; const part = state.parts[module];
    if (!material || material.id !== `${rawPrefix}:raw:${module}` || !unique(material.id)
      || (rawPrefix !== state.gameId && !issued(material.id, `:raw:${module}`))
      || !['source', 'extracted', 'grouped', 'routed', 'consumed'].includes(material.status)
      || (material.status === 'routed' ? !isModule(material.line) : material.line !== null)) return false;
    if (!state.batchId && !['source', 'extracted'].includes(material.status)) return false;
    if (state.batchId && ['source', 'extracted'].includes(material.status)) return false;
    if ((part !== null) !== (material.status === 'consumed')) return false;
    if (part && (!issued(part.id, ':part') || !unique(part.id) || part.module !== module || part.materialId !== material.id || !isConfig(part.manufacturedFor))) return false;
    if (state.configuration && state.configuration.parts[module] !== (part?.id ?? null)) return false;
  }
  for (const trial of state.trials) {
    if (!trial || !issued(trial.id, ':trial') || !unique(trial.id) || trial.batchId !== state.batchId || !configurationValid(trial.configuration)
      || !issued(trial.configuration.id, ':config') || !coherentConfig(trial.configuration)
      || !FACTORY_MODULES.every(module => id(trial.configuration.parts[module]))
      || !['single', 'comparison'].includes(trial.mode) || !conditionsValid(trial.conditions)
      || !['completed', 'incomplete', 'interrupted'].includes(trial.status)
      || (trial.status === 'completed' ? trial.reason !== null : !boundedReason(trial.reason))
      || (trial.mode === 'comparison' ? trial.reference?.id !== 'factory-reference-v1' || trial.reference?.role !== 'benchmark' : trial.reference !== null)
      || !Array.isArray(trial.samples) || trial.samples.length > FACTORY_LIMITS.samples
      || !Array.isArray(trial.observations) || trial.observations.length > FACTORY_LIMITS.observations
      || !trial.observations.every(observation => ['smooth', 'shaky', 'review'].includes(observation))) return false;
    if (!trial.samples.every((sample, index) => sampleValid(sample, trial) && (index === 0
      ? sample.player.progress === 0 && (trial.mode !== 'comparison' || sample.reference!.progress === 0)
      : sample.elapsedS > trial.samples[index - 1].elapsedS))) return false;
    if (trial.status === 'completed' && !arrived(trial)) return false;
    if (trial.configuration.revision > state.configuration!.revision) return false;
    if (trial.configuration.id === state.configuration!.id && trial.configuration.revision !== state.configuration!.revision) return false;
  }
  if (!state.history.every(event => event && issued(event.token) && ['extract', 'group', 'route', 'process', 'trial-assemble', 'test', 'rework', 'final-assemble', 'inspect', 'release'].includes(event.action) && ['completed', 'failed', 'cancelled'].includes(event.outcome))) return false;
  if (state.trialAssembled && !completeParts(state)) return false;
  if (state.finalAssembled && (!state.trialAssembled || !tested(state))) return false;
  if (state.report !== null) {
    const report = state.report;
    if (!report || !issued(report.id, ':report') || !state.finalAssembled || report.batchId !== state.batchId || !configurationValid(report.configuration)
      || report.configuration.id !== state.configuration!.id || !coherentConfig(report.configuration)
      || !inspectionValid(report.inspection, state.configuration!) || !Array.isArray(report.trialIds) || report.trialIds.length !== 2
      || !(['single', 'comparison'] as const).every(mode => matchingTrials(state, mode).some(trial => report.trialIds.includes(trial.id)))) return false;
  }
  if (state.released && !state.report) return false;
  let previousSequence = -1, previousRevision = -1;
  const batches = new Set(state.batchId ? [state.batchId] : []);
  for (const archive of state.archives) {
    if (!archive || Object.hasOwn(archive, 'archives') || archive.gameId !== state.gameId || !archive.released
      || !archive.batchId || batches.has(archive.batchId) || archive.sequence <= previousSequence || archive.sequence >= state.sequence
      || archive.revision <= previousRevision || archive.revision >= state.revision
      || !savedStateValid({ ...archive, archives: [] })) return false;
    batches.add(archive.batchId); previousSequence = archive.sequence; previousRevision = archive.revision;
  }
  return true;
}

/** null means the save is malformed or incompatible. Caller can start a fresh game explicitly. */
export function restoreFactoryGame(serialized: string): FactoryGame | null {
  if (typeof serialized !== 'string' || serialized.length > 16_000_000) return null;
  try {
    const parsed = JSON.parse(serialized) as FactoryGame;
    // Existing v1 saves predate batch archives. Preserve their state and identities.
    if (parsed && !Object.hasOwn(parsed, 'archives')) parsed.archives = [];
    // Raw JSON with an in-flight action is accepted only after stripping the uncommitted action.
    if (parsed?.pending) {
      if (!matches(parsed, parsed.pending) || !id(parsed.pending.token) || parsed.pending.token !== `${parsed.gameId}:action:${parsed.sequence}`
        || !allowed({ ...parsed, pending: null }, parsed.pending.action)
        || parsed.pending.trialId !== (parsed.pending.action.type === 'test' ? `${parsed.pending.token}:trial` : null)) return null;
      const trial = Array.isArray(parsed.trials) ? parsed.trials.find(entry => entry.id === parsed.pending!.trialId) : undefined;
      if (trial?.status === 'running') { trial.status = 'interrupted'; trial.reason = 'session-interrupted'; }
      parsed.pending = null;
      parsed.revision += 1;
    }
    return savedStateValid(parsed) ? parsed : null;
  } catch { return null; }
}
