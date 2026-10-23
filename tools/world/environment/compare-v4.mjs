/** 1080p near / mid ground views (QA entry observation; fixture teleports at terrain height).
 * Usage: WORLD_BASE_URL=http://127.0.0.1:4322 node tools/world/environment/compare-v4.mjs outDir [quality] */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.argv[2] || 'docs/world/quality-v3/environment-v4/compare');
const quality = process.argv[3] || 'high';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const query = process.env.WORLD_QUERY || '';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { base, query, quality, views: [], errors: [] };
try {
  const { page, errors } = await openWorld(browser, `${base}/world/?qa=1${query}`, { width: 1920, height: 1080 });
  await page.evaluate(q => __worldDebug.set({ quality: q }), quality);
  // [name, x, z, zoom]: player-camera fixtures (y from the physics ground below).
  const views = [['near-camp-grass', -54, 44, 0], ['near-west-slope', -66, 26, 0], ['mid-west-coast', -62, 6, 1], ['mid-camp-rim', -42, 52, 2], ['near-beach-north', -22, 56, 0]];
  for (const [name, x, z, zoom] of views) {
    const hit = await page.evaluate(([x, z]) => __worldDebug.castPlayer([x, 14, z], [x, -12, z]), [x, z]);
    const y = 14 - 26 * hit.toi + .05;
    await page.evaluate(([x, y, z, zoom]) => { __worldDebug.teleportPlayer([x, y, z]); __worldDebug.set({ zoom }); }, [x, y, z, zoom]);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    report.views.push({ name, teleport: [x, +y.toFixed(2), z], zoom });
  }
  report.stats = await page.evaluate(() => __worldDebug.stats());
  report.names = await page.evaluate(() => __worldDebug.sceneObjects().filter(n => /player|vehicle|chassis|capsule/.test(n)).slice(0, 40));
  report.errors.push(...errors);
} catch (e) { report.errors.push(e.stack || String(e)); }
await writeFile(path.join(out, 'compare.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ out, stats: report.stats, names: report.names, errors: report.errors.slice(0, 3) }, null, 1));
