/** Visual check shots for render work (render session). Two parts:
 *  1. NORMAL ENTRY (/world/, no QA params): spawn default camera, then real-mouse orbit/zoom out to see the camp,
 *     the island and the sea; dusk only (the normal entry has no light switch without the menu).
 *  2. QA-positioned close-ups (?qa=1, fixture teleports logged): shore + surf, shadow close-up, overview, night.
 * Env: SHOTS_SIZES=1920x1080,2560x1440 (default both), SHOTS_ONLY=id,id. Output PNG -> converted by the caller. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';
import { aim, look } from './budget-lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4338';
const out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/tmp/world-shots');
const sizes = (process.env.SHOTS_SIZES || '1920x1080,2560x1440').split(',').map(s => s.split('x').map(Number));
const only = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(',')) : null;
await mkdir(out, { recursive: true });
const QA = [
  { id: 'shore-close', light: 'dusk', player: [-26, 1.6, 84], cam: { yaw: look(.3, 1), pitch: .38, distance: 7 } },
  { id: 'shore-low', light: 'dusk', player: [-26, 1.6, 84], cam: { yaw: look(0, 1), pitch: .12, distance: 9 } },
  { id: 'shore-night', light: 'night', player: [-26, 1.6, 84], cam: { yaw: look(.3, 1), pitch: .3, distance: 10 } },
  { id: 'shadow-close', light: 'dusk', player: [-40, 5.9, 33], cam: { yaw: look(-.4, -1), pitch: .7, distance: 4.5 } },
  { id: 'camp-night', light: 'night', player: [-42, 5.9, 37], cam: { yaw: look(0, -1), pitch: .45, distance: 12 } },
  { id: 'overview-high', light: 'dusk', player: [-4, 1.25, -12], cam: { yaw: look(1, .3), pitch: 1.2, distance: 30 } },
  { id: 'west-coast', light: 'dusk', player: [-88, 1.25, 10], cam: { yaw: look(-1, .2), pitch: .5, distance: 20 } },
].filter(v => !only || only.has(v.id));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { base, at: new Date().toISOString(), fixtures: [], shots: [], errors: [] };
try {
  for (const [W, H] of sizes) {
    // Part 1: normal entry.
    if (!only || only.has('normal')) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
      page.on('pageerror', e => report.errors.push(String(e.message)));
      await page.goto(`${base}/world/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForSelector('canvas', { timeout: 60000 }); await page.waitForTimeout(12000);
      await page.screenshot({ path: path.join(out, `normal-spawn-${W}.png`) });
      // Zoom out and look over the island toward the south-west sea with real input.
      await page.mouse.move(W / 2, H / 2);
      for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(50); }
      await page.mouse.down(); await page.mouse.move(W / 2 + 380, H / 2 - 60, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `normal-orbit-${W}.png`) });
      report.shots.push({ id: 'normal', size: [W, H], dpr: await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; }) });
      await ctx.close();
    }
    // Part 2: QA-positioned.
    if (!QA.length) continue;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(String(e.message)));
    await page.goto(`${base}/world/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().player, undefined, { timeout: 90000 });
    await page.waitForTimeout(4000);
    const bot = new Bot(page);
    for (const v of QA) {
      await page.evaluate(l => __worldDebug.set({ light: l }), v.light);
      report.fixtures.push({ id: v.id, to: v.player });
      await bot.fixtureTeleport(v.player, `shot ${v.id}`); await page.waitForTimeout(800);
      const c = await aim(page, v.cam, W, H); await page.waitForTimeout(v.light === 'night' ? 2600 : 600);
      await page.screenshot({ path: path.join(out, `${v.id}-${W}.png`) });
      report.shots.push({ id: v.id, size: [W, H], camera: { yaw: c.yaw, pitch: c.pitch, d: c.actualDistance }, render: await page.evaluate(() => __worldDebug.renderInfo()) });
    }
    await ctx.close();
  }
} catch (e) { report.errors.push(String(e.stack || e)); }
await browser.close();
await writeFile(path.join(out, 'shots.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ shots: report.shots.length, errors: report.errors }));
