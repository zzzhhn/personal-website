/** Local, precomputed historical research. No market/API computation occurs in the browser. */
export type AlphaFactorId = 'REVERSAL_5' | 'ROC20_RANK' | 'LOW_STD_20';
export interface AlphaFactorSpec {
  name: AlphaFactorId;
  hypothesis: string;
  expression: string;
  operators_used: string[];
  lookback: number;
  universe: 'SP500';
  justification: string;
}

export const ALPHA_FACTORS = [
  {
    id: 'REVERSAL_5', label: '回声矿', labelEn: 'Echo ore', color: '#b7864d',
    hypothesis: '最近跌得多的股票可能短暂反弹；趋势延续和交易成本也可能使它失败。',
    hypothesisEn: 'Recent losers may briefly rebound; persistent trends and trading costs can defeat the hypothesis.',
    spec: {
      name: 'REVERSAL_5', hypothesis: 'Recent five-day losers may rebound relative to recent winners.',
      expression: 'subtract(0.0, subtract(divide(close, ts_delay(close, 5)), 1.0))',
      operators_used: ['subtract', 'divide', 'ts_delay'], lookback: 5, universe: 'SP500',
      justification: 'A fixed public price-only seed; short-horizon reversal is a hypothesis, not a promise.',
    },
  },
  {
    id: 'ROC20_RANK', label: '顺流矿', labelEn: 'Current ore', color: '#5c9b91',
    hypothesis: '最近相对强势的股票可能继续领先；反转行情也可能让趋势失效。',
    hypothesisEn: 'Relative strength may persist; a reversal in market leadership can break the trend.',
    spec: {
      name: 'ROC20_RANK', hypothesis: 'Stocks with stronger trailing twenty-day returns may continue to lead.',
      expression: 'rank(subtract(divide(close, ts_delay(close, 20)), 1.0))',
      operators_used: ['rank', 'subtract', 'divide', 'ts_delay'], lookback: 20, universe: 'SP500',
      justification: 'A fixed public price-only seed testing cross-sectional momentum without fitting parameters.',
    },
  },
  {
    id: 'LOW_STD_20', label: '稳岩矿', labelEn: 'Bedrock ore', color: '#9ba8b1',
    hypothesis: '近期波动小的股票获得较高分；低风险并不保证更高的绝对收益。',
    hypothesisEn: 'Lower recent volatility receives a higher score; lower risk does not guarantee higher returns.',
    spec: {
      name: 'LOW_STD_20', hypothesis: 'Stocks with lower trailing twenty-day return volatility may outperform.',
      expression: 'subtract(0.0, ts_std(returns, 20))',
      operators_used: ['subtract', 'ts_std'], lookback: 20, universe: 'SP500',
      justification: 'A fixed public price-only seed testing low volatility; strong markets may favor riskier stocks.',
    },
  },
] satisfies Array<{ id: AlphaFactorId; label: string; labelEn: string; color: string; hypothesis: string; hypothesisEn: string; spec: AlphaFactorSpec }>;

export interface AlphaDateRange { start: string; end: string }
export interface AlphaMetrics { ic: number; maxDrawdown: number; turnover: number; totalReturn: number }
export interface AlphaReplayFactor {
  spec: AlphaFactorSpec;
  curve: Array<{ date: string; nav: number; benchmark: number }>;
  /** Metrics refer only to testRange; ratios are decimal fractions, not percentages. */
  metrics: AlphaMetrics;
  trainMetrics: AlphaMetrics;
  trainRange: AlphaDateRange;
  testRange: AlphaDateRange;
}
export interface AlphaReplayPack {
  schemaVersion: 1;
  mode: 'historical-backtest-replay';
  generatedAt: string;
  dataset: {
    id: string; hash: string; source: string; asOf: string; dateRange: AlphaDateRange;
    assetCount: number; licenseStatus: 'local-only-unconfirmed';
  };
  engineCommit: string;
  resultHash: string;
  params: {
    direction: 'long_short'; topPct: number; bottomPct: number; trainRatio: number;
    transactionCostBps: number; slippageBps: number; shortBorrowBps: number;
    purgeDays: number; embargoDays: number; neutralize: 'none'; benchmark: 'SPY';
    survivorshipMask: false; metricsScope: 'test';
  };
  factors: Record<AlphaFactorId, AlphaReplayFactor>;
  limitations: string[];
  metricDefinitions: Record<'ic' | 'maxDrawdown' | 'turnover' | 'totalReturn' | 'curve', string>;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 2000;
const day = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const range = (value: unknown): value is AlphaDateRange => record(value) && day(value.start) && day(value.end) && value.start <= value.end;
const hash = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const check = (condition: unknown, label: string): void => { if (!condition) throw new Error(`历史回测包无效：${label}`); };
function validateMetrics(value: unknown): void {
  check(record(value), 'metrics');
  const m = value as Record<string, unknown>;
  check(finite(m.ic) && Math.abs(m.ic) <= 1, 'IC');
  check(finite(m.maxDrawdown) && m.maxDrawdown >= -1 && m.maxDrawdown <= 0, 'maxDrawdown');
  check(finite(m.turnover) && m.turnover >= 0 && m.turnover <= 4.000001, 'turnover');
  check(finite(m.totalReturn) && m.totalReturn > -1, 'totalReturn');
}

/** Reject malformed/local-mode drift before any result can be presented as evidence. */
export function validateAlphaReplay(value: unknown): AlphaReplayPack {
  check(record(value), 'manifest');
  const p = value as Record<string, any>;
  check(p.schemaVersion === 1 && p.mode === 'historical-backtest-replay', 'schema/mode');
  check(typeof p.generatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p.generatedAt) && Number.isFinite(Date.parse(p.generatedAt)), 'generatedAt');
  check(record(p.dataset), 'dataset');
  const d = p.dataset;
  check(text(d.id) && hash(d.hash) && text(d.source), 'dataset provenance');
  check(d.licenseStatus === 'local-only-unconfirmed', 'licenseStatus');
  check(day(d.asOf) && range(d.dateRange) && d.asOf === d.dateRange.end, 'dataset date range');
  check(Number.isInteger(d.assetCount) && d.assetCount >= 10 && d.assetCount <= 10000, 'assetCount');
  check(typeof p.engineCommit === 'string' && /^[a-f0-9]{40}$/.test(p.engineCommit) && hash(p.resultHash), 'engine/result hash');
  check(record(p.params), 'params');
  const a = p.params;
  check(a.direction === 'long_short' && a.neutralize === 'none' && a.benchmark === 'SPY'
    && a.survivorshipMask === false && a.metricsScope === 'test', 'parameter mode');
  check(a.topPct === 0.3 && a.bottomPct === 0.3 && a.trainRatio === 0.8
    && a.transactionCostBps === 10 && a.slippageBps === 0 && a.shortBorrowBps === 0
    && a.purgeDays === 1 && a.embargoDays === 1, 'fixed pilot parameters');
  check(Array.isArray(p.limitations) && p.limitations.length > 0 && p.limitations.every(text), 'limitations');
  check(record(p.metricDefinitions) && ['ic', 'maxDrawdown', 'turnover', 'totalReturn', 'curve'].every(k => text(p.metricDefinitions[k])), 'metric definitions');
  check(record(p.factors) && Object.keys(p.factors).length === ALPHA_FACTORS.length, 'factor whitelist');
  let referenceDates: string[] | undefined;
  for (const seed of ALPHA_FACTORS) {
    const f = p.factors[seed.id];
    check(record(f) && record(f.spec), `factor ${seed.id}`);
    for (const key of ['name', 'hypothesis', 'expression', 'lookback', 'universe', 'justification'] as const) {
      check(f.spec[key] === seed.spec[key], `${seed.id} spec ${key}`);
    }
    check(Array.isArray(f.spec.operators_used) && JSON.stringify([...f.spec.operators_used].sort()) === JSON.stringify([...seed.spec.operators_used].sort()), 'operators');
    validateMetrics(f.metrics); validateMetrics(f.trainMetrics);
    check(range(f.trainRange) && range(f.testRange) && f.trainRange.start >= d.dateRange.start
      && f.trainRange.end < f.testRange.start && f.testRange.end <= d.dateRange.end, 'train/test separation');
    check(Array.isArray(f.curve) && f.curve.length >= 2 && f.curve.length <= 10000, 'curve length');
    let previous = '';
    const dates: string[] = [];
    for (const row of f.curve) {
      check(record(row) && day(row.date) && row.date > previous && row.date >= d.dateRange.start && row.date <= d.dateRange.end, 'curve date order');
      check(finite(row.nav) && row.nav > 0 && finite(row.benchmark) && row.benchmark > 0, 'finite curve values');
      previous = row.date; dates.push(row.date);
    }
    check(dates[0] === d.dateRange.start && dates.at(-1) === d.dateRange.end
      && f.curve[0].nav === 1 && f.curve[0].benchmark === 1, 'curve endpoints');
    check(dates.includes(f.trainRange.start) && dates.includes(f.trainRange.end) && dates.includes(f.testRange.start) && dates.includes(f.testRange.end), 'split endpoints');
    check(!referenceDates || JSON.stringify(referenceDates) === JSON.stringify(dates), 'shared calendar');
    referenceDates = dates;
  }
  return value as AlphaReplayPack;
}

export type AlphaReplayLoad = { status: 'ready'; pack: AlphaReplayPack }
  | { status: 'missing' | 'error'; message: string };

export async function fetchAlphaReplay(signal?: AbortSignal): Promise<AlphaReplayLoad> {
  try {
    const response = await fetch('/__alpha-pilot/results.json', { signal, cache: 'no-store', credentials: 'omit' });
    if (response.status === 404) return { status: 'missing', message: '本机尚未生成真实历史回测结果。此入口仅在本机开发环境提供。' };
    if (!response.ok) throw new Error(`读取历史回测失败（HTTP ${response.status}）`);
    const pack = validateAlphaReplay(await response.json());
    return { status: 'ready', pack };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    return { status: 'error', message: error instanceof Error ? error.message : '无法读取本机历史回测包。' };
  }
}
