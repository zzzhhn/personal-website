/** Controls & camera acceptance (v3 controls round). Every input is a real Playwright keyboard event,
 * real mouse drag or real wheel event; window.__worldDebug (?qa=1) is read for observation only.
 * Start positions use logged fixture teleports. Checks:
 *  (a) after a mouse-drag camera rotation, W walks toward the new camera forward, and the heading is not
 *      a 45 deg multiple of the world axes; switching W -> W+D sweeps through intermediate headings;
 *  (b) vehicle steering angle rises continuously with key-hold time and recentres after release;
 *  (c) wheel zoom reaches ~2.5 m and ~30 m; V cycles near/mid/far/first person;
 *  (d) the camera never goes below the walkable ground (pitch dragged to its lowest limit, ramp + wall).
 * Usage: node tools/world/playtest/controls-camera.mjs [BASE] [OUTDIR] */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, loadPlaywright, CHROME, startCanvasRecording, stopCanvasRecording } from './lib.mjs';
const base = process.argv[2] || process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const out = path.resolve(process.argv[3] || 'docs/world/quality-v3/controls');
await mkdir(out, { recursive: true });
const report = { base, startedAt: new Date().toISOString(), checks: [], cases: {}, errors: [], limits: [
  'Headless Chrome (Metal ANGLE) on M5 Pro. Gamepad API is wired but no physical pad is attached in headless runs; only keyboard/mouse are exercised.',
  'Pointer-lock look is not exercised (headless Chrome does not grant pointer lock); drag look uses the same code path for yaw/pitch.'] };
const check = (name, passed, evidence) => { report.checks.push({ name, passed: !!passed, evidence }); console.log((passed ? 'PASS ' : 'FAIL ') + name); };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.routeWebSocket('**/*', ws => ws.close());
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[vite]')) report.errors.push(m.text()); });
const bot = new Bot(page);
const cam = () => page.evaluate(() => __worldDebug.camera());
const snap = () => page.evaluate(() => ({ s: __worldDebug.snapshot(), c: __worldDebug.camera() }));
const deg = r => r * 180 / Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
async function drag(dx, dy, steps = 12) {
  await page.mouse.move(800, 450); await page.mouse.down();
  await page.mouse.move(800 + dx, 450 + dy, { steps }); await page.mouse.up(); await page.waitForTimeout(150);
}
async function wheel(deltaY, n, gap = 40) { await page.mouse.move(800, 450); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, deltaY); await page.waitForTimeout(gap); } }
try {
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await startCanvasRecording(page, 30);

  // ---------- (a) camera-relative walking at an arbitrary angle
  await bot.fixtureTeleport([-42, 5.68, 39], 'open camp ground, walking direction test');
  await page.waitForTimeout(500);
  const a = { steps: [] };
  const c0 = await cam();
  await drag(137, 0);                                  // arbitrary drag -> arbitrary yaw change
  const c1 = await cam();
  a.yawChange_deg = deg(wrap(c1.yaw - c0.yaw));
  const p0 = (await snap()).s.player;
  await bot.hold(['KeyW']); await page.waitForTimeout(1600);
  const mid = await snap();
  await page.waitForTimeout(400); const p1 = (await snap()).s.player; await bot.release(); await page.waitForTimeout(400);
  const move = [p1[0] - p0[0], p1[2] - p0[2]], moveHeading = Math.atan2(move[1], move[0]);
  const camHeading = Math.atan2(c1.forwardGround[1], c1.forwardGround[0]);
  const off45 = h => { const d = Math.abs(wrap(h)) % (Math.PI / 4); return deg(Math.min(d, Math.PI / 4 - d)); };
  Object.assign(a, { cameraBefore: c0, cameraAfter: c1, start: p0, end: p1, displacement_m: Math.hypot(...move),
    moveHeading_deg: deg(moveHeading), cameraForwardHeading_deg: deg(camHeading), errorToCameraForward_deg: deg(wrap(moveHeading - camHeading)),
    distanceFromNearest45Multiple_deg: off45(moveHeading), velocityMid: mid.s.playerVelocity });
  check('(a) W walks toward the rotated camera forward (<= 6 deg)', Math.hypot(...move) > 3 && Math.abs(a.errorToCameraForward_deg) <= 6, a);
  check('(a) walking heading is not a 45 deg multiple (>= 5 deg off)', a.distanceFromNearest45Multiple_deg >= 5, a.distanceFromNearest45Multiple_deg);
  // second arbitrary angle (drag the other way, smaller) to show it is not a single lucky angle
  await bot.fixtureTeleport([-42, 5.68, 39], 'second angle start (same open ground)'); await page.waitForTimeout(400);
  await drag(-61, 0); const c2 = await cam(); const q0 = (await snap()).s.player;
  await bot.hold(['KeyW']); await page.waitForTimeout(1500); const q1 = (await snap()).s.player; await bot.release(); await page.waitForTimeout(400);
  const h2 = Math.atan2(q1[2] - q0[2], q1[0] - q0[0]), ch2 = Math.atan2(c2.forwardGround[1], c2.forwardGround[0]);
  a.second = { yaw_deg: deg(c2.yaw), moveHeading_deg: deg(h2), cameraForwardHeading_deg: deg(ch2), error_deg: deg(wrap(h2 - ch2)), off45_deg: off45(h2) };
  check('(a) second drag angle also followed (<= 6 deg)', Math.abs(a.second.error_deg) <= 6, a.second);
  // smoothing: W then W+D; sample velocity heading every animation frame for 0.5 s
  await bot.fixtureTeleport([-42, 5.68, 39], 'smoothing test start'); await page.waitForTimeout(400);
  await bot.hold(['KeyW']); await page.waitForTimeout(900);
  await page.evaluate(() => { window.__hd = []; const t0 = performance.now(); const f = () => { const v = __worldDebug.snapshot().playerVelocity; window.__hd.push([performance.now() - t0, Math.atan2(v[2], v[0]), Math.hypot(v[0], v[2])]); if (performance.now() - t0 < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await bot.hold(['KeyW', 'KeyD']); await page.waitForTimeout(700); await bot.release();
  const hd = await page.evaluate(() => window.__hd);
  const h0 = hd[0][1], hN = hd.at(-1)[1], total = wrap(hN - h0);
  const inter = hd.filter(r => r[2] > 1 && Math.abs(wrap(r[1] - h0)) > deg2(5) && Math.abs(wrap(r[1] - hN)) > deg2(5)).length;
  function deg2(d) { return d * Math.PI / 180; }
  a.smoothing = { frames: hd.length, totalTurn_deg: deg(total), intermediateFrames: inter, headings_deg: hd.map(r => [+r[0].toFixed(0), +deg(r[1]).toFixed(1), +r[2].toFixed(2)]) };
  check('(a) W -> W+D sweeps through intermediate headings (>= 3 frames strictly between)', Math.abs(Math.abs(deg(total)) - 45) < 8 && inter >= 3, { totalTurn_deg: a.smoothing.totalTurn_deg, intermediateFrames: inter });
  report.cases.walking = a;
  await page.screenshot({ path: path.join(out, 'a-walk-rotated-camera.png') });

  // ---------- (b) continuous vehicle steering
  await page.evaluate(() => __worldDebug.teleportVehicle('offroad', [-29, 5.85, 34], 0));
  await bot.fixtureTeleport([-29, 5.8, 36.5], 'beside offroad on the camp road');
  await page.waitForTimeout(500); await bot.press('KeyE'); await page.waitForTimeout(400);
  const b = { entered: (await snap()).s.activeVehicle };
  await page.evaluate(() => { window.__st = []; window.__strun = true; const t0 = performance.now(); const f = () => { const v = __worldDebug.snapshot().vehicles.find(v => v.id === 'offroad'); window.__st.push([performance.now() - t0, v.steering, v.steerInput, v.throttleInput, Math.hypot(v.velocity[0], v.velocity[2])]); if (window.__strun) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.waitForTimeout(300);
  await bot.hold(['KeyA']); await page.waitForTimeout(700); await bot.release(); await page.waitForTimeout(600);
  await bot.hold(['KeyW']); await page.waitForTimeout(1500);
  await bot.hold(['KeyW', 'KeyD']); await page.waitForTimeout(800); await bot.hold(['KeyW']); await page.waitForTimeout(500);
  await bot.hold(['Space']); await page.waitForTimeout(900); await bot.release();
  const st = await page.evaluate(() => { window.__strun = false; return window.__st; });
  const pressA = st.filter(r => r[0] >= 300 && r[0] <= 1000);
  const levels = [...new Set(pressA.map(r => +r[1].toFixed(3)))];
  const at = ms => st.reduce((best, r) => Math.abs(r[0] - ms) < Math.abs(best[0] - ms) ? r : best, st[0]);
  b.steeringAt_ms = [300, 400, 500, 600, 700, 800, 1000, 1300, 1600].map(t => ({ t, steering: +at(t)[1].toFixed(4), steerInput: +at(t)[2].toFixed(3) }));
  b.distinctSteeringLevelsWhileHeld = levels.length;
  const monotone = pressA.every((r, i) => i === 0 || r[1] >= pressA[i - 1][1] - 1e-4);
  b.monotoneWhileHeld = monotone;
  const peak = Math.max(...st.filter(r => r[0] < 1000).map(r => r[1]));
  const afterRelease = at(1600)[1];
  // speed-dependent max angle: steering at full input while moving vs standing
  const moving = st.filter(r => r[4] > 6 && r[2] < -.99);
  b.fullLockStanding_rad = +peak.toFixed(4); b.fullLockMoving_rad = moving.length ? +Math.min(...moving.map(r => r[1])).toFixed(4) : null;
  b.speedDuringMovingLock_mps = moving.length ? +Math.max(...moving.map(r => r[4])).toFixed(2) : null;
  b.samples = st.map(r => r.map(x => +x.toFixed(4)));
  check('(b) steering rises continuously while A is held (>= 8 distinct levels, monotone)', b.entered === 'offroad' && levels.length >= 8 && monotone, { levels: levels.length, monotone, steeringAt_ms: b.steeringAt_ms });
  check('(b) steering at 100 ms of hold is < 40 % of the angle at 600 ms', at(400)[1] < .4 * at(900)[1], { at400: at(400)[1], at900: at(900)[1] });
  check('(b) steering recentres after release (< 5 % of peak 600 ms later)', Math.abs(afterRelease) < .05 * peak, { peak, afterRelease });
  check('(b) moving full lock is smaller than standing full lock', b.fullLockMoving_rad !== null && Math.abs(b.fullLockMoving_rad) < peak * .95, { standing: peak, moving: b.fullLockMoving_rad, speed: b.speedDuringMovingLock_mps });
  // drive camera recentres behind the car after a manual look (isolated QA lane so the car keeps moving)
  await page.evaluate(() => __worldDebug.collisionLane('post', 8)); await page.waitForTimeout(300);
  report.fixtures_extra = [{ type: 'vehicle', id: 'offroad', p: [70, 6.6, 120], reason: 'QA lane: drive camera recentre needs a moving car' }];
  await page.evaluate(() => __worldDebug.teleportVehicle('offroad', [70, 6.6, 120], 0)); await page.waitForTimeout(600);
  await bot.hold(['KeyW']); await page.waitForTimeout(1500);
  await drag(260, 0); const lookAway = await cam();
  await page.waitForTimeout(3500); const back = await cam(); await bot.hold(['Space']); await page.waitForTimeout(900); await bot.release();
  const carYaw = await page.evaluate(() => __worldDebug.motionProbe().vehicles.find(v => v.id === 'offroad').yaw);
  const behind = wrap(-carYaw + Math.PI);
  const carV = await page.evaluate(() => { const v = __worldDebug.snapshot().vehicles.find(v => v.id === 'offroad').velocity; return Math.hypot(v[0], v[2]); });
  b.recentre = { afterDrag_offBehind_deg: deg(wrap(lookAway.yaw - behind)), after3500ms_offBehind_deg: deg(wrap(back.yaw - behind)), fovMoving: back.fov, distanceMoving: back.actualDistance, speedAtCheck_mps: carV, fovStanding: lookAway.fov };
  check('(b) chase view widens with speed (FOV > 55, distance > preset)', back.fov > 56 && back.actualDistance > back.distance, { fov: back.fov, actual: back.actualDistance, preset: back.distance, speed: carV });
  check('(b) drive camera eases back behind the car after manual look', Math.abs(b.recentre.afterDrag_offBehind_deg) > 30 && Math.abs(b.recentre.after3500ms_offBehind_deg) < 12, b.recentre);
  report.cases.steering = b;
  await page.screenshot({ path: path.join(out, 'b-drive-chase.png') });
  // driving distance: automatic chase stays <= 30 m at speed; manual scroll in the car honours 2.5-30 m
  const dd = {};
  await wheel(120, 40); await bot.hold(['KeyW']); await page.waitForTimeout(1800); dd.autoMaxAtSpeed = await cam();
  await wheel(-120, 50); await page.waitForTimeout(900); dd.manualMinAtSpeed = await cam();
  await bot.hold(['Space']); await page.waitForTimeout(1200); await bot.release(); dd.manualMinStopped = await cam();
  dd.speedAtMax_mps = await page.evaluate(() => { const v = __worldDebug.snapshot().vehicles.find(v => v.id === 'offroad').velocity; return Math.hypot(v[0], v[2]); });
  b.driveDistance = Object.fromEntries(Object.entries(dd).map(([k, v]) => [k, typeof v === 'object' ? { distance: v.distance, desired: v.desiredDistance, actual: v.actualDistance, manual: v.driveManualZoom, collided: v.collided } : v]));
  check('(b) driving: zoomed-out chase capped at 30 m at speed', dd.autoMaxAtSpeed.desiredDistance <= 30.001 && dd.autoMaxAtSpeed.actualDistance <= 30.001 && dd.autoMaxAtSpeed.distance >= 29.5, b.driveDistance);
  check('(b) driving: manual scroll in the car reaches 2.5 m (no 7 m floor)', dd.manualMinStopped.desiredDistance <= 2.6 && dd.manualMinStopped.driveManualZoom === true, b.driveDistance);
  await wheel(120, 12);
  await bot.press('KeyE'); await page.waitForTimeout(500);
  await page.evaluate(() => __worldDebug.collisionLane(null)); await page.waitForTimeout(300);

  // ---------- (c) zoom range and V cycle
  await bot.fixtureTeleport([-42, 5.68, 39], 'zoom/V test start'); await page.waitForTimeout(500);
  const c = {};
  await wheel(120, 30); await page.waitForTimeout(900); c.zoomedOut = await cam();
  await page.screenshot({ path: path.join(out, 'c-zoom-far-30m.png') });
  await wheel(-120, 40); await page.waitForTimeout(900); c.zoomedIn = await cam();
  await page.screenshot({ path: path.join(out, 'c-zoom-near-2_5m.png') });
  const trace = [];
  await wheel(120, 3, 120); trace.push((await cam()).distance); await wheel(120, 3, 120); trace.push((await cam()).distance);
  c.continuousSteps_m = trace;
  check('(c) scroll zoom reaches <= 2.6 m and >= 29.5 m', c.zoomedIn.distance <= 2.6 && c.zoomedOut.distance >= 29.5, { min: c.zoomedIn.distance, max: c.zoomedOut.distance, actualAtMax: c.zoomedOut.actualDistance });
  check('(c) scroll zoom is continuous (3 notches change distance by < 50 %)', trace[0] > c.zoomedIn.distance && trace[0] < c.zoomedIn.distance * 1.5 && trace[1] > trace[0], trace);
  c.cycle = [];
  for (let i = 0; i < 5; i++) { await bot.press('KeyV'); await page.waitForTimeout(700); const k = await cam(); c.cycle.push({ preset: k.preset, firstPerson: k.firstPerson, distance: k.distance, actual: k.actualDistance, fov: k.fov });
    await page.screenshot({ path: path.join(out, `c-v-${i}-preset${k.preset}.png`) }); }
  const seq = c.cycle.map(x => x.preset);
  check('(c) V cycles through near, mid, far, first person and back', seq.join(',') === '2,3,0,1,2' || new Set(seq).size === 4 && c.cycle.some(x => x.firstPerson), c.cycle);
  // first person + W still walks toward view
  while ((await cam()).preset !== 3) { await bot.press('KeyV'); await page.waitForTimeout(400); }
  const f0 = await snap(); await bot.hold(['KeyW']); await page.waitForTimeout(1200); const f1 = await snap(); await bot.release();
  const fh = Math.atan2(f1.s.player[2] - f0.s.player[2], f1.s.player[0] - f0.s.player[0]), fc = Math.atan2(f0.c.forwardGround[1], f0.c.forwardGround[0]);
  c.firstPersonWalk = { error_deg: deg(wrap(fh - fc)), guideVisible: (await page.evaluate(() => __worldDebug.actor().visible)) };
  check('(c) first person: W walks along the view, body hidden', Math.abs(c.firstPersonWalk.error_deg) < 8 && c.firstPersonWalk.guideVisible === false, c.firstPersonWalk);
  while ((await cam()).preset !== 1) { await bot.press('KeyV'); await page.waitForTimeout(400); }
  report.cases.zoom = c;

  // ---------- (d) camera never below ground / inside walls
  const d = { samples: [] };
  const sample = async label => { const k = await cam(); d.samples.push({ label, ...k }); return k; };
  await bot.fixtureTeleport([-14, 5.2, 32.46], 'road ramp, lowest-pitch ground test'); await page.waitForTimeout(500);
  await wheel(120, 12); await page.waitForTimeout(400);
  await drag(0, -600); await sample('ramp pitch at lower limit');
  for (const dx of [200, 200, 200, 200, 200, 200]) { await drag(dx, 0); await page.waitForTimeout(250); await sample('ramp orbit ' + dx); }
  await bot.hold(['KeyW']); for (let i = 0; i < 12; i++) { await page.waitForTimeout(150); await sample('ramp walking low pitch'); } await bot.release();
  // terrain bank: orbit low on the camp slope edge
  await bot.fixtureTeleport([-42, 5.68, 47], 'camp edge near slope'); await page.waitForTimeout(500);
  for (const dx of [250, 250, 250, 250, 250]) { await drag(dx, 0); await page.waitForTimeout(250); await sample('camp edge orbit'); }
  // wall: stand beside the big tent and swing the camera behind it
  await bot.fixtureTeleport([-42, 5.68, 15.6], 'beside large tent wall'); await page.waitForTimeout(500);
  await drag(0, 250); await wheel(120, 6);
  for (const dx of [150, 150, 150, 150, 150, 150, 150, 150]) { await drag(dx, 0); await page.waitForTimeout(250); await sample('tent orbit'); }
  const below = d.samples.filter(s => s.clearanceAboveGround !== null && s.clearanceAboveGround < 0.25);
  d.minClearance_m = Math.min(...d.samples.filter(s => s.clearanceAboveGround !== null).map(s => s.clearanceAboveGround));
  d.collidedSamples = d.samples.filter(s => s.collided).length;
  d.pitchMin = Math.min(...d.samples.map(s => s.pitch));
  check('(d) camera stays above walkable ground in every sample (>= 0.25 m)', below.length === 0 && d.samples.length > 30, { samples: d.samples.length, minClearance_m: d.minClearance_m, pitchMin: d.pitchMin });
  check('(d) camera collision pulls in when an obstacle is behind', d.collidedSamples > 0, { collidedSamples: d.collidedSamples });
  d.overlapSamples = d.samples.filter(s => s.nearPlaneOverlaps.length).length;
  check('(d) third-person camera never overlaps solids', d.overlapSamples === 0, { overlapSamples: d.overlapSamples, examples: d.samples.filter(s => s.nearPlaneOverlaps.length).slice(0, 3).map(s => s.nearPlaneOverlaps) });
  // occluder visibility: from the camera to the pivot no static solid remains between them
  d.lineOfSight = await page.evaluate(() => { const k = __worldDebug.camera(); return { position: k.position, target: k.target, actual: k.actualDistance, hit: k.hitDistance }; });
  report.cases.ground = d;
  // (e) first person against a wall: walk into the tent wall and look along / into it; the eye must not overlap solids
  const e = { samples: [] };
  await bot.fixtureTeleport([-42, 5.68, 15.6], 'beside large tent wall, first-person near-wall test'); await page.waitForTimeout(500);
  while ((await cam()).preset !== 3) { await bot.press('KeyV'); await page.waitForTimeout(400); }
  for (let turn = 0; turn < 8; turn++) {
    await bot.hold(['KeyW']); await page.waitForTimeout(700);
    for (const dy of [0, -120, 160]) { await drag(0, dy, 6); const k = await cam(); e.samples.push({ turn, dy, collided: k.collided, hitDistance: k.hitDistance, overlaps: k.nearPlaneOverlaps, position: k.position, pitch: k.pitch }); }
    await bot.release(); await drag(120, 0, 6);
  }
  e.collidedSamples = e.samples.filter(x => x.collided).length;
  e.overlapSamples = e.samples.filter(x => x.overlaps.length).length;
  check('(e) first person at a wall: eye/near plane never overlaps solids', e.samples.length >= 20 && e.overlapSamples === 0, { samples: e.samples.length, overlapSamples: e.overlapSamples, collidedSamples: e.collidedSamples });
  // drive first person beside the same wall
  await page.evaluate(() => __worldDebug.teleportVehicle('offroad', [-29, 5.85, 34], 0));
  await bot.fixtureTeleport([-29, 5.8, 36.5], 'beside offroad, first-person drive'); await page.waitForTimeout(400); await bot.press('KeyE'); await page.waitForTimeout(500);
  for (let i = 0; i < 8; i++) { await drag(150, 0, 6); const k = await cam(); e.samples.push({ drive: true, collided: k.collided, overlaps: k.nearPlaneOverlaps, position: k.position }); }
  e.driveOverlapSamples = e.samples.filter(x => x.drive && x.overlaps.length).length;
  check('(e) first person in a car: eye never overlaps static solids', e.driveOverlapSamples === 0, { driveOverlapSamples: e.driveOverlapSamples });
  await bot.press('KeyE'); await page.waitForTimeout(400);
  while ((await cam()).preset !== 1) { await bot.press('KeyV'); await page.waitForTimeout(400); }
  report.cases.firstPersonWall = e;
  await page.screenshot({ path: path.join(out, 'd-tent-orbit.png') });
  await stopCanvasRecording(page, path.join(out, 'controls-camera.webm'));
} catch (e) { report.errors.push(e.stack || String(e)); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
finally {
  await bot.release().catch(() => {}); report.fixtures = bot.fixtureCalls; report.events = bot.events; report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.checks.filter(c => c.passed).length, total: report.checks.length, failed: report.checks.filter(c => !c.passed).map(c => c.name), errors: report.errors };
  await writeFile(path.join(out, 'controls-camera.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.summary, null, 1)); await browser.close();
  if (report.errors.length || report.summary.failed.length) process.exitCode = 1;
}
