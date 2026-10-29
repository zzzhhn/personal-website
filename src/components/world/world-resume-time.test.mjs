import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { MathUtils } from 'three';
import { addEffect, advance, flushGlobalEffects } from '@react-three/fiber';
import { createResumeTimeBoundary } from './world-resume-time.ts';
import { worldRenderMode } from './performance-render-policy.ts';

// Execute the installed React-Rapier step closure, not a rewritten accumulator.
// Empty scene/event maps and a counting world isolate timestep delivery; this
// does not validate collision behavior, a browser, or WebGL performance.
const require = createRequire(import.meta.url);
const source = ts.createSourceFile('rapier.js', readFileSync(join(dirname(require.resolve('@react-three/rapier')), 'react-three-rapier.esm.js'), 'utf8'), ts.ScriptTarget.Latest, true);
const candidates = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'step' &&
      node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'useCallback') candidates.push(node.initializer.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(candidates.length, 1, 'installed Rapier step closure is unambiguous');
const stepSource = candidates[0].getText(source);

function fixture(t, enabled = true) {
  let now = 0, last = 0, calls = 0, resets = 0, registrations = 0, maxRegistrations = 0;
  let visible = true, paused = false, shot = null, position = 0, gameplayTime = 0, before = 0, after = 0;
  const deltas = [], timesteps = [], steppingState = { previousState: {}, accumulator: 0 };
  const clock = { getDelta() { const dt = (now - last) / 1000; last = now; return dt; } };
  const world = { timestep: 1 / 60, step() { calls++; timesteps.push(this.timestep); position += 3 * this.timestep; }, forEachRigidBody() {}, forEachActiveRigidBody() {} };
  const env = { worldProxy: world, MathUtils, timeStep: 1 / 60, interpolate: true, paused: false, steppingState,
    beforeStepCallbacks: new Set([{ current() { before++; } }]), afterStepCallbacks: new Set([{ current() { after++; } }]),
    filterContactPairHooks: new Set(), filterIntersectionPairHooks: new Set(), hooks: {},
    rigidBodyStates: new Map(), rigidBodyEvents: new Map(),
    eventQueue: { drainCollisionEvents() {}, drainContactForceEvents() {} }, invalidate() {} };
  const step = new Function(...Object.keys(env), `return (${stepSource});`)(...Object.values(env));
  const running = () => worldRenderMode(visible, paused, shot) === 'always';
  const state = { clock, frameloop: 'always', scene: {}, camera: {},
    gl: { render() {}, xr: { isPresenting: false } },
    internal: { active: true, priority: 0, frames: 0, subscribers: [] } };
  const store = { getState: () => state };
  state.internal.subscribers = [
    { store, ref: { current(_, delta) { deltas.push(delta); } } },
    { store, ref: { current(_, delta) { if (running()) step(delta); } } },
    { store, ref: { current(_, delta) { if (running()) gameplayTime += delta; } } },
  ];
  const boundary = createResumeTimeBoundary(clock,
    () => running() && state.internal.active && state.frameloop === 'always' && !state.gl.xr.isPresenting,
    callback => { registrations++; maxRegistrations = Math.max(maxRegistrations, registrations); const remove = addEffect(callback); return () => { registrations--; remove(); }; },
    () => { resets++; });
  t.after(() => boundary.dispose());
  return {
    state,
    set(next) {
      visible = next.visible ?? true; paused = next.paused ?? false; shot = next.shot ?? null;
      state.frameloop = worldRenderMode(visible, paused, shot);
      if (enabled && !running()) boundary.suspend();
    },
    layoutReset() { clock.getDelta(); },
    elapse(ms) { now += ms; },
    frame(ms) { now += ms; const previous = calls; advance(undefined, true, state); return { delta: deltas.at(-1), steps: calls - previous }; },
    otherRootFrame(ms) { now += ms; flushGlobalEffects('before', now); },
    read: () => ({ calls, resets, registrations, maxRegistrations, position, gameplayTime, before, after, remainder: steppingState.accumulator, deltas: [...deltas], timesteps: [...timesteps] }),
    dispose: () => boundary.dispose(),
  };
}

test('installed R3F + Rapier reproduce cold/warm catch-up; boundary excludes pre-first-frame delay only', t => {
  // Warm evidence's 14 ticks includes an unmeasured pre-pause remainder.
  // 10 ms is an explicit fixture value, not a claim about the measured run.
  for (const [delay, remainderMs, secondSteps] of [[243.8, 0, 6], [223.9, 10, 7]]) {
    const legacy = fixture(t, false), fixed = fixture(t);
    legacy.frame(remainderMs); fixed.frame(remainderMs);
    legacy.set({ paused: true }); legacy.elapse(30_000); legacy.set({}); legacy.layoutReset();
    assert.equal(legacy.frame(delay).steps, 14);
    fixed.set({ paused: true }); fixed.elapse(30_000); fixed.set({}); fixed.layoutReset();
    assert.deepEqual(fixed.frame(delay), { delta: 0, steps: 0 });
    // The cost of that first active frame is ordinary running time. Keep it.
    const second = fixed.frame(111.5);
    assert.ok(Math.abs(second.delta - .1115) < 1e-10); assert.equal(second.steps, secondSteps);
    assert.equal(fixed.read().resets, 1); assert.equal(fixed.read().registrations, 0);
  }
});

test('continuous 60/30/10 Hz, uneven frames and stalls preserve deltas, fixed ticks and callback/motion speed', t => {
  const baseline = fixture(t, false), fixed = fixture(t);
  const intervals = [...Array(120).fill(1000 / 60), ...Array(60).fill(1000 / 30), ...Array(20).fill(100), 8, 41, 111.5, 243.8, 800];
  for (const dt of intervals) assert.deepEqual(fixed.frame(dt), baseline.frame(dt));
  assert.deepEqual(fixed.read(), baseline.read());
  assert.equal(fixed.read().resets, 0);
  assert.ok(fixed.read().timesteps.every(dt => dt === 1 / 60));
  assert.equal(fixed.read().before, fixed.read().calls); assert.equal(fixed.read().after, fixed.read().calls);
  assert.ok(Math.abs(fixed.read().deltas.at(-1) - .8) < 1e-10, 'R3F still delivers the full stall; Rapier retains its existing 0.5 s cap');
});

test('fractional accumulator survives pause; repeated resume never accumulates discarded sleep', t => {
  const f = fixture(t);
  assert.equal(f.frame(10).steps, 0);
  const remainder = f.read().remainder;
  for (let i = 0; i < 6; i++) {
    f.set({ paused: true }); f.elapse(60_000); f.set({}); f.layoutReset();
    assert.equal(f.frame(240).steps, 0); assert.equal(f.read().remainder, remainder);
  }
  assert.equal(f.frame(10).steps, 1);
  assert.equal(f.read().resets, 6); assert.equal(f.read().maxRegistrations, 1);
});

test('paused menu/shot edits keep finite frame deltas without consuming the pending active reset', t => {
  const f = fixture(t);
  for (const mode of [{ paused: true }, { shot: 'coaster-overview' }]) {
    f.set(mode);
    for (const edit of ['day/night', 'quality', 'resize']) {
      f.elapse(3000); f.layoutReset();
      assert.deepEqual(f.frame(20), { delta: .02, steps: 0 }, edit);
    }
  }
  assert.equal(f.read().resets, 0); assert.equal(f.read().registrations, 1);
  f.set({}); assert.deepEqual(f.frame(240), { delta: 0, steps: 0 });
  assert.deepEqual(f.frame(20), { delta: .02, steps: 1 });
});

test('hidden/paused demand frames and stale Canvas mode cannot consume a resume boundary', t => {
  const f = fixture(t);
  f.set({ visible: false }); f.otherRootFrame(120_000);
  assert.equal(f.read().resets, 0);
  f.set({ paused: true }); f.frame(20); assert.equal(f.read().resets, 0);
  f.set({}); f.state.frameloop = 'demand'; f.otherRootFrame(240);
  assert.equal(f.read().resets, 0, 'wait for the active Canvas mode to commit');
  f.state.frameloop = 'always'; assert.deepEqual(f.frame(240), { delta: 0, steps: 0 });
  f.set({ visible: false }); f.set({}); // hide/show before any render
  assert.deepEqual(f.frame(240), { delta: 0, steps: 0 });
  assert.equal(f.read().resets, 2);
});

test('inactive/XR roots wait, and cleanup cancels pending work without waking or modifying the clock', t => {
  const f = fixture(t);
  f.set({ paused: true }); f.set({}); f.state.internal.active = false;
  f.otherRootFrame(200); assert.equal(f.read().resets, 0);
  f.state.internal.active = true; f.state.gl.xr.isPresenting = true;
  f.otherRootFrame(200); assert.equal(f.read().resets, 0);
  f.state.gl.xr.isPresenting = false; f.dispose(); f.dispose();
  f.otherRootFrame(200); assert.equal(f.read().resets, 0); assert.equal(f.read().registrations, 0);
  assert.equal(f.frame(20).delta, .62, 'cancelled boundary leaves the original clock untouched');
});
