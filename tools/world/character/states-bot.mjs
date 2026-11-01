/** G24 v3d states, real keys + logged fixtures. Sequence: idle (wait for the look-around), 90/180 turns at
 * rest, use an actual registered camp-bench anchor and real E to sit / stand, approach the live offroad
 * and E (enter), drive off briefly, E (exit). Vehicle state is identified by veh/fade, not clip names.
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
  // The integrated camp now has real seat registrations: use their actual approach point and E.
  const anchor = await page.evaluate(() => {
    const p = __worldDebug.snapshot().player;
    return __worldInteract.list().filter(i => i.id.startsWith('camp-bench-')).sort((a, b) => Math.hypot(a.position[0] - p[0], a.position[2] - p[2]) - Math.hypot(b.position[0] - p[0], b.position[2] - p[2]))[0];
  });
  if (!anchor) throw new Error('No real camp bench registered');
  await bot.fixtureTeleport([anchor.position[0], anchor.position[1] + .9, anchor.position[2]], `approach real bench ${anchor.id}`);
  await page.waitForTimeout(900); await bot.press('KeyE'); await page.waitForTimeout(250);
  const seat = await page.evaluate(() => __worldDebug.state().seat);
  if (!seat) throw new Error('E did not sit on the real camp bench');
  report.seat = seat;
  await phase('sit', [], 2600, null, 2300);
  for (let i = 0; i < 12; i++) { await bot.wheel(-240); await page.waitForTimeout(40); } await page.waitForTimeout(700); await snap('sit-near'); for (let i = 0; i < 12; i++) { await bot.wheel(240); await page.waitForTimeout(40); }
  await phase('stand-up', [], 120, 'KeyE'); await phase('stand-up-hold', [], 1600, null, 300);
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
