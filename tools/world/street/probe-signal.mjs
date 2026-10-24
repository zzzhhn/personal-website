/** Probe: drive-route furniture lamp-6 then signal-3 (same starts, van ~5 m/s, real keys), logging the van
 * and the knockables near the path every sample, to find the source of the signal-3 launch. */
import { writeFile } from 'node:fs/promises';
import { Bot, CHROME, loadPlaywright, openWorld } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4334';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const { page, context } = await openWorld(browser, base + '/world/?qa=1', { width: 960, height: 540 });
const bot = new Bot(page); const log = [];
const fu = await page.evaluate(() => window.__worldDebug.layout().furniture);
for (const id of ['lamp-6']) {
  const f = fu.find(x => x.id === id);
  await bot.release(); await page.evaluate(() => window.__worldDebug.exit());
  for (const [i, v] of ['offroad', 'coupe', 'van'].entries()) await page.evaluate(({ v, i }) => window.__worldDebug.teleportVehicle(v, [90 + i * 8, 7, 125], 0), { v, i });
  await page.evaluate(f => window.__worldDebug.teleportVehicle('van', [f.start[0], f.start[1] + 1.452, f.start[2]], f.yaw), f);
  const after = [];
  for (let i = 0; i < 12; i++) { after.push(await page.evaluate(() => { const v = window.__worldDebug.snapshot().vehicles.find(v => v.id === 'van'); return [v.position.map(x => +x.toFixed(2)), v.velocity.map(x => +x.toFixed(2))]; })); await page.waitForTimeout(30); }
  console.log(id, 'after teleport', JSON.stringify(after.filter((_, i) => i % 3 === 0)));
  await bot.fixtureTeleport([f.start[0] - Math.sin(f.yaw) * 2.5, f.start[1] + 1, f.start[2] - Math.cos(f.yaw) * 2.5], 'van start'); await page.waitForTimeout(600); await bot.press('KeyE'); await page.waitForTimeout(150);
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const r = await page.evaluate(() => { const s = window.__worldDebug.snapshot(), v = s.vehicles.find(v => v.id === 'van'); return { v: v.position.map(x => +x.toFixed(2)), sp: +Math.hypot(v.velocity[0], v.velocity[1], v.velocity[2]).toFixed(2),
      k: window.__worldDistricts.knockables().filter(k => ['lamp-6', 'signal-3', 'signal-2'].includes(k.id)).map(k => [k.id, k.phase, k.sleeping, k.lockedForPeople, k.position.map(x => +x.toFixed(2)), k.debris]), c: window.__worldDebug.contacts().map(c => c.other.kind + ':' + c.other.name).filter(x => !x.startsWith('surface')) }; });
    log.push({ id, t: Date.now() - t0, ...r });
    if (Math.hypot(r.v[0] - f.start[0], r.v[2] - f.start[2]) > 18) break;
    await bot.hold(r.sp < 5 ? ['KeyW'] : []); await page.waitForTimeout(40);
  }
  await bot.hold(['Space']); await page.waitForTimeout(1200); await bot.release();
}
await writeFile('/Users/bobby/Desktop/3D-personal-world/evidence/street/probe-signal.json', JSON.stringify(log));
for (const r of log.filter((_, i) => i % 6 === 0)) console.log(JSON.stringify([r.t, r.v, r.sp, r.k.find(k => k[0] === 'lamp-6'), r.c]));
await context.close(); await browser.close();
