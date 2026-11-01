import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ALPHA_FACTORS, validateAlphaReplay, fetchAlphaReplay } from './alpha-mine-data.ts';
import { alphaReplayPlugin } from '../../../tools/world/alpha-mine-data/local-replay-plugin.mjs';

const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
function fixture() {
  const metrics = { ic: .1, maxDrawdown: -.1, turnover: .8, totalReturn: -.05 };
  return {
    schemaVersion: 1, mode: 'historical-backtest-replay', generatedAt: '2026-10-25T00:00:00Z',
    dataset: { id: 'test-fixture-only', hash: `sha256:${'0'.repeat(64)}`, source: 'Non-market validation fixture',
      asOf: dates.at(-1), dateRange: { start: dates[0], end: dates.at(-1) }, assetCount: 12, licenseStatus: 'local-only-unconfirmed' },
    engineCommit: 'a'.repeat(40), resultHash: `sha256:${'1'.repeat(64)}`,
    params: { direction: 'long_short', topPct: .3, bottomPct: .3, trainRatio: .8, transactionCostBps: 10,
      slippageBps: 0, shortBorrowBps: 0, purgeDays: 1, embargoDays: 1, neutralize: 'none', benchmark: 'SPY',
      survivorshipMask: false, metricsScope: 'test' },
    limitations: ['Test fixture; no market evidence.'],
    metricDefinitions: Object.fromEntries(['ic', 'maxDrawdown', 'turnover', 'totalReturn', 'curve'].map(k => [k, 'Fixture definition'])),
    factors: Object.fromEntries(ALPHA_FACTORS.map(f => [f.id, {
      spec: structuredClone(f.spec), metrics: { ...metrics }, trainMetrics: { ...metrics },
      curve: dates.map((date, i) => ({ date, nav: 1 - i * .01, benchmark: 1 + i * .01 })),
      trainRange: { start: dates[0], end: dates[1] }, testRange: { start: dates[3], end: dates[4] },
    }])),
  };
}

test('three whitelist specs and an explicit local historical manifest pass', () => {
  assert.deepEqual(ALPHA_FACTORS.map(f => f.id), ['REVERSAL_5', 'ROC20_RANK', 'LOW_STD_20']);
  const pack = fixture(); assert.equal(validateAlphaReplay(pack), pack);
});

test('rejects wrong provenance/mode, unrecognized factors, changed formulas and invalid parameter semantics', () => {
  for (const change of [
    p => { p.mode = 'historical-backtest-live'; },
    p => { p.dataset.licenseStatus = 'public'; },
    p => { p.dataset.hash = 'unknown'; },
    p => { p.dataset.asOf = '2026-02-30'; },
    p => { p.params.transactionCostBps = 0; },
    p => { p.params.metricsScope = 'train'; },
    p => { p.factors.UNKNOWN = p.factors.REVERSAL_5; },
    p => { p.factors.REVERSAL_5.spec.expression = 'close'; },
    p => { p.factors.REVERSAL_5.spec.operators_used = []; },
  ]) { const p = fixture(); change(p); assert.throws(() => validateAlphaReplay(p), /历史回测包无效/); }
});

test('rejects NaN, infinity, duplicate/reversed dates, overlapping splits and mismatched calendars', () => {
  for (const change of [
    p => { p.factors.REVERSAL_5.metrics.ic = NaN; },
    p => { p.factors.REVERSAL_5.metrics.ic = 1.1; },
    p => { p.factors.REVERSAL_5.metrics.maxDrawdown = .1; },
    p => { p.factors.REVERSAL_5.curve[2].nav = Infinity; },
    p => { p.factors.REVERSAL_5.curve[2].nav = 0; },
    p => { p.factors.REVERSAL_5.curve[2].date = dates[1]; },
    p => { p.factors.REVERSAL_5.curve.reverse(); },
    p => { p.factors.REVERSAL_5.trainRange.end = dates[4]; },
    p => { p.factors.REVERSAL_5.curve.splice(2, 1); },
  ]) { const p = fixture(); change(p); assert.throws(() => validateAlphaReplay(p), /历史回测包无效/); }
});

test('fetch distinguishes ready, missing, HTTP failure, invalid payload, network failure and cancellation', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let called;
  globalThis.fetch = async (...args) => { called = args; return new Response(JSON.stringify(fixture())); };
  assert.equal((await fetchAlphaReplay()).status, 'ready');
  assert.equal(called[0], '/__alpha-pilot/results.json'); assert.equal(called[1].cache, 'no-store');
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  assert.equal((await fetchAlphaReplay()).status, 'missing');
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  assert.match((await fetchAlphaReplay()).message, /503/);
  globalThis.fetch = async () => new Response('{}');
  assert.equal((await fetchAlphaReplay()).status, 'error');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await fetchAlphaReplay(), { status: 'error', message: 'offline' });
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError'); };
  await assert.rejects(fetchAlphaReplay(controller.signal), { name: 'AbortError' });
});

async function invoke(middleware, overrides = {}) {
  const headers = {};
  let body = '', passed = false;
  const req = { url: '/__alpha-pilot/results.json', method: 'GET', headers: { host: 'localhost:4341' },
    socket: { remoteAddress: '127.0.0.1', localPort: 4341 }, ...overrides };
  const res = { statusCode: 200, setHeader: (key, value) => { headers[key] = value; }, end: value => { body = value ?? ''; } };
  await middleware(req, res, () => { passed = true; });
  return { status: res.statusCode, headers, body, passed };
}

test('dev middleware serves local-only in place; missing, host/origin/port guard, HEAD and method states', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'alpha-replay-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let middleware;
  const file = path.join(dir, 'results.json');
  const plugin = alphaReplayPlugin({ resultsFile: file });
  assert.equal(plugin.apply, 'serve');
  assert.equal(plugin.generateBundle, undefined);
  plugin.configureServer({ config: { root: dir }, middlewares: { use: handler => { middleware = handler; } } });
  let result = await invoke(middleware);
  assert.equal(result.status, 404); assert.equal(JSON.parse(result.body).status, 'missing');
  await writeFile(file, JSON.stringify(fixture()));
  result = await invoke(middleware); assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.parse(result.body).mode, 'historical-backtest-replay');
  assert.equal((await invoke(middleware, { method: 'HEAD' })).body, '');
  assert.equal((await invoke(middleware, { method: 'POST' })).status, 405);
  assert.equal((await invoke(middleware, { headers: { host: 'evil.example:4341' } })).status, 403);
  assert.equal((await invoke(middleware, { headers: { host: 'localhost:4341', origin: 'https://evil.example' } })).status, 403);
  assert.equal((await invoke(middleware, { socket: { remoteAddress: '192.168.1.2', localPort: 4341 } })).status, 403);
  assert.equal((await invoke(middleware, { socket: { remoteAddress: '127.0.0.1', localPort: 4321 } })).status, 403);
  assert.equal((await invoke(middleware, { headers: { host: '127.0.0.1:4342' }, socket: { remoteAddress: '127.0.0.1', localPort: 4342 } })).status, 200);
  assert.equal((await invoke(middleware, { headers: { host: '[::1]:4342', origin: 'http://[::1]:4342' }, socket: { remoteAddress: '::1', localPort: 4342 } })).status, 200);
  assert.equal((await invoke(middleware, { url: '/other' })).passed, true);
});
