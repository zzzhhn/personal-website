/** No-query ordinary entry: walk from spawn to the meadow and southern shore using real keys.
 * Position feedback is the visible minimap anchor only; no world/debug calls, no teleports. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { CHROME, loadPlaywright, ensureDir, comboFor } from '../playtest/lib.mjs';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const report = { url: null, debugPresent: null, steps: [], screenshots: [], errors: [], telemetryErrors: [] };
page.on('response', r => { if (r.status() >= 400) (new URL(r.url()).pathname === '/api/events' ? report.telemetryErrors : report.errors).push('HTTP '+r.status()+' '+r.url()); });
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[vite]') && !m.text().startsWith('Failed to load resource')) report.errors.push(m.text().slice(0, 800)); });
const keys = new Set();
const hud = () => page.evaluate(() => { const p = document.querySelector('aside.world-location svg circle[r="2.6"]'); return p ? [+p.getAttribute('cx'), +p.getAttribute('cy')] : null; });
async function hold(list) { for (const k of keys) if (!list.includes(k)) { await page.keyboard.up(k); keys.delete(k); } for (const k of list) if (!keys.has(k)) { await page.keyboard.down(k); keys.add(k); } }
async function snap(name) { await hold([]); await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 91 }); report.screenshots.push({ name, at: await hud(), url: page.url() }); }
async function walk(target) {
  const t0 = Date.now(), trace = []; let lastProgress = t0, best = 1e3;
  while (Date.now() - t0 < 20000) {
    const p = await hud(); if (!p) throw new Error('minimap anchor missing');
    const dx = target[0] - p[0], dz = target[1] - p[1], d = Math.hypot(dx, dz);
    trace.push(p); if (d < .9) break;
    if (d < best - .2) { best = d; lastProgress = Date.now(); }
    await hold(comboFor(dx, dz).keys);
    if (Date.now() - lastProgress > 1800) { await page.keyboard.press('Space'); lastProgress = Date.now(); }
    await page.waitForTimeout(80);
  }
  await hold([]); const p = await hud(), reached = Math.hypot(p[0] - target[0], p[1] - target[1]) < 1.3;
  report.steps.push({ target, reached, at: p, seconds: +((Date.now() - t0) / 1000).toFixed(2), trace });
  if (!reached) throw new Error('blocked at ' + p + ' toward ' + target);
}
async function light(label) { await page.keyboard.press('Escape'); await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('button', { name: 'Back to the island', exact: true }).click(); await page.waitForTimeout(2300); }
try {
  await page.goto(process.env.WORLD_BASE_URL + '/world/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('aside.world-location svg circle[r="2.6"]'), undefined, { timeout: 90000 });
  await page.waitForTimeout(3000);
  report.url = page.url(); report.debugPresent = await page.evaluate(() => '__worldDebug' in window);
  await snap('00-spawn-dusk');
  for (const p of [[-42, 42], [-42, 48], [-44, 55], [-47, 63], [-47, 69]]) await walk(p);
  await snap('01-meadow-default-dusk');
  await page.mouse.move(960, 540); await page.mouse.wheel(0, -550); await page.waitForTimeout(600);
  await snap('02-meadow-close-dusk');
  await light('Night'); await snap('03-meadow-close-night'); await light('Dusk');
  for (const p of [[-50, 77], [-54, 84], [-57, 88], [-58, 91]]) await walk(p);
  // Real mouse orbit: look towards the southern shore, at a low near-ground angle.
  const dx = (-Math.PI / 2 - Math.atan2(.8, .6)) / .0055, dy = (.38 - Math.PI / 4) / .0055;
  await page.mouse.move(1100, 600); await page.mouse.down(); await page.mouse.move(1100 + dx, 600 + dy, { steps: 35 }); await page.mouse.up();
  await snap('04-shore-close-dusk');
  await light('Night'); await snap('05-shore-close-night');
  report.pass = report.steps.every(s => s.reached) && !report.debugPresent && !report.errors.length;
} catch (e) { report.errors.push(String(e)); await snap('failure'); }
finally { await hold([]); await writeFile(path.join(out, 'normal-walk.json'), JSON.stringify(report, null, 1)); await browser.close(); }
console.log(JSON.stringify({ pass: report.pass, steps: report.steps.map(s => ({ target: s.target, at: s.at, reached: s.reached })), errors: report.errors }));
