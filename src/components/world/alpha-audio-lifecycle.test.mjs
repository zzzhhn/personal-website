import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const audioUrl = new URL('./WorldParkAudio.ts', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === './store' && context.parentURL === audioUrl ? new URL('./store.ts', import.meta.url).href : specifier, context);
} });
const { ParkAudio } = await import('./WorldParkAudio.ts');
const { useWorldStore: store } = await import('./store.ts');
hook.deregister();

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn, options) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn, options); }
  removeEventListener(type, fn, options) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn, options); }
  get count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
const param = () => ({ value: 0, events: [],
  setValueAtTime(value, at) { this.events.push([value, at]); },
  linearRampToValueAtTime(value, at) { this.events.push([value, at]); },
  exponentialRampToValueAtTime(value, at) { this.events.push([value, at]); },
  setTargetAtTime(value, at) { this.events.push([value, at]); },
});
class AudioNode {
  gain = param(); frequency = param(); threshold = param(); ratio = param(); onended = null;
  connections = []; disconnected = false; stops = 0;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
  start(at) { this.startTime = at; }
  stop(at) { this.stopTime = at; this.stops++; }
  end() { this.onended?.(new Event('ended')); }
}
class Audio extends Target {
  static instances = []; static initialState = 'running';
  state = Audio.initialState; currentTime = 1; sampleRate = 32; destination = new AudioNode(); sources = []; nodes = [];
  resumes = 0; suspends = 0; closes = 0; holdResume = false; rejectResume = false;
  constructor() { super(); Audio.instances.push(this); }
  node() { const n = new AudioNode(); this.nodes.push(n); return n; }
  createGain() { return this.node(); }
  createDynamicsCompressor() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) }; }
  createOscillator() { const n = this.node(); this.sources.push(n); return n; }
  createBufferSource() { return this.createOscillator(); }
  change(state) { this.state = state; queueMicrotask(() => this.dispatchEvent(new Event('statechange'))); }
  resume() {
    this.resumes++;
    if (this.rejectResume) return Promise.reject(new Error('gesture required'));
    if (this.holdResume) return new Promise(resolve => { this.finishResume = () => { this.change('running'); resolve(); }; });
    this.change('running'); return Promise.resolve();
  }
  suspend() { this.suspends++; this.change('suspended'); return Promise.resolve(); }
  close() { this.closes++; this.change('closed'); return Promise.resolve(); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function env(t) {
  const win = new Target(), doc = Object.assign(new Target(), { hidden: false });
  const originals = new Map(['window', 'document', 'performance'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let clock = 0, sequence = 0, subscriptions = 0;
  const intervals = new Map(), audios = [];
  Object.assign(win, { AudioContext: Audio,
    setInterval(fn) { intervals.set(++sequence, fn); return sequence; }, clearInterval(id) { intervals.delete(id); },
    setTimeout() { assert.fail('cue must not create a timeout'); },
    requestAnimationFrame() { assert.fail('cue must not create a RAF'); },
  });
  for (const [name, value] of Object.entries({ window: win, document: doc, performance: { now: () => clock } })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  Audio.instances.length = 0; Audio.initialState = 'running'; store.setState(store.getInitialState(), true);
  const subscribe = store.subscribe;
  store.subscribe = listener => { subscriptions++; const stop = subscribe(listener); let active = true;
    return () => { if (active) { active = false; subscriptions--; stop(); } }; };
  t.after(() => {
    audios.forEach(audio => audio.dispose()); store.subscribe = subscribe; store.setState(store.getInitialState(), true);
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  return { win, doc, intervals,
    audio() { const a = new ParkAudio(); audios.push(a); return a; },
    get subscriptions() { return subscriptions; }, now(value) { clock = value; },
    hidden(value) { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); },
    page(type, persisted = true) { const event = new Event(type); Object.defineProperty(event, 'persisted', { value: persisted }); win.dispatchEvent(event); },
    gesture(trusted = true) { const event = new Event('keydown'); Object.defineProperty(event, 'isTrusted', { value: trusted }); win.dispatchEvent(event); },
  };
}

test('cue needs an owner and drops muted, invalid, paused and hidden requests without opening audio', t => {
  const e = env(t), a = e.audio(); a.cue('scan'); assert.equal(Audio.instances.length, 0);
  const release = a.retain();
  for (const intensity of [0, -1, NaN, Infinity]) a.cue('strike', intensity);
  a.setMuted(true); a.cue('scan'); a.setMuted(false);
  store.setState({ paused: true }); a.cue('splash'); store.setState({ paused: false });
  e.hidden(true); a.cue('scan'); e.hidden(false);
  store.setState({ shot: 'camp' }); a.cue('scan'); store.setState({ shot: null });
  assert.equal(Audio.instances.length, 0); assert.equal(e.subscriptions, 0); release();
});

test('all three cues use one context, finite voices, no DJ loop, then suspend after onended', async t => {
  const e = env(t), a = e.audio(), release = a.retain();
  for (const [kind, cost] of [['scan', 1], ['strike', 2], ['splash', 1]]) {
    a.cue(kind); await settle(); const ctx = a.ctx;
    assert.equal(Audio.instances.length, 1); assert.equal(ctx.state, 'running'); assert.equal(a.started, false);
    assert.equal(a.snapshot().cueVoices, cost); assert.equal(e.intervals.size, 0);
    const active = ctx.sources.filter(source => source.onended);
    for (const source of active) { assert.ok(source.stopTime > source.startTime && source.stopTime - source.startTime < 0.4); source.end(); }
    await settle();
    assert.equal(ctx.state, 'suspended'); assert.equal(a.snapshot().voices, 0); assert.equal(a.snapshot().cuePending, false);
    assert.ok(active.every(source => source.disconnected && source.onended === null));
    assert.ok(active.every(source => source.connections.every(node => node.disconnected)));
  }
  release(); await settle(); assert.equal(Audio.instances[0].state, 'closed');
  assert.equal(e.subscriptions, 0); assert.equal(e.win.count + e.doc.count, 0);
});

test('intensity and overlapping event voices are bounded, even under repeated physics calls', async t => {
  const e = env(t), a = e.audio(), release = a.retain();
  for (let i = 0; i < 1000; i++) a.cue('strike', 100);
  const ctx = a.ctx; assert.equal(ctx.sources.length, 8); assert.equal(a.snapshot().cueVoices, 8);
  assert.equal(e.intervals.size, 0);
  for (const node of ctx.nodes) assert.ok(node.gain.events.every(([value]) => value <= 0.3));
  ctx.sources.forEach(source => source.end()); await settle(); assert.equal(ctx.state, 'suspended'); release();
});

test('pause, hidden, shot and mute cancel voices and never replay on return', async t => {
  const e = env(t), a = e.audio(), release = a.retain();
  const gates = [
    value => store.setState({ paused: value }), value => e.hidden(value),
    value => store.setState({ shot: value ? 'camp' : null }), value => a.setMuted(value),
  ];
  for (const gate of gates) {
    a.cue('splash'); await settle(); const ctx = a.ctx, source = ctx.sources.at(-1);
    gate(true); a.cue('strike'); await settle();
    assert.equal(source.stops, 2); assert.equal(source.disconnected, true); assert.equal(ctx.state, 'suspended');
    assert.equal(a.snapshot().cueVoices, 0); const count = ctx.sources.length;
    gate(false); await settle(); assert.equal(ctx.sources.length, count); assert.equal(ctx.state, 'suspended');
    assert.equal(e.intervals.size, 0);
  }
  release();
});

test('only the latest cue waits for resume; pause during resume discards it', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.cue('scan'); const ctx = a.ctx;
  ctx.sources.forEach(source => source.end()); await settle(); ctx.holdResume = true;
  a.cue('scan'); a.cue('strike'); a.cue('splash');
  assert.equal(ctx.resumes, 1); const count = ctx.sources.length; ctx.finishResume(); await settle();
  assert.equal(ctx.sources.length, count + 1); assert.equal(a.snapshot().cueVoices, 1);
  ctx.sources.at(-1).end(); await settle();
  a.cue('strike'); store.setState({ paused: true }); store.setState({ paused: false }); ctx.finishResume(); await settle();
  assert.equal(ctx.sources.length, count + 1); assert.equal(ctx.state, 'suspended'); assert.equal(a.snapshot().voices, 0); release();
});

test('resume rejection blocks physics retries until a new trusted input, without timers', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.cue('scan'); const ctx = a.ctx;
  ctx.sources[0].end(); await settle(); ctx.rejectResume = true; a.cue('strike'); await settle();
  const attempts = ctx.resumes;
  for (let i = 0; i < 100; i++) { a.cue('scan'); await settle(); }
  assert.equal(ctx.resumes, attempts); assert.equal(a.snapshot().cuePending, false); assert.equal(e.intervals.size, 0);
  ctx.rejectResume = false; e.gesture(false); a.cue('splash'); await settle(); assert.equal(ctx.resumes, attempts);
  e.gesture(); a.cue('strike'); await settle(); assert.equal(ctx.resumes, attempts + 1); assert.equal(a.snapshot().cueVoices, 2); release();
});

test('late resume drops an expired cue and returns the idle context to suspended', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.cue('scan'); const ctx = a.ctx;
  ctx.sources[0].end(); await settle(); ctx.holdResume = true; a.cue('strike'); e.now(300);
  ctx.finishResume(); await settle(); assert.equal(ctx.sources.length, 1); assert.equal(ctx.state, 'suspended');
  assert.equal(a.snapshot().voices, 0); assert.equal(e.intervals.size, 0); release();
});

test('DJ starts on the existing cue context and keeps exactly its original music timer', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.cue('splash'); const ctx = a.ctx;
  a.setCrossfade(0.75); a.start(); a.start(); assert.equal(a.ctx, ctx); assert.equal(Audio.instances.length, 1);
  assert.equal(e.intervals.size, 1); assert.equal(a.crossfade, 0.75);
  ctx.sources.forEach(source => source.end()); await settle(); assert.equal(ctx.state, 'running'); assert.equal(e.intervals.size, 1);
  [...e.intervals.values()][0](); const music = ctx.sources.filter(source => source.onended);
  assert.ok(music.length > 0); a.cue('strike');
  store.setState({ paused: true }); await settle(); assert.equal(e.intervals.size, 0); assert.equal(a.snapshot().cueVoices, 0);
  assert.ok(music.every(source => source.onended));
  store.setState({ paused: false }); await settle(); assert.equal(e.intervals.size, 1); release();
});

test('five release/re-entry cycles close all contexts and clear voices, listeners and subscriptions', async t => {
  const e = env(t), a = e.audio();
  for (let i = 0; i < 5; i++) {
    const release = a.retain(); a.cue('strike'); const ctx = a.ctx; release(); release(); await settle();
    assert.equal(ctx.state, 'closed'); assert.equal(ctx.count, 0); assert.equal(a.ctx, null);
    assert.ok(ctx.sources.every(source => source.disconnected && !source.onended));
    assert.equal(a.snapshot().cueVoices, 0); assert.equal(e.subscriptions, 0); assert.equal(e.win.count + e.doc.count, 0);
  }
  assert.equal(Audio.instances.length, 5); assert.equal(e.intervals.size, 0);
});

test('a late resume from a released owner cannot play on a replacement context', async t => {
  const e = env(t), a = e.audio(); let release = a.retain(); a.cue('scan'); const old = a.ctx;
  old.sources[0].end(); await settle(); old.holdResume = true; a.cue('strike'); release();
  release = a.retain(); a.cue('splash'); const current = a.ctx; old.finishResume(); await settle();
  assert.notEqual(old, current); assert.equal(a.ctx, current); assert.equal(current.sources.length, 1);
  assert.equal(old.sources.length, 1); assert.equal(e.intervals.size, 0); release();
});

test('cached departure cancels cues without replay; normal departure releases the service', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.cue('splash'); const ctx = a.ctx;
  e.page('pagehide'); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(a.snapshot().voices, 0);
  a.cue('strike'); e.page('pageshow'); await settle(); assert.equal(ctx.sources.length, 1); assert.equal(ctx.state, 'suspended');
  a.cue('scan'); await settle(); e.page('pagehide', false); await settle(); assert.equal(ctx.state, 'closed');
  assert.equal(a.ctx, null); assert.equal(e.subscriptions, 0); assert.equal(e.win.count + e.doc.count, 0); release();
});

test('an initially suspended browser context resumes once before creating any source', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); Audio.initialState = 'suspended'; a.cue('scan');
  const ctx = a.ctx; assert.equal(ctx.sources.length, 0); assert.equal(ctx.resumes, 1); await settle();
  assert.equal(ctx.sources.length, 1); assert.equal(a.started, false); assert.equal(e.intervals.size, 0); release();
});

test('an already queued old DJ callback cannot start music on a later cue-only context', async t => {
  const e = env(t), a = e.audio(); let release = a.retain(); a.start();
  const oldTick = [...e.intervals.values()][0]; release(); await settle();
  release = a.retain(); a.cue('scan'); const ctx = a.ctx; oldTick();
  assert.equal(a.started, false); assert.equal(ctx.sources.length, 1); assert.equal(e.intervals.size, 0); release();
});
