/**
 * Town look-around capture (QA camera only; evidence for my own visual review, not a playtest).
 * Usage: node tools/world/town/look.mjs OUTDIR [name=x,y,z:tx,ty,tz[:night]] ...
 * Opens /world/?qa=1 at 1920x1080, waits for the town GLBs, then for each view sets a fixed
 * camera through the camp QA close camera (same code path as existing evidence shots), captures a
 * PNG and the frame stats. Without view args, a default set is captured.
 */
import './env.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME } from '../playtest/lib.mjs';

const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4332';
const out = process.argv[2] || '/Users/bobby/Desktop/3D-personal-world/evidence/town/look';
const DEFAULT_VIEWS = [
  'town=72,46,30:12,4,-10', 'town-night=66,34,18:12,5,-12:night',
  'avenue-south=24,6,34:12,5,0', 'avenue-north=24,7,-56:10,6,-30',
  'forecourts=30,12,-6:10,3,-6', 'hunyuan=34,22,-40:6,10,-43', 'backstreet=10,30,-60:-14,3,-30',
];
const views = (process.argv.slice(3).length ? process.argv.slice(3) : DEFAULT_VIEWS).map(spec => {
  const [name, rest] = spec.split('='); const [p, t, mode] = rest.split(':');
  return { name, p: p.split(',').map(Number), t: t.split(',').map(Number), night: mode === 'night' };
});
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket('**/*', ws => ws.close());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const report = { base, views: [], errors };
try {
  await page.goto(`${base}/world/?qa=1`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__worldDebug?.state().ready, undefined, { timeout: 120000 });
  await page.waitForFunction(() => !window.__worldDebug.sceneObjects().some(n => n.startsWith('town-loading-')), undefined, { timeout: 60000 }).catch(() => errors.push('town assets still loading'));
  await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}.world-top,.world-bottom,.world-location,.world-experience,.world-interaction{display:none!important}' });
  await page.waitForTimeout(2000);
  for (const v of views) {
    await page.evaluate(v => { window.__worldDebug.set({ light: v.night ? 'night' : 'dusk' }); window.__worldCampQA.close(v.p, v.t); }, v);
    await page.waitForTimeout(v.night ? 2600 : 900);
    const file = path.join(out, `${v.name}.png`);
    await page.screenshot({ path: file });
    report.views.push({ ...v, file, stats: await page.evaluate(() => window.__worldDebug.stats()) });
  }
} catch (e) { errors.push(String(e.stack || e)); }
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.views.map(v => ({ name: v.name, calls: v.stats.calls, tris: v.stats.triangles })), null, 0), errors.slice(0, 5));
await browser.close();
