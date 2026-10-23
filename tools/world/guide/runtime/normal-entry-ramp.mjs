/**
 * G24 slope evidence, normal entry (spec v3 10.1 "near zoom, normal speed, one uphill and one downhill pass").
 * No query string, so no QA/debug API: every input is a real key (WASD) and the only feedback is the HUD
 * minimap player dot (like tools/world/playtest/normal-entry-desk.mjs). No teleport, no fixtures.
 * Route: spawn -> road ramp upper approach [-17, 34] (not recorded), then a recorded run down the ramp to
 * [-6, 29.4] and back up to [-17, 34] (same waypoints as the main-thread gaps.mjs slope case).
 * Usage: node tools/world/guide/runtime/normal-entry-ramp.mjs [BASE] [OUTDIR]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadPlaywright, CHROME, comboFor, startCanvasRecording, stopCanvasRecording } from '../../playtest/lib.mjs';
const base = process.argv[2] || 'http://127.0.0.1:4322';
const out = process.argv[3] || 'docs/world/quality-v3/guide/runtime/ramp-v3c';
await mkdir(out, { recursive: true });
const sha = execSync('shasum -a 256 public/assets/world/guide/G24.glb').toString().split(' ')[0];
const report = { base, glbSha256: sha, startedAt: new Date().toISOString(), entryUrl: null, steps: [], clips: [], errors: [], limits: [
  'HUD minimap position is published ~11 Hz and rounded by the SVG; it steers the bot, it is not a measurement.',
  'Headless Chrome (Metal ANGLE) on M5 Pro, not M1.', 'Clip is canvas-only (HUD not included).',
  'One ramp (~15 deg, the road ramp); the 10/20/25 deg matrix of spec 10.1 needs slope fixtures that do not exist in the normal map.'] };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.routeWebSocket('**/*', ws => ws.close());
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[vite]') && !m.text().startsWith('Failed to load resource')) report.errors.push(m.text()); });
const held = new Set();
async function hold(keys) { const n = new Set(keys); for (const k of [...held]) if (!n.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of n) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
const hud = () => page.evaluate(() => { const d = document.querySelector('aside.world-location svg circle[r="2.6"]'); return d ? [+d.getAttribute('cx'), +d.getAttribute('cy')] : null; });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
async function walk(points, { arrive = .6, timeout = 15, track = null, t0 = Date.now() } = {}) {
  const legs = [];
  for (const target of points) {
    const s0 = Date.now(); let p = await hud();
    while (Date.now() - s0 < timeout * 1000) { p = await hud(); if (!p) break; if (track) track.push({ t: (Date.now() - t0) / 1000, p });
      const dx = target[0] - p[0], dz = target[1] - p[1]; if (Math.hypot(dx, dz) < arrive) break; await hold(comboFor(dx, dz).keys); await page.waitForTimeout(40); }
    legs.push({ target, reached: !!p && dist(p, target) < arrive + .6, at: p, seconds: (Date.now() - s0) / 1000 });
  }
  await hold([]); return legs;
}
try {
  await page.goto(base + '/world/', { waitUntil: 'networkidle', timeout: 90000 });
  report.entryUrl = page.url();
  report.debugApiPresent = await page.evaluate(() => '__worldDebug' in window);
  await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('aside.world-location svg circle[r="2.6"]'), undefined, { timeout: 90000 });
  await page.waitForTimeout(1500);
  report.spawn = await hud();
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120); await page.waitForTimeout(1200);
  report.zoom = 'nearest (one real wheel step up from the default)';
  // approach along the camp road (same corridor normal-entry-desk.mjs walks to the car bay)
  report.steps.push({ approach: await walk([[-42.5, 38.6], [-33, 38.6], [-27, 37], [-21, 35], [-17, 34]], { timeout: 12 }) });
  await page.waitForTimeout(800);
  const file = path.join(out, 'normal-near-ramp-down-up.webm'), track = [];
  await startCanvasRecording(page, 30); const t0 = Date.now();
  const down = await walk([[-14, 32.46], [-10, 30.92], [-6, 29.38]], { arrive: .4, track, t0 });
  await page.waitForTimeout(500);
  const up = await walk([[-10, 30.92], [-14, 32.46], [-17, 34]], { arrive: .4, track, t0 });
  await page.waitForTimeout(500);
  await stopCanvasRecording(page, file);
  report.clips.push({ name: 'ramp-down-up', file, seconds: (Date.now() - t0) / 1000, down, up, track });
  await page.screenshot({ path: path.join(out, 'normal-near-ramp-end.png') });
} catch (e) { report.errors.push(e.stack || String(e)); await page.screenshot({ path: path.join(out, 'normal-ramp-failure.png') }).catch(() => {}); }
finally {
  await hold([]).catch(() => {}); report.finishedAt = new Date().toISOString();
  report.summary = { entryUrl: report.entryUrl, debugApiPresent: report.debugApiPresent, clips: report.clips.map(c => ({ name: c.name, seconds: +c.seconds.toFixed(2),
    downReached: c.down.every(l => l.reached), upReached: c.up.every(l => l.reached) })), approach: report.steps[0]?.approach?.map(l => l.reached), errors: report.errors };
  await writeFile(path.join(out, 'normal-entry-ramp.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 1)); await browser.close();
  if (report.errors.length || !report.clips.length) process.exitCode = 1;
}
