/** G24 look check: normal entry (no query) 1920x1080, default camera then nearest zoom via real wheel
 * steps; screenshots + guide draw-call / triangle delta (QA tab, hide the guide group, diff stats). */
import { mkdir, writeFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME } from '../playtest/lib.mjs';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/g24-look'; await mkdir(out, { recursive: true });
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4336', tag = process.env.G24_TAG || 'look';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(base + '/world/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(9000);
  const bot = new Bot(page);
  await page.screenshot({ path: `${out}/${tag}-normal-default.png` });
  for (let i = 0; i < 14; i++) { await bot.wheel(-240); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${tag}-normal-near.png` });
  await bot.hold(['KeyW']); await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${tag}-normal-near-run.png` }); await bot.release();
  await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${tag}-normal-near-stop.png` });
  // QA tab for the numbers only
  const q = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await q.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await q.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  await q.evaluate(() => __worldDebug.set({ zoom: 0 })); await q.waitForTimeout(1500);
  report.budget = await q.evaluate(async () => {
    const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await raf(); const on = __worldDebug.stats();
    let g = null; const s = window.__r3fScene; // not exposed: toggle via store visibility instead
    __worldDebug.set({ zoom: 3 }); await raf(); await raf(); const fp = __worldDebug.stats();
    __worldDebug.set({ zoom: 0 }); await raf(); await raf(); const back = __worldDebug.stats();
    return { withGuide: on, firstPersonNoGuide: fp, back };
  });
} catch (e) { report.errors.push(String(e?.stack || e)); }
finally { await browser.close(); await writeFile(`${out}/${tag}-report.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify(report)); }
