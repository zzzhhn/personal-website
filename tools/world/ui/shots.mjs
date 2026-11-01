/** ui session: normal-entry screenshots (no QA parameters). Desktop 1920x1080 and narrow 1280x800; real keys only.
 * Usage via tools/bot-run.sh ui 4337 tools/world/ui/shots.mjs <outdir> */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4337';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/ui-shots';
await mkdir(out, { recursive: true });
const report = { base, at: new Date().toISOString(), shots: [], errors: [] };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
async function run(name, width, height, steps) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(`${name}: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[vite]')) report.errors.push(`${name}: ${m.text()}`); });
  await page.goto(base + '/world/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('.world-radar svg'), undefined, { timeout: 120000 });
  await page.waitForTimeout(1800);
  const shot = async (label) => { const f = path.join(out, `${name}-${label}.png`); await page.screenshot({ path: f }); report.shots.push(f); };
  await steps(page, shot);
  await page.close();
}
await run('desk', 1920, 1080, async (page, shot) => {
  await shot('01-entry');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  await page.waitForTimeout(900); await shot('02-after-move');
  await page.keyboard.press('Escape'); await page.waitForTimeout(700); await shot('03-menu');
  await page.locator('.world-dialog .world-map-full').click({ position: { x: 520, y: 200 } }); await page.waitForTimeout(400);
  await page.locator('.world-keys summary').click(); await page.waitForTimeout(300); await shot('04-menu-waypoint-keys');
  await page.getByRole('button', { name: '中文' }).click(); await page.waitForTimeout(400); await shot('05-menu-zh');
  await page.keyboard.press('Escape'); await page.waitForTimeout(900); await shot('06-zh-hud-waypoint');
});
await run('narrow', 1280, 800, async (page, shot) => {
  await shot('01-entry');
  await page.keyboard.press('Escape'); await page.waitForTimeout(700); await shot('02-menu');
});
await browser.close();
await writeFile(path.join(out, 'shots.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ shots: report.shots.length, errors: report.errors }, null, 1));
