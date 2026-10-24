/** Kerb crossing (terrain session): the player walks with real keys from the carriageway over the gutter
 * and rolled kerb onto the sidewalk and back; each car drives with real keys (W, 3-6 m/s) from the
 * carriageway over the kerb onto the sidewalk. Pass = crosses within the time (no air wall), player
 * stays grounded / never blocked, car body lift <= 0.15 m above its flat-road ride height, no flip.
 * Start positions are fixture teleports (logged). Output: WORLD_PLAYTEST_DIR/report.json. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Bot, CHROME, comboFor, ensureDir, loadPlaywright, openWorld } from '../playtest/lib.mjs';

const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/tmp/kerb-cross');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4331';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { base, startedAt: new Date().toISOString(), cases: [], fixtures: [], fixtureCalls: [] };
try {
  const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: 1280, height: 720 });
  const bot = new Bot(page);
  const snap = () => page.evaluate(() => { const s = __worldDebug.snapshot(); return { p: s.player, g: s.grounded, v: s.vehicles, a: s.activeVehicle }; });
  // Avenue west kerb at x = 17 (carriageway 17..25), sidewalk 15..17; mid-block z = -5 (between J2 and the lay-by).
  // Player: east -> west (onto the sidewalk), then west -> east (down the kerb).
  for (const [name, from, dir, goal] of [['player-up-kerb', [19.2, 2.1, -6], -1, 15.6], ['player-down-kerb', [15.6, 2.1, -6], 1, 19.2]]) {
    await bot.fixtureTeleport(from, name);
    await page.waitForTimeout(500);
    const combo = comboFor(dir, 0); const t0 = Date.now(); let minY = 9, maxY = -9, air = 0, n = 0, last;
    await bot.hold(combo.keys);
    while (Date.now() - t0 < 3500) {
      last = await snap(); n++;
      if (!last.g) air++;
      minY = Math.min(minY, last.p[1]); maxY = Math.max(maxY, last.p[1]);
      if ((last.p[0] - goal) * dir > 0) break;
      await page.waitForTimeout(60);
    }
    await bot.release();
    const crossed = (last.p[0] - goal) * dir > 0;
    report.cases.push({ name, keys: combo.keys, crossed, seconds: (Date.now() - t0) / 1000, end: last.p.map(v => +v.toFixed(2)), ySpan: +(maxY - minY).toFixed(3), airborneSamples: air, samples: n, pass: crossed && air <= 2 });
  }
  // Cars: east (sea-side) kerb of the avenue (gutter line x = 24.6, sidewalk 25..27, promenade to 30.4),
  // driving east from the carriageway. The lane z is chosen from the running layout so the 10 m corridor
  // is >= 3 m from every knockable and clear of the shelter / benches (z -21.6..-18.4, -28, 16, 22).
  const knock = (await page.evaluate(() => __worldDebug.layout().knockables)).map(k => k.position);
  const fixed = [[-20, 1.8], [-28, 1.2], [16, 1.2], [22, 1.2], [18.6, 1]];
  const laneZ = [-14, -15, -16, -24, -25, 12, 13, -9.5].find(z => !knock.some(p => p[0] > 19 && p[0] < 31 && Math.abs(p[2] - z) < 3) && !fixed.some(([fz, r]) => Math.abs(fz - z) < r + 2));
  report.laneZ = laneZ;
  for (const id of ['coupe', 'offroad', 'van']) {
    // Fresh page per vehicle: no car left over from an earlier case in the lane.
    const fresh = await openWorld(browser, base + '/world/?qa=1', { width: 1280, height: 720 });
    const page = fresh.page, bot = new Bot(page);
    const snap = () => page.evaluate(() => { const s = __worldDebug.snapshot(); return { p: s.player, g: s.grounded, v: s.vehicles, a: s.activeVehicle }; });
    await bot.fixtureTeleport([19, 2.1, laneZ - 2], `${id}-board`);
    // Body centre = road top + wheelGeometry height (+0.1 m drop), as drive-route places cars.
    const size = { coupe: [4.3, 1.05, 1.9], offroad: [3.9, 1.35, 2], van: [4.5, 1.9, 2.2] }[id], r = Math.min(.5, Math.max(.34, size[1] * .28));
    const start = [20.5, 1.14 + size[1] * .28 + .42 + r + .1, laneZ];
    report.fixtures.push({ id, start });
    await page.evaluate(({ id, start }) => __worldDebug.teleportVehicle(id, start, 0), { id, start });
    await page.waitForTimeout(1200);
    await page.evaluate(id => __worldDebug.enter(id), id);
    // Ride height on flat carriageway: settle, then the mean of 10 samples.
    await page.waitForTimeout(2000);
    let ride = 0; for (let k = 0; k < 10; k++) { ride += (await snap()).v.find(v => v.id === id).position[1] / 10; await page.waitForTimeout(50); }
    const startPos = (await snap()).v.find(v => v.id === id).position;
    const dbg = await snap(); report.debug = [...(report.debug ?? []), { id, active: dbg.a, player: dbg.p, car: dbg.v.find(v => v.id === id) }];
    const t0 = Date.now(); let maxY = -9, last, maxSpeed = 0, tilt = 0;
    while (Date.now() - t0 < 7000) {
      last = await page.evaluate(id => { const s = __worldDebug.snapshot(), v = s.vehicles.find(q => q.id === id); return { v, speed: __worldDebug.state().speed }; }, id);
      const speed = Math.abs(last.speed ?? 0); maxSpeed = Math.max(maxSpeed, speed);
      await bot.hold(speed < 4 ? ['KeyW'] : []);
      maxY = Math.max(maxY, last.v.position[1]);
      if (last.v.upsideDown) tilt++;
      if (last.v.position[0] > 29) break;
      await page.waitForTimeout(50);
    }
    await bot.release();
    const crossed = last.v.position[0] > 27.5, lift = +(maxY - ride - .015).toFixed(3);
    report.cases.push({ name: `${id}-over-kerb`, crossed, startPos: startPos.map(v => +v.toFixed(2)), rideY: +ride.toFixed(3), maxLiftOverRide: lift, maxSpeed: +maxSpeed.toFixed(2), end: last.v.position.map(v => +v.toFixed(2)), flipped: tilt > 0,
      pass: crossed && lift <= .15 && !tilt });
    report.fixtureCalls.push(...bot.fixtureCalls);
    await fresh.context.close();
  }
  report.fixtureCalls.push(...bot.fixtureCalls); report.errors = errors;
} finally {
  await browser.close();
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
}
for (const c of report.cases) console.log(JSON.stringify(c));
console.log(JSON.stringify({ total: report.cases.length, passed: report.cases.filter(c => c.pass).length, errors: report.errors?.length }));
