/** Build a local-only, no-WebGL fixture from the real service modules. Never part of the Astro entry. */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = path.join(root, 'dist/_qa/resource-lifecycle');
await mkdir(out, { recursive: true });
await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
import { ParkAudio } from './src/components/world/WorldParkAudio';
import { useWorldStore as store } from './src/components/world/store';
import { watchUiGamepads, uiGamepadTasks } from './src/components/world/WorldUiGamepad';
const rows = [], output = document.querySelector('#results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = (name, value) => { rows.push({ name, ...value }); output.textContent = JSON.stringify(rows, null, 2); };
const ensure = (value, message) => { if (!value) throw new Error(message); };
const realSubscribe = store.subscribe;
let subscriptions = 0;
store.subscribe = listener => { subscriptions++; const stop = realSubscribe(listener); let active = true;
  return () => { if (active) { active = false; subscriptions--; stop(); } }; };
const prototype = EventTarget.prototype, add = prototype.addEventListener, remove = prototype.removeEventListener;
const tracked = new Map();
// Count service-owned lifecycle event types, excluding browser automation's pointer listeners.
const lifecycleTypes = new Set(['visibilitychange', 'pagehide', 'pageshow', 'statechange', 'gamepadconnected', 'gamepaddisconnected']);
const relevant = (target, type) => lifecycleTypes.has(type) && (target === window || target === document || target instanceof AudioContext);
prototype.addEventListener = function(type, fn, options) { if (relevant(this, type)) {
  if (!tracked.has(this)) tracked.set(this, new Map()); const types = tracked.get(this);
  if (!types.has(type)) types.set(type, new Set()); types.get(type).add(fn);
} return add.call(this, type, fn, options); };
prototype.removeEventListener = function(type, fn, options) { if (relevant(this, type)) {
  const types = tracked.get(this); types?.get(type)?.delete(fn);
  if (types?.get(type)?.size === 0) types.delete(type); if (types?.size === 0) tracked.delete(this);
} return remove.call(this, type, fn, options); };
const listenerCount = () => [...tracked.values()].reduce((n, types) => n + [...types.values()].reduce((m, listeners) => m + listeners.size, 0), 0);
document.querySelector('#run').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true; rows.length = 0;
  const padDescriptor = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  let audio, release, stop, stopFirst;
  try {
    ensure(!document.hidden, 'Bring this fixture tab to the foreground before running.');
    store.setState({ paused: false, shot: null });
    audio = new ParkAudio(); release = audio.retain(); audio.start(); await wait(200);
    ensure(audio.ctx?.state === 'running' && audio.snapshot().timer, 'Real AudioContext did not start.');
    const analyser = audio.ctx.createAnalyser(), master = audio.master;
    analyser.fftSize = 1024; master.connect(analyser); await wait(200);
    const signal = new Float32Array(1024); analyser.getFloatTimeDomainData(signal);
    const rms = Math.sqrt(signal.reduce((n, value) => n + value * value, 0) / signal.length);
    master.disconnect(analyser); analyser.disconnect(); ensure(rms > 0, 'No generated signal.');
    record('running', { audio: audio.snapshot(), rms });
    store.setState({ paused: true }); await wait(100);
    const before = { at: performance.now(), ticks: audio.snapshot().ticks, time: audio.ctx.currentTime };
    await wait(2000);
    const paused = { ms: performance.now() - before.at, ticks: audio.snapshot().ticks - before.ticks,
      audioTime: audio.ctx.currentTime - before.time, timer: audio.snapshot().timer, state: audio.ctx.state };
    ensure(paused.ticks === 0 && paused.audioTime === 0 && !paused.timer, 'Paused audio kept working.'); record('paused', paused);
    store.setState({ paused: false }); await wait(150); ensure(audio.snapshot().timer, 'Resume failed.');
    audio.setMuted(true); await wait(100); ensure(!audio.snapshot().timer && audio.ctx.state === 'suspended', 'Mute kept audio running.');
    audio.setMuted(false); await wait(150); ensure(audio.snapshot().timer, 'Unmute failed.'); record('resumed', { audio: audio.snapshot() });
    const first = audio.ctx; release(); await wait(80); ensure(first.state === 'closed', 'Owner did not close context.');
    record('first-release', { subscriptions, listeners: listenerCount(), remaining: [...tracked].map(([target, types]) => ({ target: target === window ? 'window' : target === document ? 'document' : 'AudioContext', types: [...types].map(([type, listeners]) => [type, listeners.size]) })) });
    ensure(subscriptions === 0 && listenerCount() === 0, 'Audio owner retained subscriptions/listeners.');
    let closed = 1;
    for (let i = 1; i < 5; i++) {
      release = audio.retain(); audio.start(); await wait(120); const ctx = audio.ctx;
      ensure(ctx?.state === 'running', 'Restart failed.'); release(); await wait(50);
      if (ctx.state === 'closed') closed++;
      ensure(!audio.snapshot().timer && !audio.snapshot().voices && !subscriptions && !listenerCount(), 'Cycle retained resources.');
    }
    record('five-owner-cycles', { closed, audio: audio.snapshot(), subscriptions, listeners: listenerCount() });
    let pads = []; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    const consume = () => {}; stopFirst = watchUiGamepads(consume); stop = watchUiGamepads(consume);
    ensure(!uiGamepadTasks().framePending, 'No controller still scheduled UI frames.'); record('ui-no-pad', { ui: uiGamepadTasks() });
    pads = [{ connected: true, axes: [0,0,0,0], buttons: [] }]; window.dispatchEvent(new Event('gamepadconnected'));
    await wait(100); ensure(uiGamepadTasks().consumers === 2 && uiGamepadTasks().framePending, 'Shared UI sampling did not start.');
    record('ui-simulated-pad', { ui: uiGamepadTasks() });
    stopFirst(); stop(); ensure(!uiGamepadTasks().framePending && listenerCount() === 0, 'Last consumer left a task.');
    record('ui-released', { ui: uiGamepadTasks(), listeners: listenerCount() });
    record('complete', { ok: true, hidden: document.hidden });
  } catch (error) { record('failure', { message: String(error) }); }
  finally { stopFirst?.(); stop?.(); release?.(); audio?.dispose();
    if (padDescriptor) Object.defineProperty(navigator, 'getGamepads', padDescriptor); else delete navigator.getGamepads;
    button.disabled = false;
  }
});
` }, bundle: true, platform: 'browser', format: 'esm', outfile: path.join(out, 'probe.js'),
  define: { 'import.meta.hot': 'undefined' }, logLevel: 'silent' });
await writeFile(path.join(out, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Audio/UI lifecycle fixture</title>
<style>body{max-width:960px;margin:32px auto;padding:0 24px;background:#f5f5f5;color:#18252d;font:16px/1.5 system-ui}button{padding:12px 18px;font:inherit}pre{white-space:pre-wrap;background:white;padding:20px;border:1px solid #ccc}</style>
<h1>Audio/UI lifecycle fixture</h1><p>Local technical test using the real source modules. No 3D scene. Gamepad input below is simulated.</p>
<button id="run">Run bounded lifecycle test</button><pre id="results">Ready. Bring this tab to the foreground, then run.</pre><script type="module" src="./probe.js"></script></html>`);
console.log('Local fixture: http://127.0.0.1:4345/_qa/resource-lifecycle/');
