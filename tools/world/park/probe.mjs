/** One-off QA probe: evaluates an expression in the QA entry after load. Usage: probe.mjs "<js expr>" */
import { loadPlaywright, CHROME, openWorld } from '../playtest/lib.mjs';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
try {
  const { page, errors } = await openWorld(browser, `${process.env.WORLD_BASE_URL}/world/?qa=1`, { width: 1280, height: 720 });
  await page.waitForTimeout(1500);
  console.log(JSON.stringify(await page.evaluate(process.argv[2]), null, 0).slice(0, 6000));
  console.log('errors', errors.filter(e => !e.includes('changed size between renders')).slice(0, 5));
} finally { await browser.close(); }
