import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mockRoamingMedia, attachMediaNode } from './roaming-media-test-fixture.mjs';
import { ParkAudio } from './WorldParkAudio.ts';
import { PARK_AUDIO_MIX } from './park-audio-mix.ts';
import { PARK_ROAMING_TRACK } from './park-roaming-music.ts';
import { useWorldStore } from './store.ts';
import { useWorldAudioSettings, setWorldAudioMuted, setWorldAudioVolume } from './world-audio-settings.ts';
import { setClubAudible } from './world-music-focus.ts';

const LEGACY_WAV = '/assets/world/park/audio/boardwalk-v2.wav';

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn); }
  get count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
const param = () => ({ value: 0, events: [], setTargetAtTime(value, at, tau) { this.events.push({ from: this.value, value, at, tau }); this.value = value; },
  setValueAtTime(value,at) { this.value=value;this.events.push({kind:'set',value,at}); },
  cancelScheduledValues(at) { this.events.push({kind:'cancel',at}); },
  cancelAndHoldAtTime(at) { this.events.push({kind:'hold',at}); },
  linearRampToValueAtTime(value,at) { this.events.push({kind:'linear',value,at}); }, exponentialRampToValueAtTime() {} });
class Audio extends Target {
  static instances = [];
  state = 'suspended'; currentTime = 0; sampleRate = 24000; destination = {}; sources = []; nodes = [];
  decodes = 0; resumes = 0; holdResume = false; rejectResume = false; mediaSources = [];
  constructor(options) { super(); this.options = options; Audio.instances.push(this); }
  node() { const node = { gain: param(), frequency: param(), threshold: param(), ratio: param(),
    connections: [], connect(target) { node.connections.push(target); return target; }, disconnect() { node.disconnected = true; } }; this.nodes.push(node); return node; }
  createGain() { return this.node(); } createBiquadFilter() { return this.node(); } createDynamicsCompressor() { return this.node(); }
  createBuffer(channels, length, sampleRate) { const pcm = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate, getChannelData: i => pcm[i] }; }
  createBufferSource() { const node = this.node(),ctx=this; Object.assign(node, {
    start(at, offset) { node.offset = offset; node.started = true; }, stop(at=0) { node.stopAt=at;node.stopped=at<=ctx.currentTime; }, end() { node.stopped=true;node.onended?.(); },
  }); this.sources.push(node); return node; }
  createOscillator() { return this.createBufferSource(); }
  createMediaElementSource(media) {
    const node = attachMediaNode(media, this.node());
    this.mediaSources.push(node);
    return node;
  }
  decodeAudioData() { this.decodes++; assert.fail('roaming never decodes a whole file'); }
  change(state) { if (this.state === 'closed') return; this.state = state; queueMicrotask(() => this.dispatchEvent(new Event('statechange'))); }
  async resume() { this.resumes++; if (this.rejectResume) throw new Error('gesture required');
    if (this.holdResume) await new Promise(resolve => this.finishResume = resolve); this.change('running'); }
  async suspend() { this.change('suspended'); } async close() { this.change('closed'); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const original = new Map(['window', 'document', 'fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const timers = new Map();
  let timerId = 0;
  const win = Object.assign(new Target(), { AudioContext: Audio, location: { search: '' },
    setInterval() { assert.fail('no audio scheduler'); },
    setTimeout(callback, delay) { assert.equal(delay, 180); timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { assert.fail('no audio frame loop'); } });
  const doc = Object.assign(new Target(), { hidden: false }), club = {};
  const media = mockRoamingMedia(doc);
  for (const [name, value] of Object.entries({ window: win, document: doc,
    fetch() { assert.fail('roaming never fetches a whole file in JavaScript'); } })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  Audio.instances.length = 0; useWorldStore.setState(useWorldStore.getInitialState(), true);
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
  const audio = new ParkAudio(), release = audio.retain();
  const gesture = (trusted = true, type = 'pointerdown', pointerType = 'mouse') => {
    const event = Object.assign(new Event(type), { pointerType });
    Object.defineProperty(event, 'isTrusted', { value: trusted });
    win.dispatchEvent(event);
  };
  const page = (name, persisted = true) => win.dispatchEvent(Object.assign(new Event(name), { persisted }));
  t.after(() => { release(); setClubAudible(club, false);
    useWorldStore.setState(useWorldStore.getInitialState(), true); useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  return { win, doc, ...media, audio, release, gesture, page, club, timers };
}

test('a trusted gesture calls native play before a pending context resume, behind a zero gain', async t => {
  const e = fixture(t);
  e.gesture(false);
  setWorldAudioVolume('music', .7);
  assert.equal(Audio.instances.length, 0);
  assert.equal(e.media.length, 0);

  const original = Audio.prototype.resume;
  Audio.prototype.resume = function () { this.holdResume = true; return original.call(this); };
  try { e.gesture(); } finally { Audio.prototype.resume = original; }
  const ctx = Audio.instances[0], [media] = e.media;
  assert.deepEqual(ctx.options, { sampleRate: 24000 });
  assert.equal(ctx.resumes, 1);
  assert.equal(ctx.state, 'suspended');
  assert.equal(media.plays, 1, 'play happens in the input handler');
  assert.equal(media.src, PARK_ROAMING_TRACK.url);
  assert.equal(media.loop, true);
  assert.equal(media.preload, 'none');
  const gain = ctx.mediaSources[0].connections[0];
  assert.equal(gain.connections[0], e.audio.master);
  assert.equal(gain.gain.value, 0);
  await settle();
  assert.equal(gain.gain.value, 0, 'a playing media element stays silent before context resume');
  ctx.finishResume();
  await settle();
  assert.equal(e.audio.snapshot().roaming.sources, 1);
  assert.equal(e.audio.snapshot().roaming.streaming, true);
  assert.equal(e.audio.snapshot().roaming.playPending, false);
  assert.equal(e.audio.snapshot().roaming.bytes, 0);
  assert.equal(e.audio.snapshot().roaming.buffers, 0);
  assert.equal(ctx.decodes, 0);
  assert.equal(ctx.sources.length, 0);
  for (let i = 0; i < 20; i++) e.gesture();
  await settle();
  assert.equal(media.plays, 1);
  assert.equal(Audio.instances.length, 1);
  assert.equal(e.media.length, 1);
  assert.equal(ctx.mediaSources.length, 1);
  assert.equal(e.audio.snapshot().timer, false);
  assert.equal(e.audio.snapshot().ticks, 0);
});

test('each silence gate pauses the element and restores the phrase on the same source', async t => {
  const e = fixture(t);
  e.gesture(); await settle();
  const ctx = Audio.instances[0], [media] = e.media;
  const gain = ctx.mediaSources[0].connections[0].gain;
  const gates = [v => useWorldStore.setState({ paused: v }), v => { e.doc.hidden = v; e.doc.dispatchEvent(new Event('visibilitychange')); },
    v => useWorldStore.setState({ poolInspect: v }), v => useWorldStore.setState({ shot: v ? 'camp' : null }),
    v => e.page(v ? 'pagehide' : 'pageshow'),
    v => setWorldAudioMuted(v), v => setWorldAudioVolume('music', v ? 0 : 1), v => e.audio.setMuted(v)];
  for (const gate of gates) {
    const phrase = (media.currentTime + 7) % PARK_ROAMING_TRACK.seconds;
    media.currentTime = phrase;
    gate(true);
    assert.equal(media.paused, true);
    assert.equal(gain.value, 0);
    assert.equal(e.audio.snapshot().roaming.sources, 0);
    await settle();
    assert.equal(ctx.state, 'suspended');
    assert.equal(e.audio.snapshot().roaming.offset, phrase);
    ctx.currentTime += 30;
    gate(false); await settle();
    assert.equal(media.paused, false);
    assert.equal(media.currentTime, phrase);
    assert.equal(e.audio.snapshot().roaming.sources, 1);
    assert.equal(ctx.mediaSources.length, 1);
    assert.equal(media.loads, 0);
  }
});

test('touch starts playback on a trusted pointer release', async t => {
  const e = fixture(t);
  e.gesture(true, 'pointerdown', 'touch');
  e.gesture(false, 'pointerup', 'touch');
  e.gesture(true, 'pointerup', 'mouse');
  assert.equal(Audio.instances.length, 0);
  e.gesture(true, 'pointerup', 'touch');
  assert.equal(e.media[0].plays, 1);
  await settle();
  assert.equal(e.audio.snapshot().roaming.sources, 1);
});

test('Club entry reaches zero on the audio clock and restores at the deadline even after a long frame', async t => {
  const e = fixture(t);
  setWorldAudioVolume('music', .5); e.gesture(); await settle();
  const ctx = Audio.instances[0], [media] = e.media;
  const gain = ctx.mediaSources[0].connections[0].gain;
  assert.deepEqual(gain.events, [{ from: 0, value: .7, at: 0, tau: .08 }]);
  ctx.currentTime = 2;
  media.currentTime = 13.375;
  setClubAudible(e.club, true);
  assert.equal(media.paused, false);
  assert.equal(e.audio.snapshot().timer, true);
  assert.equal(e.timers.size, 1);
  assert.deepEqual(gain.events.at(-1), { kind: 'linear', value: 0, at: 2.18 });
  ctx.currentTime = 4;
  media.currentTime += 2;
  e.timers.values().next().value();
  await settle();
  assert.equal(ctx.state, 'suspended');
  assert.equal(media.paused, true);
  assert.equal(e.timers.size, 0);
  assert.equal(e.audio.snapshot().roaming.offset, 13.555);
  setClubAudible(e.club, false); await settle();
  assert.equal(media.currentTime, 13.555);
  assert.deepEqual(gain.events.at(-1), { from: 0, value: .7, at: 4, tau: .08 });
  assert.equal(media.plays, 2);
  assert.equal(ctx.mediaSources.length, 1);

  setClubAudible(e.club, true);
  const staleDeadline = e.timers.values().next().value;
  ctx.currentTime += 2;
  media.currentTime += 2;
  setClubAudible(e.club, false);
  staleDeadline(); await settle();
  assert.ok(Math.abs(media.currentTime - 13.735) < 1e-8, 'exit wins the late timer without skipping the silent tail');
  assert.equal(e.audio.snapshot().roaming.sources, 1);
  assert.equal(e.timers.size, 0);
});

test('quick Club reversal retains the source and every hard silence gate clears the fade deadline', async t => {
  const e = fixture(t);
  e.gesture(); await settle();
  const ctx = Audio.instances[0], [media] = e.media;
  ctx.currentTime = 5;
  media.currentTime = 10;
  setClubAudible(e.club, true);
  const staleDeadline = e.timers.values().next().value;
  ctx.currentTime += .06;
  media.currentTime += .06;
  setClubAudible(e.club, false);
  staleDeadline();
  assert.equal(media.plays, 1);
  assert.equal(media.paused, false);
  assert.equal(e.timers.size, 0);
  const gates = [v => useWorldStore.setState({ paused: v }), v => setWorldAudioMuted(v),
    v => setWorldAudioVolume('music', v ? 0 : 1), v => { e.doc.hidden = v; e.doc.dispatchEvent(new Event('visibilitychange')); }];
  for (const gate of gates) {
    setClubAudible(e.club, true);
    assert.equal(e.audio.snapshot().roaming.fading, true);
    gate(true);
    assert.equal(media.paused, true);
    assert.equal(e.timers.size, 0);
    await settle();
    assert.equal(ctx.state, 'suspended');
    setClubAudible(e.club, false); gate(false); await settle();
  }
  setClubAudible(e.club, true);
  e.release();
  assert.equal(e.timers.size, 0);
  assert.equal(e.audio.snapshot().roaming.streaming, false);
  assert.equal(ctx.mediaSources[0].disconnected, true);
  assert.equal(ctx.mediaSources[0].connections[0].disconnected, true);
  assert.equal(media.src, '');
  assert.equal(media.onloadedmetadata, null);
  assert.equal(media.ondurationchange, null);
  assert.equal(media.onerror, null);
  assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

function recording() {
  const wav = readFileSync(new URL(`../../../public${LEGACY_WAV}`, import.meta.url));
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') {
      return { wav, pcm: wav.subarray(offset + 8, offset + 8 + size) };
    }
    offset += 8 + size + size % 2;
  }
  assert.fail('the WAV is missing its PCM data chunk');
}

test('the legacy recording and shared mix establish headroom while cues and music retain independent controls', async t => {
  const e = fixture(t); e.gesture(); await settle();
  const ctx = Audio.instances[0], [media] = e.media;
  const gain = ctx.mediaSources[0].connections[0].gain;
  const { pcm } = recording();
  let peak = 0, energy = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset) / 32768; peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2;
  }
  const effective = gain.value * e.audio.master.gain.value;
  const outputRmsDb = 20 * Math.log10(Math.sqrt(energy / (pcm.length / 2)) * effective);
  assert.ok(outputRmsDb > -36 && outputRmsDb < -35, `measured baseline RMS ${outputRmsDb}`);
  assert.ok(20 * Math.log10(peak * effective) < -16.5);
  assert.equal(e.audio.master.gain.value, .16);
  assert.equal(gain.value, PARK_AUDIO_MIX.roaming);
  setWorldAudioVolume('music', .5); assert.equal(gain.value * e.audio.master.gain.value, effective / 2);
  setWorldAudioVolume('sfx', .4); e.audio.workshopCue('intake'); await settle();
  assert.equal(e.audio.cueOutput.gain.value, .68);
  assert.equal(gain.value, .7 * .62);
  ctx.sources.at(-1).end(); await settle();
  assert.equal(gain.value, .7);
  assert.equal(media.plays, 1);
  setWorldAudioVolume('music', 0); await settle(); e.audio.cue('scan'); await settle();
  assert.equal(media.paused, true);
  assert.equal(e.audio.snapshot().cueVoices, 1);
  setWorldAudioMuted(true); await settle();
  assert.equal(ctx.state, 'suspended');
  assert.equal(e.audio.snapshot().cueVoices, 0);
});

test('pause aborts initial buffering and stale media results cannot affect a newer play', async t => {
  const e = fixture(t);
  e.options.holdPlay = true;
  e.options.deferAborts = true;
  e.gesture(); await settle();
  const [media] = e.media;
  const first = media.lastPlay, staleMetadata = media.onloadedmetadata;
  assert.equal(e.audio.snapshot().roaming.playPending, true);
  useWorldStore.setState({ paused: true }); await settle();
  assert.equal(media.src, '');
  assert.equal(media.loads, 1);
  assert.equal(e.audio.snapshot().roaming.phase, 'idle');
  useWorldStore.setState({ paused: false }); await settle();
  const second = media.lastPlay;
  assert.notEqual(first, second);
  media.metadata();
  second.resolve();
  await settle();
  first.reject(new DOMException('Interrupted', 'AbortError'));
  staleMetadata();
  await settle();
  assert.equal(e.audio.snapshot().roaming.sources, 1);
  assert.equal(e.audio.snapshot().roaming.phase, 'ready');
  assert.equal(media.paused, false);
  assert.equal(e.media.length, 1);
});

test('media rejection and invalid duration stay silent until a new trusted gesture', async t => {
  const e = fixture(t);
  e.options.holdPlay = true;
  e.gesture(); await settle();
  const [media] = e.media;
  const ctx = Audio.instances[0];
  media.lastPlay.reject(new DOMException('Gesture required', 'NotAllowedError'));
  await settle();
  assert.equal(ctx.state, 'suspended');
  assert.equal(e.audio.snapshot().roaming.phase, 'error');
  assert.equal(media.src, '');
  for (let i = 0; i < 10; i++) { setWorldAudioVolume('music', .5); e.gesture(false); await settle(); }
  assert.equal(media.plays, 1);
  e.gesture(); await settle(); media.metadata(Infinity); await settle();
  assert.equal(media.plays, 2);
  assert.equal(e.audio.snapshot().roaming.phase, 'error');
  assert.equal(media.src, '');
  e.gesture(); await settle(); media.onerror(); await settle();
  assert.equal(media.plays, 3);
  assert.equal(e.audio.snapshot().roaming.phase, 'error');
  e.options.holdPlay = false;
  e.gesture(); await settle();
  assert.equal(media.plays, 4);
  assert.equal(ctx.mediaSources.length, 1);
  assert.equal(e.audio.snapshot().roaming.sources, 1);
});

test('a hard silence gate aborts native buffering even after metadata has arrived', async t => {
  const e = fixture(t);
  e.options.holdPlay = true;
  e.gesture(); await settle();
  const [media] = e.media;
  media.metadata();
  assert.equal(e.audio.snapshot().roaming.phase, 'ready');
  assert.equal(e.audio.snapshot().roaming.playPending, true);
  useWorldStore.setState({ paused: true }); await settle();
  assert.equal(media.src, '');
  assert.equal(media.loads, 1);
  assert.equal(e.audio.snapshot().roaming.phase, 'idle');
  e.options.holdPlay = false;
  useWorldStore.setState({ paused: false }); await settle();
  assert.equal(e.audio.snapshot().roaming.sources, 1);
  assert.equal(e.media.length, 1);
});

test('pending play resolution after final release cannot repopulate the audio graph', async t => {
  const e = fixture(t);
  e.options.holdPlay = true;
  e.options.deferAborts = true;
  e.gesture(); await settle();
  const ctx = Audio.instances[0], [media] = e.media;
  const latePlay = media.lastPlay, lateMetadata = media.onloadedmetadata;
  e.page('pagehide', false);
  assert.equal(ctx.state, 'closed');
  assert.equal(media.src, '');
  assert.equal(media.paused, true);
  latePlay.resolve(); lateMetadata(); await settle();
  assert.equal(e.audio.snapshot().roaming.sources, 0);
  assert.equal(e.audio.snapshot().roaming.bytes, 0);
  assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('a pending resume cannot resurrect music after Club entry or final release', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  useWorldStore.setState({ paused: true }); await settle(); ctx.holdResume = true;
  useWorldStore.setState({ paused: false }); setClubAudible(e.club, true); ctx.finishResume(); await settle();
  assert.equal(ctx.state, 'suspended'); assert.equal(e.audio.snapshot().roaming.sources, 0);
  setClubAudible(e.club, false); e.release(); ctx.finishResume(); await settle(); assert.equal(ctx.state, 'closed');
  assert.equal(e.audio.snapshot().roaming.bytes, 0); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('context autoplay rejection waits for the next trusted gesture without starting media', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0], [media] = e.media;
  useWorldStore.setState({ paused: true }); await settle(); ctx.rejectResume = true;
  useWorldStore.setState({ paused: false }); await settle(); const attempts = ctx.resumes;
  assert.equal(media.plays, 1);
  assert.equal(e.audio.snapshot().roaming.sources, 0);
  for (let i = 0; i < 10; i++) { setWorldAudioVolume('music', .5); e.audio.workshopCue('intake'); await settle(); }
  assert.equal(ctx.resumes, attempts); ctx.rejectResume = false; e.gesture(false); await settle();
  assert.equal(ctx.resumes, attempts); e.gesture(); await settle();
  assert.equal(ctx.resumes, attempts + 1); assert.equal(e.audio.snapshot().roaming.sources, 1);
});

test('the original public WAV still matches the Boardwalk v2 handoff', () => {
  const { wav, pcm } = recording();
  assert.equal(createHash('sha256').update(wav).digest('hex'), '297b3c3ae76d463015970e1f009c09c9f8548f526dd9cef65ed00ce7893e49e8');
  assert.equal(wav.length, 4_430_298);
  assert.equal(wav.readUInt16LE(20), 1); // PCM.
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 44_100);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(pcm.length / 4, 1_107_555);
});
