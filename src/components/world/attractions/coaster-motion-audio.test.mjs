import test from 'node:test';
import assert from 'node:assert/strict';
import { CoasterMotionAudio, coasterSoundPlan, coasterSoundSpeed, renderCoasterTexture, readCoasterSoundMotion, readCoasterMotionAudioSnapshot } from './coaster-motion-audio.ts';
import { useWorldStore } from '../store.ts';
import { useWorldAudioSettings, setWorldAudioMuted, setWorldAudioVolume } from '../world-audio-settings.ts';
import { useIntentStore, intentRideClock } from './intent-state.ts';
import { attractionRide } from './attraction-ride.ts';
import { COASTER_LENGTH, COASTER_DURATION, coasterDistanceAt } from './coaster-track.ts';
import { THRILL_RELEASE_SECONDS } from './coaster-thrill-motion.ts';

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn); }
  get count() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
const param = () => ({ value: 0, writes: 0, setTargetAtTime(v) { this.value = v; this.writes++; }, setValueAtTime(v) { this.value = v; this.writes++; }, cancelScheduledValues() {} });
class Audio extends Target {
  static instances = [];
  state = 'suspended'; currentTime = 1; destination = {}; sources = []; nodes = []; peakSources = 0;
  hold = false; reject = false; resumes = 0;
  constructor() { super(); Audio.instances.push(this); }
  node() { const n = { gain: param(), frequency: param(), Q: param(), connect() { return n; }, disconnect() { n.disconnected = true; } }; this.nodes.push(n); return n; }
  createGain() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createBuffer(channels, length, rate) { const data = new Float32Array(length); return { length, numberOfChannels: channels, sampleRate: rate, getChannelData: () => data }; }
  createBufferSource() {
    const ctx = this, n = { playbackRate: param(), connect() {}, disconnect() { n.disconnected = true; },
      start() { n.live = true; ctx.peakSources = Math.max(ctx.peakSources, ctx.sources.filter(s => s.live).length); }, stop() { n.live = false; } };
    this.sources.push(n); return n;
  }
  change(state) { if (this.state === 'closed') return; this.state = state; queueMicrotask(() => this.dispatchEvent(new Event('statechange'))); }
  async resume() { this.resumes++; if (this.reject) throw new Error('gesture required'); if (this.hold) await new Promise(resolve => this.resumeNow = resolve); this.change('running'); }
  async suspend() { this.change('suspended'); }
  async close() { this.state = 'closed'; }
}
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function fixture(t) {
  const originals = new Map(['window', 'document'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const win = Object.assign(new Target(), { AudioContext: Audio,
    setInterval() { assert.fail('no polling'); }, setTimeout() { assert.fail('no delayed sounds'); }, requestAnimationFrame() { assert.fail('no extra RAF'); } });
  const doc = Object.assign(new Target(), { hidden: false });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: doc });
  Audio.instances.length = 0;
  useWorldStore.setState({ ...useWorldStore.getInitialState(), paused: false, ready: true });
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
  const motion = { eligible: true, riding: false, speed: 8, phase: 'lift' };
  const service = new CoasterMotionAudio(() => motion), release = service.mount();
  const gesture = (trusted = true) => { const event = new Event('click'); Object.defineProperty(event, 'isTrusted', { value: trusted }); win.dispatchEvent(event); };
  const page = (type, persisted = true) => win.dispatchEvent(Object.assign(new Event(type), { persisted }));
  t.after(() => {
    release(); useWorldStore.setState(useWorldStore.getInitialState(), true);
    useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
    for (const [k, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
  });
  return { service, release, motion, gesture, page, win, doc };
}

test('motion follows the actual track distance curve and respects ownership and boarding', () => {
  const old = { ...attractionRide }, clock = { ...intentRideClock }, state = useIntentStore.getState();
  try {
    useIntentStore.setState({ active: true, riding: true });
    Object.assign(attractionRide, { active: true, revision: 8, transition: { phase: 'riding' } });
    Object.assign(intentRideClock, { riding: true, revision: 8, elapsed: 45 });
    assert.equal(readCoasterSoundMotion().riding, true); assert.ok(readCoasterSoundMotion().speed > 0);
    attractionRide.revision = 9; assert.equal(readCoasterSoundMotion().riding, false);
    attractionRide.revision = 8; attractionRide.transition.phase = 'settle'; assert.equal(readCoasterSoundMotion().speed, 0);
    let distance = 0;
    for (let t = .05; t < COASTER_DURATION; t += .1) distance += coasterSoundSpeed(t) * .1;
    assert.ok(Math.abs(distance - COASTER_LENGTH) / COASTER_LENGTH < .003);
    // v4 releases at 29 s; 35 s is already moving. Keep the exact-zero check inside its real hold.
    assert.equal(coasterSoundSpeed(THRILL_RELEASE_SECONDS - 1), 0); assert.equal(coasterSoundSpeed(NaN), 0);
    const expected = (coasterDistanceAt(20.02) - coasterDistanceAt(19.98)) * COASTER_LENGTH / .04;
    assert.ok(Math.abs(coasterSoundSpeed(20) - expected) < 1e-8);
  } finally { Object.assign(attractionRide, old); Object.assign(intentRideClock, clock); useIntentStore.setState(state, true); }
});

test('three real textures are finite and bounded, speed and lift phase change the mix without cue beeps', () => {
  let bytes = 0;
  for (const channel of ['chain', 'wind', 'rail']) {
    const data = renderCoasterTexture(channel); bytes += data.byteLength;
    assert.ok(data.some(v => Math.abs(v) > .01)); assert.ok(data.every(v => Number.isFinite(v) && Math.abs(v) < .5));
    assert.deepEqual(data, renderCoasterTexture(channel));
  }
  assert.equal(bytes, 240000);
  for (const p of Object.values(coasterSoundPlan(0, 'lift'))) assert.equal(p.gain, 0);
  assert.equal(coasterSoundPlan(8, 'drop').chain.gain, 0); assert.ok(coasterSoundPlan(8, 'lift').chain.gain > 0);
  assert.ok(coasterSoundPlan(30, 'drop').wind.gain > coasterSoundPlan(10, 'drop').wind.gain);
  assert.ok(coasterSoundPlan(30, 'drop').rail.rate > coasterSoundPlan(10, 'drop').rail.rate);
  for (const p of Object.values(coasterSoundPlan(NaN, 'lift'))) assert.equal(p.gain, 0);
});

test('frames never create a context; a trusted gesture primes boarding silently then at most three sources run', async t => {
  const e = fixture(t); for (let i = 0; i < 500; i++) e.service.update(); assert.equal(Audio.instances.length, 0);
  e.gesture(false); assert.equal(Audio.instances.length, 0); e.motion.eligible = false; e.gesture(); assert.equal(Audio.instances.length, 0);
  e.motion.eligible = true; e.gesture(); await settle(); const ctx = Audio.instances[0];
  assert.equal(ctx.state, 'suspended'); assert.equal(e.service.inspect().sources, 0);
  e.motion.riding = true; e.service.update(); await settle(); assert.equal(e.service.inspect().sources, 3);
  assert.equal(e.service.inspect().bufferBytes, 240000);
  for (let i = 0; i < 500; i++) e.service.update(); assert.equal(ctx.sources.length, 3);
  e.motion.phase = 'drop'; e.motion.speed = 30; e.service.update(); assert.equal(e.service.inspect().sources, 2);
  setWorldAudioVolume('music', 0); await settle(); assert.equal(e.service.inspect().sources, 2);
  setWorldAudioVolume('sfx', .4); assert.equal(ctx.nodes[0].gain.value, .24);
  e.motion.speed = 0; e.service.update(); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(e.service.inspect().sources, 0);
  assert.ok(ctx.peakSources <= 3);
});

test('continuous controls stay bounded at high frame rates and silence does not rewrite AudioParams', async t => {
  const e = fixture(t); e.motion.riding = true; e.gesture(); await settle(); const ctx = Audio.instances[0];
  const before = e.service.inspect().controlUpdates;
  for (let i = 0; i < 240; i++) { ctx.currentTime += 1 / 120; e.motion.speed = 8 + i / 24; e.service.update(); }
  const updates = e.service.inspect().controlUpdates - before;
  assert.ok(updates >= 30 && updates <= 40, `two seconds scheduled ${updates} control samples`);
  const sampled = e.service.inspect().controlUpdates;
  e.motion.phase = 'drop'; e.service.update();
  assert.equal(e.service.inspect().controlUpdates, sampled + 1, 'phase changes bypass the sample interval');
  assert.equal(e.service.inspect().sources, 2);
  useWorldStore.setState({ paused: true }); await settle();
  const writes = () => ctx.nodes.reduce((n, node) => n + node.gain.writes + node.frequency.writes, 0);
  const stoppedWrites = writes();
  for (let i = 0; i < 500; i++) e.service.update();
  assert.equal(writes(), stoppedWrites, 'an already silent graph does no AudioParam work');
  assert.equal(e.service.inspect().sources, 0);
});

test('pause, hidden, inspection, mute and BFCache stop sources; resume reads the current motion without replay', async t => {
  const e = fixture(t); e.motion.riding = true; e.gesture(); await settle(); const ctx = Audio.instances[0];
  const gates = [v => useWorldStore.setState({ paused: v }), v => useWorldStore.setState({ poolInspect: v }),
    v => useWorldStore.setState({ shot: v ? 'camp' : null }), v => useWorldStore.setState({ card: v ? { kind: 'project', id: 'x' } : null }),
    v => { e.doc.hidden = v; e.doc.dispatchEvent(new Event('visibilitychange')); },
    v => setWorldAudioMuted(v), v => setWorldAudioVolume('sfx', v ? 0 : 1), v => e.page(v ? 'pagehide' : 'pageshow')];
  for (const gate of gates) {
    e.motion.phase = 'lift'; e.motion.speed = 8; e.service.update();
    const old = ctx.sources.filter(s => s.live); gate(true); await settle();
    assert.equal(e.service.inspect().sources, 0); assert.equal(ctx.state, 'suspended');
    assert.ok(old.every(s => !s.live && s.disconnected)); const count = ctx.sources.length;
    for (let i = 0; i < 30; i++) e.service.update(); assert.equal(ctx.sources.length, count);
    e.motion.phase = 'drop'; e.motion.speed = 30; gate(false); await settle();
    assert.equal(e.service.inspect().sources, 2); assert.equal(ctx.sources.length, count + 2);
  }
  e.motion.riding = false; e.service.update(); await settle(); assert.equal(e.service.inspect().sources, 0);
  assert.equal(ctx.state, 'suspended'); assert.ok(ctx.peakSources <= 3);
  e.release(); assert.equal(ctx.state, 'closed'); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
  assert.equal(e.service.inspect().bufferBytes, 0);
});

test('pending resume cannot start sources after pause or unmount; rejection does not poll', async t => {
  const e = fixture(t); e.motion.riding = true; e.gesture(); await settle(); const ctx = Audio.instances[0];
  setWorldAudioMuted(true); await settle(); ctx.hold = true;
  setWorldAudioMuted(false); useWorldStore.setState({ paused: true });
  ctx.resumeNow(); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(e.service.inspect().sources, 0);
  useWorldStore.setState({ paused: false }); e.release(); ctx.resumeNow(); await settle();
  assert.equal(ctx.state, 'closed'); assert.equal(e.service.inspect().sources, 0);
  assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('failed autoplay remains silent until a trusted gesture and does not retry from frames or settings', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0]; ctx.reject = true;
  e.motion.riding = true; e.service.update(); await settle(); const attempts = ctx.resumes;
  for (let i = 0; i < 100; i++) { e.service.update(); setWorldAudioVolume('sfx', .7); }
  await settle(); assert.equal(ctx.resumes, attempts); assert.equal(e.service.inspect().sources, 0);
  ctx.reject = false; e.gesture(false); await settle(); assert.equal(ctx.resumes, attempts);
  e.gesture(); await settle(); assert.equal(ctx.resumes, attempts + 1); assert.equal(e.service.inspect().sources, 3);
});

test('normal page departure disposes buffers and all listeners instead of restarting on pageshow', async t => {
  const e = fixture(t); e.motion.riding = true; e.gesture(); await settle(); const ctx = Audio.instances[0];
  e.page('pagehide', false); await settle();
  assert.equal(ctx.state, 'closed'); assert.equal(e.service.inspect().bufferBytes, 0);
  assert.equal(e.service.inspect().sources, 0); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
  e.page('pageshow'); e.gesture(); e.service.update(); setWorldAudioVolume('sfx', .2); await settle();
  assert.equal(Audio.instances.length, 1); assert.equal(e.service.inspect().context, 'absent');
});

test('QA snapshots read existing values without audio creation and stale disposal preserves the current reader', t => {
  const e = fixture(t);
  for (let i = 0; i < 50; i++) readCoasterMotionAudioSnapshot();
  assert.equal(Audio.instances.length, 0);
  assert.equal(readCoasterMotionAudioSnapshot().updates, 0);
  e.motion.speed = 24; e.motion.phase = 'drop'; e.motion.riding = true; e.service.update();
  assert.deepEqual(readCoasterMotionAudioSnapshot(), { context: 'absent', sources: 0, bufferBytes: 0,
    timers: 0, mounted: true, eligible: true, riding: true, speed: 24, phase: 'drop', updates: 1, controlUpdates: 0 });
  const replacement = new CoasterMotionAudio(() => ({ ...e.motion, speed: 12 }));
  const release = replacement.mount();
  try { e.release(); assert.equal(readCoasterMotionAudioSnapshot().speed, 12); }
  finally { release(); }
  assert.equal(readCoasterMotionAudioSnapshot(), null);
  assert.equal(e.win.count + e.doc.count, 0);
});

// Steady-state numerical model: actual PCM, linear resampling at playbackRate,
// Web Audio biquad coefficients, channel gains and the unchanged .6 master.
// Excludes browser interpolation differences, gain ramps and listening judgment.
function measureMix(speed, phase) {
  const rate = 48000, frames = rate * 3, plan = coasterSoundPlan(speed, phase);
  const mix = new Float64Array(frames), channels = {};
  for (const name of ['chain', 'wind', 'rail']) {
    const p = plan[name], data = renderCoasterTexture(name), w = 2 * Math.PI * p.cutoff / rate;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * (name === 'wind' ? 10 ** (.5 / 20) : .7));
    const a0 = 1 + alpha, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
    const b0 = (name === 'wind' ? (1 - cos) / 2 : alpha) / a0;
    const b1 = name === 'wind' ? (1 - cos) / a0 : 0, b2 = name === 'wind' ? b0 : -b0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, power = 0, peak = 0;
    for (let i = 0; i < frames; i++) {
      const at = i * 24000 * p.rate / rate, base = Math.floor(at), f = at - base;
      const x = data[base % data.length] * (1 - f) + data[(base + 1) % data.length] * f;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const output = y * p.gain * .6; mix[i] += output;
      if (i >= rate * 2) { power += output * output; peak = Math.max(peak, Math.abs(output)); }
    }
    channels[name] = { rms: Math.sqrt(power / rate), peak };
  }
  let power = 0, peak = 0;
  for (const v of mix.subarray(rate * 2)) { power += v * v; peak = Math.max(peak, Math.abs(v)); }
  return { channels, rms: Math.sqrt(power / rate), peak };
}

test('filtered PCM mix retains useful digital levels and peak headroom without changing global volume', t => {
  for (const [speed, phase, minDb, maxDb] of [[8, 'lift', -43, -32], [35, 'drop', -36, -26],
    [8, 'return', -49, -36], [90, 'lift', -34, -24]]) {
    const m = measureMix(speed, phase), db = v => Number((20 * Math.log10(v)).toFixed(2));
    t.diagnostic(JSON.stringify({ speed, phase, rmsDb: db(m.rms), peakDb: db(m.peak),
      channels: Object.fromEntries(Object.entries(m.channels).map(([k, v]) => [k, { rmsDb: db(v.rms), peakDb: db(v.peak) }])) }));
    assert.ok(db(m.rms) > minDb && db(m.rms) < maxDb, `${phase} RMS within calibrated range`);
    assert.ok(m.peak < .25, `${phase} retains at least 12 dB of sampled peak headroom`);
  }
  assert.equal(measureMix(0, 'lift').peak, 0);
});
