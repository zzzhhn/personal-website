/** Street props visual capture. QA entry (?qa=1): fixture teleport (logged) + real mouse drag / wheel to aim
 * the orbit camera, then a 1920x1080 drawing-buffer screenshot. Views: STREET_VIEWS=name,name or all.
 * Usage: tools/bot-run.sh street 4334 tools/world/street/shots.mjs <outdir> */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Bot, CHROME, loadPlaywright, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/tmp/street-shots');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4334';
// yaw: orbit yaw (camera sits at player + orbitDirection(yaw, pitch) * distance); pitch radians up.
export const VIEWS = {
  trees: { p: [-26.5, 1.2, -5], yaw: -.5, pitch: .22, d: 9 },
  'tree-near': { p: [-27, 1.2, -8], yaw: -.9, pitch: .02, d: 4 },
  'tree-park': { p: [-20, 1.2, -39], yaw: 1.2, pitch: .15, d: 8 },
  windmill: { p: [-26, 4.9, -80], yaw: 1.2, pitch: .25, d: 20 },
  foundation: { p: [8, 1.4, -61.5], yaw: .3, pitch: .15, d: 8 },
  'foundation-near': { p: [8, 1.4, -60.5], yaw: .3, pitch: .08, d: 4 },
  avenue: { p: [19, 1.2, 8], yaw: 2.6, pitch: .32, d: 14 },
  'avenue-near': { p: [17.2, 1.2, 2.2], yaw: 2.2, pitch: .12, d: 5 },
  lamp: { p: [17.5, 1.2, 14.5], yaw: 1.2, pitch: .15, d: 4.5 },
  signal: { p: [27.5, 1.2, -4], yaw: .6, pitch: .18, d: 6 },
  signs: { p: [-1.2, 1.2, -37.5], yaw: 1.2, pitch: .12, d: 4.5 },
  bin: { p: [16.4, 1.2, -23.2], yaw: 1.0, pitch: .3, d: 3.2 },
  ring: { p: [-62, 1.2, -56], yaw: -2.2, pitch: .35, d: 16 },
  delineator: { p: [-15, 1.2, -50], yaw: 1.4, pitch: .2, d: 4 },
  roadblock: { p: [24, 1.2, -15.5], yaw: 1.9, pitch: .25, d: 4 },
  bench: { p: [14.2, 1.2, 9.9], yaw: .3, pitch: .25, d: 3.6 },
  bollards: { p: [16.5, 1.2, -1], yaw: 2.8, pitch: .3, d: 5 },
  shelter: { p: [27.3, 1.2, -20], yaw: 2.9, pitch: .15, d: 4.2 },
  'shelter-poster': { p: [29.4, 1.2, -19.2], yaw: -1.5, pitch: .08, d: 2.5 },
  promenade: { p: [28.5, 1.2, 19], yaw: 2.5, pitch: .25, d: 7 },
  seawall: { p: [29.5, 1.2, 4], yaw: 2.2, pitch: .2, d: 4.5 },
  guardrail: { p: [-66, 1.2, -52], yaw: -1.0, pitch: .25, d: 6 },
  hillrail: { p: [-12.5, 3.2, -86], yaw: 2.6, pitch: .25, d: 5 },
  bridge: { p: [33, 1.2, -43], yaw: 2.2, pitch: .3, d: 9 },
};
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { base, views: [], errors: [] };
const want = (process.env.STREET_VIEWS || 'all').split(',');
const lights = (process.env.STREET_LIGHTS || 'dusk,night').split(',');
try {
  const { page, errors, context } = await openWorld(browser, base + '/world/' + (process.env.STREET_ORDINARY ? '' : '?qa=1'), { width: 1920, height: 1080, preserve: true });
  const bot = new Bot(page);
  await page.waitForTimeout(2500);
  const box = await page.locator('canvas').first().boundingBox();
  const aim = async (yaw, pitch, d) => {
    for (let k = 0; k < 4; k++) {
      const c = await page.evaluate(() => window.__worldDebug.camera());
      const dy = Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw)), dp = pitch - c.pitch;
      if (Math.abs(dy) < .01 && Math.abs(dp) < .01) break;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down();
      await page.mouse.move(cx + dy / .0055, cy + dp / .0055, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(80);
    }
    for (let k = 0; k < 6; k++) {
      const c = await page.evaluate(() => window.__worldDebug.camera());
      const step = Math.log(d / c.distance) / .0011;
      if (Math.abs(step) < 20) break;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, step); await page.waitForTimeout(120);
    }
  };
  for (const light of lights) {
    await page.evaluate(l => window.__worldDebug.set({ light: l }), light);
    for (const [name, v] of Object.entries(VIEWS)) {
      if (!want.includes('all') && !want.includes(name)) continue;
      await bot.fixtureTeleport(v.p, `street view ${name}`);
      await page.waitForTimeout(900);
      await aim(v.yaw, v.pitch, v.d);
      await page.waitForTimeout(2600);
      const file = path.join(out, `${name}-${light}.png`);
      await page.screenshot({ path: file });
      const stats = await page.evaluate(() => ({ frame: window.__worldDebug.stats(), street: window.__worldStreet?.stats(), claimed: window.__worldDebug.claimedGreybox() }));
      report.views.push({ name, light, file, view: v, stats });
      console.log(name, light, JSON.stringify(stats.frame), JSON.stringify(stats.street?.meshes ?? null));
    }
  }
  report.errors.push(...errors);
  report.fixtures = bot.fixtureCalls;
  await context.close();
} catch (e) { report.errors.push(e.stack || String(e)); console.error(e); }
await writeFile(path.join(out, 'shots.json'), JSON.stringify(report, null, 2));
console.log('errors', JSON.stringify(report.errors.slice(0, 8)));
await browser.close();
