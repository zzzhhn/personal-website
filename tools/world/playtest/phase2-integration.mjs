/** Composed character/driving checks. Fixtures only place actors; driving uses real keys. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME } from './lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4345';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/bobby-phase2-integration';
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { checks: [], errors: [] };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  await page.evaluate(() => __worldDebug.set({ quality: 'balanced', zoom: 0, lang: 'en' }));
  const bot = new Bot(page), wait = ms => page.waitForTimeout(ms);
  const sample = () => page.evaluate(() => {
    const s = __worldDebug.snapshot();
    return { step: s.physicsStep, active: s.activeVehicle, car: s.vehicles.find(v => v.id === 'coupe') };
  });
  const setup = async () => {
    await bot.release();
    await bot.fixtureTeleport([-88, 2.02, 14.1], 'flat-road coupe entry fixture');
    await page.evaluate(() => __worldDebug.teleportVehicle('coupe', [-88, 2.5, 12], 0));
    await wait(1000);
    await page.waitForFunction(() => __worldDebug.state().nearbyVehicle === 'coupe');
  };
  const record = () => page.evaluate(() => {
    window.__integrationRows = []; const until = performance.now() + 3500;
    const tick = () => {
      const s = __worldDebug.snapshot(), c = s.vehicles.find(v => v.id === 'coupe');
      window.__integrationRows.push({ step: s.physicsStep, entering: c.entering, active: s.activeVehicle,
        engine: c.driving.engine, nitro: c.driving.nitro, boosting: c.driving.boosting, p: c.position });
      if (performance.now() < until) requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
  await setup(); await record();
  await bot.hold(['KeyW', 'ShiftLeft']); await bot.press('KeyE');
  await wait(300);
  const entering = await sample(); assert.equal(entering.car.entering, true);
  assert.equal(entering.car.driving.engine, 0); assert.equal(entering.car.driving.nitro, 1);
  await page.waitForFunction(() => __worldDebug.snapshot().vehicles.find(v => v.id === 'coupe').driving.boosting, undefined, { timeout: 6000 });
  await wait(550);
  const boosted = await sample(); assert.ok(boosted.car.driving.nitro < .95);
  const hud = page.getByRole('meter', { name: 'Nitro', exact: true });
  assert.ok(Number(await hud.getAttribute('aria-valuenow')) < 100);
  await page.screenshot({ path: `${out}/coupe-hud-en.jpg`, type: 'jpeg', quality: 82 });
  await page.evaluate(() => __worldDebug.set({ lang: 'zh' }));
  await page.getByRole('meter', { name: '氮气', exact: true }).waitFor();
  await page.screenshot({ path: `${out}/coupe-hud-zh.jpg`, type: 'jpeg', quality: 82 });
  await bot.hold(['Space']); await wait(1800); await bot.release();
  const rows = await page.evaluate(() => window.__integrationRows);
  const entryRows = rows.filter(r => r.entering);
  assert.ok(entryRows.length > 5 && entryRows.every(r => r.engine === 0 && r.nitro === 1));
  report.checks.push({ name: 'held-input-entry-and-live-bilingual-hud', entryFrames: entryRows.length, nitroAfterBoost: boosted.car.driving.nitro });
  await writeFile(`${out}/held-entry.json`, JSON.stringify(rows));

  await setup(); const before = await sample();
  await bot.hold(['KeyW', 'ShiftLeft']); await bot.press('KeyE'); await wait(280);
  await bot.press('Escape'); await bot.release(); await wait(100);
  const paused = await sample(); await wait(450); const still = await sample();
  assert.equal(still.step, paused.step); assert.equal(still.car.entering, true);
  await bot.press('Escape'); await wait(150);
  assert.equal((await sample()).car.entering, true);
  await bot.press('KeyE');
  await page.waitForFunction(() => !__worldDebug.state().activeVehicle && !__worldDebug.actor().vehicle, undefined, { timeout: 8000 });
  const exited = await sample();
  assert.equal(exited.car.driving.nitro, 1); assert.equal(exited.car.driving.engine, 0);
  const drift = Math.hypot(exited.car.position[0] - before.car.position[0], exited.car.position[2] - before.car.position[2]);
  assert.ok(drift < .15, `entry cancellation drift: ${drift}`);
  assert.equal(await page.getByRole('meter').count(), 0);
  report.checks.push({ name: 'pause-resume-queued-exit-no-stored-power', frozenStep: paused.step, carDrift: drift });
  // Same safe-exit path after composing both lanes: no floor means remain in the vehicle.
  await page.evaluate(() => { __worldDebug.teleportVehicle('coupe', [400, 20, 400], 0); __worldDebug.enter('coupe'); });
  await wait(1300);
  assert.equal(await page.evaluate(() => __worldDebug.exit()), false);
  assert.equal((await sample()).active, 'coupe');
  report.checks.push({ name: 'unsafe-exit-refused' });
  await page.goto(base + '/world/', { waitUntil: 'networkidle' });
  await page.locator('.world-loading').waitFor({ state: 'hidden', timeout: 90000 });
  await wait(1000);
  assert.equal(await page.evaluate(() => '__worldDebug' in window), false);
  await page.screenshot({ path: `${out}/normal-entry.jpg`, type: 'jpeg', quality: 82 });
  report.checks.push({ name: 'normal-entry-no-qa-api' });
  report.fixtures = bot.fixtureCalls;
} catch (error) {
  report.errors.push(String(error.stack || error));
  await page?.screenshot({ path: `${out}/failure.jpg`, type: 'jpeg', quality: 82 }).catch(() => {});
} finally {
  await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); if (report.errors.length) process.exitCode = 1;
}
