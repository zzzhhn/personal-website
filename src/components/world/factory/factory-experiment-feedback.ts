import type { FactoryConditions, FactoryGame, FactoryTrial } from './factory-game.ts';
import { factoryLaneReadings, factoryTrialHasCompletedEvidence, factoryTrialMatchesConfiguration, factoryTrialRound } from './factory-readings.ts';

/** All five conditions matter, including seed and time budget. */
export function factorySameConditions(a: FactoryConditions, b: FactoryConditions): boolean {
  return a.testKind === b.testKind && a.loadKg === b.loadKg && a.courseVersion === b.courseVersion
    && a.seed === b.seed && a.durationLimitS === b.durationLimitS;
}

export function factoryPreviousComparable(trial: FactoryTrial, records: FactoryTrial[]): FactoryTrial | null {
  const index = records.findIndex(record => record.id === trial.id);
  if (index < 0 || !factoryTrialHasCompletedEvidence(trial)) return null;
  const candidates = records.slice(0, index).reverse().filter(record => record.batchId === trial.batchId
    && record.mode === trial.mode && factorySameConditions(record.conditions, trial.conditions)
    && factoryTrialHasCompletedEvidence(record));
  return candidates.find(record => factoryTrialMatchesConfiguration(record, trial.configuration)) ?? candidates[0] ?? null;
}

const section = (progress: number, zh: boolean) => progress < 1 / 3 ? (zh ? '前段' : 'early section')
  : progress < 2 / 3 ? (zh ? '中段' : 'middle section') : (zh ? '后段' : 'late section');

/** Describes retained samples, without thresholds that turn a tilt into a fabricated pass/fail. */
export function factoryRunSummary(trial: FactoryTrial, zh: boolean): string | null {
  if (trial.status === 'running') return null;
  if (!trial.samples.length) return zh ? '本轮没有保留采样，暂时无法判断速度和晃动。' : 'No retained samples to assess speed or tilt.';
  const readings = factoryLaneReadings(trial, 'player');
  const fastest = trial.samples.reduce((a, b) => b.player.speedMps > a.player.speedMps ? b : a);
  const tilted = trial.samples.reduce((a, b) => Math.abs(b.player.tiltDeg) > Math.abs(a.player.tiltDeg) ? b : a);
  const finish = readings.arrivalS === null
    ? (zh ? `你的伙伴记录到路程 ${Math.floor(readings.latest!.progress * 100)}%，未到终点。` : `Yours reached ${Math.floor(readings.latest!.progress * 100)}% in the record, without a finish.`)
    : (zh ? `你的伙伴在 ${readings.arrivalS.toFixed(1)} s 的采样中到达终点。` : `Yours reached the finish in the ${readings.arrivalS.toFixed(1)} s sample.`);
  return zh ? `${finish}最高记录速度 ${fastest.player.speedMps.toFixed(2)} m/s（${section(fastest.player.progress, zh)}），最大倾角 ${Math.abs(tilted.player.tiltDeg).toFixed(1)}°（${section(tilted.player.progress, zh)}）。`
    : `${finish} Recorded top speed ${fastest.player.speedMps.toFixed(2)} m/s (${section(fastest.player.progress, zh)}); peak tilt ${Math.abs(tilted.player.tiltDeg).toFixed(1)}° (${section(tilted.player.progress, zh)}).`;
}

/** Only complete, retained course runs support whole-course timing and tilt differences. */
export function factoryComparisonSummary(trial: FactoryTrial, records: FactoryTrial[], zh: boolean): string | null {
  if (trial.status === 'running') return null;
  if (!factoryTrialHasCompletedEvidence(trial)) return zh ? '本轮未完整完成，不作全程快慢或稳定性比较。' : 'This run is incomplete; no whole-course speed or stability comparison.';
  const previous = factoryPreviousComparable(trial, records);
  const benchmark = !previous && trial.mode === 'comparison' && trial.reference?.id === 'factory-reference-v1';
  if (!benchmark && !previous) return zh ? '还没有同配置、同条件的完整旧跑；再跑一次可比较。' : 'No complete earlier run with this configuration and conditions; rerun to compare.';
  const player = factoryLaneReadings(trial, 'player');
  const other = factoryLaneReadings(benchmark ? trial : previous!, benchmark ? 'reference' : 'player');
  if (player.arrivalS === null || other.arrivalS === null || player.recordedPeakTiltDeg === null || other.recordedPeakTiltDeg === null) return null;
  const time = Number((player.arrivalS - other.arrivalS).toFixed(1));
  const tilt = Number((player.recordedPeakTiltDeg - other.recordedPeakTiltDeg).toFixed(1));
  const sameConfiguration = previous && factoryTrialMatchesConfiguration(previous, trial.configuration);
  const kind = (record: FactoryTrial) => record.configuration.kind === 'steady' ? (zh ? '稳健型' : 'Steady') : (zh ? '轻快型' : 'Nimble');
  const label = benchmark ? (zh ? '同场基准机' : 'the benchmark in this run') : sameConfiguration
    ? (zh ? `同配置旧跑 ${factoryTrialRound(previous!)}` : `earlier run ${factoryTrialRound(previous!)} with this configuration`)
    : (zh ? `整套配置前后（${kind(previous!)} → ${kind(trial)}，旧跑 ${factoryTrialRound(previous!)}）` : `the earlier whole setup (${kind(previous!)} → ${kind(trial)}, run ${factoryTrialRound(previous!)})`);
  const timing = time === 0 ? (zh ? '采样耗时相同' : 'equal sampled finish time')
    : zh ? `${time < 0 ? '快' : '慢'} ${Math.abs(time).toFixed(1)} s` : `${Math.abs(time).toFixed(1)} s ${time < 0 ? 'quicker' : 'slower'}`;
  const leaning = tilt === 0 ? (zh ? '峰值倾角相同' : 'equal peak tilt')
    : zh ? `峰值倾角${tilt < 0 ? '少' : '多'} ${Math.abs(tilt).toFixed(1)}°` : `${Math.abs(tilt).toFixed(1)}° ${tilt < 0 ? 'less' : 'more'} peak tilt`;
  const scope = previous && !sameConfiguration ? (zh ? '这是整套配置差异，不能归因于单个零件。' : 'This is a whole-setup difference, not evidence of a single part’s effect.') : '';
  return zh ? `相比${label}：${timing}，${leaning}。${scope}` : `Against ${label}: ${timing}; ${leaning}.${scope ? ` ${scope}` : ''}`;
}

export function factoryWheelExperiment(game: FactoryGame, zh: boolean, record?: FactoryTrial): string | null {
  if (!game.configuration || game.finalAssembled || !game.trialAssembled) return null;
  const latest = record ?? game.trials.filter(trial => trial.batchId === game.batchId && factoryTrialMatchesConfiguration(trial, game.configuration)).at(-1);
  if (latest && (latest.batchId !== game.batchId || !factoryTrialMatchesConfiguration(latest, game.configuration))) return null;
  if (!latest || latest.status === 'running') return null;
  if (['physics-step-too-large', 'test-rig-unavailable', 'simulation-failed', 'operator-cancelled', 'session-interrupted', 'disposed'].includes(latest.reason ?? '')) {
    return zh ? '先按原条件重跑，排除中断或装置问题，再决定是否换轮组。' : 'Rerun the same conditions to rule out an interruption or rig issue before changing wheels.';
  }
  const steady = game.configuration.kind !== 'steady';
  const wheels = steady ? (zh ? '稳健型宽轮' : 'Steady wide wheels') : (zh ? '轻快型窄轮' : 'Nimble narrow wheels');
  const course = { slope: zh ? '上下坡' : 'ramp', rumble: zh ? '颠簸路' : 'rumble strip', load: zh ? '负载爬坡' : 'loaded climb' }[latest.conditions.testKind];
  return zh ? `想试另一种取舍？去返工换${wheels}，加工、试装后，用相同模式与条件再跑${course}，观察耗时和倾角。换型会调整整套行驶参数，不保证改善。`
    : `Try another trade-off: change to ${wheels} at Module return, process and refit, then repeat the ${course} with the same mode and conditions. Watch time and tilt. Switching type changes the driving setup; improvement is not guaranteed.`;
}
