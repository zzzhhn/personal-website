/** G24 v3d states, real keys + logged fixtures. Sequence: idle (wait for the look-around), 90/180 turns at
 * rest, sit on a camp log bench (store.seat set as a logged fixture: no seat interactable exists in this
 * worktree yet), stand up with W, walk to the offroad and E (enter), drive off briefly, E (exit).
 * Screenshots on the NORMAL entry are a separate pass (guide-look.mjs); this tab uses ?qa=1 for numbers. */
import { mkdir, writeFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
import { summarize } from './motion-metrics.mjs';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/g24-states'; await mkdir(out, { recursive: true });
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4336', tag = process.env.G24_TAG || 'states', shots = process.env.G24_SHOTS === '1';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { tag, errors: [], fixtures: [], phases: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  const bot = new Bot(page);
  await page.evaluate(() => __worldDebug.set({ zoom: 0 }));
  let n = 0;
  const snap = async label => { if (shots) await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${label}.png` }); };
  const phase = async (label, keys, ms, press, shotAt) => { await bot.hold(keys); if (press) await bot.press(press); report.phases.push({ label, t: bot.now(), active: await page.evaluate(() => __worldDebug.snapshot().activeVehicle), nearby: await page.evaluate(() => __worldDebug.state().nearbyVehicle) });
    if (shotAt !== undefined) { await page.waitForTimeout(shotAt); await snap(label); await page.waitForTimeout(Math.max(0, ms - shotAt)); } else await page.waitForTimeout(ms); };
  // camp log bench C06 (x -36.4.. per layout): use the bench closest to the spawn via the scene
  const bench = await page.evaluate(() => { const p = __worldDebug.snapshot().player; return p; });
  await page.waitForTimeout(800);
  await page.evaluate(() => __worldDebug.actor('record:start', 30000));
  await phase('idle-wait', [], 9500, null, 7000);
  const E = comboFor(1, 0).keys, W_ = comboFor(-1, 0).keys;
  await phase('turn90', E, 250); await phase('turn90-settle', [], 900, null, 250);
  await phase('turn180', W_, 300); await phase('turn180-settle', [], 1000, null, 300);
  // seat: 1.6 m in front of the player, top 0.6 m (C06 log bench height), yaw = current facing + pi
  // seat on the nearest real camp log bench C06: its collider top centre (physicsInventory aabb), facing the fire
  const seat = await page.evaluate(() => {
    const p = __worldDebug.snapshot().player;
    const b = __worldDebug.physicsInventory().filter(c => c.assetId === 'C06').map(c => ({ c, d: Math.hypot((c.aabb[0][0] + c.aabb[1][0]) / 2 - p[0], (c.aabb[0][2] + c.aabb[1][2]) / 2 - p[2]) })).sort((a, b) => a.d - b.d)[0].c;
    const cx = (b.aabb[0][0] + b.aabb[1][0]) / 2, cz = (b.aabb[0][2] + b.aabb[1][2]) / 2, top = b.aabb[1][1];
    const fire = [-42, 35]; const yaw = Math.atan2(-(fire[1] - cz), fire[0] - cx);
    return { id: 'qa-seat-C06', position: [cx, top, cz], yaw, aabb: b.aabb };
  });
  report.fixtures.push({ t: bot.now(), kind: 'store.seat', seat, reason: 'no seat interactable on C06 in this worktree yet (camp session); same WorldActors seat path' });
  await bot.fixtureTeleport([seat.position[0] + Math.cos(seat.yaw) * 1.0, seat.position[1] + 0.6, seat.position[2] - Math.sin(seat.yaw) * 1.0], 'in front of the C06 bench, then seat');
  delete seat.aabb;
  await page.evaluate(s => __worldDebug.set({ seat: s }), seat);
  await phase('sit', [], 2600, null, 2300);
  for (let i = 0; i < 12; i++) { await bot.wheel(-240); await page.waitForTimeout(40); } await page.waitForTimeout(700); await snap('sit-near'); for (let i = 0; i < 12; i++) { await bot.wheel(240); await page.waitForTimeout(40); }
  await phase('stand-up', ['KeyW'], 120); await phase('stand-up-hold', [], 1600, null, 300);
  // vehicle: fixture next to the offroad, then real E
  const car = await page.evaluate(() => __worldDebug.snapshot().vehicles.find(v => v.id === 'offroad').position);
  report.car = car;
  await bot.fixtureTeleport([car[0] - 0.5, car[1] + 0.6, car[2] + 2.4], 'beside the offroad (live position), door side (vehicle enter/exit)'); report.fixtures.push({ t: bot.now(), kind: 'teleport' });
  await page.waitForTimeout(900);
  await phase('enter', [], 900, 'KeyE', 280);
  await phase('drive', ['KeyW'], 1200); await phase('brake', ['KeyS'], 900); await phase('stopped', [], 900);
  await phase('exit', [], 1200, 'KeyE', 330); await snap('exit-done');
  await bot.release();
  const frames = await page.evaluate(() => { __worldDebug.actor('record:stop'); return __worldDebug.actor('record:take'); });
  await writeFile(`${out}/frames-${tag}.json`, JSON.stringify(frames));
  report.metrics = summarize(frames);
  report.anims = [...new Set(frames.map(f => f.anim))];
  report.seq = []; for (const f of frames) if (!report.seq.length || report.seq.at(-1)[1] !== f.anim) report.seq.push([+f.t.toFixed(2), f.anim]);
  report.rootJumps = []; for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].root, b = frames[i].root; const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); if (d > .12) report.rootJumps.push({ t: frames[i].t, d: +d.toFixed(3), anim: frames[i].anim }); }
} catch (e) { report.errors.push(String(e?.stack || e)); }
finally { await browser.close(); await writeFile(`${out}/report-${tag}.json`, JSON.stringify(report, null, 1)); const m = report.metrics || {}; console.log(JSON.stringify({ errors: report.errors, seq: report.seq, rootJumps: report.rootJumps, slip: m.slipByAnim, turnSlip: m.turnSlipMax_mm, switchMax: m.poseJumpSwitchMax_mm })); }
