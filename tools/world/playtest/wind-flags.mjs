import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';
import { ALPHA_ORIGIN } from '../../../src/components/world/alpha-island/alpha-layout.ts';

const [base = 'http://127.0.0.1:4343', mode = 'after'] = process.argv.slice(2);
assert.ok(['before', 'after'].includes(mode));
const url = new URL('/world/?start=alpha-wind', base);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 75000 });
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  url.searchParams.set('qa', '1');
  await page.goto(url.href);
  await page.waitForFunction(
    () =>
      window.__worldDebug?.sceneObjects().includes('alpha-playable-stations') &&
      window.__worldDebug.snapshot().grounded,
    undefined,
    { timeout: 90000 },
  );
  const posts = await page.evaluate(([ox, , oz]) => {
    const d = window.__worldDebug;
    return [0, 1, 2].map((i) => {
      const x = ox + 22 + i * 2.4,
        z = oz - 45 - i;
      return {
        mast: d.probeAsset('alpha-wind-flag-stand', [x - 0.65, 40, z], [1, 0, 0], 0.015),
        cloth: d.probeAsset('alpha-wind-flag-stand', [x + 0.65, 40.3, z + 0.6], [0, 0, -1], 0.015),
      };
    });
  }, ALPHA_ORIGIN);
  const bot = new Bot(page);
  const route = await bot.walk(
    [
      [256, 148],
      [258, 148],
      [260, 147.5],
      [262, 147.2],
    ],
    { arrive: 0.5, timeout: 15, maxRecoveries: 1 },
  );
  console.log(
    JSON.stringify({
      mode,
      posts,
      legs: route.legs,
      grounded: route.trace.filter((row) => row.g).length,
      samples: route.trace.length,
      fixtures: bot.fixtureCalls,
      errors,
    }),
  );
  assert.ok(posts.every((p) => (mode === 'after' ? p.mast && p.mast.toi < 0.64 : !p.mast)));
  assert.ok(posts.every((p) => !p.cloth));
  assert.ok(route.legs.length === 4 && route.legs.every((leg) => leg.reached && !leg.recoveries));
  assert.ok(route.trace.filter((row) => row.g).length >= 0.95 * route.trace.length);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
