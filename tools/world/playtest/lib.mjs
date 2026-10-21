/**
 * Feedback-driven keyboard bot for /world (no RL, no training).
 * Walking uses only real input (page.keyboard WASD/Shift/Space/E/R, mouse wheel) and reads
 * feedback every tick from the same-origin QA API (window.__worldDebug, ?qa=1).
 * walk() never calls teleport/drive. Fixtures must use fixtureTeleport(), which is logged so
 * reports can exclude it from walking evidence.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
export const MODULES = process.env.WORLD_BROWSER_MODULES || process.cwd();
export const CHROME = process.env.WORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const loadPlaywright = () => require(require.resolve('playwright', { paths: [MODULES] }));

// WorldActors (c507506): vx=(.8x-.6z)/|.|, vz=(-.6x-.8z)/|.|, x=D-A, z=W-S (camera ground axes)
const COMBOS = [];
for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (!x && !z) continue;
  const m = Math.hypot(x, z);
  COMBOS.push({ keys: [z > 0 ? 'KeyW' : z < 0 ? 'KeyS' : null, x > 0 ? 'KeyD' : x < 0 ? 'KeyA' : null].filter(Boolean),
    dir: [(0.8 * x - 0.6 * z) / m, (-0.6 * x - 0.8 * z) / m] });
}
export function comboFor(dx, dz) {
  const m = Math.hypot(dx, dz) || 1; let best = COMBOS[0], score = -Infinity;
  for (const c of COMBOS) { const s = (c.dir[0] * dx + c.dir[1] * dz) / m; if (s > score) { score = s; best = c; } }
  return best;
}

export class Bot {
  constructor(page) { this.page = page; this.held = new Set(); this.events = []; this.fixtureCalls = []; this.t0 = Date.now(); }
  now() { return (Date.now() - this.t0) / 1000; }
  feedback() {
    return this.page.evaluate(() => {
      const d = window.__worldDebug, s = d.state(), n = d.snapshot();
      return { player: n.player, grounded: n.grounded, activeVehicle: n.activeVehicle, canRecover: n.canRecover, vehicles: n.vehicles,
        zone: s.zone, zoom: s.zoom, light: s.light, paused: s.paused, nearbyVehicle: s.nearbyVehicle, speed: s.speed, stats: d.stats(),
        extra: { playerVelocity: n.playerVelocity ?? null, contacts: typeof d.contacts === 'function' ? d.contacts() : null } };
    });
  }
  async hold(keys) {
    const next = new Set(keys);
    for (const k of [...this.held]) if (!next.has(k)) { await this.page.keyboard.up(k); this.held.delete(k); }
    for (const k of next) if (!this.held.has(k)) { await this.page.keyboard.down(k); this.held.add(k); }
  }
  release() { return this.hold([]); }
  async press(key) { this.events.push({ t: this.now(), press: key }); await this.page.keyboard.press(key); }
  async wheel(deltaY) {
    const b = await this.page.locator('canvas').first().boundingBox();
    await this.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    this.events.push({ t: this.now(), wheel: deltaY }); await this.page.mouse.wheel(0, deltaY);
  }
  async fixtureTeleport(p, reason) {
    this.fixtureCalls.push({ t: this.now(), to: p, reason });
    const ok = await this.page.evaluate(p => window.__worldDebug.teleportPlayer(p), p);
    await this.page.waitForTimeout(250);
    return ok;
  }
  /**
   * Real-key path following. Stuck = <0.25 m progress toward the waypoint within 0.8 s while
   * keys are held. Recovery: back off, alternate side-step, jump from the 3rd attempt.
   * stopOnBlocked returns at the first block (used by contact probes, which want the block).
   */
  async walk(waypoints, { run = false, arrive = 0.6, timeout = 40, maxRecoveries = 4, stopOnBlocked = false, onTick } = {}) {
    const trace = [], legs = [];
    for (const wp of waypoints) {
      const leg = { target: wp, reached: false, recoveries: 0, blockedAt: null, start: null, end: null, seconds: 0, minDist: Infinity };
      const began = this.now(); let win = [], side = 1;
      while (this.now() - began < timeout) {
        const fb = await this.feedback(); const p = fb.player;
        if (!leg.start) leg.start = p;
        const dx = wp[0] - p[0], dz = wp[1] - p[2], dist = Math.hypot(dx, dz);
        leg.minDist = Math.min(leg.minDist, dist);
        const row = { t: +this.now().toFixed(2), p: p.map(v => +v.toFixed(3)), g: fb.grounded, dist: +dist.toFixed(3), keys: [...this.held] };
        if (fb.extra.contacts) row.contacts = fb.extra.contacts;
        trace.push(row);
        if (onTick) await onTick(fb, row);
        if (dist < arrive) { leg.reached = true; break; }
        win.push({ t: this.now(), dist }); win = win.filter(w => this.now() - w.t <= 0.8);
        if (win.length >= 6 && this.now() - win[0].t >= .65 && win[0].dist - dist < 0.25) {
          leg.recoveries++; if (!leg.blockedAt) leg.blockedAt = { p, dist: +dist.toFixed(3), t: +this.now().toFixed(2) };
          if (stopOnBlocked || leg.recoveries > maxRecoveries) break;
          await this.hold(comboFor(-dx, -dz).keys); await this.page.waitForTimeout(350);
          await this.hold(comboFor(-dz * side, dx * side).keys); await this.page.waitForTimeout(600);
          if (leg.recoveries >= 3) { await this.release(); await this.page.keyboard.press('Space'); await this.page.waitForTimeout(250); }
          side = -side; win = []; continue;
        }
        const c = comboFor(dx, dz);
        await this.hold(run ? [...c.keys, 'ShiftLeft'] : c.keys);
        await this.page.waitForTimeout(90);
      }
      await this.release();
      leg.end = (await this.feedback()).player; leg.seconds = +(this.now() - began).toFixed(2); leg.minDist = +leg.minDist.toFixed(3);
      legs.push(leg);
      if (!leg.reached) break;
    }
    await this.release();
    return { legs, trace, realKeyboardOnly: true };
  }
}

export function canvasFacts(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'); const a = gl.getContextAttributes();
    return { cssSize: [c.clientWidth, c.clientHeight], canvasAttr: [c.width, c.height], drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      viewport: Array.from(gl.getParameter(gl.VIEWPORT)), devicePixelRatio: window.devicePixelRatio,
      effectiveRenderScale: +(gl.drawingBufferWidth / c.clientWidth).toFixed(3), windowInner: [innerWidth, innerHeight],
      antialias: a.antialias, preserveDrawingBuffer: a.preserveDrawingBuffer, maxSamples: gl.getParameter(0x8d57),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
}
export function frameTiming(page, seconds = 5) {
  return page.evaluate(seconds => new Promise(resolve => {
    const d = []; let last = performance.now(); const end = last + seconds * 1000;
    const tick = now => { d.push(now - last); last = now; if (now < end) return requestAnimationFrame(tick);
      const s = [...d].sort((a, b) => a - b), q = p => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
      resolve({ frames: d.length, seconds, fps: +(d.length / seconds).toFixed(1), p50: q(.5), p90: q(.9), p95: q(.95), p99: q(.99), max: +s[s.length - 1].toFixed(2), over33ms: d.filter(x => x > 33.4).length }); };
    requestAnimationFrame(tick);
  }), seconds);
}
/** Real drawing-buffer pixels (needs PRESERVE_BUFFER_INIT; never used for timing runs). */
export async function saveBuffer(page, file) {
  const r = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => { const c = document.querySelector('canvas'); res({ url: c.toDataURL('image/png'), w: c.width, h: c.height }); })));
  await writeFile(file, Buffer.from(r.url.split(',')[1], 'base64'));
  return { file, width: r.w, height: r.h };
}
export const PRESERVE_BUFFER_INIT = `(() => { const o = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, a) { if (/webgl/.test(t)) a = Object.assign({}, a, { preserveDrawingBuffer: true }); return o.call(this, t, a); }; })();`;

export async function openWorld(browser, url, { width = 1440, height = 900, dpr = 1, preserve = false, videoDir = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr,
    ...(videoDir ? { recordVideo: { dir: videoDir, size: { width: 1280, height: Math.round(1280 * height / width) } } } : {}) });
  if (preserve) await context.addInitScript(PRESERVE_BUFFER_INIT);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().player, undefined, { timeout: 90000 });
  const assetsLoaded = await page.waitForFunction(() => !window.__worldDebug.sceneObjects().some(n => n.startsWith('camp-loading-')), undefined, { timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(800);
  return { context, page, errors, readyMs: Date.now() - t0, assetsLoaded };
}
export const ensureDir = async d => { await mkdir(d, { recursive: true }); return d; };

/** Canvas-only recording via in-page MediaRecorder (no Playwright ffmpeg dependency). */
export async function startCanvasRecording(page, fps = 30) {
  return await page.evaluate(fps => {
    const c = document.querySelector('canvas'); const stream = c.captureStream(fps);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 }); const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(500);
    window.__pt_rec = { rec, chunks, mime };
    return Date.now();
  }, fps);
}
export async function stopCanvasRecording(page, file) {
  const b64 = await page.evaluate(() => new Promise(resolve => { const r = window.__pt_rec; r.rec.onstop = async () => {
    const blob = new Blob(r.chunks, { type: r.mime }); const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); resolve(btoa(s)); }; r.rec.stop(); }));
  await writeFile(file, Buffer.from(b64, 'base64'));
  return file;
}
