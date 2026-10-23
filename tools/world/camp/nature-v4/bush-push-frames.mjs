/** Visual (not machine-judged) evidence that G19 leaves part around the walker and spring back:
 * normal follow camera, real keys, frames before / inside / +0.3 s / +1.8 s after exit, plus the
 * push uniform amplitude at each frame. Output: docs/world/quality-v3/nature-v4/bush-push/. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, loadPlaywright, CHROME } from '../../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const out = path.resolve('docs/world/quality-v3/nature-v4/bush-push'); await mkdir(out, { recursive: true });
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); const bot = new Bot(page);
const frames = [];
await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForFunction(() => window.__worldDebug?.actor().loaded && window.__worldSoftBush && !__worldDebug.sceneObjects().some(n => /camp-(loading|fallback)/.test(n)), undefined, { timeout: 90000 });
await page.locator('canvas').click({ position: { x: 960, y: 540 } });
const r = (await page.evaluate(() => __worldDebug.campColliders())).find(x => x.id === 'G19' && x.instance === 0);
const c = [(r.aabb.min[0] + r.aabb.max[0]) / 2, (r.aabb.min[2] + r.aabb.max[2]) / 2];
// Same diagonal lane as soft-bush.mjs (clear of the G21 boulder and G16 trunk).
await bot.fixtureTeleport([c[0] - 3.2, 5.68, c[1] - 3.7], 'bush push frames: isolated start SW of G19-0');
await page.waitForTimeout(900);
const grab = async label => { const s = await page.evaluate(() => ({ p: __worldDebug.snapshot().player, inside: __worldSoftBush.state().lastInside.length })); await page.screenshot({ path: path.join(out, label + '.png') }); frames.push({ label, ...s }); };
await grab('0-before');
// Real-key walk west through the bush (bot key mapping). The inside frame is taken on the first
// tick the zone reports the walker, so the parted leaves are in shot; trace is kept for review.
let stage = 0; const trace = [];
const res = await bot.walk([[c[0] + 3.3, c[1] + 3.7]], { timeout: 6, arrive: .4, maxRecoveries: 0, stopOnBlocked: true, onTick: async fb => {
  const s = await page.evaluate(() => ({ inside: __worldSoftBush.state().lastInside.length }));
  trace.push([fb.player, s.inside]);
  if (stage === 0 && s.inside) { await grab('1-inside'); stage = 1; }
} });
frames.push({ label: 'walk', legs: res.legs, trace });
await page.waitForTimeout(300); await grab('2-exit+0.3s'); await page.waitForTimeout(1500); await grab('3-exit+1.8s');
await writeFile(path.join(out, 'frames.json'), JSON.stringify({ base, bush: 'G19-0', center: c, frames, fixtures: bot.fixtureCalls, note: 'Visual evidence only; artistic judgement separate from machine checks.' }, null, 1) + '\n');
console.log(JSON.stringify(frames.map(f => [f.label, f.inside]))); await browser.close();
