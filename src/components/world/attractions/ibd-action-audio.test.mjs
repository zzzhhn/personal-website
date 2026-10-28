import test from 'node:test';
import assert from 'node:assert/strict';
import { IbdActionAudio, renderIbdSound, ibdActionSound, committedIbdAction, ibdSoundDistance } from './ibd-action-audio.ts';
import { ParkAudio } from '../WorldParkAudio.ts';
import { registerInteractable, nearestInteractable } from '../WorldInteract.ts';
import { useWorldStore } from '../store.ts';
import { useWorldAudioSettings, setWorldAudioMuted, setWorldAudioVolume } from '../world-audio-settings.ts';
import { useIbdYardStore, dispatchIbdAction, finishIbdAction, cancelIbdAction } from './ibd-yard-store.ts';
import { createIbdYardGame, requestIbdYardAction, finishIbdYardAction, cancelIbdYardAction, yardActions } from './ibd-yard-game.ts';
import { ibdStation, ibdWorld } from './ibd-yard-layout.ts';

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn); }
  get count() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
const param = () => ({ value: 0, writes: 0, setTargetAtTime(v) { this.value = v; this.writes++; },
  setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } });
class Audio extends Target {
  static instances = [];
  state = 'running'; currentTime = 1; sampleRate = 32; destination = {}; sources = []; gains = []; peakSources = 0;
  hold = false; reject = false; resumes = 0;
  constructor() { super(); Audio.instances.push(this); }
  createGain() { const n = { gain: param(), frequency: param(), threshold: param(), ratio: param(), connect(target) { return target; }, disconnect() { n.disconnected = true; } }; this.gains.push(n); return n; }
  createDynamicsCompressor() { return this.createGain(); }
  createBiquadFilter() { return this.createGain(); }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(channels, length, rate) { const data = new Float32Array(length); return { length, duration: length / rate, numberOfChannels: channels, getChannelData: () => data }; }
  createBufferSource() {
    const ctx = this, n = { frequency: param(), connect(target) { return target; }, disconnect() { n.disconnected = true; },
      start(at) { n.live = true; n.startedAt = at; ctx.peakSources = Math.max(ctx.peakSources, ctx.sources.filter(s => s.live).length); },
      stop(at) { if (at === undefined) n.live = false; else n.stopAt = at; },
      end() { n.live = false; n.onended?.(); } };
    this.sources.push(n); return n;
  }
  change(state) { if (this.state === 'closed') return; this.state = state; queueMicrotask(() => this.dispatchEvent(new Event('statechange'))); }
  async resume() { this.resumes++; if (this.reject) throw new Error('gesture required'); if (this.hold) await new Promise(resolve => this.resumeNow = resolve); this.change('running'); }
  async suspend() { this.change('suspended'); }
  async close() { this.state = 'closed'; }
}
const settle = async () => { for (let i = 0; i < 18; i++) await Promise.resolve(); };
function fixture(t) {
  const oldGlobals = new Map(['window', 'document'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const oldYard = useIbdYardStore.getState(), oldWorld = useWorldStore.getState(), oldSettings = useWorldAudioSettings.getState();
  const win = Object.assign(new Target(), { AudioContext: Audio,
    setInterval() { assert.fail('no interval'); }, setTimeout() { assert.fail('no timer'); }, requestAnimationFrame() { assert.fail('no standalone frame loop'); } });
  const doc = Object.assign(new Target(), { hidden: false });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Audio.instances.length = 0;
  useWorldStore.setState({ ...useWorldStore.getInitialState(), paused: false, position: ibdWorld(ibdStation('manifest').at) });
  // Isolate IBD's finite SFX from the now-enabled roaming music gesture listener.
  useWorldAudioSettings.setState({ ...useWorldAudioSettings.getInitialState(), musicVolume: 0 }, true);
  useIbdYardStore.setState({ game: createIbdYardGame(), active: true });
  const audio = new ParkAudio(), externalRelease = audio.retain();
  const service = new IbdActionAudio(audio), release = service.mount();
  const gesture = (trusted = true, type = 'keydown') => { const e = new Event(type); Object.defineProperty(e, 'isTrusted', { value: trusted }); win.dispatchEvent(e); };
  const prime = async () => { audio.cue('scan'); await settle(); audio.ctx.sources.at(-1).end(); await settle(); return audio.ctx; };
  const move = station => useWorldStore.setState({ position: ibdWorld(ibdStation(station, useIbdYardStore.getState().game.core.moved).at) });
  const act = (station, kind) => {
    move(station); const game = useIbdYardStore.getState().game;
    const action = yardActions(game, station).find(a => !kind || a.kind === kind); assert.ok(action, `${station}/${kind}`);
    // WorldActors' gamepad Y edge invokes this same reachable Interactable callback.
    // There is deliberately no synthetic key/pointer event on this path.
    const position = useWorldStore.getState().position;
    const unregister = registerInteractable({ id: `ibd-${station}`, kind: 'exhibit', position, radius: 2.1,
      label: { en: station, zh: station }, onInteract: () => dispatchIbdAction(action) });
    try { nearestInteractable(...position).item.onInteract(); } finally { unregister(); }
    const token = useIbdYardStore.getState().game.pending?.token;
    if (token !== undefined) finishIbdAction(token);
    return token;
  };
  const page = (type, persisted = true) => win.dispatchEvent(Object.assign(new Event(type), { persisted }));
  t.after(() => {
    release(); externalRelease(); useIbdYardStore.setState(oldYard, true); useWorldStore.setState(oldWorld, true); useWorldAudioSettings.setState(oldSettings, true);
    for (const [k, descriptor] of oldGlobals) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
  });
  return { audio, service, release, externalRelease, prime, gesture, move, act, page, win, doc };
}

test('six material patches have three deterministic finite variants, distinct spectra/envelopes and bounded memory', () => {
  const signatures = new Set(); let bytes = 0;
  for (const kind of ['paper', 'tool', 'metal', 'wood', 'machine', 'release']) {
    const variants = [];
    for (let v = 0; v < 3; v++) {
      const data = renderIbdSound(kind, v); bytes += data.byteLength;
      assert.ok(data.length <= Math.round(24000 * .58)); assert.ok(data.at(-1) === 0);
      assert.ok(data.every(n => Number.isFinite(n) && Math.abs(n) <= .7));
      assert.deepEqual(data, renderIbdSound(kind, v));
      let power = 0, roughness = 0, tail = 0;
      for (let i = 1; i < data.length; i++) { power += data[i] ** 2; roughness += (data[i] - data[i - 1]) ** 2; if (i > data.length / 2) tail += data[i] ** 2; }
      assert.ok(Math.sqrt(power / data.length) > .012);
      signatures.add([data.length, (roughness / power).toFixed(3), (tail / power).toFixed(3)].join(':'));
      variants.push(data);
    }
    assert.notDeepEqual(variants[0], variants[1]); assert.notDeepEqual(variants[1], variants[2]);
  }
  assert.equal(signatures.size, 18); assert.ok(bytes < 700000);
  assert.equal(ibdActionSound({ kind: 'brief' }), 'paper'); assert.equal(ibdActionSound({ kind: 'kit' }), 'tool');
  assert.equal(ibdActionSound({ kind: 'scan' }), 'metal'); assert.equal(ibdActionSound({ kind: 'load' }), 'wood');
  assert.equal(ibdActionSound({ kind: 'crane' }), 'machine'); assert.equal(ibdActionSound({ kind: 'release' }), 'release');
  for (const slot of ['coil-front', 'coil-rear'])
    assert.equal(ibdActionSound({ kind: 'replace', station: slot, slot }), 'machine');
  for (const slot of ['parts-a', 'parts-b'])
    assert.equal(ibdActionSound({ kind: 'replace', station: slot, slot }), 'wood');
  assert.equal(ibdSoundDistance([0, 0, 0], [2, 0, 0]), 1); assert.equal(ibdSoundDistance([0, 0, 0], [16, 0, 0]), 0);
  assert.equal(ibdSoundDistance([0, 0, 0], [9, 0, 0]), .25); assert.equal(ibdSoundDistance([NaN, 0, 0], [0, 0, 0]), 0);
});

test('the domain commit gate rejects failures, cancellation, stale and duplicate callbacks', () => {
  let g = createIbdYardGame();
  const actor = station => ({ active: true, local: ibdStation(station).at });
  const brief = requestIbdYardAction(g, { kind: 'brief', station: 'manifest' }, actor('manifest'));
  assert.equal(committedIbdAction(g, brief).kind, 'brief'); g = brief;
  const pending = requestIbdYardAction(g, { kind: 'kit', station: 'kit' }, actor('kit'));
  assert.equal(committedIbdAction(g, pending), null);
  assert.equal(committedIbdAction(pending, cancelIbdYardAction(pending)), null);
  assert.equal(committedIbdAction(pending, finishIbdYardAction(pending, pending.pending.token + 1, actor('kit'))), null);
  assert.equal(committedIbdAction(pending, finishIbdYardAction(pending, pending.pending.token, actor('manifest'))), null);
  g = finishIbdYardAction(pending, pending.pending.token, actor('kit'));
  assert.equal(committedIbdAction(pending, g).kind, 'kit');
  assert.equal(committedIbdAction(g, finishIbdYardAction(g, pending.pending.token, actor('kit'))), null);
  assert.equal(committedIbdAction(g, requestIbdYardAction(g, { kind: 'turn', station: 'turn-front', slot: 'coil-front' }, actor('turn-front'))), null);
});

test('unrelated nearby gestures never create or resume audio; inactive position changes stay idle', async t => {
  const e = fixture(t);
  for (const type of ['click', 'pointerdown', 'keydown']) for (let i = 0; i < 20; i++) e.gesture(true, type);
  assert.equal(Audio.instances.length, 0);
  const updates = e.service.inspect().updates;
  for (let i = 0; i < 100; i++) useWorldStore.setState({ position: [i, 0, 0] });
  assert.equal(e.service.inspect().updates, updates);
  useIbdYardStore.setState({ active: false }); const inactive = e.service.inspect().updates;
  for (let i = 0; i < 100; i++) useWorldStore.setState({ position: [i, 1, 0] });
  assert.equal(e.service.inspect().updates, inactive);
  assert.equal(Audio.instances.length, 0);
});

test('gamepad-equivalent registry callbacks use already unlocked shared audio without an IBD gesture', async t => {
  const e = fixture(t), ctx = await e.prime(), before = ctx.sources.length;
  e.act('manifest'); await settle(); assert.equal(ctx.sources.length, before + 1);
  assert.equal(Audio.instances.length, 1); assert.equal(e.audio.snapshot().owners, 2);
  e.act('kit'); await settle();
  e.move('coil-front'); dispatchIbdAction({ kind: 'scan', station: 'coil-front', slot: 'coil-front' });
  const token = useIbdYardStore.getState().game.pending.token, count = ctx.sources.length;
  finishIbdAction(token + 1); cancelIbdAction(); finishIbdAction(token); assert.equal(ctx.sources.length, count);
  const accepted = e.act('coil-front'); await settle(); assert.equal(ctx.sources.length, count + 1);
  finishIbdAction(accepted); await settle(); assert.equal(ctx.sources.length, count + 1);
  for (const source of ctx.sources) if (source.live) source.end(); await settle();
  assert.equal(e.audio.snapshot().cueVoices, 0); assert.equal(ctx.state, 'suspended');
});

test('a complete real shipment emits its material cue once at every accepted completion, including release', async t => {
  const e = fixture(t), ctx = await e.prime(), variants = new Map();
  const route = [['manifest', 'brief'], ['kit', 'kit'], ['crane', 'crane'],
    ['coil-front', 'scan'], ['turn-front', 'turn'], ['coil-front', 'rear'],
    ['coil-rear', 'scan'], ['turn-rear', 'turn'], ['coil-rear', 'rear'],
    ['parts-a', 'open'], ['parts-a', 'contents'], ['scale-a', 'weigh'], ['load-a', 'load'],
    ['parts-b', 'open'], ['parts-b', 'contents'], ['load-b', 'load'], ['dispatch', 'verify'], ['dispatch', 'release']];
  for (const [station, kind] of route) {
    const count = ctx.sources.length; e.act(station, kind); await settle();
    assert.equal(ctx.sources.length, count + 1, `${kind} emits once after commit`);
    const material = ibdActionSound({ kind }), variant = variants.get(material) ?? 0;
    assert.deepEqual(ctx.sources.at(-1).buffer.getChannelData(0), renderIbdSound(material, variant));
    variants.set(material, (variant + 1) % 3);
    ctx.sources.at(-1).end(); await settle(); assert.equal(ctx.state, 'suspended');
  }
  assert.equal(useIbdYardStore.getState().game.released, true);
});

test('IBD cancellation, distance and unmount stop only owned cues and keep other shared voices running', async t => {
  const e = fixture(t), ctx = await e.prime();
  e.act('manifest'); await settle();
  const stopWorkshop = e.audio.workshopCue('process'); await settle(); const workshop = ctx.sources.at(-1);
  e.act('kit'); await settle(); e.act('gallery-front'); await settle();
  assert.ok(e.service.inspect().activeHandles > 0);
  useIbdYardStore.setState({ active: false }); await settle();
  assert.equal(e.service.inspect().activeHandles, 0); assert.equal(e.audio.snapshot().cueVoices, 1);
  assert.equal(workshop.live, true); assert.equal(ctx.state, 'running');
  useIbdYardStore.setState({ active: true }); e.act('gallery-front'); await settle();
  useWorldStore.setState({ position: [0, 0, 0] }); await settle();
  assert.equal(e.service.inspect().activeHandles, 0); assert.equal(workshop.live, true);
  e.act('gallery-front'); await settle(); e.release(); await settle();
  assert.equal(e.audio.snapshot().owners, 1); assert.equal(e.audio.snapshot().cueVoices, 1);
  assert.equal(ctx.state, 'running'); assert.equal(workshop.live, true);
  stopWorkshop(); await settle(); assert.equal(ctx.state, 'suspended');
  e.externalRelease(); assert.equal(ctx.state, 'closed'); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('IBD and Alpha/workshop cues share one eight-source ceiling, SFX bus and lifecycle', async t => {
  const e = fixture(t), ctx = await e.prime();
  e.act('manifest'); await settle(); e.act('kit'); await settle();
  for (const source of ctx.sources) if (source.live) source.end(); await settle();
  e.move('gallery-front');
  e.audio.cue('strike'); await settle(); // two Alpha sources
  for (let i = 0; i < 4; i++) e.audio.workshopCue('process'); await settle();
  for (let i = 0; i < 20; i++) e.act('gallery-front'); await settle();
  assert.equal(e.audio.snapshot().cueVoices, 8); assert.ok(ctx.peakSources <= 8);
  setWorldAudioVolume('music', 0); assert.equal(e.audio.snapshot().cueVoices, 8);
  setWorldAudioVolume('sfx', .4); assert.equal(e.audio.cueOutput.gain.value, .4);
  const gates = [v => useWorldStore.setState({ paused: v }), v => useWorldStore.setState({ poolInspect: v }),
    v => useWorldStore.setState({ shot: v ? 'camp' : null }), v => useWorldStore.setState({ card: v ? { kind: 'project', id: 'x' } : null }),
    v => { e.doc.hidden = v; e.doc.dispatchEvent(new Event('visibilitychange')); }, v => setWorldAudioMuted(v),
    v => setWorldAudioVolume('sfx', v ? 0 : 1), v => e.page(v ? 'pagehide' : 'pageshow')];
  for (const gate of gates) {
    for (const source of ctx.sources) if (source.live) source.end(); await settle();
    e.act('gallery-front'); await settle(); assert.ok(e.service.inspect().activeHandles > 0);
    gate(true); await settle(); assert.equal(e.audio.snapshot().cueVoices, 0); assert.equal(ctx.state, 'suspended');
    const count = ctx.sources.length; gate(false); await settle(); assert.equal(ctx.sources.length, count);
  }
  e.page('pagehide', false); await settle();
  assert.equal(ctx.state, 'closed'); assert.equal(e.audio.snapshot().pcmBytes, 0);
});

test('shared resume remains latest-only, expires at 250 ms, and rejects pending IBD after cancellation or unmount', async t => {
  const e = fixture(t), ctx = await e.prime(); ctx.hold = true;
  e.act('manifest'); e.act('kit'); ctx.resumeNow(); await settle();
  assert.deepEqual(ctx.sources.at(-1).buffer.getChannelData(0), renderIbdSound('tool', 0));
  for (const s of ctx.sources) if (s.live) s.end(); await settle();
  const count = ctx.sources.length;
  e.act('gallery-front'); useIbdYardStore.setState({ active: false }); ctx.resumeNow(); await settle();
  assert.equal(ctx.sources.length, count); assert.equal(ctx.state, 'suspended');
  useIbdYardStore.setState({ active: true });
  const oldNow = Object.getOwnPropertyDescriptor(performance, 'now'); let now = 1000;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  try { e.act('gallery-front'); now += 251; ctx.resumeNow(); await settle(); assert.equal(ctx.sources.length, count); }
  finally { if (oldNow) Object.defineProperty(performance, 'now', oldNow); else delete performance.now; }
  e.act('gallery-front'); e.release(); ctx.resumeNow(); await settle();
  assert.equal(ctx.sources.length, count); assert.equal(ctx.state, 'suspended'); assert.equal(e.audio.snapshot().owners, 1);
});

test('browser authorization failure remains silent and does not synthesize a trusted input', async t => {
  const e = fixture(t), ctx = await e.prime(); ctx.reject = true;
  e.act('manifest'); await settle(); const attempts = ctx.resumes, count = ctx.sources.length;
  e.act('kit'); e.act('gallery-front'); await settle(); assert.equal(ctx.resumes, attempts);
  assert.equal(ctx.sources.length, count);
  ctx.reject = false; e.gesture(false); e.act('gallery-front'); await settle(); assert.equal(ctx.resumes, attempts);
  e.gesture(); e.act('gallery-front'); await settle(); assert.equal(ctx.resumes, attempts + 1);
  assert.equal(Audio.instances.length, 1); assert.equal(ctx.sources.length, count + 1);
});
