/** G24 slope stance check (spec 10.1 口径): camp road ramp (~15 deg, [-18,4.84,34] -> [-5,1.14,29]).
 * Logged fixture teleport to the ramp top, then real keys: run down, stop on the ramp, run up, sprint down,
 * walk-speed tap up, stop. Per-frame recorder; stance = clip contact >= 0.5 per foot while grounded.
 * float = lowest sole above its probed ground > 20 mm; sink = below -15 mm. */
import { mkdir, writeFile } from 'node:fs/promises';
import { summarizeSlope } from './slope-metrics.mjs';
import { Bot, loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/g24-slope'; await mkdir(out, { recursive: true });
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4336', tag = process.env.G24_TAG || 'slope';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { tag, errors: [], fixture: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  const bot = new Bot(page);
  await page.evaluate(() => __worldDebug.set({ zoom: 0 }));
  const down = comboFor(13, -5).keys, up = comboFor(-13, 5).keys;
  const runs = [['run-down', down, [], 1700], ['stop-on-ramp', [], [], 900], ['run-up', up, [], 1700], ['stop2', [], [], 900],
    ['sprint-down', down, ['ShiftLeft'], 1500], ['stop3', [], [], 900], ['run-up2', up, [], 2200], ['stop4', [], [], 900]];
  await bot.fixtureTeleport([-19.5, 4.84 + 0.9, 34.3], 'camp road ramp top (15 deg) for slope stance metrics');
  report.fixture = bot.fixtureCalls;
  await page.waitForTimeout(1200);
  await page.evaluate(() => __worldDebug.actor('record:start', 20000));
  report.phases = [];
  for (const [label, keys, extra, ms] of runs) { await bot.hold([...keys, ...extra]); report.phases.push({ label, t: bot.now() }); await page.waitForTimeout(ms); }
  await bot.release();
  const frames = await page.evaluate(() => { __worldDebug.actor('record:stop'); return __worldDebug.actor('record:take'); });
  await writeFile(`${out}/frames-${tag}.json`, JSON.stringify(frames));
  Object.assign(report, summarizeSlope(frames));
} catch (e) { report.errors.push(String(e?.stack || e)); }
finally { await browser.close(); await writeFile(`${out}/report-${tag}.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify({ a: report.byClipCurve, b: report.excludingStopStepSwing, f: report.floatsByAnim, w: report.stance?.worst }), report.errors); }
