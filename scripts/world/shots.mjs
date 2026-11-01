/** Fixed world cameras. Uses installed Chrome; never downloads a browser. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const playwrightPath = require.resolve('playwright', { paths: [process.env.WORLD_BROWSER_MODULES || repo] });
const { chromium } = require(playwrightPath);
const output = process.env.WORLD_SHOTS_DIR || path.join(repo, 'docs/world/evidence');
await mkdir(output, { recursive: true });
const installedMacChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.WORLD_CHROME || (existsSync(installedMacChrome) ? installedMacChrome : undefined);
const browser = await chromium.launch({ executablePath, channel: executablePath ? undefined : 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  if (process.argv.includes('--inventory')) {
    await page.goto(pathToFileURL(path.join(repo, 'docs/world/reference-crops.html')).href);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode().catch(() => {}))));
    await page.screenshot({ path: path.join(output, 'asset-inventory.png') });
    await writeFile(path.join(output, 'inventory-shot.json'), JSON.stringify({ viewport: { width: 1440, height: 900 }, entries: await page.locator('article').count(), errors }, null, 2) + '\n');
    console.log('Captured reference crop index. This is not world runtime evidence.');
  } else {
    const base = process.env.WORLD_BASE_URL || 'http://localhost:4321';
    const shots = ['overview', 'camp', 'camp-night', 'town', 'town-night', 'bridge', 'park', 'park-night'];
    const report = [];
    for (const shot of shots) {
      await page.goto(`${base}/world?qa=1&shot=${shot}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__worldDebug?.state().ready, undefined, { timeout: 30000 });
      // Lighting transitions are exactly two seconds; sample after the transition.
      await page.waitForTimeout(2300);
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
      const stats = await page.evaluate(() => window.__worldDebug.stats());
      await page.screenshot({ path: path.join(output, `${shot}.png`) });
      report.push({ shot, viewport: { width: 1440, height: 900 }, stats });
    }
    await writeFile(path.join(output, 'world-shots.json'), JSON.stringify({ base, capturedAt: new Date().toISOString(), report, errors }, null, 2) + '\n');
    console.log(`Captured ${report.length} fixed views. Page errors: ${errors.length}.`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
