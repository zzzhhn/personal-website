/** Shadows v4 probe (QA page, ?qa=1). Reads only: shadow telemetry, camera rig, player snapshot.
 * Inputs are real wheel zoom and mouse-drag orbit. No teleport.
 * Usage: node shadow-v4-probe.mjs <label> [BASE] [OUTDIR]
 * Writes <OUTDIR>/<label>/*.png (1080p drawing buffer) + telemetry.json. Same camera recipe before/after. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME, openWorld, saveBuffer } from './lib.mjs';
const label = process.argv[2] || 'run';
const base = process.argv[3] || 'http://127.0.0.1:4322';
const out = path.join(process.argv[4] || 'docs/world/quality-v3/shadows-v4', label);
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { label, base, startedAt: new Date().toISOString(), shots: [], errors: [] };
try {
  const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: 1920, height: 1080, preserve: true });
  await page.routeWebSocket('**/*', ws => ws.close());
  report.errors = errors;
  const canvas = await page.locator('canvas').first().boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx, cy);
  if (process.env.QUALITY === 'balanced') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.getByRole('button', { name: /^Balanced$/ }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }
  const info = () => page.evaluate(() => { const d = window.__worldDebug; return { shadow: d.shadowInfo?.() ?? null, camera: d.camera(), player: d.snapshot().player, render: d.renderInfo() }; });
  async function zoomTo(target) {
    for (let i = 0; i < 60; i++) { const c = (await info()).camera; if (Math.abs(c.distance - target) / target < .04) break; await page.mouse.wheel(0, c.distance > target ? -100 : 100); await page.waitForTimeout(30); }
    await page.waitForTimeout(1000);
  }
  async function orbit(dx, dy = 0) { await page.mouse.move(cx, cy); await page.mouse.down(); const n = 12; for (let i = 1; i <= n; i++) await page.mouse.move(cx + dx * i / n, cy + dy * i / n); await page.mouse.up(); await page.waitForTimeout(900); }
  // Screen coverage per cascade (v4.1 fixed windows): 64 x 36 grid of ground hits at the focus height, classified
  // by the snapped light-space windows in telemetry (full weight inside 88 %, blend band to the edge).
  const SUN = [-90, 40, 65], n = Math.hypot(...SUN), Z = SUN.map(v => v / n);
  const R = (() => { const r = [Z[2], 0, -Z[0]]; const m = Math.hypot(...r); return r.map(v => v / m); })();
  const U = [Z[1] * R[2] - Z[2] * R[1], Z[2] * R[0] - Z[0] * R[2], Z[0] * R[1] - Z[1] * R[0]];
  async function coverage(i) {
    const c = i.shadow?.cascades; if (!c || !c[0].centre_ru) return null;
    const pts = await page.evaluate(([w, h, y]) => { const q = window.__worldDebug.shadowQa, out = []; for (let gy = 0; gy < 36; gy++) for (let gx = 0; gx < 64; gx++) out.push(q.groundHit((gx + .5) * w / 64, (gy + .5) * h / 36, w, h, y)); return out; }, [1920, 1080, i.player[1] - .82]);
    const tally = { c0: 0, c1: 0, c2: 0, fade2: 0, none: 0, sky: 0 }; let nearestNone = Infinity, nearestFade = Infinity;
    for (const p of pts) {
      if (!p) { tally.sky++; continue; }
      const r = p[0] * R[0] + p[1] * R[1] + p[2] * R[2], u = p[0] * U[0] + p[1] * U[1] + p[2] * U[2];
      const inside = (k, f) => Math.abs(r - c[k].centre_ru[0]) < c[k].halfExtent_m[0] * f && Math.abs(u - c[k].centre_ru[1]) < c[k].halfExtent_m[1] * f;
      const dist = Math.hypot(p[0] - i.camera.position[0], p[2] - i.camera.position[2]);
      if (inside(0, .94)) tally.c0++; else if (inside(1, .94)) tally.c1++; else if (inside(2, .92)) tally.c2++; else if (inside(2, 1)) { tally.fade2++; nearestFade = Math.min(nearestFade, dist); } else { tally.none++; nearestNone = Math.min(nearestNone, dist); }
    }
    const g = pts.length - tally.sky; return { ...Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, k === 'sky' ? +(v / pts.length).toFixed(3) : +(v / Math.max(1, g)).toFixed(3)])), nearestUnshadowedGround_m: Number.isFinite(nearestNone) ? +nearestNone.toFixed(1) : null, nearestFadeBand_m: Number.isFinite(nearestFade) ? +nearestFade.toFixed(1) : null };
  }
  async function shot(name) { const i = await info(); const f = await saveBuffer(page, path.join(out, name + '.png')); report.shots.push({ name, ...i, coverage: await coverage(i), file: f.file, size: [f.width, f.height] }); }
  await zoomTo(4.5); await shot('near-4p5m-default');
  await zoomTo(2.5); await shot('near-2p5m-default');
  await orbit(500); await shot('near-2p5m-orbit-a');
  await orbit(500); await shot('near-2p5m-orbit-b');
  await orbit(0, 250); await shot('near-2p5m-orbit-b-high');
  await zoomTo(10); await shot('mid-10m');
  await zoomTo(30); await shot('far-30m');
  await orbit(0, -200); await shot('far-30m-low');
  await zoomTo(10); await shot('mid-10m-low');
  report.finalErrors = errors.filter(e => !/\[vite\]|api\/events/.test(e));
} catch (e) { report.errors.push(String(e.stack || e)); }
report.finishedAt = new Date().toISOString();
await writeFile(path.join(out, 'telemetry.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.shots.map(s => ({ n: s.name, cam: +(s.camera?.distance ?? 0).toFixed(2), pitch: +(s.camera?.pitch ?? 0).toFixed(2), cascades: (s.shadow?.cascades ?? []).map(c => [c.halfExtent_m, +(c.groundTexel_m.acrossSun * 100).toFixed(2), +(c.groundTexel_m.alongSun * 100).toFixed(2)]), coverage: s.coverage })), null, 0), report.errors.slice(0, 5));
await browser.close();
