/** Environment evidence (quality-v3 §2/§3).
 * 1. Normal entry (/world, no query, no QA API): 2 s canvas video + sea pixel-difference metric.
 * 2. QA entry (?qa=1), observation only: fixed shots and player-camera coast views. Player
 *    placement uses fixture teleports whose y comes from the new terrain (tools/world/environment
 *    /fixtures.json, generated from WorldLandform.meshHeight); old fixed-y fixtures are invalid.
 * Usage: WORLD_BASE_URL=http://127.0.0.1:4322 WORLD_ENV_OUT=dir node tools/world/environment/capture.mjs */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { comboFor, loadPlaywright, CHROME, openWorld, ensureDir, frameTiming, startCanvasRecording, stopCanvasRecording } from '../playtest/lib.mjs';

const out = await ensureDir(process.env.WORLD_ENV_OUT || 'docs/world/quality-v3/environment/candidate');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const fixtures = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { startedAt: new Date().toISOString(), base, normalEntry: {}, fixtures: [], shots: [], timing: {}, errors: [] };

/** Mean |diff| and share of pixels changing > 8/255 between two canvas frames 0.5 s apart,
 * restricted to sea pixels (teal-dominant: b > r + 12 and g > r + 8). */
const seaDiff = page => page.evaluate(() => new Promise(resolve => {
  const c = document.querySelector('canvas'), w = 480, h = Math.round(480 * c.height / c.width);
  const grab = () => { const o = new OffscreenCanvas(w, h), x = o.getContext('2d'); x.drawImage(c, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
  requestAnimationFrame(() => { const a = grab(); setTimeout(() => requestAnimationFrame(() => {
    const b = grab(); let n = 0, sum = 0, changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const sea = a[i + 2] > a[i] + 12 && a[i + 1] > a[i] + 8 && b[i + 2] > b[i] + 12;
      if (!sea) continue;
      const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
      n++; sum += d; if (d > 8) changed++;
    }
    resolve({ seaPixels: n, meanDiff: n ? +(sum / n).toFixed(2) : 0, changedOver8: n ? +(changed / n).toFixed(3) : 0 });
  }), 500); });
}));

try {
  // ---- normal entry: no query parameters, no QA API calls.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(`(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { if (/webgl/.test(t)) a = Object.assign({}, a, { preserveDrawingBuffer: true }); return o.call(this, t, a); }; })();`);
    const page = await context.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + '/world', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForFunction(() => !!document.querySelector('canvas'), undefined, { timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(out, 'normal-entry-default.png') });
    const spawnSamples = [await seaDiff(page)];
    // The spawn view is mostly camp; walk with real keys (no QA API) to the south-west
    // plateau edge where the sea fills part of the default follow frame.
    const combo = comboFor(-1, .55);
    for (const k of combo.keys) await page.keyboard.down(k);
    await page.waitForTimeout(Number(process.env.WORLD_ENV_WALK_MS || 7000));
    for (const k of combo.keys) await page.keyboard.up(k);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'normal-entry-edge.png') });
    await startCanvasRecording(page, 30); await page.waitForTimeout(2000);
    await stopCanvasRecording(page, path.join(out, 'normal-entry-edge-2s.webm'));
    const samples = [];
    for (let k = 0; k < 3; k++) samples.push(await seaDiff(page));
    report.normalEntry = { url: base + '/world', input: { keys: combo.keys, ms: Number(process.env.WORLD_ENV_WALK_MS || 7000) }, spawnSamples, samples, errors: errs,
      pass: samples.every(s => s.seaPixels > 5000 && s.meanDiff >= 3 && s.changedOver8 >= .1),
      threshold: 'sea pixels > 5000 (of 480 px wide frame), mean >= 3/255 and >= 10% of sea pixels > 8/255 over 0.5 s' };
    await context.close();
  }
  // ---- QA entry: observation shots.
  const { page, errors, readyMs } = await openWorld(browser, base + '/world?qa=1', { width: 1440, height: 900 });
  report.readyMs = readyMs;
  const settle = ms => page.waitForTimeout(ms);
  const snap = async (name, note) => { await page.screenshot({ path: path.join(out, name + '.png') }); report.shots.push({ name, note }); };
  for (const light of ['dusk', 'night']) {
    await page.evaluate(l => __worldDebug.set({ light: l }), light); await settle(2400);
    for (const shot of ['overview', 'camp', 'bridge']) {
      await page.evaluate(s => __worldDebug.set({ shot: s }), shot); await settle(900);
      await snap(`shot-${shot}-${light}`, 'fixed QA camera (wind clock paused in shot mode)');
    }
    await page.evaluate(() => __worldDebug.set({ shot: null })); await settle(300);
    for (const f of fixtures.views) {
      const p = [f.x, f.ground + 0.88 + 0.05, f.z];
      await page.evaluate(q => __worldDebug.teleportPlayer(q), p);
      await page.evaluate(z => __worldDebug.set({ zoom: z }), f.zoom ?? 1); await settle(1600);
      const snapAfter = await page.evaluate(() => ({ player: __worldDebug.snapshot().player, grounded: __worldDebug.snapshot().grounded }));
      report.fixtures.push({ name: f.name, light, teleport: p, terrainGround: f.ground, after: snapAfter });
      await snap(`${f.name}-${light}`, 'player camera after fixture teleport onto terrain height');
    }
  }
  await page.evaluate(() => __worldDebug.set({ light: 'dusk' })); await settle(2400);
  const west = fixtures.views[0];
  await page.evaluate(q => __worldDebug.teleportPlayer(q), [west.x, west.ground + .93, west.z]); await settle(1500);
  report.timing.coastWest = await frameTiming(page, 5);
  report.stats = await page.evaluate(() => __worldDebug.stats());
  report.errors.push(...errors);
} catch (e) { report.errors.push(e.stack || String(e)); }
await writeFile(path.join(out, 'capture.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ out, normalEntry: report.normalEntry, shots: report.shots.length, timing: report.timing, fixtures: report.fixtures.map(f => [f.name, f.light, f.after?.grounded, f.after?.player?.[1]?.toFixed?.(2), f.terrainGround.toFixed(2)]), errors: report.errors.slice(0, 5) }, null, 1));
