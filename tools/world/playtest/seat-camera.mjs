/** Focused seated camera regression. Logged approach fixtures; sit/stand and orbit use real inputs. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, CHROME, loadPlaywright, openWorld } from './lib.mjs';
import { aim } from './budget-lib.mjs';
const out = process.env.WORLD_PLAYTEST_DIR;
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { errors: [], fixtures: [], seats: [] };
try {
  const { page, errors } = await openWorld(browser, `${process.env.WORLD_BASE_URL}/world/?qa=1`, { width: 1920, height: 1080 });
  const bot = new Bot(page);
  for (const [label, prefix] of [['C06', 'camp-bench-0-a'], ['P16', 'park-P16-']]) {
    const anchor = await page.evaluate(prefix => __worldInteract.list().find(i => i.id.startsWith(prefix)), prefix);
    if (!anchor) throw Error(`No ${label} seat`);
    await bot.fixtureTeleport([anchor.position[0], anchor.position[1] + .3, anchor.position[2]], `real ${label} approach`);
    await page.waitForTimeout(1400);
    await bot.press('KeyE'); await page.waitForTimeout(2700);
    const seat = await page.evaluate(() => __worldDebug.state().seat);
    if (!seat) throw Error(`E did not sit on ${label}`);
    const row = { label, seat, views: [] };
    for (const [name, yaw, pitch] of [['front', -seat.yaw, .18], ['side', -seat.yaw + .4, -.15]]) {
      await aim(page, { yaw, pitch, distance: 5 });
      await page.waitForTimeout(800);
      const camera = await page.evaluate(() => __worldDebug.camera());
      row.views.push({ name, camera, targetAboveSeat: camera.target[1] - seat.position[1],
        targetCorrect: Math.abs(camera.target[1] - seat.position[1] - .92) < .02,
        nearPlaneClear: camera.nearPlaneOverlaps.length === 0 });
      await page.screenshot({ path: path.join(out, `${label}-${name}.jpg`), type: 'jpeg', quality: 82 });
    }
    await bot.press('KeyE'); await page.waitForTimeout(2200);
    row.stood = await page.evaluate(() => !__worldDebug.state().seat);
    report.seats.push(row);
  }
  report.fixtures = bot.fixtureCalls; report.errors.push(...errors);
} catch (e) { report.errors.push(String(e.stack || e)); }
await browser.close();
await writeFile(path.join(out, 'camera.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ seats: report.seats.map(r => ({ label: r.label, stood: r.stood, views: r.views.map(v => ({ name: v.name, distance: v.camera.actualDistance, targetCorrect: v.targetCorrect, nearPlaneClear: v.nearPlaneClear })) })), errors: report.errors }));
