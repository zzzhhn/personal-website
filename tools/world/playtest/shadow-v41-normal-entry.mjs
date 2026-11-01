/** Normal-entry (no query params, no debug API) combined clip for shadows v4.1 (spec v3 14.4): night via the
 * settings dialog, walk around the campfire with real WASD (dynamic fire shadow), orbit by mouse drag, wheel
 * out to the 30 m camera and back. Canvas-only 1080p webm + report with entry URL and source hashes.
 * Usage: node shadow-v41-normal-entry.mjs [BASE] [OUTDIR] */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { loadPlaywright, CHROME, startCanvasRecording, stopCanvasRecording } from './lib.mjs';
const base = process.argv[2] || 'http://127.0.0.1:4322';
const out = process.argv[3] || 'docs/world/quality-v3/shadows-v4/v41/normal-entry';
await mkdir(out, { recursive: true });
const files = ['WorldShadows.ts', 'WorldLights.ts', 'WorldOcclusion.ts', 'WorldQuality.ts', 'WorldEnvironment.tsx'];
const hashes = {}; for (const f of files) hashes[f] = createHash('sha256').update(await readFile(path.join('src/components/world', f))).digest('hex');
const report = { base, startedAt: new Date().toISOString(), gitHead: execSync('git rev-parse HEAD').toString().trim(), sourceSha256: hashes, steps: [], errors: [] };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket('**/*', ws => ws.close());
page.on('pageerror', e => report.errors.push(e.message));
try {
  await page.goto(base + '/world/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('canvas'), undefined, { timeout: 90000 });
  await page.waitForTimeout(2500);
  report.entryUrl = page.url(); report.debugApiPresent = await page.evaluate(() => '__worldDebug' in window);
  const box = await page.locator('canvas').first().boundingBox(); const CX = box.x + box.width / 2, CY = box.y + box.height / 2;
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.getByRole('button', { name: /^Night$/ }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(2500);
  await startCanvasRecording(page, 30); const t0 = Date.now();
  const step = (s) => report.steps.push({ t: (Date.now() - t0) / 1000, s });
  // around the fire: the camera-relative keys trace a loop (W, D, S, A legs), 4 x 1.1 s
  step('walk loop around the fire (W, D, S, A)');
  for (const k of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) { await page.keyboard.down(k); await page.waitForTimeout(1100); await page.keyboard.up(k); }
  step('orbit 360 deg by mouse drag');
  await page.mouse.move(CX, CY); await page.mouse.down(); for (let i = 1; i <= 60; i++) { await page.mouse.move(CX + i * 19, CY); await page.waitForTimeout(25); } await page.mouse.up();
  step('wheel out to 30 m');
  await page.mouse.move(CX, CY); for (let i = 0; i < 22; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  step('orbit at 30 m'); await page.mouse.down(); for (let i = 1; i <= 30; i++) { await page.mouse.move(CX + i * 20, CY); await page.waitForTimeout(25); } await page.mouse.up();
  step('wheel back in'); for (let i = 0; i < 22; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  await stopCanvasRecording(page, path.join(out, 'fire-orbit-zoom.webm'));
  report.clipSeconds = (Date.now() - t0) / 1000;
  await page.screenshot({ path: path.join(out, 'end.png') });
} catch (e) { report.errors.push(String(e.stack || e)); }
report.finishedAt = new Date().toISOString();
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ entryUrl: report.entryUrl, debugApiPresent: report.debugApiPresent, clipSeconds: report.clipSeconds, errors: report.errors.slice(0, 3) }));
await browser.close();
