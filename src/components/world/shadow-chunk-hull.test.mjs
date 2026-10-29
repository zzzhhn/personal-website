import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { BufferAttribute, SphereGeometry, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { ShadowHullError, ShadowHullJob } from './shadow-chunk-hull-job.ts';
import { ShadowChunkStages } from './shadow-chunk-stages.ts';

// Frozen original farHull arithmetic, independently exercised against the real worker entrypoint.
function legacyHull(g) {
  const pos = g.getAttribute('position'), wind = g.getAttribute('_wind'), pts = [], keys = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (keys.has(k)) continue;
    keys.set(k, i); pts.push(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  const hull = new ConvexGeometry(pts), hp = hull.getAttribute('position');
  if (wind) {
    const w = new Float32Array(hp.count * 4);
    for (let i = 0; i < hp.count; i++) {
      const src = keys.get(`${hp.getX(i).toFixed(4)},${hp.getY(i).toFixed(4)},${hp.getZ(i).toFixed(4)}`) ?? 0;
      w.set([wind.getX(src), wind.getY(src), wind.getZ(src), wind.getW(src)], i * 4);
    }
    hull.setAttribute('_wind', new BufferAttribute(w, 4));
  }
  hull.deleteAttribute('normal'); hull.computeVertexNormals();
  return hull;
}

function nativePort() {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      await import(workerData.register);
      globalThis.self = { postMessage: (data, options) => parentPort.postMessage(data, options?.transfer ?? []) };
      await import(workerData.entry);
      parentPort.on('message', data => self.onmessage({data}));
    })().catch(error => { throw error; });
  `, { eval: true, workerData: {
    register: new URL('../../../tools/world/alpha-mine-tests/register.mjs', import.meta.url).href,
    entry: new URL('./shadow-chunk-hull.worker.ts', import.meta.url).href,
  } });
  const port = { onmessage: null, onerror: null, onmessageerror: null, lastPosted: null, terminated: 0,
    postMessage(data, transfers) { this.lastPosted = data; worker.postMessage(data, transfers); },
    terminate() { this.terminated++; void worker.terminate(); },
  };
  worker.on('message', data => port.onmessage?.({ data }));
  worker.on('error', error => port.onerror?.(error));
  worker.on('messageerror', error => port.onmessageerror?.(error));
  return port;
}

async function drain(job) {
  for (let i = 0; i < 5000; i++) {
    const step = job.next();
    if (step.done) return step.value;
    if (step.value === 'hull-wait') await delay(2);
  }
  assert.fail('worker did not finish within bounded test iterations');
}
function submit(task) {
  for (let i = 0; i < 10000; i++) {
    const step = task.next(); assert.equal(step.done, false);
    if (step.value === 'hull-submit') return;
  }
  assert.fail('source preparation did not finish');
}

test('real worker preserves exact convex geometry, normals, wind lookup and Float64 inputs; one worker serves sequential hulls', { timeout: 10000 }, async t => {
  const geometry = new SphereGeometry(2, 48, 24), ports = [], job = new ShadowHullJob(() => { const port = nativePort(); ports.push(port); return port; });
  const pos = geometry.getAttribute('position'), input = Float64Array.from(pos.array, (v, i) => v + (i % 3 === 0 ? 1e-11 : 0));
  geometry.setAttribute('position', new BufferAttribute(input, 3));
  const wind = Float32Array.from({ length: pos.count * 4 }, (_, i) => i % 13 / 17);
  geometry.setAttribute('_wind', new BufferAttribute(wind, 4));
  let expected, actual, second;
  try {
    expected = legacyHull(geometry); actual = await drain(job.build(geometry, 'sphere-wind'));
    for (const name of ['position', 'normal', '_wind']) assert.deepEqual(actual.getAttribute(name).array, expected.getAttribute(name).array);
    const sphere = actual.boundingSphere.clone(); geometry.computeBoundingSphere(); assert.deepEqual(sphere, geometry.boundingSphere);
    assert.ok(input.byteLength > 0); assert.ok(wind.byteLength > 0, 'source buffers remain owned by the caller');
    assert.equal(ports[0].lastPosted.positions.byteLength, 0, 'copy transfers rather than duplicates to the worker');
    second = await drain(job.build(geometry, 'sphere-again'));
    assert.deepEqual(second.getAttribute('position').array, actual.getAttribute('position').array);
    assert.equal(ports.length, 1); assert.equal(job.stats.requests, 2);
    assert.ok(job.stats.maxWorkerMs > 0);
    t.diagnostic(JSON.stringify({ fixture: 'synthetic sphere, Node worker entrypoint; not browser timing', ...job.stats }));
  } finally { job.dispose(); geometry.dispose(); expected?.dispose(); actual?.dispose(); second?.dispose(); }
  assert.equal(ports[0].terminated, 1); assert.equal(ports[0].onmessage, null);
});

test('pending worker cancellation terminates once, disconnects callbacks and ignores late results', () => {
  const geometry = new SphereGeometry(), port = { onmessage: null, onerror: null, onmessageerror: null, postMessage() {}, terminated: 0, terminate() { this.terminated++; } };
  const job = new ShadowHullJob(() => port), task = job.build(geometry, 'cancel');
  try {
    submit(task);
    const late = port.onmessage;
    assert.equal(task.next().value, 'hull-wait');
    task.return(); job.dispose(); job.dispose();
    late({ data: { positions: new Float32Array(9), normals: new Float32Array(9), workerMs: 100 } });
    assert.equal(port.terminated, 1); assert.equal(port.onmessage, null); assert.equal(job.stats.workerMs, 0);
  } finally { job.dispose(); geometry.dispose(); }
});

test('worker startup failure is explicit and never invokes synchronous hull fallback', () => {
  const geometry = new SphereGeometry(), job = new ShadowHullJob(() => { throw Error('blocked worker'); });
  try {
    const task = job.build(geometry, 'blocked');
    assert.throws(() => { for (let i = 0; i < 100; i++) if (task.next().done) break; }, ShadowHullError);
    assert.equal(job.stats.requests, 0);
  } finally { job.dispose(); geometry.dispose(); }
});

test('stalled worker watchdog terminates without another render frame', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const geometry = new SphereGeometry(), port = { onmessage: null, onerror: null, onmessageerror: null, postMessage() {}, terminated: 0, terminate() { this.terminated++; } };
  const job = new ShadowHullJob(() => port), task = job.build(geometry, 'paused');
  try {
    submit(task);
    t.mock.timers.tick(15001);
    assert.equal(port.terminated, 1, 'no further rendering frame is needed to release a stalled worker');
    assert.throws(() => task.next(), /timed out/);
  } finally { job.dispose(); geometry.dispose(); }
});

test('source collection yields within 1024 position reads and copies into independently owned buffers', () => {
  const geometry = new SphereGeometry(2, 48, 24), pos = geometry.getAttribute('position'), getX = pos.getX;
  let reads = 0, submitted;
  pos.getX = function(i) { reads++; return getX.call(this, i); };
  const port = { onmessage: null, onerror: null, onmessageerror: null, postMessage(data) { submitted = data; }, terminate() {} };
  const job = new ShadowHullJob(() => port), task = job.build(geometry, 'copy');
  try {
    for (let i = 0; i < 100; i++) {
      const step = task.next();
      assert.ok(reads <= 1024); reads = 0;
      if (step.value === 'hull-submit') break;
    }
    assert.ok(submitted.positions instanceof Float64Array);
    assert.notEqual(submitted.positions.buffer, pos.array.buffer);
    assert.equal(submitted.positions.length, pos.count * 3);
    task.return();
  } finally { job.dispose(); geometry.dispose(); }
});

test('worker run, message and computation errors terminate cleanly without accepting a later successful reply', () => {
  for (const event of ['onerror', 'onmessageerror', 'reply-error']) {
    const geometry = new SphereGeometry(), port = { onmessage: null, onerror: null, onmessageerror: null, postMessage() {}, terminated: 0, terminate() { this.terminated++; } };
    const job = new ShadowHullJob(() => port), task = job.build(geometry, event);
    try {
      submit(task);
      const late = port.onmessage;
      if (event === 'reply-error') port.onmessage({ data: { error: 'computation failed' } });
      else port[event]({});
      assert.throws(() => task.next(), ShadowHullError);
      job.dispose();
      late({ data: { positions: new Float32Array(9), normals: new Float32Array(9), workerMs: 1 } });
      assert.equal(job.stats.workerMs, 0); assert.equal(port.terminated, 1);
    } finally { job.dispose(); geometry.dispose(); }
  }
});

test('phase summaries retain a late maximum beyond 64 units with bounded metadata', () => {
  const stages = new ShadowChunkStages();
  for (let i = 0; i < 10000; i++) stages.record('bin', 1, i, `source-${i}`);
  stages.record('bin', 211, 10001, 'x'.repeat(1000));
  stages.record('publish', 4, 10002);
  const rows = stages.snapshot();
  assert.equal(rows.length, 2); assert.equal(rows[0].count, 10001); assert.equal(rows[0].maxMs, 211);
  assert.equal(rows[0].maxFrame, 10001); assert.equal(rows[0].source.length, 120);
  rows[0].maxMs = 0; assert.equal(stages.snapshot()[0].maxMs, 211);
});
