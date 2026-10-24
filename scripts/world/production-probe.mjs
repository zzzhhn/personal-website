/** One production-build load/performance sample; does not certify the M1 Air target. */
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.WORLD_BROWSER_MODULES || repo] }));
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { base, capturedAt: new Date().toISOString(), hardware: 'Apple M5 Pro', browser: await browser.version(), viewport: '1920×1080, DPR 1', errors };
const heavy = urls => urls.filter(url => /WorldRuntime|rapier|\.wasm(?:$|\?)/i.test(url));
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  report.home = await page.evaluate(() => ({ resources: performance.getEntriesByType('resource').map(r => r.name), canvasCount: document.querySelectorAll('canvas').length }));
  report.home.worldRuntimeRequests = heavy(report.home.resources);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 30, downloadThroughput: 100_000_000 / 8, uploadThroughput: 20_000_000 / 8 });
  await page.goto(`${base}/world?qa=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__worldDebug?.state().ready, undefined, { timeout: 30000 });
  report.coldLoad = await page.evaluate(() => {
    const entries = [performance.getEntriesByType('navigation')[0], ...performance.getEntriesByType('resource')];
    return {
      readyMs: performance.now(),
      transferBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
      encodedBodyBytes: entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      resources: entries.map(({ name, transferSize, encodedBodySize }) => ({ name, transferSize, encodedBodySize })),
    };
  });
  report.coldLoad.profile = 'Cold browser cache; 100 Mbps down / 20 Mbps up; 30 ms simulated latency; local Astro production preview';
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  report.frames = [];
  for (const [zone, position] of [['camp', [-40, 5.85, 38]], ['town', [22, 2.2, -10]], ['park', [64, 2.2, -40]]]) {
    await page.evaluate(p => window.__worldDebug.teleportPlayer(p), position);
    await page.waitForTimeout(750);
    const sample = await page.evaluate(() => new Promise(resolve => {
      const intervals = []; let first, last;
      function frame(now) {
        if (first === undefined) first = now;
        if (last !== undefined) intervals.push(now - last);
        last = now;
        if (now - first < 5000) return requestAnimationFrame(frame);
        const sorted = [...intervals].sort((a, b) => a - b);
        resolve({ elapsedMs: now - first, frames: intervals.length, meanFps: intervals.length * 1000 / (now - first), p95FrameMs: sorted[Math.floor(sorted.length * .95)], stats: window.__worldDebug.stats() });
      }
      requestAnimationFrame(frame);
    }));
    report.frames.push({ zone, ...sample });
  }
  report.framesNote = 'One 5-second stationary follow-camera sample in each zone, live physics. Headless Chrome RAF timing on M5 Pro, not an M1 Air certification or subjective driving review.';
  await page.screenshot({ path: path.join(repo, 'docs/world/evidence/production-1080p.png') });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${base}/world`, { waitUntil: 'networkidle' });
  report.mobile = await mobile.evaluate(() => ({ text: document.querySelector('main')?.textContent, canvasCount: document.querySelectorAll('canvas').length, resources: performance.getEntriesByType('resource').map(r => r.name) }));
  report.mobile.worldRuntimeRequests = heavy(report.mobile.resources);
  await mobileContext.close();
  report.checks = {
    localReadyWithin8Seconds: report.coldLoad.readyMs <= 8000,
    localInitialEncodedBodyWithin15MB: report.coldLoad.encodedBodyBytes <= 15_000_000,
    homeDoesNotRequestWorldRuntime: report.home.worldRuntimeRequests.length === 0,
    mobileDoesNotLoad3D: report.mobile.canvasCount === 0 && report.mobile.worldRuntimeRequests.length === 0,
    noPageErrors: errors.length === 0,
  };
  console.log(JSON.stringify({ coldLoad: { readyMs: report.coldLoad.readyMs, encodedBodyBytes: report.coldLoad.encodedBodyBytes }, frames: report.frames, checks: report.checks }, null, 2));
  if (Object.values(report.checks).some(passed => !passed)) process.exitCode = 1;
} finally {
  await writeFile(path.join(repo, 'docs/world/evidence/production-probe.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
