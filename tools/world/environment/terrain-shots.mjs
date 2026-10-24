/** Terrain / road look-dev stills (terrain session). 1920x1080, ?qa=1 only for fixture placement
 * (teleport logged per shot) and camera orbit by real mouse drags; rendering is the same as the
 * normal entry (qa only attaches debug hooks). Output: WORLD_PLAYTEST_DIR (bot-run.sh).
 * Env: SHOTS=comma list of names (default all), LIGHTS=dusk,night, JPEG=1 to also write small jpgs. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { CHROME, ensureDir, loadPlaywright, openWorld } from '../playtest/lib.mjs';

const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/Users/bobby/Desktop/3D-personal-world/evidence/terrain/shots');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4331';
// at: player xz; look: world view direction; pitch: orbit pitch (rad, camera above player); zoom preset
// 0 near / 1 mid / 2 far; dist: optional wheel ticks after the preset (+ = out).
const ALL = [
  { name: 'camp-exit', at: [-8, 30.5], look: [1, -.15], pitch: .42, zoom: 1 },
  { name: 'avenue', at: [17.5, 8], look: [.25, -1], pitch: .32, zoom: 1 },
  { name: 'junction-j3', at: [14.5, -36], look: [.6, -.8], pitch: .5, zoom: 2 },
  { name: 'ring-south', at: [-30, 71], look: [1, .1], pitch: .38, zoom: 1 },
  { name: 'north-hill', at: [-40, -62], look: [.35, -1], pitch: .4, zoom: 2 },
  { name: 'south-beach', at: [-30, 84], look: [.2, 1], pitch: .36, zoom: 1 },
  { name: 'west-coast', at: [-96, 4], look: [-1, -.2], pitch: .36, zoom: 1 },
  { name: 'close-curb', at: [15.6, -20], look: [.9, -.45], pitch: .3, zoom: 0 },
  { name: 'close-grass', at: [-70, -10], look: [.3, -1], pitch: .28, zoom: 0 },
  { name: 'close-sand', at: [-60, 79], look: [.1, 1], pitch: .3, zoom: 0 },
];
const pick = (process.env.SHOTS || '').split(',').filter(Boolean);
const shots = pick.length ? ALL.filter(s => pick.includes(s.name)) : ALL;
const lights = (process.env.LIGHTS || 'dusk,night').split(',');
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { base, startedAt: new Date().toISOString(), shots: [] };
try {
  const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: 1920, height: 1080 });
  const canvas = await page.locator('canvas').first().boundingBox();
  const drag = async (dx, dy) => {
    const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 40));
    for (let i = 1; i <= n; i++) await page.mouse.move(cx + dx * i / n, cy + dy * i / n);
    await page.mouse.up();
  };
  const orbit = async (yaw, pitch) => {
    for (let k = 0; k < 3; k++) {
      const c = await page.evaluate(() => __worldDebug.camera());
      let dy = yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dp = pitch - c.pitch;
      if (Math.abs(dy) < .01 && Math.abs(dp) < .01) break;
      await drag(dy / .0055, dp / .0055);
    }
  };
  for (const light of lights) {
    await page.evaluate(l => __worldDebug.set({ light: l }), light);
    for (const s of shots) {
      await page.evaluate(p => __worldDebug.teleportPlayer(p), [s.at[0], 7.5, s.at[1]]);
      await page.evaluate(z => __worldDebug.set({ zoom: z }), s.zoom);
      await page.waitForTimeout(1500);
      await orbit(Math.atan2(-s.look[1], -s.look[0]), s.pitch);
      await page.waitForTimeout(light === 'night' ? 2600 : 1200);
      const file = `${s.name}-${light}.png`;
      await page.screenshot({ path: path.join(out, file) });
      const info = await page.evaluate(() => ({ stats: __worldDebug.stats(), player: __worldDebug.snapshot().player, grounded: __worldDebug.snapshot().grounded, camera: __worldDebug.camera() }));
      report.shots.push({ file, light, fixtureTeleport: [s.at[0], 7.5, s.at[1]], ...info });
    }
  }
  report.errors = errors;
} finally {
  await browser.close();
  await writeFile(path.join(out, 'shots.json'), JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(report.shots.map(s => ({ f: s.file, calls: s.stats.calls, tri: s.stats.triangles, p: s.player?.map(v => +v.toFixed(2)), g: s.grounded })), null, 0));
console.log('errors', report.errors?.length ?? 'n/a', (report.errors || []).slice(0, 5));
