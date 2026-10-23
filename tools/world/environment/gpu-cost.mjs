/** Synchronous wall-clock frame interval probe (QA observation). With vsync / frame-rate limit
 * disabled, each rAF callback calls gl.finish(), so the interval between callbacks covers CPU
 * frame work + GPU completion + browser overhead. It is NOT pure GPU time; it is an upper bound
 * on per-frame cost without the 60 Hz cap. Grass shown vs hidden gives its marginal cost.
 * Usage: WORLD_BASE_URL=http://127.0.0.1:4322 [WORLD_QUERY=&groundPbr=0] node tools/world/environment/gpu-cost.mjs out.json */
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const query = process.env.WORLD_QUERY || '';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const { page } = await openWorld(browser, `${base}/world/?qa=1${query}`, { width: 1920, height: 1080 });
await page.waitForFunction(() => window.__worldEnv?.groundDetail().grassBuildMs > 0, undefined, { timeout: 20000 }).catch(() => {});
const result = { metric: 'syncWallFrameIntervalMs (rAF interval with gl.finish(), vsync off; not pure GPU time)', query, groundPbr: await page.evaluate(() => __worldEnv.groundPbr) };
const sample = () => page.evaluate(async () => {
  const gl = document.querySelector('canvas').getContext('webgl2'), frames = []; let last = performance.now();
  await new Promise(res => { let n = 0; const tick = () => { gl.finish(); const now = performance.now(); frames.push(now - last); last = now; if (++n < 240) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  frames.splice(0, 20); frames.sort((a, b) => a - b);
  const q = p => +frames[Math.floor(p * (frames.length - 1))].toFixed(2);
  return { frames: frames.length, p50: q(.5), p90: q(.9), p99: q(.99), mean: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2) };
});
for (const q of ['high', 'balanced']) {
  await page.evaluate(q => { __worldDebug.set({ quality: q }); __worldDebug.teleportPlayer([-50, 1.95, -24]); __worldDebug.set({ zoom: 1 }); }, q);
  await page.waitForTimeout(2500);
  result[q] = { groundDetail: await page.evaluate(() => __worldEnv.groundDetail()), stats: await page.evaluate(() => __worldDebug.stats()) };
  result[q].withGrass = await sample();
  await page.evaluate(() => __worldEnv.setGrassVisible(false)); await page.waitForTimeout(300);
  result[q].noGrass = await sample();
  await page.evaluate(() => __worldEnv.setGrassVisible(true));
}
await writeFile(process.argv[2] || 'docs/world/quality-v3/environment-v4/sync-wall-frame.json', JSON.stringify(result, null, 2));
await browser.close();
console.log(JSON.stringify(result, null, 1));
