import { create } from 'zustand';
import { ALPHA_FACTORS, type AlphaFactorId, type AlphaMetrics, type AlphaReplayFactor } from './alpha-mine-data.ts';

export const MINE_BACKTEST_ENDPOINT = 'https://alpha-api.bobbyzhong.com/api/v1/factor/backtest';
export const MINE_BACKTEST_TIMEOUT_MS = 25_000;
export const MINE_RECOVERY_DELAY_MS = 1_500;
export interface MineOnlineIssue {
  kind: 'offline' | 'network' | 'timeout' | 'http' | 'invalid';
  requestId: string; attempt: number; elapsedMs: number; httpStatus?: number;
}
class BacktestFailure extends Error {
  readonly kind: MineOnlineIssue['kind'];
  readonly httpStatus?: number;
  constructor(kind: MineOnlineIssue['kind'], httpStatus?: number) { super(kind); this.kind=kind; this.httpStatus=httpStatus; }
}
const PARAMETERS = {
  direction: 'long_short', top_pct: .3, bottom_pct: .3, train_ratio: .8,
  transaction_cost_bps: 10, purge_days: 1, embargo_days: 1, neutralize: 'none',
  benchmark_ticker: 'SPY', include_breakdown: false, mode: 'static', apply_survivorship_mask: true,
} as const;

export function mineBacktestParameters(id: AlphaFactorId) {
  const seed = ALPHA_FACTORS.find(f => f.id === id);
  if (!seed) throw new Error('Unknown mine factor');
  return { spec: { ...seed.spec, operators_used: [...seed.spec.operators_used] }, ...PARAMETERS };
}
export interface MineOnlineResult {
  factor: AlphaReplayFactor;
  metadata: {
    source: 'live-alpha-backtest'; endpoint: string; requestId: string; requestedAt: string;
    /** Client acceptance time; the API supplies no server computation timestamp. */
    computedAt: string; computedAtBasis: 'client-response-validation';
    parameters: ReturnType<typeof mineBacktestParameters>;
    survivorshipCorrected: boolean; membershipAsOf: string | null; currency: string;
    dateRange: { start: string; end: string }; trainEndIndex: number;
    metricsScope: 'test'; metricsDays: { train: number; test: number };
    /** Only these parameter values are acknowledged by the response. */
    acknowledgedParameters: { direction: 'long_short'; benchmark: 'SPY'; neutralize: 'none' };
    metricRangeBasis: 'returned-split-with-requested-purge-embargo';
  };
}
export interface MineOnlineEntry {
  status: 'idle' | 'loading' | 'ready' | 'error'; result: MineOnlineResult | null; error: string | null;
  phase?: 'queued' | 'requesting' | 'slow' | 'recovering'; issue?: MineOnlineIssue | null;
}
export interface MineOnlineState { factors: Record<AlphaFactorId, MineOnlineEntry> }
const initial = (): MineOnlineState => ({ factors: Object.fromEntries(ALPHA_FACTORS.map(f => [f.id,
  { status: 'idle', result: null, error: null }])) as MineOnlineState['factors'] });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`在线回测结果无效 / Invalid online backtest: ${label}`);
}
function metrics(v: unknown, maxDays: number): { metrics: AlphaMetrics; days: number } {
  check(record(v), 'metrics');
  check(finite(v.ic_spearman) && Math.abs(v.ic_spearman) <= 1, 'IC');
  check(finite(v.max_drawdown) && v.max_drawdown >= -1 && v.max_drawdown <= 0, 'drawdown');
  check(finite(v.turnover) && v.turnover >= 0 && v.turnover <= 4.000001, 'turnover');
  check(finite(v.total_return) && v.total_return > -1 && finite(v.sharpe), 'return/Sharpe');
  check(Number.isInteger(v.n_days) && (v.n_days as number) >= 2 && (v.n_days as number) <= maxDays, 'scored days');
  check(Object.values(v).every(finite), 'non-finite metric');
  return { metrics: { ic: v.ic_spearman, maxDrawdown: v.max_drawdown, turnover: v.turnover, totalReturn: v.total_return }, days: v.n_days as number };
}

/** The API reports currency-valued curves; normalize each series by its own first value. */
export function adaptMineBacktest(id: AlphaFactorId, value: unknown) {
  const parameters = mineBacktestParameters(id);
  check(record(value), 'response');
  check(value.factor_name === id && value.direction === PARAMETERS.direction
    && value.benchmark_ticker === PARAMETERS.benchmark_ticker && value.neutralize === PARAMETERS.neutralize, 'factor/parameters');
  check(typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency), 'currency');
  check(typeof value.survivorship_corrected === 'boolean', 'survivorship metadata');
  check(value.membership_as_of === null || day(value.membership_as_of), 'membership date');
  const equity = value.equity_curve, benchmark = value.benchmark_curve;
  check(Array.isArray(equity) && equity.length >= 10 && equity.length <= 10_000
    && Array.isArray(benchmark) && benchmark.length === equity.length, 'curve length');
  const split = value.train_end_index;
  check(Number.isInteger(split) && split === Math.floor(equity.length * PARAMETERS.train_ratio), 'train/test split');
  const trainEnd = (split as number) - PARAMETERS.purge_days;
  const testStart = (split as number) + PARAMETERS.embargo_days;
  check(trainEnd > 1 && testStart < equity.length - 1, 'purge/embargo');
  let previous = '';
  for (let i = 0; i < equity.length; i++) {
    const a = equity[i], b = benchmark[i];
    check(record(a) && record(b) && day(a.date) && a.date > previous && a.date === b.date, 'ordered aligned dates');
    check(finite(a.value) && a.value > 0 && finite(b.value) && b.value > 0, 'positive finite curve');
    previous = a.date;
  }
  const curve = equity.map((row, i) => ({ date: row.date as string,
    nav: row.value / equity[0].value, benchmark: benchmark[i].value / benchmark[0].value }));
  check(curve.every(p => finite(p.nav) && p.nav > 0 && finite(p.benchmark) && p.benchmark > 0), 'normalized curve');
  const train = metrics(value.train_metrics, trainEnd), test = metrics(value.test_metrics, equity.length - testStart);
  const factor: AlphaReplayFactor = { spec: parameters.spec, curve, metrics: test.metrics, trainMetrics: train.metrics,
    trainRange: { start: curve[0].date, end: curve[trainEnd - 1].date },
    testRange: { start: curve[testStart].date, end: curve.at(-1)!.date } };
  return { factor, actual: { survivorshipCorrected: value.survivorship_corrected,
    membershipAsOf: value.membership_as_of as string | null, currency: value.currency,
    dateRange: { start: curve[0].date, end: curve.at(-1)!.date }, trainEndIndex: split as number,
    metricsDays: { train: train.days, test: test.days } } };
}

/** Shared, translated status for the detector and the pool. No raw server body is displayed. */
export function mineOnlineMessage(entry: MineOnlineEntry, zh: boolean) {
  const t = (cn: string, en: string) => zh ? cn : en;
  if (entry.status === 'loading') {
    if (entry.phase === 'queued') return { title: t('等待前一份回测完成', 'Waiting for the previous backtest'), detail: t('矿石已放好，轮到后会自动开始。', 'Your ore is in place. This calculation will start next.') };
    if (entry.phase === 'recovering') return { title: t('连接暂时失联，正在恢复一次', 'Reconnecting once'), detail: t('矿石仍在池中，不用重新开采。', 'Your ore is still in the pool. No need to mine it again.') };
    if (entry.phase === 'slow') return { title: t('这次计算稍慢，请再等一会儿', 'This calculation is taking a little longer'), detail: t('仍在等待线上结果，25 秒内未返回会停止等待。', 'Still awaiting the online result. Waiting stops after 25 seconds.') };
    return { title: t('正在读取市场的回声…', 'Reading the market’s history…'), detail: t('线上计算完成后，曲线与指标会在这里浮现。', 'The online curve and metrics will appear here.') };
  }
  const issue = entry.issue;
  if (issue?.kind === 'offline') return { title: t('设备当前离线', 'Your device is offline'), detail: t('矿石已保留。恢复网络后，在池边再试一次。', 'Ore retained. Reconnect, then retry at the pool.') };
  if (issue?.kind === 'timeout') return { title: t('回测等待超过 25 秒', 'Backtest timed out after 25 seconds'), detail: t('矿石已保留。稍后重试，不需要重新投矿。', 'Ore retained. Retry shortly without casting another ore.') };
  if (issue?.kind === 'invalid') return { title: t('回测结果未通过完整性检查', 'The result failed its integrity check'), detail: t('没有显示不完整的数据。矿石已保留，可重试。', 'Incomplete data was not displayed. Ore retained; you can retry.') };
  if (issue?.kind === 'http') return { title: issue.httpStatus === 429 ? t('回测服务当前繁忙', 'The backtest service is busy') : t('回测服务暂时不可用', 'The backtest service is unavailable'), detail: t('矿石已保留。请稍后重试；错误编号见来源详情。', 'Ore retained. Retry later; the error code is in source details.') };
  return { title: t('未能连接回测服务', 'Could not reach the backtest service'), detail: t('矿石已保留。检查网络后，在池边再试一次。', 'Ore retained. Check your connection, then retry at the pool.') };
}

/** One in-flight request, three caches and at most one recovery for a transient failure.
 * Timeouts, rate limits and invalid data need a player retry; no background polling. */
export function createMineOnlineClient(options: { fetch?: typeof fetch; timeoutMs?: number; now?: () => Date;
  automaticRecovery?: boolean; isOnline?: () => boolean; isVisible?: () => boolean } = {}) {
  const store = create<MineOnlineState>(initial);
  const now = options.now ?? (() => new Date());
  const timeoutMs = Math.min(MINE_BACKTEST_TIMEOUT_MS, Math.max(1, options.timeoutMs ?? MINE_BACKTEST_TIMEOUT_MS));
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const isVisible = options.isVisible ?? (() => typeof document === 'undefined' || !document.hidden);
  interface Job { id: AlphaFactorId; requestId: string; controller: AbortController; cancelled: boolean;
    timedOut: boolean; resolve: () => void; promise: Promise<void> }
  const jobs = new Map<AlphaFactorId, Job>(), queue: Job[] = [];
  let active: Job | null = null, sequence = 0;
  const update = (id: AlphaFactorId, entry: MineOnlineEntry) => store.setState(s => ({ factors: { ...s.factors, [id]: entry } }));
  async function drain() {
    if (active || !queue.length) return;
    const job = queue.shift()!; active = job;
    const parameters = mineBacktestParameters(job.id), requestedAt = now().toISOString();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('Request aborted', 'AbortError'));
      job.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    let timer: ReturnType<typeof setTimeout> | undefined, slowTimer: ReturnType<typeof setTimeout> | undefined;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      for (let attempt = 1; attempt <= 2 && !job.cancelled; attempt++) {
        const startedAt = now().getTime();
        update(job.id, { status: 'loading', phase: 'requesting', error: null, result: null });
        timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, timeoutMs);
        slowTimer = setTimeout(() => { if (!job.cancelled) update(job.id, { status: 'loading', phase: 'slow', error: null, result: null }); }, 8_000);
        try {
          const work = async () => {
            if (!isOnline()) throw new BacktestFailure('offline');
            const response = await (options.fetch ?? globalThis.fetch)(MINE_BACKTEST_ENDPOINT, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
              cache: 'no-store', redirect: 'error', signal: job.controller.signal, body: JSON.stringify(parameters),
            });
            if (!response.ok) throw new BacktestFailure('http', response.status);
            try { return adaptMineBacktest(job.id, await response.json()); }
            catch { throw new BacktestFailure('invalid'); }
          };
          const result = await Promise.race([work(), aborted]);
          if (!job.cancelled) update(job.id, { status: 'ready', error: null, result: { factor: result.factor,
            metadata: { source: 'live-alpha-backtest', endpoint: MINE_BACKTEST_ENDPOINT, requestId: job.requestId,
              requestedAt, computedAt: now().toISOString(), computedAtBasis: 'client-response-validation', parameters,
              ...result.actual, metricsScope: 'test', metricRangeBasis: 'returned-split-with-requested-purge-embargo',
              acknowledgedParameters: { direction: 'long_short', benchmark: 'SPY', neutralize: 'none' } } } });
          break;
        } catch (error) {
          clearTimeout(timer); clearTimeout(slowTimer);
          if (job.cancelled) break;
          const issue: MineOnlineIssue = { kind: job.timedOut ? 'timeout' : error instanceof BacktestFailure ? error.kind : 'network',
            requestId: job.requestId, attempt, elapsedMs: Math.max(0, now().getTime() - startedAt),
            ...(error instanceof BacktestFailure && error.httpStatus ? { httpStatus: error.httpStatus } : {}) };
          const transient = issue.kind === 'network' || (issue.kind === 'http' && [502, 503, 504].includes(issue.httpStatus!));
          if (attempt === 1 && transient && options.automaticRecovery !== false && isOnline() && isVisible()) {
            update(job.id, { status: 'loading', phase: 'recovering', error: null, result: null, issue });
            await Promise.race([new Promise<void>(resolve => { recoveryTimer = setTimeout(resolve, MINE_RECOVERY_DELAY_MS); }), aborted]);
            // A hidden tab must not start another calculation after the backoff.
            if (!job.cancelled && isOnline() && isVisible()) continue;
          }
          if (!job.cancelled) {
            const entry: MineOnlineEntry = { status: 'error', result: null, error: null, issue };
            const cn = mineOnlineMessage(entry, true), en = mineOnlineMessage(entry, false);
            entry.error = `${cn.title} / ${en.title}`;
            update(job.id, entry);
          }
          break;
        } finally { clearTimeout(timer); clearTimeout(slowTimer); }
      }
    } catch { /* release() cancels a pending recovery without publishing an error. */
    } finally {
      clearTimeout(timer); clearTimeout(slowTimer); clearTimeout(recoveryTimer); job.controller.signal.removeEventListener('abort', onAbort);
      if (jobs.get(job.id) === job) jobs.delete(job.id);
      active = null; job.resolve(); void drain();
    }
  }
  function request(id: AlphaFactorId, retry = false): Promise<void> {
    mineBacktestParameters(id); // Runtime whitelist, before publishing state or opening a connection.
    const pending = jobs.get(id);
    if (pending) return pending.promise;
    const entry = store.getState().factors[id];
    if (entry.status === 'ready' || (entry.status === 'error' && !retry)) return Promise.resolve();
    let resolve = () => {};
    const promise = new Promise<void>(done => { resolve = done; });
    const job: Job = { id, requestId: `mine-${++sequence}`, controller: new AbortController(),
      cancelled: false, timedOut: false, resolve, promise };
    jobs.set(id, job); queue.push(job); update(id, { status: 'loading', phase: 'queued', result: null, error: null });
    void drain(); return promise;
  }
  function release() {
    for (const job of jobs.values()) {
      job.cancelled = true; job.controller.abort(); job.resolve();
      if (store.getState().factors[job.id].status === 'loading') update(job.id, { status: 'idle', result: null, error: null });
    }
    jobs.clear(); queue.length = 0;
  }
  return { store, request, release };
}

let qaNetworkFailure = false;
/** Explicit development UI fault injection; never alters the accepted result or game inventory. */
export function setMineNetworkFailureForQA(enabled: boolean) {
  if (import.meta.env?.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') qaNetworkFailure = enabled;
}
const online = createMineOnlineClient({ fetch: (url,init) => {
  if (import.meta.env?.DEV && qaNetworkFailure) return Promise.reject(new TypeError('QA simulated transport interruption'));
  return globalThis.fetch(url,init);
} });
export const useMineOnline = online.store;
/** Call only after a player's completed deposit, or their explicit retry action. */
export const requestMineBacktest = online.request;
/** Unmount cleanup cancels pending work; accepted visit-local results stay cached. */
export const releaseMineOnline = online.release;
