/** G24 motion bot: real keys only (Bot.hold/press), per-frame recorder via __worldDebug.actor('record:*').
 * Sequence on flat camp ground: idle, start (run), sprint, stop, run, 90/180 turns at rest, run turn,
 * stand jump, run jump into run, sprint jump, land standing. Output: report.json + frames.json + PNG frames.
 * The QA query (?qa=1) is used only for the debug read; a separate normal-entry screenshot pass exists. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Bot, loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
import { summarize } from './motion-metrics.mjs';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/g24-motion'; await mkdir(out, { recursive: true });
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4336';
const startupOnly = process.env.G24_STARTUP_ONLY === '1', captureSkin = process.env.G24_SKIN === '1';
const shots = process.env.G24_SHOTS === '1', tag = process.env.G24_TAG || 'run';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { base, tag, startedAt: new Date().toISOString(), errors: [], phases: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(base + '/world/?qa=1' + (process.env.G24_XFADE === '1' ? '&guideXfade=1' : '') + (process.env.G24_ENTRY_LEGACY === '1' ? '&guideEntryLegacy=1' : ''), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  const bot = new Bot(page);
  const asset = await page.request.get(base + '/assets/world/guide/G24.glb');
  report.glbSha256 = createHash('sha256').update(await asset.body()).digest('hex'); report.glbBytes = (await asset.body()).length;
  await page.evaluate(() => __worldDebug.set({ zoom: 0 }));
  // Logged fixture: start of the straight west coastal road (x -88.5, flat 1.14 m) so a sprint and its
  // stop are not cut short by camp props. All motion after this is real keys.
  await bot.fixtureTeleport([-88.6, 1.14 + 0.88, 24], 'west ring road straight (flat, ~45 m clear) for motion metrics');
  await page.waitForTimeout(1500);
  const N = comboFor(0, -1).keys, S = comboFor(0, 1).keys, E = comboFor(1, 0).keys, W_ = comboFor(-1, 0).keys;
  report.keyMap = { north: N, south: S, east: E, west: W_ };
  if (process.env.G24_ALIGN_STARTUP === '1') {
    // Supplemental direct Idle->Run coverage: establish heading with real keys, then reset position only.
    await bot.hold(N); await page.waitForTimeout(600); await bot.release(); await page.waitForTimeout(1300);
    await bot.fixtureTeleport([-88.6, 1.14 + .88, 24], 'supplemental aligned-heading start; position reset after real-key alignment');
    await page.waitForTimeout(1500); report.alignedStartup = true;
  }
  report.fixtures = bot.fixtureCalls;
  report.entryMode = process.env.G24_ENTRY_LEGACY === '1' ? 'legacy' : 'support';
  report.scope = startupOnly ? 'original idle 800 ms + start-run 1400 ms only' : 'full';
  const skinTopology = captureSkin ? await page.evaluate(() => __worldDebug.actor('skin:topology')) : null;
  await page.evaluate(skin => __worldDebug.actor(skin ? 'record:skin' : 'record:start', 20000), captureSkin);
  let n = 0;
  const phase = async (label, keys, ms, press) => {
    await bot.hold(keys); if (press) await bot.press(press);
    const t = bot.now(); report.phases.push({ label, keys, press: press ?? null, t });
    if (shots) { await page.waitForTimeout(Math.min(ms, 120)); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${label}.png` }); await page.waitForTimeout(Math.max(0, ms - 120 - 60)); }
    else await page.waitForTimeout(ms);
  };
  await phase('idle', [], 800);
  await phase('start-run', N, 1400);
  if (!startupOnly) {
  await phase('sprint', [...N, 'ShiftLeft'], 1500);
  await phase('sprint-stop', [], 1200);
  await phase('run', N, 1000);
  await phase('run-stop', [], 1200);
  await phase('turn90', E, 300);
  await phase('turn90-stop', [], 900);
  await phase('turn180', W_, 350);
  await phase('turn180-stop', [], 900);
  await phase('run-curve', [...S, ...W_].slice(0, 2), 700);
  await phase('run-curve2', S, 900);
  await phase('run-stop2', [], 1000);
  await phase('stand-jump', [], 1300, 'Space');
  await phase('run-for-jump', N, 900);
  await phase('run-jump', N, 1300, 'Space');
  await phase('sprint-for-jump', [...N, 'ShiftLeft'], 800);
  await phase('sprint-jump', [...N, 'ShiftLeft'], 1200, 'Space');
  await phase('jump-land-stand', [], 1400, 'Space');
  await phase('end', [], 600);
  }
  await bot.release();
  await page.evaluate(() => __worldDebug.actor('record:stop'));
  const frames = await page.evaluate(() => __worldDebug.actor('record:take'));
  report.recorded = frames.length;
  if (captureSkin) {
    // Predeclared narrow A6 window: every captured frame from one frame before first Run through 250 ms after.
    const start = frames.findIndex(f => f.anim === 'Run');
    const samples = start < 0 ? [] : frames.slice(Math.max(0, start - 1)).filter(f => f.t <= frames[start].t + .25).map(f => ({ ...f, label: 'startup-first-250ms' }));
    if (!samples.length) throw new Error('No startup skin samples captured');
    await writeFile(`${out}/runtime-skin-${tag}.json`, JSON.stringify({ views: [{ label: 'startup-first-250ms', assetSha256: report.glbSha256, skinTopology, samples }] }));
    report.a6CapturedSamples = samples.length;
  }
  report.metrics = summarize(frames);
  report.actor = await page.evaluate(() => { const a = __worldDebug.actor(); return { inert: a.inert, stop: a.stop?.events ?? null }; });
  await writeFile(`${out}/frames-${tag}.json`, JSON.stringify(frames));
} catch (e) { report.errors.push(String(e?.stack || e)); }
finally { await browser.close(); await writeFile(`${out}/report-${tag}.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify({ errors: report.errors, recorded: report.recorded, metrics: { ...report.metrics, switches: undefined } }, null, 1)); }
