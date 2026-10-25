/** Queued character reset validation. Run only after receiving the shared heavy-resource slot. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4342';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/bobby-phase2-character/reset';
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { errors: [], checks: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded && window.__worldCampContent?.seats().length, undefined, { timeout: 90000 });
  await page.evaluate(() => __worldDebug.set({ quality: 'balanced', zoom: 0 }));
  const bot = new Bot(page), wait = ms => page.waitForTimeout(ms);
  const clean = async name => {
    await page.waitForFunction(() => {
      const a = __worldDebug.actor(), s = __worldDebug.state(), p = __worldDebug.snapshot();
      return a.loaded && !a.vault && !a.movementLocked && !a.vehicle && !a.jumpKind && !s.seat && !s.activeVehicle && p.grounded;
    }, undefined, { timeout: 15000 });
    report.checks.push({ name, clean: true });
  };
  // Hard cut while seated must discard both the physical seat and the guide's Sit state.
  const seat = await page.evaluate(() => __worldCampContent.seats()[0]);
  await bot.fixtureTeleport([seat.anchor[0] + Math.cos(seat.yaw) * .4, 5.7, seat.anchor[2] - Math.sin(seat.yaw) * .4], 'seat-front fixture');
  await page.waitForFunction(() => __worldDebug.snapshot().grounded, undefined, { timeout: 15000 });
  await bot.press('KeyE');
  await page.waitForFunction(() => __worldDebug.actor().animation === 'SitIdle', undefined, { timeout: 15000 });
  await bot.fixtureTeleport([-42, 5.68, 30], 'hard QA teleport from SitIdle'); await clean('teleport-from-seat');
  await bot.press('Space');
  await page.waitForFunction(() => !!__worldDebug.actor().jumpKind, undefined, { timeout: 5000 });
  await bot.fixtureTeleport([-42, 5.68, 30], 'hard QA teleport from airborne'); await clean('teleport-from-air');
  // Actual fall below the recovery threshold, then the existing two-second water recovery.
  await bot.fixtureTeleport([-42, -90, 30], 'fall/death threshold fixture'); await clean('death-recovery');
  await page.evaluate(() => __worldDebug.water()); await wait(2500); await clean('water-recovery');
  // Enter while vault is active, then exit with no keys: old vault velocity must not reappear.
  await page.evaluate(() => { __worldDebug.teleportVehicle('offroad', [-39, 5.8, 41], 0); __worldDebug.wheelFixture(true, 41.1, 3); });
  const crossing = comboFor(1, 0), [dx, dz] = crossing.dir;
  await bot.fixtureTeleport([-42 - dx * .98, 5.68, 41.1 - dz * .98], 'low-vault before vehicle entry');
  await page.waitForFunction(() => __worldDebug.snapshot().grounded, undefined, { timeout: 15000 });
  await bot.hold(crossing.keys); await bot.press('Space');
  await page.waitForFunction(() => __worldDebug.actor().vault, undefined, { timeout: 5000 });
  assert.equal(await page.evaluate(() => __worldDebug.enter('offroad')), true); await bot.release();
  await page.waitForFunction(() => __worldDebug.state().activeVehicle && !__worldDebug.actor().vehicle, undefined, { timeout: 5000 });
  assert.equal((await page.evaluate(() => __worldDebug.actor())).vault, false);
  assert.equal(await page.evaluate(() => __worldDebug.exit()), true);
  await page.waitForFunction(() => !__worldDebug.actor().vehicle, undefined, { timeout: 5000 });
  await clean('vault-enter-exit');
  const before = await page.evaluate(() => __worldDebug.snapshot().player); await wait(500);
  const after = await page.evaluate(() => __worldDebug.snapshot().player);
  const drift = Math.hypot(after[0] - before[0], after[2] - before[2]); assert.ok(drift < .05);
  report.checks.push({ name: 'no-stale-vault-velocity', drift });
  await page.evaluate(() => __worldDebug.wheelFixture(false));
  report.fixtures = bot.fixtureCalls;
} catch (error) { report.errors.push(String(error.stack || error)); }
finally { await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.errors.length) process.exitCode = 1; }
