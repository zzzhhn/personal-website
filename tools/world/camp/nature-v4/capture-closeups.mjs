/** 1080p close evidence stills (trees, rocks, bushes, fire) from the live dev world.
 * Uses the QA-only window.__worldCampQA close camera (shot mode: physics/motion frozen).
 * WORLD_CLOSEUP_TAG=before|after selects the output folder. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME } from '../../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const tag = process.env.WORLD_CLOSEUP_TAG || 'after';
const out = path.resolve('docs/world/quality-v3/nature-v4/closeups', tag);
await mkdir(out, { recursive: true });
const views = [
  ['tree-G16', [-53.2, 8.4, 39.6], [-59, 7.4, 34], 'dusk'],
  ['tree-G17', [-46.6, 8.2, 49.8], [-52, 7.2, 45], 'dusk'],
  ['tree-G18', [-34.2, 9.0, 13.6], [-40, 8.0, 9], 'dusk'],
  ['rocks-west', [-56.6, 6.7, 43.6], [-60.0, 5.1, 41.0], 'dusk'],
  ['bush-G19-G20', [-58.0, 6.4, 27.4], [-61.6, 5.2, 24.8], 'dusk'],
  ['fire-dusk', [-39.9, 6.25, 32.1], [-42, 5.35, 30], 'dusk'],
  ['fire-night', [-39.9, 6.25, 32.1], [-42, 5.35, 30], 'night'],
];
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const report = { base, tag, startedAt: new Date().toISOString(), views: [], errors };
try {
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded && window.__worldCampQA && !__worldDebug.sceneObjects().some(n => /camp-(loading|fallback)/.test(n)), undefined, { timeout: 90000 });
  // A short running interval so wind/fire clocks are not at t=0 when the shot freezes them.
  await page.waitForTimeout(2500);
  for (const [name, p, t, light] of views) {
    await page.evaluate(([p, t, light]) => { __worldDebug.set({ light }); __worldCampQA.close(p, t); }, [p, t, light]);
    await page.waitForTimeout(light === 'night' ? 2600 : 1400);
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    const stats = await page.evaluate(() => __worldDebug.stats());
    report.views.push({ name, camera: p, target: t, light, file: path.relative(process.cwd(), file), stats });
    console.log(name, stats.triangles, stats.calls);
  }
  await page.evaluate(() => { __worldCampQA.release(); __worldDebug.set({ light: 'dusk' }); });
} catch (e) { errors.push(e.stack || String(e)); }
report.finishedAt = new Date().toISOString();
await writeFile(path.join(out, 'closeups.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
if (errors.length) { console.error(errors); process.exitCode = 1; }
