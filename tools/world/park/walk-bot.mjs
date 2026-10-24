/** Park walk + collision bot (real keys only for movement; every teleport is a logged fixture).
 * 1. From the plaza, walk the boardwalk centreline and into all six huts (opening -> inside -> out).
 * 2. Inside each hut, walk at the back wall: must be blocked (no pass-through).
 * 3. Walk sideways into a rail section: it must be pushed / knocked, not an air wall; record its state.
 * 4. Van: fixture-place it facing a rail, enter with E, hold W 1.6 s: rail must be knocked, van must not
 *    launch. Usage via bot-run.sh: walk-bot.mjs */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld, Bot } from '../playtest/lib.mjs';
const out = process.env.WORLD_PLAYTEST_DIR;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { started: new Date().toISOString(), huts: [], walls: [], rail: null, lamp: null, van: null, errors: [] };
const shot = (page, n) => page.screenshot({ path: path.join(out, n + '.png') });
try {
  const { page, errors } = await openWorld(browser, `${process.env.WORLD_BASE_URL}/world/?qa=1`, { width: 1600, height: 900 });
  await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
  await page.waitForFunction(() => window.__parkWalk?.huts, undefined, { timeout: 30000 });
  const park = await page.evaluate(() => window.__parkWalk);
  const bot = new Bot(page);
  await page.evaluate(() => window.__worldDebug.set({ zoom: 1 }));
  await bot.fixtureTeleport([48, 2.3, -45], 'start on plaza');
  // Boardwalk centreline
  const wp = [[52, -44.8], [64, -40], [69, -22], [56.5, -7.5]];
  const r1 = await bot.walk(wp, { run: true, timeout: 30 });
  report.boardwalk = r1.legs.map(l => ({ target: l.target, reached: l.reached, recoveries: l.recoveries, minY: Math.min(...r1.trace.map(t => t.p[1])) }));
  await shot(page, 'walk-end');
  for (const h of park.huts) {
    await bot.fixtureTeleport([h.spurEnd[0], 2.3, h.spurEnd[2]], `boardwalk edge at ${h.id} spur`);
    const r = await bot.walk([[h.opening[0], h.opening[2]], [h.inside[0], h.inside[2]]], { timeout: 15 });
    const fb = await bot.feedback();
    const row = { id: h.id, reachedOpening: r.legs[0]?.reached ?? false, reachedInside: r.legs[1]?.reached ?? false, inside: fb.player, grounded: fb.grounded };
    await shot(page, `hut-${h.id}`);
    // back wall: target a point 0.6 m behind the outer back face
    const w = await bot.walk([[h.backOutside[0], h.backOutside[2]]], { timeout: 4, stopOnBlocked: true });
    const p = (await bot.feedback()).player;
    const behind = ((p[0] - h.inside[0]) * -h.front[0] + (p[2] - h.inside[2]) * -h.front[1]);
    row.backWall = { blocked: !w.legs[0].reached, travelledBack_m: +behind.toFixed(2), limit_m: 1.55, pass: !w.legs[0].reached && behind < 1.55 };
    report.huts.push(row);
  }
  // Rail: stand 1.6 m inside a rail on segment 1 and run straight through it (real keys).
  const knock = () => page.evaluate(() => window.__parkKnock());
  const rail = park.railList.find(r => r.id.startsWith('rail-1-')) ?? park.railList[5];
  const nrm = [Math.cos(rail.yaw), -Math.sin(rail.yaw)]; // local +X of the section (across the walk)
  const toCentre = Math.sign((66.5 - rail.position[0]) * nrm[0] + (-31 - rail.position[2]) * nrm[1]) || 1;
  const start = [rail.position[0] + nrm[0] * 1.6 * toCentre, rail.position[2] + nrm[1] * 1.6 * toCentre];
  const beyond = [rail.position[0] - nrm[0] * 0.9 * toCentre, rail.position[2] - nrm[1] * 0.9 * toCentre];
  await bot.fixtureTeleport([start[0], 2.3, start[1]], 'inside rail ' + rail.id);
  await bot.walk([beyond], { run: true, timeout: 2.5, maxRecoveries: 0 });
  await page.waitForTimeout(1500);
  const after = (await knock()).find(k => k.id === rail.id);
  report.rail = { id: rail.id, home: rail.position, after, player: (await bot.feedback()).player };
  await shot(page, 'rail-push');
  // Van: start beside its own bay on the plaza (fixture: player only), E, drive east with real keys. The
  // van faces +X while boardwalk segment 0 runs 22 deg south of east, so it drifts into the north rail.
  const k0 = await knock();
  const vs = (await bot.feedback()).vehicles.find(v => v.id === 'van');
  await bot.fixtureTeleport([vs.position[0] - 1.0, 2.3, vs.position[2] + 2.2], 'beside the parked van');
  await page.waitForTimeout(500);
  await bot.press('KeyE'); await page.waitForTimeout(800);
  const inVan = (await bot.feedback()).activeVehicle;
  const track = [];
  await bot.hold(['KeyW']);
  for (let i = 0; i < 26; i++) { await page.waitForTimeout(100); const f = await bot.feedback(); const v = f.vehicles.find(x => x.id === 'van'); track.push({ p: v.position.map(x => +x.toFixed(2)), vy: +v.velocity[1].toFixed(2), speed: +Math.hypot(v.velocity[0], v.velocity[2]).toFixed(2) }); }
  await bot.release(); await bot.hold(['Space']); await page.waitForTimeout(1500); await bot.release();
  const k1 = await knock();
  const moved = k1.filter(k => { const o = k0.find(x => x.id === k.id); return k.knocked && !o?.knocked; }).map(k => ({ id: k.id, position: k.position?.map(x => +x.toFixed(2)) }));
  const vEnd = (await bot.feedback()).vehicles.find(v => v.id === 'van');
  report.van = { inVan, knockedByVan: moved, maxUpwardVel: Math.max(...track.map(t => t.vy)), maxY: Math.max(...track.map(t => t.p[1])), end: vEnd.position, track };
  await shot(page, 'van-rail');
  await bot.press('KeyE'); await page.waitForTimeout(500);
  report.errors = errors.filter(e => !e.includes('changed size between renders'));
} catch (e) { report.fatal = String(e.stack || e); }
finally {
  await browser.close();
  await writeFile(path.join(out, 'walk-bot.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ boardwalk: report.boardwalk, huts: report.huts.map(h => [h.id, h.reachedOpening, h.reachedInside, h.backWall?.pass, h.backWall?.travelledBack_m]), rail: report.rail?.after, van: report.van && { ...report.van, track: undefined }, fatal: report.fatal, errors: report.errors?.slice(0, 3) }));
}
