/**
 * Town visual capture. Two passes, recorded in report.json:
 *  1. Normal entry (/world/, no QA params): fixture teleport onto the avenue, real-key run past the
 *     forecourts with the default follow camera; dusk and night stills; wheel zoom-in close-up.
 *  2. ?qa=1 fixed overview cameras (dusk + night) for whole-district review, plus the district's own
 *     cost at the worst (high overview) view: frame stats with and without the town group.
 * Usage: tools/bot-run.sh town 4332 tools/world/town/look.mjs <outdir>
 */
import './env.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME, Bot, openWorld, ensureDir } from '../playtest/lib.mjs';

const base = process.env.WORLD_BASE_URL;
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/Users/bobby/Desktop/3D-personal-world/evidence/town/look');
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const report = { base, normal: [], qa: [], errors: [] };
const hideUi = 'astro-dev-toolbar{display:none!important}';
const townReady = page => page.waitForFunction(() => window.__worldDebug.sceneObjects().includes('world-town-assets'), undefined, { timeout: 90000 }).then(() => true, () => false);
const shot = async (page, name, list) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  list.push({ name, file, stats: await page.evaluate(() => window.__worldDebug.stats()), player: await page.evaluate(() => window.__worldDebug.snapshot().player) });
};
const only = process.argv[2];
try {
  if (!only || only === 'normal') {
    const { page, errors, context } = await openWorld(browser, `${base}/world/`, { width: 1920, height: 1080 });
    report.normalTownLoaded = await townReady(page);
    report.normalClaims = await page.evaluate(() => window.__worldDebug.claimedGreybox());
    await page.addStyleTag({ content: hideUi });
    const bot = new Bot(page);
    await bot.fixtureTeleport([22, 1.9, 22], 'town avenue south of SDIC (fixture start for the town pass)');
    report.walk1 = (await bot.walk([[19.5, 14], [19.5, 0]], { run: true, timeout: 25 })).legs;
    await page.waitForTimeout(1200);
    await shot(page, 'normal-dusk-avenue', report.normal);
    report.walk2 = (await bot.walk([[17, -12], [17, -28]], { run: true, timeout: 25 })).legs;
    await page.waitForTimeout(1200);
    await shot(page, 'normal-dusk-north', report.normal);
    await page.evaluate(() => window.__worldDebug.set({ light: 'night' }));
    await page.waitForTimeout(2600);
    await shot(page, 'normal-night-north', report.normal);
    for (let i = 0; i < 6; i++) await bot.wheel(-300);
    await page.waitForTimeout(900);
    await shot(page, 'normal-night-close', report.normal);
    report.normalErrors = errors.slice(0, 10);
    await context.close();
  }
  if (!only || only === 'qa') {
    const { page, errors, context } = await openWorld(browser, `${base}/world/?qa=1`, { width: 1920, height: 1080 });
    report.qaTownLoaded = await townReady(page);
    await page.addStyleTag({ content: hideUi + '.world-top,.world-bottom,.world-location,.world-experience,.world-interaction{display:none!important}' });
    report.townStats = await page.evaluate(() => window.__worldTown?.stats());
    const views = [
      ['overview-dusk', [52, 34, 24], [8, 4, -12]], ['overview-night', [52, 34, 24], [8, 4, -12], true],
      ['forecourts-dusk', [26, 7, 14], [10, 4, 4]], ['north-dusk', [28, 12, -54], [8, 7, -36]], ['north-night', [28, 12, -54], [8, 7, -36], true],
      ['backstreet-dusk', [4, 22, -62], [-16, 3, -34]], ['westshore-dusk', [-90, 16, 4], [-72, 2, -10]], ['beach-dusk', [-28, 12, 106], [-28, 2, 84]],
      ['moe-palms-dusk', [24, 5, 4], [12, 4, -4]], ['arcade-dusk', [19, 2.6, -36], [9, 2.4, -32]],
      ['worst-overview', [40, 70, 10], [0, 0, -20]],
    ];
    for (const [name, p, t, nightOn] of views) {
      await page.evaluate(([p, t, n]) => { window.__worldDebug.set({ light: n ? 'night' : 'dusk' }); window.__worldCampQA.close(p, t); }, [p, t, !!nightOn]);
      await page.waitForTimeout(nightOn ? 2600 : 1100);
      await shot(page, name, report.qa);
      report.qa.at(-1).townLod = await page.evaluate(() => window.__worldTown?.lod());
    }
    const cost = async () => {
      const r = {};
      r.with = await page.evaluate(() => window.__worldDebug.stats());
      await page.evaluate(() => window.__worldTown.setVisible(false)); await page.waitForTimeout(500);
      r.without = await page.evaluate(() => window.__worldDebug.stats());
      await page.evaluate(() => window.__worldTown.setVisible(true)); await page.waitForTimeout(300);
      r.town = { calls: r.with.calls - r.without.calls, triangles: r.with.triangles - r.without.triangles };
      return r;
    };
    report.cost = {};
    for (const [name, p, t] of [['worst-overview', [40, 70, 10], [0, 0, -20]], ['avenue-north', [24, 7, 20], [10, 5, -30]], ['overview', [52, 34, 24], [8, 4, -12]]]) {
      await page.evaluate(([p, t]) => { window.__worldDebug.set({ light: 'dusk' }); window.__worldCampQA.close(p, t); }, [p, t]);
      await page.waitForTimeout(900);
      report.cost[name] = await cost();
    }
    report.qaErrors = errors.slice(0, 10);
    await context.close();
  }
} catch (e) { report.errors.push(String(e.stack || e)); }
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ normalTownLoaded: report.normalTownLoaded, qaTownLoaded: report.qaTownLoaded, claims: report.normalClaims, townStats: report.townStats,
  normal: report.normal.map(v => [v.name, v.stats.calls, v.stats.triangles]), qa: report.qa.map(v => [v.name, v.stats.calls, v.stats.triangles]),
  cost: report.cost && Object.fromEntries(Object.entries(report.cost).map(([k, v]) => [k, v.town])),
  walk: [report.walk1?.map(l => l.reached), report.walk2?.map(l => l.reached)], errors: [...report.errors, ...(report.normalErrors ?? []), ...(report.qaErrors ?? [])].slice(0, 6) }));
await browser.close();
