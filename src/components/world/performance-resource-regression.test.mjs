import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import { CoasterStructureCache } from './attractions/coaster-structure-cache.ts';
import { buildCoasterInWorker, coasterStructureJobs } from './attractions/coaster-structure-job.ts';
import { packCoasterStructure } from './attractions/coaster-structure-transfer.ts';
import { createIbdMotionClock, stepIbdSafeMotion } from './attractions/ibd-yard-safety.ts';

// Exercise actual resource ownership code without spawning a Worker or building
// the full coaster. Tiny real Three geometries make disposal observable.
const structure = () => ({ steel: new BoxGeometry(), glow: new BoxGeometry(), colliders: [], relief: { vertices: new Float32Array(), indices: new Uint32Array() } });
function ports(t) {
  const timers = new Map(), workers = [];
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let next = 0;
  globalThis.setTimeout = (callback, ms) => { const id = ++next; timers.set(id, { callback, ms }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  t.after(() => { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; });
  const spawn = () => {
    const worker = { onmessage: null, onerror: null, onmessageerror: null, terminated: 0,
      postMessage() {}, terminate() { this.terminated++; } };
    workers.push(worker); return worker;
  };
  return { timers, workers, spawn };
}

test('normal play: 100 mount/detail-request/unmount cycles leave no job, timeout or pending cache', async t => {
  const p = ports(t), baseline = coasterStructureJobs.active;
  let disposed = 0, signals = 0;
  for (let i = 0; i < 100; i++) {
    const cache = new CoasterStructureCache(() => {
      const value = structure();
      for (const g of [value.steel, value.glow]) g.addEventListener('dispose', () => disposed++);
      return value;
    }, (near, signal) => {
      const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
      signal.addEventListener = (...args) => { signals++; return add(...args); };
      signal.removeEventListener = (...args) => { signals--; return remove(...args); };
      return buildCoasterInWorker(near, signal, p.spawn);
    });
    cache.get(false);
    const request = cache.load(true);
    assert.equal(cache.load(true), request);
    const rejected = assert.rejects(request, /cancelled/);
    const worker = p.workers.at(-1), lateError = worker.onerror;
    assert.equal(coasterStructureJobs.active, baseline + 1);
    assert.equal(p.timers.size, 1);
    cache.dispose(); await rejected;
    lateError(); // A previously queued callback must not resurrect a disposed job.
    assert.equal(worker.terminated, 1);
    assert.equal(worker.onmessage, null); assert.equal(worker.onerror, null); assert.equal(worker.onmessageerror, null);
    assert.equal(coasterStructureJobs.active, baseline); assert.equal(p.timers.size, 0); assert.equal(signals, 0);
    assert.deepEqual(cache.snapshot(), { variants: 0, attributeBytes: 0 });
  }
  assert.equal(disposed, 200);
  t.diagnostic('100 ordinary-play lifecycle cycles: active jobs 0 delta, pending deadlines 0, abort listeners 0, 200 geometry dispose events. Mock worker transport; no browser/GPU claim.');
});

test('worker completion, load failure, malformed reply and deadline each release their owned task', async t => {
  const p = ports(t), baseline = coasterStructureJobs.active;
  for (const outcome of ['success', 'error', 'malformed', 'timeout']) {
    const controller = new AbortController();
    const promise = buildCoasterInWorker(true, controller.signal, p.spawn);
    const worker = p.workers.at(-1);
    if (outcome === 'success') {
      const value = structure(), { packet } = packCoasterStructure(value);
      worker.onmessage({ data: { packet, workerMs: 1 } });
      const result = await promise;
      value.steel.dispose(); value.glow.dispose(); result.steel.dispose(); result.glow.dispose();
    } else {
      const rejected = assert.rejects(promise);
      if (outcome === 'error') worker.onerror();
      else if (outcome === 'malformed') worker.onmessage({ data: { packet: {}, workerMs: 0 } });
      else {
        const deadline = [...p.timers.values()][0]; assert.equal(deadline.ms, 15000); deadline.callback();
      }
      await rejected;
    }
    controller.abort();
    assert.equal(worker.terminated, 1); assert.equal(p.timers.size, 0);
    assert.equal(coasterStructureJobs.active, baseline);
  }
});

test('IBD paused/away safety steps do no collision screening and blocked active retries stay bounded', t => {
  let calls = 0;
  const safety = { protectedMotion: true, stops: [1], blocked() { calls++; return true; } };
  const clock = createIbdMotionClock(), player = {};
  for (let i = 0; i < 3600; i++) stepIbdSafeMotion(clock, 3, 1 / 60, safety, player, false);
  assert.equal(calls, 0); assert.equal(clock.elapsed, 0);
  for (let i = 0; i < 600; i++) stepIbdSafeMotion(clock, 3, 1 / 60, safety, player, true);
  assert.ok(calls > 0 && calls <= 101, `10 seconds should not perform 600 blocked-path queries: ${calls}`);
  assert.equal(clock.elapsed, 0);
  const before = calls;
  for (let i = 0; i < 3600; i++) stepIbdSafeMotion(clock, 3, 1 / 60, safety, player, false);
  assert.equal(calls, before);
  t.diagnostic(`IBD safety scheduler: 3600 frozen steps = 0 screenings; 600 blocked active steps = ${calls} screenings; no catch-up elapsed time.`);
});
