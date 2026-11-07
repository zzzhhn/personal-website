import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ParkAudio } from './WorldParkAudio.ts';
import { PARK_AUDIO_MIX } from './park-audio-mix.ts';
import { PARK_ROAMING_TRACK } from './park-roaming-music.ts';
import { useWorldStore } from './store.ts';
import { useWorldAudioSettings, setWorldAudioMuted, setWorldAudioVolume } from './world-audio-settings.ts';
import { setClubAudible } from './world-music-focus.ts';

const DECODED_FRAMES = 602_751;
const DECODED_SECONDS = DECODED_FRAMES / 24_000;

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn); }
  get count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
const param = () => ({ value: 0, events: [], setTargetAtTime(value, at, tau) { this.events.push({ from: this.value, value, at, tau }); this.value = value; },
  setValueAtTime(value,at) { this.value=value;this.events.push({kind:'set',value,at}); },
  cancelAndHoldAtTime(at) { this.events.push({kind:'hold',at}); },
  linearRampToValueAtTime(value,at) { this.events.push({kind:'linear',value,at}); }, exponentialRampToValueAtTime() {} });
class Audio extends Target {
  static instances = [];
  state = 'suspended'; currentTime = 0; sampleRate = 24000; destination = {}; sources = []; nodes = [];
  decodes = 0; resumes = 0; holdResume = false; rejectResume = false; holdDecode = false;
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
  async decodeAudioData(data) { this.decodes++; assert.equal(data.byteLength, PARK_ROAMING_TRACK.fileBytes);
    if (this.holdDecode) await new Promise(resolve => this.finishDecode = resolve);
    return { length: DECODED_FRAMES, sampleRate: 24000, numberOfChannels: 2, duration: DECODED_SECONDS }; }
  change(state) { if (this.state === 'closed') return; this.state = state; queueMicrotask(() => this.dispatchEvent(new Event('statechange'))); }
  async resume() { this.resumes++; if (this.rejectResume) throw new Error('gesture required');
    if (this.holdResume) await new Promise(resolve => this.finishResume = resolve); this.change('running'); }
  async suspend() { this.change('suspended'); } async close() { this.change('closed'); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const original = new Map(['window', 'document', 'fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const win = Object.assign(new Target(), { AudioContext: Audio, location: { search: '' },
    setInterval() { assert.fail('no audio scheduler'); }, setTimeout() { assert.fail('no retry timer'); },
    requestAnimationFrame() { assert.fail('no audio frame loop'); } });
  const doc = Object.assign(new Target(), { hidden: false }), requests = [], club = {};
  let reply = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(PARK_ROAMING_TRACK.fileBytes) });
  for (const [name, value] of Object.entries({ window: win, document: doc,
    fetch: (url, options) => { requests.push({ url, options }); return reply(url, options); } })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  Audio.instances.length = 0; useWorldStore.setState(useWorldStore.getInitialState(), true);
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
  const audio = new ParkAudio(), release = audio.retain();
  const gesture = (trusted = true) => { const event = new Event('pointerdown'); Object.defineProperty(event, 'isTrusted', { value: trusted }); win.dispatchEvent(event); };
  const page = (name, persisted = true) => win.dispatchEvent(Object.assign(new Event(name), { persisted }));
  t.after(() => { release(); setClubAudible(club, false);
    useWorldStore.setState(useWorldStore.getInitialState(), true); useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(), true);
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  return { win, doc, requests, audio, release, gesture, page, club, reply(fn) { reply = fn; } };
}

test('normal world starts only on a trusted gesture, fetches the rendered asset and shares one context/source/cache', async t => {
  const e = fixture(t); e.gesture(false); setWorldAudioVolume('music', .7);
  assert.equal(Audio.instances.length, 0); assert.equal(e.requests.length, 0);
  e.gesture(); const ctx = Audio.instances[0]; assert.equal(ctx.resumes, 1, 'resume is invoked inside the input before fetch resolves');
  assert.equal(ctx.sources.length, 0, 'no synchronous music PCM generation'); await settle();
  assert.deepEqual(ctx.options, { sampleRate: 24000 });
  assert.equal(e.requests[0].url, '/assets/world/park/audio/boardwalk-v2.wav');
  assert.equal(e.audio.snapshot().roaming.sources, 1); assert.equal(e.audio.snapshot().roaming.buffers, 1);
  assert.equal(e.audio.snapshot().roaming.bytes, DECODED_FRAMES * 8); assert.equal(ctx.decodes, 1);
  const music = ctx.sources[0]; assert.equal(music.loop, true); assert.equal(music.loopEnd, DECODED_SECONDS);
  for (let i = 0; i < 20; i++) e.gesture(); await settle();
  e.audio.workshopCue('intake'); await settle(); assert.equal(Audio.instances.length, 1);
  assert.equal(ctx.sources.filter(source => source.loop && !source.stopped).length, 1);
  assert.equal(e.requests.length, 1); assert.equal(ctx.decodes, 1);
  assert.equal(e.audio.snapshot().timer, false); assert.equal(e.audio.snapshot().ticks, 0);
});

test('pause, background, inspection, shot and BFCache stop then resume at the same position without duplication', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  const gates = [v => useWorldStore.setState({ paused: v }), v => { e.doc.hidden = v; e.doc.dispatchEvent(new Event('visibilitychange')); },
    v => useWorldStore.setState({ poolInspect: v }), v => useWorldStore.setState({ shot: v ? 'camp' : null }),
    v => e.page(v ? 'pagehide' : 'pageshow'),
    v => setWorldAudioMuted(v), v => setWorldAudioVolume('music', v ? 0 : 1), v => e.audio.setMuted(v)];
  for (const [index, gate] of gates.entries()) {
    const music = ctx.sources.at(-1); ctx.currentTime += 7; gate(true); await settle();
    assert.equal(e.audio.snapshot().roaming.sources, 0); assert.equal(music.stopped, true); assert.equal(music.disconnected, true);
    assert.equal(ctx.state, 'suspended'); const count = ctx.sources.length, offset = e.audio.snapshot().roaming.offset;
    assert.ok(Math.abs(offset - (7 * (index + 1)) % DECODED_SECONDS) < 1e-9);
    ctx.currentTime += 30; // Hidden wall time must not fast-forward the saved phrase.
    assert.equal(ctx.sources.length, count); gate(false); await settle();
    assert.equal(ctx.sources.length, count + 1); assert.equal(ctx.sources.at(-1).offset, offset);
    assert.equal(e.audio.snapshot().roaming.sources, 1); assert.equal(ctx.decodes, 1); assert.equal(e.requests.length, 1);
  }
});

test('shared levels and SFX duck the recording without restarting it, and Music=0 preserves finite SFX', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0], source = ctx.sources[0];
  e.audio.workshopCue('intake'); await settle(); assert.equal(e.audio.snapshot().roaming.level, PARK_AUDIO_MIX.roaming * .62);
  ctx.sources.at(-1).end(); await settle(); assert.equal(e.audio.snapshot().roaming.level, PARK_AUDIO_MIX.roaming);
  setWorldAudioVolume('music', .3); assert.equal(e.audio.snapshot().roaming.level, .42);
  assert.equal(ctx.sources[0], source); assert.equal(source.stopped, undefined);
  setWorldAudioVolume('music', 0); await settle(); e.audio.cue('scan'); await settle();
  assert.equal(e.audio.snapshot().roaming.sources, 0); assert.equal(e.audio.snapshot().cueVoices, 1);
  setWorldAudioMuted(true); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(e.audio.snapshot().cueVoices, 0);
});

test('Club entry fades on the audio clock, then exit resumes the saved phrase without a fresh decode', async t => {
  const e = fixture(t); setWorldAudioVolume('music', .5); e.gesture(); await settle();
  const ctx = Audio.instances[0], initial = ctx.sources[0];
  const assertOnset = source => {
    assert.deepEqual(source.connections[0].gain.events, [{ from: 0, value: .7, at: ctx.currentTime, tau: .08 }]);
    assert.equal(e.audio.snapshot().roaming.level, .7, 'the user-selected target level is preserved');
  };
  assertOnset(initial); ctx.currentTime = 13.375; setClubAudible(e.club, true);
  assert.equal(initial.stopped, false);assert.equal(initial.stopAt,13.555);
  assert.equal(e.audio.snapshot().roaming.fading,true);assert.equal(ctx.state,'running');
  assert.deepEqual(initial.connections[0].gain.events.at(-1),{kind:'linear',value:0,at:13.555});
  ctx.currentTime=14;initial.end();await settle(); // Delayed ended delivery must not advance the saved phrase.
  assert.equal(ctx.state,'suspended');assert.equal(e.audio.snapshot().roaming.offset,13.555);
  ctx.currentTime = 30; setClubAudible(e.club, false); await settle();
  const restored = ctx.sources.at(-1); assert.notEqual(restored, initial); assert.equal(restored.offset, 13.555);
  assertOnset(restored); assert.equal(ctx.decodes, 1); assert.equal(e.requests.length, 1);
  assert.equal(ctx.sources.filter(source => source.loop && !source.stopped).length, 1);
  useWorldStore.setState({ paused: true });
  assert.equal(restored.stopped, true); assert.equal(restored.disconnected, true);
  assert.equal(restored.connections[0].disconnected, true, 'no scheduled gain target can leak through pause');
  assert.equal(e.audio.snapshot().roaming.sources, 0);
});

test('a rapid Club boundary reversal replaces the fading source once, and silence gates cut its tail immediately',async t=>{
  const e=fixture(t);e.gesture();await settle();const ctx=Audio.instances[0];
  ctx.currentTime=5;setClubAudible(e.club,true);const outgoing=ctx.sources.at(-1),late=outgoing.onended;
  ctx.currentTime=5.06;setClubAudible(e.club,false);await settle();
  assert.equal(outgoing.disconnected,true);assert.equal(ctx.sources.at(-1).offset,5.06);
  assert.equal(e.audio.snapshot().roaming.sources,1);late();assert.equal(e.audio.snapshot().roaming.sources,1);
  const gates=[v=>useWorldStore.setState({paused:v}),v=>setWorldAudioMuted(v),
    v=>setWorldAudioVolume('music',v?0:1),v=>{e.doc.hidden=v;e.doc.dispatchEvent(new Event('visibilitychange'));}];
  for(const gate of gates){
    setClubAudible(e.club,true);const source=ctx.sources.at(-1);assert.equal(e.audio.snapshot().roaming.fading,true);
    gate(true);await settle();assert.equal(e.audio.snapshot().roaming.sources,0);assert.equal(source.disconnected,true);
    assert.equal(e.audio.snapshot().roaming.fading,false);assert.equal(ctx.state,'suspended');
    setClubAudible(e.club,false);gate(false);await settle();
  }
  const expectedOffset=e.audio.snapshot().roaming.offset+.18;
  setClubAudible(e.club,true);ctx.currentTime+=2;useWorldStore.setState({paused:true});
  assert.ok(Math.abs(e.audio.snapshot().roaming.offset-expectedOffset)<1e-8,'a late UI pause cannot count silence after the scheduled tail');
  e.release();assert.equal(e.audio.snapshot().roaming.sources,0);
  assert.equal(e.audio.snapshot().roaming.bytes,0);assert.equal(e.win.count+e.doc.count+ctx.count,0);
});

function recording() {
  const wav = readFileSync(new URL(`../../../public${PARK_ROAMING_TRACK.url}`, import.meta.url));
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') {
      return { wav, pcm: wav.subarray(offset + 8, offset + 8 + size) };
    }
    offset += 8 + size + size % 2;
  }
  assert.fail('the WAV is missing its PCM data chunk');
}

test('the actual recording keeps the established music level and independent user channel scaling', async t => {
  const e = fixture(t); e.gesture(); await settle();
  const ctx = Audio.instances[0], source = ctx.sources[0], musicGain = source.connections[0].gain;
  const { pcm } = recording();
  let peak = 0, energy = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset) / 32768; peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2;
  }
  const effective = musicGain.value * e.audio.master.gain.value;
  const rms = Math.sqrt(energy / (pcm.length / 2));
  const outputRmsDb = 20 * Math.log10(rms * effective), outputPeakDb = 20 * Math.log10(peak * effective);
  assert.ok(outputRmsDb > -36 && outputRmsDb < -35, `measured full-volume RMS ${outputRmsDb}`);
  assert.ok(outputPeakDb < -16.5, 'the recording retains at least 16.5 dB of peak headroom');
  assert.equal(e.audio.master.gain.value, .16, 'QA audition and the safety master are unchanged');
  setWorldAudioVolume('music', .5); assert.equal(musicGain.value * e.audio.master.gain.value, effective / 2);
  setWorldAudioVolume('sfx', .4); e.audio.workshopCue('intake'); await settle();
  assert.equal(e.audio.cueOutput.gain.value, .68);
  assert.equal(musicGain.value, .7 * .62, 'the cue keeps the selected music level with a finite dip');
  assert.equal(useWorldAudioSettings.getState().musicVolume, .5); assert.equal(useWorldAudioSettings.getState().sfxVolume, .4);
  setWorldAudioVolume('sfx', 0); assert.equal(e.audio.snapshot().cueVoices, 0); assert.equal(musicGain.value, .7);
  setWorldAudioVolume('music', 0); assert.equal(source.stopped, true); assert.equal(source.disconnected, true);
});

test('pause cancels fetch, stale replies cannot decode, and failed loads retry only on the next trusted gesture', async t => {
  const e = fixture(t); let finish; e.reply(() => new Promise(resolve => finish = resolve));
  e.gesture(); const ctx = Audio.instances[0]; useWorldStore.setState({ paused: true }); await settle();
  assert.equal(e.requests[0].options.signal.aborted, true);
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(PARK_ROAMING_TRACK.fileBytes) }); await settle();
  assert.equal(ctx.decodes, 0); assert.equal(ctx.sources.length, 0);
  e.reply(async () => ({ ok: false })); useWorldStore.setState({ paused: false }); await settle();
  assert.equal(e.audio.snapshot().roaming.phase, 'error'); assert.equal(ctx.state, 'suspended'); const attempts = e.requests.length;
  for (let i = 0; i < 10; i++) { setWorldAudioVolume('music', .5); await settle(); } assert.equal(e.requests.length, attempts);
  e.reply(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(PARK_ROAMING_TRACK.fileBytes) }));
  e.gesture(false); await settle(); assert.equal(e.requests.length, attempts);
  e.gesture(); await settle(); assert.equal(e.audio.snapshot().roaming.sources, 1); assert.equal(ctx.decodes, 1);
});

test('uncancellable decoding is serialized across pause/resume, and late completion after unmount is discarded', async t => {
  const e = fixture(t); e.gesture(); const ctx = Audio.instances[0]; ctx.holdDecode = true; await settle();
  assert.equal(ctx.decodes, 1); useWorldStore.setState({ paused: true }); useWorldStore.setState({ paused: false }); await settle();
  assert.equal(e.requests.length, 1); assert.equal(ctx.decodes, 1);
  ctx.holdDecode = false; ctx.finishDecode(); await settle(); assert.equal(ctx.decodes, 2);
  assert.equal(e.audio.snapshot().roaming.sources, 1); assert.equal(e.audio.snapshot().roaming.buffers, 1);
  e.page('pagehide', false); await settle(); assert.equal(ctx.state, 'closed');
  assert.equal(e.audio.snapshot().roaming.buffers, 0); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('a pending resume cannot resurrect sources after Club entry or final release', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  useWorldStore.setState({ paused: true }); await settle(); ctx.holdResume = true;
  useWorldStore.setState({ paused: false }); setClubAudible(e.club, true); ctx.finishResume(); await settle();
  assert.equal(ctx.state, 'suspended'); assert.equal(e.audio.snapshot().roaming.sources, 0);
  setClubAudible(e.club, false); e.release(); ctx.finishResume(); await settle(); assert.equal(ctx.state, 'closed');
  assert.equal(e.audio.snapshot().roaming.bytes, 0); assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('an uncancellable decode completed after final release cannot repopulate the cache or start a source', async t => {
  const e = fixture(t); e.gesture(); const ctx = Audio.instances[0]; ctx.holdDecode = true; await settle();
  assert.equal(ctx.decodes, 1); e.release(); assert.equal(ctx.state, 'closed'); assert.equal(e.audio.snapshot().roaming.bytes, 0);
  ctx.holdDecode = false; ctx.finishDecode(); await settle();
  assert.equal(e.audio.snapshot().roaming.buffers, 0); assert.equal(ctx.sources.length, 0);
  assert.equal(e.win.count + e.doc.count + ctx.count, 0);
});

test('autoplay rejection stays silent across state/settings updates until the next trusted gesture', async t => {
  const e = fixture(t); e.gesture(); await settle(); const ctx = Audio.instances[0];
  useWorldStore.setState({ paused: true }); await settle(); ctx.rejectResume = true;
  useWorldStore.setState({ paused: false }); await settle(); const attempts = ctx.resumes;
  assert.equal(e.audio.snapshot().roaming.sources, 0);
  for (let i = 0; i < 10; i++) { setWorldAudioVolume('music', .5); e.audio.workshopCue('intake'); await settle(); }
  assert.equal(ctx.resumes, attempts); ctx.rejectResume = false; e.gesture(false); await settle();
  assert.equal(ctx.resumes, attempts); e.gesture(); await settle();
  assert.equal(ctx.resumes, attempts + 1); assert.equal(e.audio.snapshot().roaming.sources, 1);
});

test('public recording exactly matches the Boardwalk v2 handoff and its decoded budget', () => {
  const { wav, pcm } = recording();
  assert.equal(createHash('sha256').update(wav).digest('hex'), '297b3c3ae76d463015970e1f009c09c9f8548f526dd9cef65ed00ce7893e49e8');
  assert.equal(wav.length, PARK_ROAMING_TRACK.fileBytes);
  assert.equal(wav.readUInt16LE(20), 1); // PCM.
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 44_100);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(pcm.length / 4, 1_107_555);
  assert.equal(pcm.length / 4 / 44_100, PARK_ROAMING_TRACK.seconds);
  assert.equal(Math.ceil(PARK_ROAMING_TRACK.seconds * 48_000) * 8, PARK_ROAMING_TRACK.maxDecodedBytes);
});
