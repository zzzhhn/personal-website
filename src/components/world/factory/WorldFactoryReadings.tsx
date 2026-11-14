import { FACTORY_LIMITS, type FactoryGame, type FactoryTestMode, type FactoryTrial } from './factory-game';
import { factoryRunSummary, factoryComparisonSummary, factoryWheelExperiment } from './factory-experiment-feedback';
import {
  factoryLaneReadings, factoryTrialHasCompletedEvidence, factoryTrialReason, factoryTrialRound,
  factoryTrialStatus, selectFactoryReadings, type FactoryObservation,
} from './factory-readings';

interface Props {
  game: FactoryGame;
  mode: FactoryTestMode;
  zh: boolean;
  onObserve?: (trialId: string, observation: FactoryObservation) => void;
}
const format = (value: number | null, decimals: number, unit: string) => value === null ? 'N/A' : `${value.toFixed(decimals)} ${unit}`;
const observationLabel = (observation: FactoryObservation, zh: boolean) => ({
  smooth: zh ? '平稳' : 'Smooth', shaky: zh ? '摇晃' : 'Shaky', review: zh ? '需要复看' : 'Review',
})[observation];

export function FactoryTrialReadings({ trial, zh, onObserve, records = [] }: { trial: FactoryTrial; zh: boolean; onObserve?: Props['onObserve']; records?: FactoryTrial[] }) {
  const player = factoryLaneReadings(trial, 'player'), reference = factoryLaneReadings(trial, 'reference');
  const running = trial.status === 'running', comparison = trial.mode === 'comparison';
  const reason = factoryTrialReason(trial.reason, zh), completed = factoryTrialHasCompletedEvidence(trial);
  const lanes = comparison ? [player, reference] : [player];
  const condition = { slope: zh ? '上下坡' : 'Ramp', rumble: zh ? '颠簸路' : 'Rumble strip', load: zh ? '负载爬坡' : 'Loaded climb' }[trial.conditions.testKind];
  const config = trial.configuration.kind === 'steady' ? (zh ? '稳健型' : 'Steady') : (zh ? '轻快型' : 'Nimble');
  const summary = factoryRunSummary(trial, zh);
  const difference = records.length || comparison ? factoryComparisonSummary(trial, records, zh) : null;
  const row = (label: string, values: string[]) => <tr key={label}>
    <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '3px 0' }}>{label}</th>
    {values.map((value, index) => <td key={index} style={{ textAlign: 'right', paddingLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{value}</td>)}
  </tr>;
  return <>
    <p title={trial.id}><strong>{config} · {zh ? '配置' : 'Rev'} {trial.configuration.revision} · {zh ? '轮次' : 'Run'} {factoryTrialRound(trial)}</strong></p>
    <p role="status">{factoryTrialStatus(trial, zh)}{reason ? ` · ${reason}` : ''}</p>
    {summary && <p className="factory-result-summary">{summary}</p>}
    {difference && <p className="factory-result-difference">{difference}</p>}
    <p>{comparison ? (zh ? '共同条件' : 'Shared conditions') : (zh ? '试验条件' : 'Conditions')}{zh ? '：' : ': '}{condition} · {trial.conditions.loadKg} kg · {trial.conditions.durationLimitS} s {zh ? '时限' : 'limit'}</p>
    <details open={running} className="factory-samples"><summary>{zh ? '查看采样读数' : 'Sampled readings'}</summary>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} aria-label={zh ? '本轮实测读数' : 'Measured readings for this run'}>
      <thead><tr><th aria-label={zh ? '测量项' : 'Measurement'} />
        <th scope="col" style={{ textAlign: 'right' }}>{zh ? '你的伙伴' : 'Yours'}</th>
        {comparison && <th scope="col" style={{ textAlign: 'right' }}>{zh ? '基准机' : 'Benchmark'}</th>}
      </tr></thead>
      <tbody>
        {row(zh ? '路程进度' : 'Progress', lanes.map(lane => lane.latest ? `${Math.floor(lane.latest.progress * 100)}%` : (zh ? '待采样' : 'Awaiting sample')))}
        {running ? <>
          {row(zh ? '当前速度' : 'Current speed', lanes.map(lane => format(lane.latest?.speedMps ?? null, 2, 'm/s')))}
          {row(zh ? '当前倾角' : 'Current tilt', lanes.map(lane => format(lane.latest?.tiltDeg ?? null, 1, '°')))}
          {row(zh ? '记录至' : 'Recorded at', lanes.map(lane => format(lane.recordedThroughS, 1, 's')))}
        </> : <>
          {row(zh ? '耗时（采样）' : 'Finish time (sampled)', lanes.map(lane => lane.arrivalS === null ? (zh ? '未到终点' : 'Not reached') : format(lane.arrivalS, 1, 's')))}
          {row(zh ? '终点速度' : 'Finish speed', lanes.map(lane => format(lane.finishSpeedMps, 2, 'm/s')))}
          {row(zh ? '记录峰值倾角' : 'Recorded peak tilt', lanes.map(lane => format(lane.recordedPeakTiltDeg, 1, '°')))}
          {!completed && row(zh ? '记录至' : 'Recorded at', lanes.map(lane => format(lane.recordedThroughS, 1, 's')))}
        </>}
      </tbody>
    </table>
    {!running && <small>{zh ? '终点速度含安全停机；峰值与耗时来自保留的采样。' : 'Finish speed includes the safety stop; peaks and times use retained samples.'}</small>}
    </details>
    <details style={{ marginTop: 10 }}><summary>{zh ? '试验身份' : 'Trial identity'}</summary>
      <small style={{ overflowWrap: 'anywhere' }}>{trial.id}<br />{trial.configuration.id}<br />
        {trial.conditions.courseVersion} · {zh ? '种子' : 'Seed'} {trial.conditions.seed}
        {comparison && <><br />{trial.reference?.id ?? (zh ? '缺少基准机身份' : 'Benchmark identity missing')}</>}
      </small>
    </details>
    {!running && (onObserve||trial.observations.length>0) && <div style={{ marginTop: 12 }}>
      <p>{zh ? '你的观察' : 'Your observation'}</p>
      {onObserve && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(['smooth', 'shaky', 'review'] as const).map(observation => <button key={observation}
          disabled={trial.observations.length >= FACTORY_LIMITS.observations} onClick={() => onObserve(trial.id, observation)}>{observationLabel(observation, zh)}</button>)}
      </div>}
      {trial.observations.length > 0 && <p>{trial.observations.map(observation => observationLabel(observation, zh)).join(' · ')}</p>}
    </div>}
  </>;
}

/** Uses the store's existing sample updates through props; no timers, physics or duplicated state. */
export default function WorldFactoryReadings({ game, mode, zh, onObserve }: Props) {
  const { current, history } = selectFactoryReadings(game, mode);
  return <div className="factory-readings" style={{ display: 'block' }}>
    {current ? <><FactoryTrialReadings trial={current} zh={zh} onObserve={onObserve} records={game.trials} />
      {current.status !== 'running' && factoryWheelExperiment(game, zh, current) && <p className="factory-experiment-advice">{factoryWheelExperiment(game, zh, current)}</p>}</> :
      <p>{mode === 'comparison' ? (zh ? '当前配置尚无双机试验记录。' : 'No comparison trial for this configuration yet.') :
        (zh ? '当前配置尚无单机试验记录。' : 'No single trial for this configuration yet.')}</p>}
    {history.length > 0 && <details style={{ marginTop: 12 }}>
      <summary>{zh ? `历史试验（${history.length}）` : `Trial history (${history.length})`}</summary>
      {history.map(trial => <details key={trial.id} style={{ marginTop: 12 }}>
        <summary>{zh ? '配置' : 'Rev'} {trial.configuration.revision} · {zh ? '轮次' : 'Run'} {factoryTrialRound(trial)} · {factoryTrialStatus(trial, zh)}</summary>
        <FactoryTrialReadings trial={trial} zh={zh} onObserve={onObserve} records={game.trials} />
      </details>)}
    </details>}
  </div>;
}
