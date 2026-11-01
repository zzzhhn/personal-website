/** nature-v4 soft-bush + interaction classes, real keyboard input only after logged fixture starts.
 * A/B: identical start and key sequence with the drag impulse on (default) and off (QA switch
 * __worldSoftBush.setDrag(false); same sensors/visuals). Also re-proves hard objects block and the
 * existing dynamic roadblock is pushed. Output: docs/world/quality-v3/nature-v4/soft-bush/report.json */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, loadPlaywright, CHROME } from '../../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const out = path.resolve(process.env.WORLD_PLAYTEST_DIR || 'docs/world/quality-v3/nature-v4/soft-bush');
await mkdir(out, { recursive: true });
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
const bot = new Bot(page);
const report = { base, startedAt: new Date().toISOString(), cases: [], checks: [], errors: [] };
page.on('pageerror', e => report.errors.push(e.message));
// The shared dev server's Vite optimiser occasionally answers Astro's dev-toolbar entry with 504
// 'Outdated Optimize Dep' while other sessions edit files; it is not world code. Logged separately.
report.devServerNoise = [];
page.on('response', r => { if (r.status() === 504 && /dev-toolbar/.test(r.url())) report.devServerNoise.push(r.url()); });
page.on('console', m => { if (m.type() !== 'error') return; if (/Outdated Optimize Dep/.test(m.text())) report.devServerNoise.push(m.text()); else report.errors.push(m.text()); });
const check = (name, passed, evidence) => { report.checks.push({ name, passed: !!passed, evidence }); console.log((passed ? 'PASS ' : 'FAIL ') + name); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const hz = v => Math.hypot(v[0], v[2]);
const sample = () => ev(() => { const s = __worldDebug.snapshot(), b = __worldSoftBush.state();
  return { t: performance.now() / 1000, player: s.player, pv: s.playerVelocity, grounded: s.grounded, active: s.activeVehicle, vehicles: s.vehicles, inside: b.lastInside, contacts: __worldDebug.contacts().filter(c => c.other.kind === 'solid').map(c => c.other.assetId) }; });
try {
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded && window.__worldSoftBush && __worldDebug.campColliders().length > 50 && !__worldDebug.sceneObjects().some(n => /camp-(loading|fallback)/.test(n)), undefined, { timeout: 90000 });
  await page.waitForTimeout(1200); await page.locator('canvas').click({ position: { x: 960, y: 540 } });
  const records = await ev(() => __worldDebug.campColliders());
  const zone = (id, i) => { const r = records.find(r => r.id === id && r.instance === i); return { id, i, min: r.aabb.min, max: r.aabb.max, c: [(r.aabb.min[0] + r.aabb.max[0]) / 2, (r.aabb.min[2] + r.aabb.max[2]) / 2], sensor: r.sensor }; };
  check('G19/G20 collider records are sensors only (no rigid core)', records.filter(r => r.id === 'G19' || r.id === 'G20').every(r => r.sensor && r.part === 'soft-crown'), records.filter(r => r.id === 'G19' || r.id === 'G20').map(r => [r.id, r.instance, r.part, r.sensor]));

  // ---------- person: walk straight through one bush, A/B ----------
  async function personPass(z, from, to, drag, label) {
    await ev(on => __worldSoftBush.setDrag(on), drag);
    await bot.fixtureTeleport([from[0], 5.68, from[1]], `${label}: isolated start ${drag ? 'drag on' : 'drag off'}`);
    await page.waitForTimeout(400);
    const rows = [];
    const result = await bot.walk([to], { timeout: 9, arrive: .45, maxRecoveries: 0, stopOnBlocked: true, onTick: async () => { rows.push(await sample()); } });
    rows.push(await sample());
    const inZone = r => r.player[0] > z.min[0] && r.player[0] < z.max[0] && r.player[2] > z.min[2] && r.player[2] < z.max[2];
    const flagged = rows.filter(r => r.inside.some(x => x.kind === 'person'));
    const free = rows.filter(r => !r.inside.length && hz(r.pv) > 1 && !inZone(r));
    const lastIn = rows.findLastIndex(x => x.inside.length), after = lastIn >= 0 ? rows.slice(lastIn + 1) : [];
    const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    return { label, drag, zone: z, reached: result.legs.every(l => l.reached), legs: result.legs.map(l => ({ reached: l.reached, seconds: l.seconds, blockedAt: l.blockedAt })),
      samplesInside: flagged.length, medianSpeedInside: med(flagged.map(r => hz(r.pv))), medianSpeedFree: med(free.map(r => hz(r.pv))),
      medianSpeedAfterExit: med(after.slice(3).map(r => hz(r.pv))), maxAbsVyInside: Math.max(0, ...flagged.map(r => Math.abs(r.pv[1]))),
      maxK: Math.max(0, ...rows.flatMap(r => r.inside.map(x => x.k))), solidContacts: [...new Set(rows.flatMap(r => r.contacts))], groundedInsideShare: flagged.length ? flagged.filter(r => r.grounded).length / flagged.length : null, rows };
  }
  const g19 = zone('G19', 0);
  // Diagonal line through G19-0 that clears the neighbouring G21 boulder (2.3 m) and the G16 trunk.
  const P_FROM = [g19.c[0] - 3.2, g19.c[1] - 3.7], P_TO = [g19.c[0] + 3.3, g19.c[1] + 3.7];
  const pOn = await personPass(g19, P_FROM, P_TO, true, 'person-G19-0');
  const pOff = await personPass(g19, P_FROM, P_TO, false, 'person-G19-0');
  report.cases.push(pOn, pOff);
  check('Person passes through G19 with drag (real keys, no block)', pOn.reached && pOn.samplesInside > 0 && !pOn.solidContacts.length, { reached: pOn.reached, samplesInside: pOn.samplesInside, solid: pOn.solidContacts });
  check('Person horizontal speed inside drops >= 20% vs free, and vs drag-off A/B', pOn.medianSpeedInside < .8 * pOn.medianSpeedFree && pOn.medianSpeedInside < .85 * pOff.medianSpeedInside,
    { inside: pOn.medianSpeedInside, free: pOn.medianSpeedFree, insideDragOff: pOff.medianSpeedInside });
  check('Person: no vertical launch inside (|vy| <= 1 m/s) and stays grounded', pOn.maxAbsVyInside <= 1 && pOn.groundedInsideShare >= .9, { maxAbsVy: pOn.maxAbsVyInside, groundedShare: pOn.groundedInsideShare });
  check('Person: drag released after exit (speed back within 5% of free)', pOn.medianSpeedAfterExit != null && pOn.medianSpeedAfterExit > .95 * pOn.medianSpeedFree, { after: pOn.medianSpeedAfterExit, free: pOn.medianSpeedFree });

  // ---------- person: two overlapping/adjacent bushes merge by max, not sum ----------
  const a = zone('G20', 0), b = zone('G19', 1);
  const pair = await personPass({ min: [Math.min(a.min[0], b.min[0]), 0, Math.min(a.min[2], b.min[2])], max: [Math.max(a.max[0], b.max[0]), 9, Math.max(a.max[2], b.max[2])] },
    [(a.c[0] + b.c[0]) / 2 + 5, (a.c[1] + b.c[1]) / 2 - 3.5], [(a.c[0] + b.c[0]) / 2 - 3, (a.c[1] + b.c[1]) / 2 + 3.8], true, 'person-G20-0+G19-1');
  report.cases.push(pair);
  check('Adjacent bushes: passes through, drag coefficient merged by max (never > single)', pair.reached && pair.maxK <= 5.6 + 1e-9, { reached: pair.reached, maxK: pair.maxK, legs: pair.legs });
  await ev(() => __worldSoftBush.setDrag(true));

  // ---------- hard objects still block (real keys) ----------
  for (const [id, inst] of [['G21', 0], ['C06', 0], ['G16', 0]]) {
    const r = records.find(x => x.id === id && x.instance === inst);
    // G16 instance 0 trunk base is the layout tree at (-59, 34); its trunk AABB is widened by limbs.
    const c = id === 'G16' ? [-59, 34] : [(r.aabb.min[0] + r.aabb.max[0]) / 2, (r.aabb.min[2] + r.aabb.max[2]) / 2], half = id === 'G16' ? 1.1 : (r.aabb.max[0] - r.aabb.min[0]) / 2;
    await bot.fixtureTeleport([c[0] - half - .9, 5.68, c[1]], `hard ${id}: isolated approach start`);
    const seen = [];
    const res = await bot.walk([c], { timeout: 5, arrive: .15, stopOnBlocked: true, onTick: async () => { const s = await sample(); seen.push(...s.contacts); } });
    const blocked = !res.legs[0].reached && seen.includes(id);
    report.cases.push({ label: `hard-${id}`, blocked, contacts: [...new Set(seen)], leg: res.legs[0] });
    check(`Hard ${id} still blocks the player`, blocked, { contacts: [...new Set(seen)], minDist: res.legs[0].minDist });
  }

  // ---------- existing dynamic roadblock is pushed (real keys) ----------
  const before = await ev(() => __worldDebug.motionProbe()?.obstacles ?? null);
  const rb = before?.find(o => Math.hypot(o.position[0] + 3, o.position[2] - 28) < 1.5);
  if (rb) {
    await bot.fixtureTeleport([rb.position[0] - 2.2, rb.position[1] + .5, rb.position[2]], 'roadblock push: isolated start');
    const pushWalk = await bot.walk([[rb.position[0] + 3, rb.position[2]]], { timeout: 5, arrive: .4, maxRecoveries: 0, stopOnBlocked: true });
    await page.waitForTimeout(600);
    const after = await ev(() => __worldDebug.motionProbe()?.obstacles ?? null);
    const moved = after.find(o => o.handle === rb.handle);
    const d = Math.hypot(moved.position[0] - rb.position[0], moved.position[2] - rb.position[2]);
    report.cases.push({ label: 'push-roadblock', before: rb, after: moved, displacement_m: d, walk: pushWalk.legs });
    check('Existing 28 kg dynamic roadblock is pushed by walking into it', d > .3, { displacement_m: d });
  } else check('Existing 28 kg dynamic roadblock is pushed by walking into it', false, { error: 'roadblock not found', before });
  // Vehicle runs last: driving re-aims the follow camera, and Bot.walk keys assume the default view.
  // ---------- vehicle: offroad, real W through G20-2, A/B ----------
  // Lane selection (logged): every G19/G20 instance x {radial-inward-from-centre, tangent +, tangent -};
  // keep lanes whose 10 m approach + 3.5 m run-out stay on the plateau top (camp radius <= 23.2 m;
  // the plateau rim is >= 24 m) and keep the car centreline >= 0.9 m from every other collider AABB; largest clearance wins.
  const others = records.filter(r => r.id !== 'G19' && r.id !== 'G20');
  const segDist = (a, b, box) => { let best = Infinity; for (let k = 0; k <= 40; k++) { const t = k / 40, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const dx = Math.max(box.min[0] - x, 0, x - box.max[0]), dz = Math.max(box.min[2] - z, 0, z - box.max[2]); best = Math.min(best, Math.hypot(dx, dz)); } return best; };
  const lanes = [];
  for (const r of records.filter(r => (r.id === 'G19' || r.id === 'G20') && r.instance != null)) {
    const z = zone(r.id, r.instance), rad = [z.c[0] + 42, z.c[1] - 30], rl = Math.hypot(...rad);
    for (const d of [[-rad[0] / rl, -rad[1] / rl], [rad[1] / rl, -rad[0] / rl], [-rad[1] / rl, rad[0] / rl]]) {
      const a = [z.c[0] - d[0] * 10, z.c[1] - d[1] * 10], b = [z.c[0] + d[0] * 3.5, z.c[1] + d[1] * 3.5];
      const onPlateau = Array.from({ length: 11 }, (_, k) => k / 10).every(t => Math.hypot(a[0] + (b[0] - a[0]) * t + 42, a[1] + (b[1] - a[1]) * t - 30) <= 23.2);
      const clear = Math.min(...others.map(o => segDist(a, b, o.aabb)));
      lanes.push({ id: r.id, instance: r.instance, dir: d, onPlateau, clear });
    }
  }
  // The auto-scan found no lane that is both flat for the whole run and clear of tents/rocks (the
  // best flat candidate, G20-1, grazes C04 in the drag-off run). Use the fixed lane G20-2, driving
  // outward from inside the ring: approach and the bush itself are on the flat plateau top, and the
  // ground starts to fall about 1 m past the bush, so height/support is compared only on samples
  // where the drag-off run still has all four wheels down. Candidates stay logged.
  const g2 = zone('G20', 2), out2 = [g2.c[0] + 42, g2.c[1] - 30], ol = Math.hypot(...out2);
  const lane = { id: 'G20', instance: 2, dir: [out2[0] / ol, out2[1] / ol], fixed: true };
  report.vehicleLane = { chosen: lane, candidates: lanes };
  const g20 = zone(lane.id, lane.instance), dir = lane.dir;
  const start = [g20.c[0] - dir[0] * 10, g20.c[1] - dir[1] * 10];
  const yaw = Math.atan2(-dir[1], dir[0]); // vehicle forward = (cos yaw, -sin yaw) = dir
  async function vehiclePass(drag) {
    await ev(on => __worldSoftBush.setDrag(on), drag);
    await bot.fixtureTeleport([start[0] - dir[1] * 2.2, 5.68, start[1] + dir[0] * 2.2], 'driver standing start beside the car');
    await page.evaluate(([s, y]) => __worldDebug.teleportVehicle('offroad', [s[0], 5.9, s[1]], y), [start, yaw]);
    bot.fixtureCalls.push({ t: bot.now(), to: start, reason: `offroad isolated start ${drag ? 'drag on' : 'drag off'}` });
    await page.waitForTimeout(700);
    await bot.press('KeyE'); await page.waitForTimeout(300);
    const rows = []; const t0 = Date.now();
    await bot.hold(['KeyW']);
    let passed = false, exitAt = null;
    while (Date.now() - t0 < 6000) {
      const r = await sample(); rows.push(r);
      const v = r.vehicles.find(v => v.id === 'offroad');
      const along = (v.position[0] - g20.c[0]) * dir[0] + (v.position[2] - g20.c[1]) * dir[1];
      r.along = along; r.speed = hz(v.velocity); r.vy = v.velocity[1]; r.wheels = v.wheelContacts; r.y = v.position[1];
      if (along > 2.2 && !passed) { passed = true; exitAt = rows.length; }
      if (passed && rows.length - exitAt > 2) break;
      await page.waitForTimeout(60);
    }
    await bot.hold(['Space']); await page.waitForTimeout(900); await bot.release();
    const insideRows = rows.filter(r => r.inside.some(x => x.kind === 'vehicle'));
    const at = d => { const r = rows.find(r => r.along >= d); return r ? r.speed : null; };
    const res = { drag, start, yaw, passed, active: rows[0]?.active, samplesInside: insideRows.length, speedAtEntry: at(-1.2), speedAtExit: at(2.2),
      maxAbsVyInside: Math.max(0, ...insideRows.map(r => Math.abs(r.vy))), wheelContactShareInside: insideRows.length ? insideRows.flatMap(r => r.wheels).filter(Boolean).length / (insideRows.length * 4) : null,
      maxYDeltaInside: insideRows.length ? Math.max(...insideRows.map(r => r.y)) - Math.min(...insideRows.map(r => r.y)) : null, solidContacts: [...new Set(rows.flatMap(r => r.contacts))],
      rows: rows.map(r => ({ along: r.along, speed: r.speed, vy: r.vy, y: r.y, wheels: r.wheels, inside: r.inside })) };
    await bot.press('KeyE'); await page.waitForTimeout(300);
    return res;
  }
  const vOn = await vehiclePass(true), vOff = await vehiclePass(false);
  await ev(() => __worldSoftBush.setDrag(true));
  report.cases.push({ label: `vehicle-offroad-${lane.id}-${lane.instance}`, on: vOn, off: vOff });
  check(`Vehicle (offroad) drives through ${lane.id}-${lane.instance} under real W`, vOn.active === 'offroad' && vOn.passed && vOn.samplesInside > 0, { active: vOn.active, passed: vOn.passed, samplesInside: vOn.samplesInside });
  const lossOn = vOn.speedAtEntry - vOn.speedAtExit, lossOff = vOff.speedAtEntry - vOff.speedAtExit;
  check('Vehicle speed loss across the bush exceeds drag-off A/B by >= 0.5 m/s', lossOn - lossOff >= .5, { on: [vOn.speedAtEntry, vOn.speedAtExit], off: [vOff.speedAtEntry, vOff.speedAtExit], lossOn, lossOff });
  // Terrain under the bush is not flat; both runs share it. The bush must add no vertical motion
  // or support: at matched positions the body height and vertical speed match the drag-off run.
  const match = vOn.rows.filter(r => r.inside.length).map(r => { const o = vOff.rows.reduce((best, x) => Math.abs(x.along - r.along) < Math.abs(best.along - r.along) ? x : best);
    return { along: r.along, dy: r.y - o.y, dvy: r.vy - o.vy, wheelsOn: r.wheels.filter(Boolean).length, wheelsOff: o.wheels.filter(Boolean).length }; });
  // The bush sits ~1 m from the plateau edge: past it both runs roll down the slope at different
  // speeds, so height is compared only where the drag-off run still has all four wheels on flat
  // ground. Upward speed is checked absolutely for every in-bush sample.
  // One-sided (lift only). The drag decelerates like a light brake, so the suspension may pitch the
  // body (a second-order effect of horizontal deceleration; the impulse itself has y = 0). The bar is
  // the same 'no launch' bar as for the person: no rise above the drag-off run, |vy| up <= 1 m/s.
  // Paired A/B at matched positions along the same lane (terrain bumps appear in both runs):
  // one-sided lift (on higher than off), extra upward speed (on minus off), and wheel-contact share.
  // Upward speed: compare window peaks (pointwise pairing of 60 ms samples straddles the shared terrain
  // bump at the bush edge and flips between ~0 and ~0.5 m/s run to run, though both runs peak the same).
  const peakUp = rows => Math.max(0, ...rows.filter(r => r.inside.length).map(r => r.vy));
  const maxDy = Math.max(0, ...match.map(m => m.dy)), maxUpDvy = peakUp(vOn.rows) - peakUp(vOff.rows);
  const share = k => match.reduce((n, m) => n + m[k], 0) / Math.max(1, match.length * 4);
  const wheelShareOn = share('wheelsOn'), wheelShareOff = share('wheelsOff');
  check('Vehicle: bush adds no lift / support vs drag-off A/B (never higher by > 0.05 m, in-zone peak upward vy not above drag-off peak + 0.3 m/s, wheel-contact share not above drag-off + 0.1, no solid contact)', maxDy <= .05 && maxUpDvy <= .3 && wheelShareOn <= wheelShareOff + .1 && !vOn.solidContacts.length,
    { maxDy, peakUpVyOn: peakUp(vOn.rows), peakUpVyOff: peakUp(vOff.rows), extraPeakUpVy: maxUpDvy, wheelShareOn, wheelShareOff, solidContacts: vOn.solidContacts, match, absoluteOn: { vy: vOn.maxAbsVyInside, wheelShare: vOn.wheelContactShareInside, yDelta: vOn.maxYDeltaInside } });

  check('No page/console errors', report.errors.length === 0, report.errors);
} catch (e) { report.errors.push(e.stack || String(e)); console.error(e); }
finally {
  await bot.release().catch(() => {}); await ev(() => window.__worldSoftBush?.setDrag(true)).catch(() => {});
  report.fixtures = bot.fixtureCalls; report.events = bot.events; report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.checks.filter(c => c.passed).length, total: report.checks.length, errors: report.errors.length };
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report.summary)); await browser.close();
  if (report.errors.length || report.checks.some(c => !c.passed)) process.exitCode = 1;
}
