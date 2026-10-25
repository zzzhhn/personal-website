import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Native Node TS loading needs the browser bundler's extensionless store import resolved.
const audioUrl = new URL('./WorldParkAudio.ts', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === './store' && context.parentURL === audioUrl ? new URL('./store.ts', import.meta.url).href : specifier, context);
} });
const { ParkAudio } = await import('./WorldParkAudio.ts');
const { useWorldStore } = await import('./store.ts');
const { watchUiGamepads, uiGamepadTasks } = await import('./WorldUiGamepad.ts');
hook.deregister();

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn, options) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn, options); }
  removeEventListener(type, fn, options) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn, options); }
  get count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
class Node {
  gain = param(); frequency = param(); threshold = param(); ratio = param(); onended = null;
  disconnected = false;
  connect(node) { return node; }
  disconnect() { this.disconnected = true; }
  start(time) { this.startTime = time; }
  stop(time) { this.stopTime = time; }
  end() { this.onended?.(new Event('ended')); }
}
class Audio extends Target {
  static instances = [];
  state = 'running'; currentTime = 1; sampleRate = 32; destination = new Node(); sources = [];
  resumes = 0; suspends = 0; closes = 0; holdResume = false; rejectResume = false;
  constructor() { super(); Audio.instances.push(this); }
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) }; }
  createOscillator() { const n = new Node(); this.sources.push(n); return n; }
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
  const names = ['window', 'document', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const descriptors = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const win = new Target(), doc = Object.assign(new Target(), { hidden: false });
  const intervals = new Map(), frames = new Map(), audios = [], stops = [];
  let id = 0, pads = [], reads = 0, denied = false, subscriptions = 0;
  const request = fn => { frames.set(++id, fn); return id; }, cancel = i => frames.delete(i);
  Object.assign(win, { AudioContext: Audio, setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: i => intervals.delete(i) });
  const values = { window: win, document: doc, navigator: { getGamepads: () => { reads++; if (denied) throw new Error('denied'); return pads; } }, requestAnimationFrame: request, cancelAnimationFrame: cancel };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  Audio.instances.length = 0;
  useWorldStore.setState(useWorldStore.getInitialState(), true);
  const subscribe = useWorldStore.subscribe;
  useWorldStore.subscribe = listener => {
    subscriptions++; const stop = subscribe(listener); let live = true;
    return () => { if (live) { live = false; subscriptions--; stop(); } };
  };
  t.after(() => {
    stops.forEach(stop => stop()); audios.forEach(audio => audio.dispose());
    useWorldStore.subscribe = subscribe; useWorldStore.setState(useWorldStore.getInitialState(), true);
    for (const name of names) { const d = descriptors.get(name); if (d) Object.defineProperty(globalThis, name, d); else delete globalThis[name]; }
  });
  return { win, doc, intervals, frames,
    audio() { const a = new ParkAudio(); audios.push(a); return a; },
    watch(fn) { const stop = watchUiGamepads(fn); stops.push(stop); return stop; },
    get reads() { return reads; }, get subscriptions() { return subscriptions; },
    pads(value) { pads = value; }, denied(value) { denied = value; },
    tick() { [...intervals.values()].forEach(fn => fn()); },
    frame() { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn(0)); },
    hidden(value) { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); },
    page(type, persisted = true) { const e = new Event(type); Object.defineProperty(e, 'persisted', { value: persisted }); win.dispatchEvent(e); },
  };
}

test('audio ownership: five start/unmount cycles release timers, graphs and listeners', async t => {
  const e = env(t), a = e.audio();
  a.start(); assert.equal(Audio.instances.length, 0, 'no audio without a mounted owner');
  for (let i = 0; i < 5; i++) {
    const release = a.retain(); assert.equal(e.subscriptions, 0, 'unused audio has no store subscription');
    a.start(); a.start(); const ctx = a.ctx;
    assert.equal(e.intervals.size, 1); assert.equal(e.subscriptions, 1);
    e.tick(); assert.ok(a.snapshot().voices > 0);
    release(); release(); await settle();
    assert.equal(a.started, false); assert.equal(a.ctx, null); assert.equal(ctx.state, 'closed');
    assert.equal(e.intervals.size, 0); assert.equal(e.subscriptions, 0); assert.equal(e.win.count + e.doc.count, 0);
    assert.equal(a.snapshot().voices, 0); assert.ok(ctx.sources.every(s => s.disconnected));
  }
  assert.equal(Audio.instances.length, 5);
});

test('pause, hidden, mute and shot suspend audio without keeping the scheduler awake', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.start(); const ctx = a.ctx;
  e.tick(); const ticks = a.snapshot().ticks;
  useWorldStore.setState({ paused: true }); await settle(); e.tick();
  assert.equal(e.intervals.size, 0); assert.equal(a.snapshot().ticks, ticks); assert.equal(ctx.state, 'suspended');
  useWorldStore.setState({ position: [1, 2, 3] }); assert.equal(ctx.suspends, 1, 'unrelated store writes do not suspend again');
  useWorldStore.setState({ paused: false }); await settle(); assert.equal(e.intervals.size, 1);
  e.hidden(true); await settle(); assert.equal(e.intervals.size, 0);
  e.hidden(false); await settle(); assert.equal(e.intervals.size, 1);
  a.setMuted(true); await settle(); assert.equal(e.intervals.size, 0);
  a.setMuted(false); await settle(); assert.equal(e.intervals.size, 1);
  useWorldStore.setState({ shot: 'camp' }); await settle(); assert.equal(e.intervals.size, 0);
  useWorldStore.setState({ shot: null }); await settle(); assert.equal(e.intervals.size, 1);
  release();
});

test('a late resume cannot resurrect a disposed context or duplicate a newer timer', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.start(); const old = a.ctx;
  useWorldStore.setState({ paused: true }); await settle();
  old.holdResume = true;
  useWorldStore.setState({ paused: false }); assert.equal(a.snapshot().transitioning, true);
  useWorldStore.setState({ paused: true }); a.dispose();
  useWorldStore.setState({ paused: false }); a.start(); const current = a.ctx;
  old.finishResume(); await settle();
  assert.notEqual(current, old); assert.equal(e.intervals.size, 1); assert.equal(a.ctx, current);
  assert.equal(e.subscriptions, 1); assert.equal(current.resumes, 0);
  release();
});

test('pause wins over an in-flight resume; failed autoplay waits for a new gesture', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.start(); const ctx = a.ctx;
  useWorldStore.setState({ paused: true }); await settle();
  ctx.holdResume = true;
  useWorldStore.setState({ paused: false }); useWorldStore.setState({ paused: true });
  ctx.finishResume(); await settle(); assert.equal(ctx.state, 'suspended'); assert.equal(e.intervals.size, 0);
  ctx.holdResume = false; ctx.rejectResume = true;
  useWorldStore.setState({ paused: false }); await settle();
  const attempts = ctx.resumes; await settle();
  assert.equal(ctx.resumes, attempts); assert.equal(e.intervals.size, 0);
  ctx.rejectResume = false; a.start(); await settle(); assert.equal(e.intervals.size, 1);
  release();
});

test('cached pagehide suspends and pageshow restores; normal departure disposes', async t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.start(); const ctx = a.ctx;
  e.page('pagehide'); await settle(); assert.equal(e.intervals.size, 0); assert.equal(ctx.state, 'suspended');
  e.page('pageshow'); await settle(); assert.equal(e.intervals.size, 1); assert.equal(a.ctx, ctx);
  e.page('pagehide', false); await settle();
  assert.equal(a.ctx, null); assert.equal(ctx.state, 'closed'); assert.equal(e.subscriptions, 0); assert.equal(e.win.count + e.doc.count, 0);
  release(); const releaseAgain = a.retain(); a.start();
  assert.notEqual(a.ctx, ctx); assert.equal(e.intervals.size, 1); releaseAgain();
});

test('ended voices disconnect and a long scheduler gap never synthesizes a backlog', t => {
  const e = env(t), a = e.audio(), release = a.retain(); a.start(); const ctx = a.ctx;
  e.tick(); assert.ok(ctx.sources.length > 0);
  ctx.sources.forEach(s => s.end()); assert.equal(a.snapshot().voices, 0);
  const before = ctx.sources.length; ctx.currentTime += 1000; e.tick();
  assert.ok(ctx.sources.length - before < 20, 'one current step rather than thousands of overdue beats');
  release();
});

const pad = () => ({ connected: true, axes: [0, 0, 0, 0], buttons: [{ pressed: false }] });
test('UI consumers share one RAF and no controller means no recurring task', t => {
  const e = env(t); let calls = 0; const consume = () => calls++;
  const first = e.watch(consume), second = e.watch(consume);
  assert.equal(e.frames.size, 0); assert.equal(uiGamepadTasks().consumers, 2);
  e.pads([pad()]); e.win.dispatchEvent(new Event('gamepadconnected'));
  assert.equal(e.frames.size, 1); const reads = e.reads; e.frame();
  assert.equal(e.reads - reads, 1); assert.equal(calls, 2); assert.equal(e.frames.size, 1);
  first(); first(); assert.equal(uiGamepadTasks().consumers, 1); assert.equal(e.frames.size, 1);
  second(); assert.equal(e.frames.size, 0); assert.equal(e.win.count + e.doc.count, 0);
});

test('hidden pages and pagehide stop UI sampling; returning restarts only one frame', t => {
  const e = env(t); e.pads([pad()]); const stop = e.watch(() => {});
  assert.equal(e.frames.size, 1); e.hidden(true); assert.equal(e.frames.size, 0);
  const before = e.reads; e.frame(); assert.equal(e.reads, before);
  e.hidden(false); assert.equal(e.frames.size, 1);
  e.page('pagehide'); assert.equal(e.frames.size, 0);
  e.page('pageshow'); e.page('pageshow'); assert.equal(e.frames.size, 1);
  stop(); assert.equal(e.frames.size, 0);
});

test('disconnect and consumer completion cancel the last UI frame', t => {
  const e = env(t), g = pad(); e.pads([g]);
  const stop = e.watch(() => {}); assert.equal(e.frames.size, 1);
  g.connected = false; e.win.dispatchEvent(new Event('gamepaddisconnected')); assert.equal(e.frames.size, 0);
  stop(); g.connected = true;
  let complete; complete = e.watch(() => complete()); e.frame();
  assert.equal(uiGamepadTasks().consumers, 0); assert.equal(e.frames.size, 0); assert.equal(e.win.count + e.doc.count, 0);
});

test('blocked gamepad access stays idle; five subscription cycles leave no listeners', t => {
  const e = env(t); e.denied(true); const stop = e.watch(() => {});
  assert.equal(e.frames.size, 0); e.denied(false); e.pads([pad()]);
  e.win.dispatchEvent(new Event('gamepadconnected')); assert.equal(e.frames.size, 1); stop();
  for (let i = 0; i < 5; i++) { const end = e.watch(() => {}); e.frame(); end(); }
  assert.equal(e.frames.size, 0); assert.equal(e.win.count + e.doc.count, 0);
});
