/** QA probe: which knockables are awake / displaced, idle and after teleporting the van next to signal-3. */
import { CHROME, loadPlaywright, openWorld } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4334';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const { page, context } = await openWorld(browser, base + '/world/?qa=1', { width: 960, height: 540 });
const dump = () => page.evaluate(() => window.__worldDistricts.knockables().filter(k => !k.sleeping || k.knocked || k.displacement > .02).map(k => ({ id: k.id, s: k.sleeping, ph: k.phase, d: +k.displacement.toFixed(3), lock: k.lockedForPeople, p: k.position.map(v => +v.toFixed(2)) })));
await page.waitForTimeout(1500); console.log('idle', JSON.stringify(await dump()));
const fu = await page.evaluate(() => window.__worldDebug.layout().furniture);
console.log(JSON.stringify(fu.map(f => [f.id, f.start.map(v => +v.toFixed(2)), +f.yaw.toFixed(2)])));
for (const f of fu) {
  await page.evaluate(f => window.__worldDebug.teleportVehicle('van', [f.start[0], f.start[1] + 1.46, f.start[2]], f.yaw), f);
  await page.waitForTimeout(1200); console.log('van at', f.id, JSON.stringify(await dump()));
}
await context.close(); await browser.close();
