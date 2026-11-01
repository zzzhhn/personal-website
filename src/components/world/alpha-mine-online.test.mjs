import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHA_FACTORS } from './alpha-mine-data.ts';
import { adaptMineBacktest, createMineOnlineClient, mineBacktestParameters,
  MINE_BACKTEST_ENDPOINT, MINE_BACKTEST_TIMEOUT_MS, MINE_RECOVERY_DELAY_MS, mineOnlineMessage } from './alpha-mine-online.ts';

const ids = ALPHA_FACTORS.map(f => f.id);
const dates = Array.from({ length: 20 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
function fixture(id = ids[0]) {
  const metrics = { ic_spearman: .1, max_drawdown: -.2, turnover: .8, total_return: -.1, sharpe: -.4 };
  return { factor_name: id, direction: 'long_short', benchmark_ticker: 'SPY', neutralize: 'none', currency: 'USD',
    survivorship_corrected: true, membership_as_of: '2026-01-14', train_end_index: 16,
    equity_curve: dates.map((date, i) => ({ date, value: 100000 - i * 1000 })),
    benchmark_curve: dates.map((date, i) => ({ date, value: 200000 + i * 1000 })),
    train_metrics: { ...metrics, n_days: 14 }, test_metrics: { ...metrics, ic_spearman: -.07, n_days: 3 } };
}
const response = id => new Response(JSON.stringify(fixture(id)));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('adapts actual currency curves, API test metrics, split and truthful survivorship metadata', () => {
  const result = adaptMineBacktest(ids[0], fixture());
  assert.equal(result.factor.curve[0].nav, 1); assert.equal(result.factor.curve[0].benchmark, 1);
  assert.equal(result.factor.curve[1].nav, .99); assert.equal(result.factor.curve[1].benchmark, 1.005);
  assert.equal(result.factor.metrics.ic, -.07); assert.equal(result.factor.trainMetrics.ic, .1);
  assert.deepEqual(result.factor.trainRange, { start: dates[0], end: dates[14] });
  assert.deepEqual(result.factor.testRange, { start: dates[17], end: dates[19] });
  assert.equal(result.actual.survivorshipCorrected, true); assert.equal(result.actual.membershipAsOf, '2026-01-14');
  assert.equal(result.actual.currency, 'USD'); assert.equal(result.actual.trainEndIndex, 16);
  const legacy = fixture(); legacy.survivorship_corrected = false; legacy.membership_as_of = null;
  assert.equal(adaptMineBacktest(ids[0], legacy).actual.survivorshipCorrected, false);
});

test('rejects wrong factor/mode, nonfinite metrics, malformed calendars, mismatched benchmark and invalid split', () => {
  const mutations = [
    p => { p.factor_name = ids[1]; }, p => { p.direction = 'long_only'; },
    p => { p.benchmark_ticker = 'RSP'; }, p => { p.neutralize = 'sector'; },
    p => { p.currency = ''; }, p => { delete p.survivorship_corrected; },
    p => { p.membership_as_of = '2026-02-30'; }, p => { p.equity_curve = []; },
    p => { p.benchmark_curve.pop(); }, p => { p.equity_curve[1].date = dates[0]; },
    p => { p.equity_curve.reverse(); }, p => { p.equity_curve[2].date = '2026-02-30'; },
    p => { p.benchmark_curve[2].date = dates[3]; }, p => { p.equity_curve[3].value = Infinity; },
    p => { p.benchmark_curve[3].value = 0; }, p => { p.equity_curve[0].value = Number.MIN_VALUE; },
    p => { p.train_end_index = 15; }, p => { p.train_end_index = 16.5; },
    p => { p.test_metrics.ic_spearman = NaN; }, p => { p.test_metrics.ic_spearman = 1.1; },
    p => { p.test_metrics.max_drawdown = .1; }, p => { p.test_metrics.turnover = -1; },
    p => { p.test_metrics.total_return = -1; }, p => { p.train_metrics.sharpe = Infinity; },
    p => { p.train_metrics.n_days = 16; }, p => { p.test_metrics.n_days = 4; },
    p => { p.test_metrics.n_days = 1; }, p => { p.test_metrics.ic_pvalue = NaN; },
  ];
  for (const mutate of mutations) { const p = fixture(); mutate(p); assert.throws(() => adaptMineBacktest(ids[0], p), /Invalid online backtest/); }
  assert.throws(() => adaptMineBacktest('UNKNOWN', fixture()), /Unknown mine factor/);
});

test('fixed public request has no dynamic formula, credentials, breakdown or lookahead-mode substitution', () => {
  for (const seed of ALPHA_FACTORS) {
    const p = mineBacktestParameters(seed.id);
    assert.deepEqual(p.spec, seed.spec); assert.notEqual(p.spec, seed.spec);
    assert.deepEqual({ ...p, spec: undefined }, { spec: undefined, direction: 'long_short', top_pct: .3, bottom_pct: .3,
      train_ratio: .8, transaction_cost_bps: 10, purge_days: 1, embargo_days: 1, neutralize: 'none', benchmark_ticker: 'SPY',
      include_breakdown: false, mode: 'static', apply_survivorship_mask: true });
    p.spec.operators_used.push('mutated'); assert.notDeepEqual(p.spec.operators_used, seed.spec.operators_used);
  }
});

test('no request until deposit callback; dedupes, serializes three factors and retains only three canonical caches', async () => {
  const calls = [], gates = [];
  const client = createMineOnlineClient({ fetch: (url, init) => { const gate = deferred(); calls.push({ url, init }); gates.push(gate); return gate.promise; },
    now: () => new Date('2026-10-26T01:02:03Z') });
  assert.equal(calls.length, 0); assert.ok(Object.values(client.store.getState().factors).every(e => e.status === 'idle'));
  const first = client.request(ids[0]); assert.equal(client.request(ids[0]), first);
  const second = client.request(ids[1]), third = client.request(ids[2]);
  assert.equal(calls.length, 1); assert.ok(Object.values(client.store.getState().factors).every(e => e.status === 'loading'));
  for (let i = 0; i < 3; i++) {
    gates[i].resolve(response(ids[i])); await [first, second, third][i];
    assert.equal(calls.length, Math.min(i + 2, 3));
  }
  for (const id of ids) { await client.request(id); await client.request(id, true); }
  assert.equal(calls.length, 3); assert.equal(Object.keys(client.store.getState().factors).length, 3);
  for (let i = 0; i < calls.length; i++) {
    const { url, init } = calls[i]; assert.equal(url, MINE_BACKTEST_ENDPOINT);
    assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body), mineBacktestParameters(ids[i]));
  }
  const metadata = client.store.getState().factors[ids[0]].result.metadata;
  assert.equal(metadata.source, 'live-alpha-backtest'); assert.equal(metadata.survivorshipCorrected, true);
  assert.equal(metadata.computedAtBasis, 'client-response-validation'); assert.equal(metadata.computedAt, '2026-10-26T01:02:03.000Z');
  assert.equal(metadata.metricsScope, 'test'); assert.equal(metadata.metricRangeBasis, 'returned-split-with-requested-purge-embargo');
  assert.equal('datasetHash' in metadata, false); assert.equal('license' in metadata, false); assert.equal('engineCommit' in metadata, false);
  assert.throws(() => client.request('UNKNOWN'), /Unknown mine factor/);
  client.release(); assert.ok(Object.values(client.store.getState().factors).every(e => e.status === 'ready'));
});

test('explicit-retry mode preserves failures without fallback and can retry the retained ore', async () => {
  for (const fail of [() => new Response('{}', { status: 503 }), () => { throw new Error('offline'); }, () => new Response('{}')]) {
    let count = 0;
    const client = createMineOnlineClient({ automaticRecovery: false, fetch: async () => { count++; return count === 1 ? fail() : response(ids[0]); } });
    await client.request(ids[0]);
    assert.equal(client.store.getState().factors[ids[0]].status, 'error'); assert.equal(client.store.getState().factors[ids[0]].result, null);
    await client.request(ids[0]); assert.equal(count, 1);
    await client.request(ids[0], true); assert.equal(count, 2); assert.equal(client.store.getState().factors[ids[0]].status, 'ready');
  }
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test('transient service failure recovers once, deduplicates player clicks and holds the single request queue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const client = createMineOnlineClient({ fetch: async (_url, init) => {
    calls++; return calls === 1 ? new Response('{}', { status: 503 }) : response(JSON.parse(init.body).spec.name);
  } });
  const first = client.request(ids[1]), second = client.request(ids[2]);
  await settle();
  assert.equal(client.store.getState().factors[ids[1]].phase, 'recovering');
  assert.equal(client.store.getState().factors[ids[2]].phase, 'queued');
  assert.equal(client.request(ids[1], true), first);
  t.mock.timers.tick(MINE_RECOVERY_DELAY_MS - 1); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await first; await second;
  assert.equal(calls, 3); assert.equal(client.store.getState().factors[ids[1]].status, 'ready');
  t.mock.timers.tick(100_000); assert.equal(calls, 3);
});

test('a persistent network failure stops after two attempts and exposes actionable diagnostics', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const client = createMineOnlineClient({ fetch: async () => { calls++; throw new TypeError('Failed to fetch'); } });
  const request = client.request(ids[1]); await settle();
  t.mock.timers.tick(MINE_RECOVERY_DELAY_MS); await request;
  const entry = client.store.getState().factors[ids[1]];
  assert.equal(calls, 2); assert.equal(entry.issue.kind, 'network'); assert.equal(entry.issue.attempt, 2);
  assert.match(mineOnlineMessage(entry, true).detail, /检查网络/);
  t.mock.timers.tick(100_000); await client.request(ids[1]); assert.equal(calls, 2);
});

test('a response body interrupted after headers recovers once as a network failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const client = createMineOnlineClient({ fetch: async () => {
    calls++;
    return calls === 1 ? new Response(new ReadableStream({ start(controller) {
      controller.error(new TypeError('Response body transport interrupted'));
    } })) : response(ids[0]);
  } });
  const task = client.request(ids[0]); await settle();
  const interrupted = client.store.getState().factors[ids[0]];
  assert.equal(interrupted.phase, 'recovering'); assert.equal(interrupted.issue.kind, 'network');
  t.mock.timers.tick(MINE_RECOVERY_DELAY_MS); await task;
  assert.equal(calls, 2); assert.equal(client.store.getState().factors[ids[0]].status, 'ready');
});

test('a fully received malformed JSON result does not trigger automatic recalculation', async () => {
  let calls = 0;
  const client = createMineOnlineClient({ fetch: async () => { calls++; return new Response('{"equity_curve":'); } });
  await client.request(ids[0]);
  const entry = client.store.getState().factors[ids[0]];
  assert.equal(calls, 1); assert.equal(entry.status, 'error'); assert.equal(entry.issue.kind, 'invalid');
  assert.equal(entry.result, null);
});

test('offline, rate limits and invalid results do not auto-repeat a calculation', async () => {
  let calls = 0, online = false;
  const client = createMineOnlineClient({ isOnline: () => online, fetch: async () => { calls++; return response(ids[0]); } });
  await client.request(ids[0]); assert.equal(calls, 0); assert.equal(client.store.getState().factors[ids[0]].issue.kind, 'offline');
  online = true; await client.request(ids[0], true); assert.equal(calls, 1);
  for (const [reply,kind,status] of [[new Response('{}',{status:429}),'http',429],[new Response('{}'),'invalid',undefined]]) {
    let count = 0; const c = createMineOnlineClient({fetch:async()=>{count++;return reply;}});
    await c.request(ids[0]); const entry=c.store.getState().factors[ids[0]];
    assert.equal(count,1); assert.equal(entry.issue.kind,kind); assert.equal(entry.issue.httpStatus,status);
    assert.equal(entry.result,null); assert.notEqual(mineOnlineMessage(entry,true).title,'连接中断');
  }
});

test('release or a newly hidden page prevents delayed recovery and clears its timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const cancel of [true,false]) {
    let calls=0,visible=true;
    const client=createMineOnlineClient({isVisible:()=>visible,fetch:async()=>{calls++;throw new TypeError('network');}});
    const task=client.request(ids[0]); await settle();
    assert.equal(client.store.getState().factors[ids[0]].phase,'recovering');
    if(cancel)client.release();else visible=false;
    t.mock.timers.tick(MINE_RECOVERY_DELAY_MS); await task;
    t.mock.timers.tick(100_000); assert.equal(calls,1);
    assert.equal(client.store.getState().factors[ids[0]].status,cancel?'idle':'error');
  }
});

test('finite timeout aborts even a non-cooperative transport, releases queue and never automatically retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const client = createMineOnlineClient({ timeoutMs: 100_000, fetch: async (_url, init) => {
    signals.push(init.signal); if (signals.length === 1) return new Promise(() => {}); return response(ids[1]);
  } });
  const first = client.request(ids[0]), second = client.request(ids[1]);
  t.mock.timers.tick(MINE_BACKTEST_TIMEOUT_MS - 1); assert.equal(signals[0].aborted, false);
  t.mock.timers.tick(1); await first; await second;
  assert.equal(signals[0].aborted, true); assert.equal(signals.length, 2);
  assert.equal(client.store.getState().factors[ids[0]].status, 'error');
  assert.match(client.store.getState().factors[ids[0]].error, /timed out/);
  assert.equal(client.store.getState().factors[ids[1]].status, 'ready');
  t.mock.timers.tick(1_000_000); assert.equal(signals.length, 2);
});

test('unmount cancels active and queued work; a stale response cannot overwrite a new visit request', async () => {
  const stale = deferred(), fresh = deferred(); let count = 0, firstSignal;
  const client = createMineOnlineClient({ fetch: (_url, init) => { count++; if (count === 1) firstSignal = init.signal;
    return count === 1 ? stale.promise : fresh.promise; } });
  const first = client.request(ids[0]), queued = client.request(ids[1]); client.release();
  assert.equal(firstSignal.aborted, true); assert.equal(count, 1);
  assert.ok(Object.values(client.store.getState().factors).every(e => e.status === 'idle'));
  const next = client.request(ids[0]); await first; await queued; await Promise.resolve();
  assert.equal(count, 2); fresh.resolve(response(ids[0])); await next;
  const accepted = client.store.getState().factors[ids[0]].result;
  stale.resolve(response(ids[0])); await Promise.resolve(); await Promise.resolve();
  assert.equal(client.store.getState().factors[ids[0]].result, accepted);
  assert.equal(client.store.getState().factors[ids[1]].status, 'idle'); client.release();
});
