/** Vehicle in the sea: real-key drive off the west beach; records the clear spot (QA observation).
 * Usage: WORLD_BASE_URL=http://127.0.0.1:4322 node tools/world/environment/sea-vehicle.mjs outDir */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.argv[2] || 'docs/world/quality-v3/environment-v4/grass-water');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const { page, errors } = await openWorld(browser, `${base}/world/?qa=1`, { width: 1920, height: 1080 });
const report = { fixtures: [], samples: [] };
await page.evaluate(() => { __worldDebug.teleportVehicle('coupe', [-66, 1.9, -2], Math.PI); __worldDebug.teleportPlayer([-66, 1.95, .6]); });
report.fixtures.push({ vehicle: 'coupe', at: [-66, 1.9, -2], yaw: Math.PI, player: [-66, 1.95, .6] });
await page.waitForTimeout(1500);
await page.keyboard.press('KeyE'); await page.waitForTimeout(600);
await page.keyboard.down('KeyW');
const t0 = Date.now(); let shot = false;
while (Date.now() - t0 < 5000) {
  const s = await page.evaluate(() => ({ v: __worldDebug.snapshot().vehicles.find(v => v.id === 'coupe'), sea: __worldEnv.sea(), active: __worldDebug.snapshot().activeVehicle }));
  report.samples.push({ t: Date.now() - t0, p: s.v.position.map(x => +x.toFixed(2)), sea: s.sea, active: s.active });
  if (!shot && s.sea[0]?.strength > .95) { await page.keyboard.up('KeyW'); await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, 'sea-3-vehicle.png') }); shot = true; break; }
  await page.waitForTimeout(80);
}
await page.keyboard.up('KeyW');
report.passed = shot; report.errors = errors.slice(0, 5);
report.spot = report.samples.at(-1)?.sea?.[0] ?? null;
await writeFile(path.join(out, 'sea-vehicle.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ passed: report.passed, active: report.samples[0]?.active, last: report.samples.at(-1), errors: report.errors }, null, 1));
