/** Terrain-session render cost per view (SESSION-RULES §5 method): full frame stats, then the same
 * frame with each owned group hidden; the difference is that group's submitted calls / triangles
 * (main pass + shadow passes). Groups: terrain chunks, paving, grass + pebbles. Fixture teleports only. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { CHROME, ensureDir, loadPlaywright, openWorld } from '../playtest/lib.mjs';

const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/tmp/terrain-cost');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4331';
const VIEWS = [['camp', [-42, 30], 2], ['camp-exit', [-8, 30.5], 2], ['avenue', [17.5, 8], 2], ['j3', [14.5, -36], 2], ['hill', [-40, -62], 2], ['south', [-30, 84], 2], ['west', [-96, 4], 2], ['camp-near', [-42, 24], 0]];
const GROUPS = { terrain: '^island-terrain-v4-chunk-', paving: '^world-paving-v4$', detail: '^(ground-grass-blades|ground-pebbles)$' };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { base, startedAt: new Date().toISOString(), views: [] };
try {
  const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: 1920, height: 1080 });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(__worldDebug.stats())))));
  for (const [name, [x, z], zoom] of VIEWS) {
    await page.evaluate(p => __worldDebug.teleportPlayer(p), [x, 7.5, z]);
    await page.evaluate(z => __worldDebug.set({ zoom: z }), zoom);
    await page.waitForTimeout(2200);
    const full = await frame();
    const row = { name, at: [x, z], zoom, full: { calls: full.calls, tri: full.triangles }, groups: {}, lod: await page.evaluate(() => window.__worldEnv?.terrainLod?.() ?? null), detail: await page.evaluate(() => window.__worldEnv?.groundDetail?.() ?? null) };
    for (const [g, re] of Object.entries(GROUPS)) {
      const hidden = await page.evaluate(re => __worldEnv.hideByName(re), re);
      const less = await frame();
      await page.evaluate(() => __worldEnv.restore());
      row.groups[g] = { objects: hidden, calls: full.calls - less.calls, tri: full.triangles - less.triangles };
    }
    report.views.push(row);
    console.log(JSON.stringify(row));
  }
  report.errors = errors;
} finally {
  await browser.close();
  await writeFile(path.join(out, 'terrain-cost.json'), JSON.stringify(report, null, 1));
}
