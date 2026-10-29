import test from 'node:test';
import assert from 'node:assert/strict';
import { _roots, invalidate } from '@react-three/fiber';
import { StaticShotFrames, worldRenderMode } from './performance-render-policy.ts';

// Run the installed R3F loop with a deterministic RAF clock. gl.render is only
// a counter: these checks measure scheduling, not WebGL cost or visual output.
function fixture() {
  const saved = new Map(['requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const raf = new Map(), key = {}, burst = new StaticShotFrames();
  let next = 0, now = 0, draws = 0, updates = 0, extension = 0, shot = null;
  const state = {
    frameloop: 'always', scene: {}, camera: {}, clock: { getDelta: () => 1 / 60 },
    gl: { xr: { isPresenting: false }, render() { draws++; } },
    internal: { active: true, frames: 0, priority: 0, subscribers: [] },
  };
  const store = { getState: () => state };
  state.internal.subscribers.push({ store, ref: { current() {
    updates++;
    if (burst.frame(!!shot)) invalidate(state);
    // Emulate existing finite NightClock/weather jobs invalidating in useFrame.
    if (extension > 0) { extension--; invalidate(state); }
  } } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: callback => { const id = ++next; raf.set(id, callback); return id; } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: id => raf.delete(id) });
  _roots.set(key, { store });
  const tick = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      now += 1000 / 60;
      const batch = [...raf.values()]; raf.clear();
      for (const callback of batch) callback(now);
    }
  };
  const api = {
    state, tick, invalidate: () => invalidate(state),
    set({ visible = true, paused = false, view = null } = {}) {
      shot = view; burst.reset(); state.frameloop = worldRenderMode(visible, paused, view); invalidate(state);
    },
    edit(frames = 0) { extension = frames; burst.reset(); invalidate(state); },
    read: () => ({ draws, updates, queued: raf.size }),
    unmount() { state.internal.active = false; _roots.delete(key); },
    dispose() {
      api.unmount(); tick(2);
      assert.equal(raf.size, 0);
      for (const [k, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
      }
    },
  };
  return api;
}

test('60 simulated seconds: legacy frozen view keeps rendering, demand view settles then stops', t => {
  const f = fixture(); t.after(() => f.dispose());
  // Baseline Canvas used always whenever visible and not paused, even in shot.
  f.state.frameloop = 'always'; f.invalidate(); f.tick(3600);
  assert.equal(f.read().draws, 3600);
  const before = f.read().draws;
  f.set({ view: 'coaster-overview' }); f.tick(3600);
  assert.equal(f.read().draws - before, 90);
  assert.equal(f.read().queued, 0);
  const asleep = f.read(); f.tick(3600); assert.deepEqual(f.read(), asleep);
  t.diagnostic('R3F scheduling only: legacy 3600 draws; new 90 settling draws + 0 recurring draws; no GPU measurement.');
});

test('normal stationary/active play remains continuous; pause and pool inspection can wake for finite edits', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.set(); f.tick(600); assert.equal(f.read().draws, 600);
  // Runtime combines paused || poolInspect before passing the policy.
  f.set({ paused: true }); f.tick(600);
  assert.equal(f.read().draws, 601); assert.equal(f.read().queued, 0);
  const before = f.read().draws;
  f.edit(120); f.tick(600);
  assert.equal(f.read().draws - before, 121); assert.equal(f.read().queued, 0);
  f.set(); const resumed = f.read().draws; f.tick(600);
  assert.equal(f.read().draws - resumed, 600);
});

test('shot changes, late assets, quality/resize edits and finite climate updates each return to sleep', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.set({ view: 'ibd-yard' }); f.tick(600);
  for (const reason of ['late asset', 'quality', 'resize', 'day/night', 'weather']) {
    const before = f.read().draws;
    if (reason === 'late asset') f.invalidate(); else f.edit(reason === 'day/night' || reason === 'weather' ? 120 : 0);
    f.tick(600);
    assert.equal(f.read().draws - before, reason === 'day/night' || reason === 'weather' ? 180 : 90, reason);
    assert.equal(f.read().queued, 0, reason);
  }
  const before = f.read().draws;
  f.set({ view: 'coaster-overview' }); f.tick(600);
  assert.equal(f.read().draws - before, 90); assert.equal(f.read().queued, 0);
});

test('hidden settled views ignore invalidation and restore their correct running/frozen mode', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.set({ view: 'ibd-yard' }); f.tick(600);
  const before = f.read().draws;
  f.set({ visible: false, view: 'ibd-yard' });
  for (let i = 0; i < 50; i++) f.invalidate();
  f.tick(600); assert.equal(f.read().draws, before); assert.equal(f.read().queued, 0);
  f.set({ view: 'ibd-yard' }); f.tick(600);
  assert.equal(f.read().draws - before, 90); assert.equal(f.read().queued, 0);
  f.set(); const resumed = f.read().draws; f.tick(60); assert.equal(f.read().draws - resumed, 60);
});

test('unmount during a settling burst releases the root and drains the shared RAF without more draws', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.set({ view: 'coaster-overview' }); f.tick(15);
  const before = f.read().draws; f.unmount(); f.tick(600);
  assert.equal(f.read().draws, before); assert.equal(f.read().queued, 0);
});
