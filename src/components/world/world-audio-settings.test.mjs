import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrivingAudio } from './WorldDrivingFeedback.tsx';
import WorldAudioSettings from './WorldAudioSettings.tsx';
import { useWorldStore } from './store.ts';
import { publishDrivingTelemetry } from './vehicle-telemetry.ts';
import { useWorldAudioSettings, setWorldAudioMuted, setWorldAudioVolume, worldAudioLevel } from './world-audio-settings.ts';

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn); }
  get count() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
const param = () => ({ value: 0, targets: [], cancelled: 0,
  setTargetAtTime(value) { this.value = value; this.targets.push(value); },
  setValueAtTime(value) { this.value = value; }, cancelScheduledValues() { this.cancelled++; } });
class Audio extends Target {
  static instances = [];
  state = 'suspended'; currentTime = 1; sampleRate = 32; destination = {}; nodes = []; sources = [];
  resumes = 0; hold = false; reject = false;
  constructor() { super(); Audio.instances.push(this); }
  node() { const n = { gain: param(), frequency: param(), Q: param(), connect() { return n; }, disconnect() { n.disconnected = true; } }; this.nodes.push(n); return n; }
  createGain() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) }; }
  createOscillator() { const n = Object.assign(this.node(), { start() { n.started = true; }, stop() { n.stopped = true; } }); this.sources.push(n); return n; }
  createBufferSource() { return this.createOscillator(); }
  change(state) { if (this.state === 'closed') return; this.state = state; queueMicrotask(() => this.dispatchEvent(new Event('statechange'))); }
  async resume() { this.resumes++; if (this.reject) throw new Error('gesture required'); if (this.hold) await new Promise(resolve => this.resumeNow = resolve); this.change('running'); }
  async suspend() { this.change('suspended'); }
  async close() { this.state = 'closed'; }
}
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const telemetry = { id: 'coupe', speed: 12, power: .5, contacts: 4, slipAngle: .4, boosting: true };
function fixture(t) {
  const originals = new Map(['window', 'document'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const win = Object.assign(new Target(), { AudioContext: Audio,
    setInterval() { assert.fail('no audio polling'); }, setTimeout() { assert.fail('no audio timeout'); }, requestAnimationFrame() { assert.fail('no extra frame loop'); } });
  const doc = Object.assign(new Target(), { hidden: false });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: doc });
  Audio.instances.length = 0;
  useWorldStore.setState({ activeVehicle: 'coupe', paused: false, poolInspect: false, shot: null });
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
  publishDrivingTelemetry(telemetry);
  const service = new DrivingAudio(), release = service.mount();
  const gesture = () => { const event = new Event('keydown'); Object.defineProperty(event, 'isTrusted', { value: true }); win.dispatchEvent(event); };
  const page = (type, persisted = true) => win.dispatchEvent(Object.assign(new Event(type), { persisted }));
  t.after(() => {
    release(); publishDrivingTelemetry(null); useWorldStore.setState(useWorldStore.getInitialState(), true);
    useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
    for (const [k, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
  });
  return { service, release, gesture, page, win, doc };
}

test('settings clamp finite volumes and mute preserves the selected levels without audio', () => {
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
  setWorldAudioVolume('music', 2); setWorldAudioVolume('sfx', -.1);
  assert.equal(worldAudioLevel('music'), 1); assert.equal(worldAudioLevel('sfx'), 0);
  setWorldAudioVolume('sfx', .35); setWorldAudioVolume('sfx', NaN); setWorldAudioVolume('music', Infinity);
  setWorldAudioMuted(true); assert.equal(worldAudioLevel('music'), 0); assert.equal(worldAudioLevel('sfx'), 0);
  setWorldAudioVolume('music', .6); setWorldAudioMuted(false);
  assert.equal(worldAudioLevel('music'), .6); assert.equal(worldAudioLevel('sfx'), .35);
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
});

test('settings component has bilingual labelled native sliders and a toggle button without an audio side effect', () => {
  for (const [lang, music, effects, mute] of [['zh', '音乐', '音效', '主静音'], ['en', 'Music', 'Sound effects', 'Mute all']]) {
    const html = renderToStaticMarkup(createElement(WorldAudioSettings, { lang }));
    assert.ok(html.includes(`aria-label="${music}"`)); assert.ok(html.includes(`aria-label="${effects}"`));
    assert.ok(html.includes(mute)); assert.ok(html.includes('type="button" aria-pressed="false"'));
    assert.equal((html.match(/type="range"/g) ?? []).length, 2);
    assert.equal((html.match(/aria-valuetext="100%"/g) ?? []).length, 2);
  }
});

test('driving needs a gesture, follows SFX only, and never allocates while muted or inspecting', async t => {
  const e = fixture(t); setWorldAudioMuted(true); e.gesture(); assert.equal(Audio.instances.length, 0);
  setWorldAudioMuted(false); useWorldStore.setState({ poolInspect: true }); e.gesture(); assert.equal(Audio.instances.length, 0);
  useWorldStore.setState({ poolInspect: false }); setWorldAudioVolume('music', 0); e.gesture(); await settle();
  const ctx = Audio.instances[0]; assert.equal(ctx.state, 'running'); assert.equal(ctx.sources.length, 3);
  setWorldAudioVolume('sfx', .4); await settle(); assert.ok(Math.abs(ctx.nodes[0].gain.value - .048) < 1e-12);
  e.release(); assert.equal(ctx.state, 'closed'); assert.ok(ctx.sources.every(n => n.stopped && n.disconnected));
  assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('all driving lifecycle gates suspend, clear stale boost and resume with current telemetry', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  const gates = [
    v => useWorldStore.setState({ paused: v }), v => useWorldStore.setState({ poolInspect: v }),
    v => useWorldStore.setState({ shot: v ? 'camp' : null }), v => useWorldStore.setState({ activeVehicle: v ? null : 'coupe' }),
    v => { e.doc.hidden = v; e.doc.dispatchEvent(new Event('visibilitychange')); },
    v => e.page(v ? 'pagehide' : 'pageshow'), v => setWorldAudioMuted(v), v => setWorldAudioVolume('sfx', v ? 0 : 1),
  ];
  for (const gate of gates) {
    publishDrivingTelemetry(telemetry); e.service.update(telemetry);
    const boost = e.service.sound.boost.gain; assert.equal(boost.value, .15);
    gate(true); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(ctx.nodes[0].gain.value, 0); assert.equal(boost.value, 0);
    e.service.update(telemetry); assert.equal(boost.value, 0);
    publishDrivingTelemetry({ ...telemetry, boosting: false, slipAngle: 0 }); gate(false); await settle();
    assert.equal(ctx.state, 'running'); assert.equal(boost.value, 0); assert.equal(e.service.sound.tyre.gain.value, 0);
    assert.equal(ctx.sources.length, 3);
  }
  e.page('pagehide', false); await settle(); assert.equal(ctx.state, 'closed'); assert.equal(e.win.count + e.doc.count, 0);
  e.page('pageshow'); e.gesture(); assert.equal(Audio.instances.length, 1);
});

test('driving serializes resume races and cannot wake after disposal', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  useWorldStore.setState({ paused: true }); await settle(); ctx.hold = true;
  useWorldStore.setState({ paused: false }); setWorldAudioMuted(true);
  ctx.resumeNow(); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(ctx.nodes[0].gain.value, 0);
  setWorldAudioMuted(false); e.release(); ctx.resumeNow(); await settle();
  assert.equal(ctx.state, 'closed'); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
  setWorldAudioVolume('sfx', .2); e.gesture(); await settle(); assert.equal(Audio.instances.length, 1);
});

test('rejected driving resume stays quiet until a trusted gesture, without polling', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  useWorldStore.setState({ paused: true }); await settle(); ctx.reject = true;
  useWorldStore.setState({ paused: false }); await settle(); const attempts = ctx.resumes;
  for (let i = 0; i < 20; i++) { e.service.update(telemetry); setWorldAudioVolume('sfx', .5); await settle(); }
  assert.equal(ctx.resumes, attempts); assert.equal(ctx.nodes[0].gain.value, 0);
  ctx.reject = false; e.win.dispatchEvent(new Event('keydown')); await settle(); assert.equal(ctx.resumes, attempts);
  e.gesture(); await settle(); assert.equal(ctx.resumes, attempts + 1); assert.equal(ctx.state, 'running');
});
