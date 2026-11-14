import type { FactoryConfiguration, FactoryGame, FactoryMeasurement, FactoryTestMode, FactoryTrial } from './factory-game';

export type FactoryObservation = FactoryTrial['observations'][number];
export interface FactoryLaneReadings {
  latest: FactoryMeasurement | null;
  recordedThroughS: number | null;
  arrivalS: number | null;
  finishSpeedMps: number | null;
  recordedPeakTiltDeg: number | null;
}

/** Configuration identity includes its parts, so a result never silently applies after rework. */
export function factoryTrialMatchesConfiguration(trial: FactoryTrial, configuration: FactoryConfiguration | null): boolean {
  return !!configuration && trial.configuration.id === configuration.id
    && trial.configuration.revision === configuration.revision && trial.configuration.kind === configuration.kind
    && (['frame', 'wheels', 'shell'] as const).every(module => trial.configuration.parts[module] === configuration.parts[module]);
}

/** A console only promotes this mode's current-configuration trial; older configurations remain history. */
export function selectFactoryReadings(game: FactoryGame, mode: FactoryTestMode) {
  const records = game.trials.filter(trial => trial.mode === mode);
  const currentRecords = records.filter(trial => trial.batchId === game.batchId && factoryTrialMatchesConfiguration(trial, game.configuration));
  const pending = currentRecords.find(trial => trial.id === game.pending?.trialId && trial.status === 'running');
  const current = pending ?? currentRecords.at(-1) ?? null;
  return { current, history: records.filter(trial => trial.id !== current?.id).slice().reverse() };
}

/** Only retained simulation samples contribute. Arrival is sampled, not an interpolated finish time. */
export function factoryLaneReadings(trial: FactoryTrial, lane: 'player' | 'reference'): FactoryLaneReadings {
  const samples = trial.samples.flatMap(sample => sample[lane] ? [{ elapsedS: sample.elapsedS, measurement: sample[lane]! }] : []);
  const latest = samples.at(-1);
  const arrival = samples.find(sample => sample.measurement.progress === 1);
  return {
    latest: latest?.measurement ?? null,
    recordedThroughS: latest?.elapsedS ?? null,
    arrivalS: arrival?.elapsedS ?? null,
    finishSpeedMps: arrival?.measurement.speedMps ?? null,
    recordedPeakTiltDeg: samples.length ? Math.max(...samples.map(sample => Math.abs(sample.measurement.tiltDeg))) : null,
  };
}

/** Completion requires both the committed outcome and recorded arrivals in every active lane. */
export function factoryTrialHasCompletedEvidence(trial: FactoryTrial): boolean {
  const last = trial.samples.at(-1);
  return trial.status === 'completed' && trial.samples.length >= 2 && last?.player.progress === 1
    && (trial.mode === 'single' || (!!trial.reference && last.reference?.progress === 1));
}

export function factoryTrialRound(trial: FactoryTrial): string {
  return trial.id.match(/:action:(\d+):trial$/)?.[1] ?? trial.id;
}

export function factoryTrialStatus(trial: FactoryTrial, zh: boolean): string {
  if (factoryTrialHasCompletedEvidence(trial)) return zh ? '已完成' : 'Completed';
  if (trial.status === 'running') return zh ? '试验进行中' : 'Trial running';
  if (trial.status === 'interrupted') return zh ? '已中断，可重新试验' : 'Interrupted; rerun available';
  if (trial.status === 'completed') return zh ? '完成记录缺少终点采样' : 'Completion record missing finish samples';
  return zh ? '未完成，可重新试验' : 'Incomplete; rerun available';
}

export function factoryTrialReason(reason: string | null, zh: boolean): string | null {
  if (!reason) return null;
  const reasons: Record<string, [string, string]> = {
    timeout: ['已达试验时限', 'Trial time limit reached'],
    stalled: ['机械伙伴停滞', 'Companion stalled'],
    overturned: ['机械伙伴侧翻', 'Companion overturned'],
    'out-of-bounds': ['机械伙伴偏离试验段', 'Companion left the course'],
    'physics-step-too-large': ['物理步长超限，试验安全停止', 'Physics step exceeded limit; safety stop'],
    'operator-cancelled': ['已退出操作', 'Operator left the console'],
    'session-interrupted': ['上次会话中断', 'Previous session interrupted'],
    'test-rig-unavailable': ['试验装置未就绪', 'Trial rig unavailable'],
    'simulation-failed': ['试验运行失败', 'Simulation failed'],
    'course-incomplete': ['未走完试验段', 'Course not completed'],
    disposed: ['试验装置已停止', 'Trial rig stopped'],
  };
  return reasons[reason]?.[zh ? 0 : 1] ?? reason;
}
