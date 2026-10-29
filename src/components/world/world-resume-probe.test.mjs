import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldResumeProbe } from './world-resume-probe.ts';

function fixture() {
  let time = 0, clockReads = 0;
  const scene = {}, camera = {}, state = { paused: true, hidden: false, shot: null, poolInspect: false };
  const add = ms => { time += ms; };
  const probe = new WorldResumeProbe(() => { clockReads++; return time; });
  const world = { value: 7, step(arg) { assert.equal(this, world); add(2); return [this.value, arg]; } };
  const renderer = {
    info: { render: { frame: 116 }, programs: Array.from({ length: 5 }, () => ({})) },
    renderBufferDirect(_camera, _scene, _geometry, material, object) {
      assert.equal(this, renderer); add(material.cost);
      for (let i = 0; i < material.grow; i++) this.info.programs?.push({});
      return object;
    },
    shadowMap: { render() {
      assert.equal(this, renderer.shadowMap); add(2);
      renderer.renderBufferDirect(camera, scene, {}, { cost: 3, grow: 1, type: 'depth', uuid: 'depth-1' }, { name: 'shadow caster' });
    } },
    render(s, c) {
      assert.equal(this, renderer); assert.equal(s, scene); assert.equal(c, camera);
      add(4); this.info.render.frame++; this.shadowMap.render();
      this.renderBufferDirect(c, s, {}, { cost: 7, grow: 2, type: 'standard', uuid: 'opaque-1' }, { name: 'visible mesh' });
      add(1); return 'render-result';
    },
  };
  const originals = { step: world.step, render: renderer.render, shadow: renderer.shadowMap.render, draw: renderer.renderBufferDirect };
  const unbind = probe.bind({ world, renderer, scene, camera, state: () => state });
  const restored = () => {
    assert.equal(world.step, originals.step); assert.equal(renderer.render, originals.render);
    assert.equal(renderer.shadowMap.render, originals.shadow); assert.equal(renderer.renderBufferDirect, originals.draw);
  };
  return { probe, world, renderer, scene, camera, state, originals, unbind, restored, add, now: () => time, clockReads: () => clockReads };
}

test('no clocks or wrappers before explicit arm; five actual frames preserve delta, count real steps and separate inclusive spans', () => {
  const f = fixture();
  f.probe.beginFrame(.2); f.probe.clockReset(); f.restored(); assert.equal(f.clockReads(), 0);
  assert.equal(f.probe.arm().started, true); f.state.paused = false;
  f.add(5); f.probe.clockReset(); f.add(95);
  f.probe.beginFrame(.2301);
  for (let i = 0; i < 13; i++) {
    f.add(3); // Synthetic before/after-step work deliberately outside world.step.
    assert.deepEqual(f.world.step(i), [7, i]);
  }
  assert.equal(f.renderer.render(f.scene, f.camera), 'render-result');
  const first = f.probe.read().frames[0];
  assert.equal(first.rawDeltaMs, .2301 * 1000); assert.equal(first.entryAtMs, 100);
  assert.equal(first.worldStepCalls, 13); assert.equal(first.worldStepCpuMs, 26);
  assert.equal(first.entryToFirstRenderMs, 65); assert.equal(first.rendererCpuMs, 17); assert.equal(first.shadowCpuMs, 5);
  assert.equal(first.programNetGrowth, 3); assert.equal(first.drawGrowthEvents, 2); assert.equal(first.drawProgramsAdded, 3);
  assert.deepEqual(first.largestGrowthDraws.map(x => [x.pass, x.drawCpuMs, x.programsAdded]), [['other', 7, 2], ['shadow', 3, 1]]);
  assert.equal(first.lastRenderFrameAtEntry, 116); assert.equal(first.lastRenderFrameAtEnd, 117);
  for (let i = 0; i < 4; i++) { f.probe.beginFrame(1 / 60); f.world.step(i); f.renderer.render(f.scene, f.camera); }
  const report = f.probe.read();
  assert.equal(report.status, 'complete'); assert.equal(report.frames.length, 5); assert.equal(report.clockResetAtMs, 5);
  assert.deepEqual(Object.values(report.unavailable), [null, null, null, null]);
  f.restored(); const reads = f.clockReads();
  f.probe.beginFrame(99); f.probe.clockReset(); f.world.step(0); f.renderer.render(f.scene, f.camera);
  assert.equal(f.clockReads(), reads, 'completed capture leaves no continuing timing');
  report.frames[0].worldStepCalls = 999; assert.equal(f.probe.read().frames[0].worldStepCalls, 13);
  f.unbind();
});

test('program-growth output stays bounded, excludes unchanged draws and never calls custom shader key callbacks', () => {
  const f = fixture(); let keyCalls = 0;
  f.probe.arm(); f.probe.beginFrame(.01);
  for (let i = 0; i < 100; i++) f.renderer.renderBufferDirect(null, null, null,
    { cost: i, grow: 1, type: 'x'.repeat(1000), uuid: 'mat', customProgramCacheKey() { keyCalls++; } }, { name: 'y'.repeat(1000) });
  for (let i = 0; i < 100; i++) f.renderer.renderBufferDirect(null, null, null, { cost: 1, grow: 0 }, {});
  f.probe.cancel();
  const row = f.probe.read().frames[0];
  assert.equal(row.drawGrowthEvents, 100); assert.equal(row.drawProgramsAdded, 100); assert.equal(row.largestGrowthDraws.length, 3);
  assert.deepEqual(row.largestGrowthDraws.map(x => x.drawCpuMs), [99, 98, 97]);
  assert.ok(row.largestGrowthDraws.every(x => x.object.length === 120 && x.materialType.length === 120));
  assert.equal(keyCalls, 0); f.restored(); f.unbind();
});

test('nested renders are counted inclusively once and only the target main render completes a frame', () => {
  const f = fixture(), offscreen = {};
  f.renderer.render = function(s, c) {
    f.add(1);
    if (s === f.scene) this.render(offscreen, c);
    f.add(2); return s;
  };
  const original = f.renderer.render;
  f.probe.arm(); f.probe.beginFrame(.016);
  f.renderer.render(offscreen, f.camera); assert.equal(f.probe.read().frames.length, 0);
  f.renderer.render(f.scene, f.camera);
  const row = f.probe.read().frames[0];
  assert.equal(row.rendererCalls, 2); assert.equal(row.rendererCpuMs, 9);
  f.probe.cancel(); assert.equal(f.renderer.render, original); f.unbind();
});

test('render/step exceptions propagate unchanged; cancellation and unmount restore methods and keep missing-render CPU null', () => {
  for (const phase of ['world', 'render']) {
    const f = fixture(), error = Error(phase);
    const target = phase === 'world' ? f.world : f.renderer, key = phase === 'world' ? 'step' : 'render';
    target[key] = function() { f.add(4); throw error; }; const original = target[key];
    f.probe.arm(); f.probe.beginFrame(.3);
    assert.throws(() => target[key](f.scene, f.camera), e => e === error);
    f.unbind(); assert.equal(target[key], original);
    const report = f.probe.read(), row = report.frames[0]; assert.equal(report.status, 'cancelled');
    if (phase === 'world') { assert.equal(row.worldStepThrew, true); assert.equal(row.worldStepCpuMs, 4); assert.equal(row.rendererCpuMs, null); }
    else { assert.equal(row.completion, 'render-threw'); assert.equal(row.rendererCpuMs, 4); }
  }
});

test('read-only/missing timing points report unavailable, and invalid trigger states install nothing', () => {
  const f = fixture();
  for (const state of [{ paused: false }, { hidden: true }, { shot: 'shot' }, { poolInspect: true }]) {
    Object.assign(f.state, { paused: true, hidden: false, shot: null, poolInspect: false }, state);
    assert.equal(f.probe.arm().started, false); f.restored();
  }
  Object.assign(f.state, { paused: true, hidden: false, shot: null, poolInspect: false });
  Object.defineProperty(f.world, 'step', { writable: false }); f.renderer.info.programs = null;
  assert.equal(f.probe.arm().started, true); f.probe.beginFrame(.02); f.renderer.render(f.scene, f.camera);
  const report = f.probe.read(), row = report.frames[0];
  assert.equal(report.coverage.worldStep, false); assert.equal(row.worldStepCalls, null); assert.equal(row.worldStepCpuMs, null);
  assert.equal(report.coverage.programGrowthDraws, false); assert.equal(row.drawGrowthEvents, null); assert.equal(row.programNetGrowth, null);
  f.unbind(); f.restored();
  assert.equal(f.probe.arm().started, false, 'unmounted runtime is unavailable');
});

test('hide, rearm and incomplete frames remain bounded without scheduling timers or manufacturing a render', () => {
  const f = fixture(); f.probe.arm();
  for (let i = 0; i < 6; i++) f.probe.beginFrame(.02);
  assert.equal(f.probe.read().status, 'complete'); assert.equal(f.probe.read().frames.length, 5);
  assert.ok(f.probe.read().frames.every(x => x.completion === 'render-not-reached' && x.rendererCpuMs === null)); f.restored();
  f.probe.arm(); f.probe.beginFrame(.02); f.world.step(0); f.probe.arm();
  assert.equal(f.probe.read().frames.length, 0); f.state.hidden = true; f.probe.beginFrame(.02);
  assert.equal(f.probe.read().reason, 'hidden'); f.restored(); f.unbind();
});

test('Rapier-style proxy writes are restored; newer foreign wrappers survive and old probe wrappers stay inert on rearm', () => {
  const f = fixture(), instance = { count: 0, step() { this.count++; f.add(2); return this.count; } };
  const proxy = new Proxy({}, { get: (_, key) => Reflect.get(instance, key), set: (_, key, value) => Reflect.set(instance, key, value) });
  f.unbind(); const unbind = f.probe.bind({ world: proxy, renderer: f.renderer, scene: f.scene, camera: f.camera, state: () => f.state });
  const original = proxy.step;
  f.probe.arm(); const instrumented = proxy.step;
  const foreign = function(...args) { return instrumented.apply(this, args); }; proxy.step = foreign;
  f.probe.cancel(); assert.equal(proxy.step, foreign); assert.deepEqual(f.probe.read().restorationConflicts, ['world.step']);
  f.probe.arm(); f.probe.beginFrame(.01); assert.equal(proxy.step(), 1); f.renderer.render(f.scene, f.camera);
  assert.equal(f.probe.read().frames[0].worldStepCalls, 1, 'retained wrapper from the earlier run must not record twice');
  f.probe.cancel(); assert.equal(proxy.step, foreign);
  proxy.step = original; f.probe.arm(); f.probe.cancel(); assert.equal(proxy.step, original);
  unbind();
});
