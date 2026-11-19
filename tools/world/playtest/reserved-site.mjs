import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'after'] = process.argv.slice(2);
assert.ok(['before', 'after'].includes(mode));
const url = new URL('/world/', base);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 75000 });
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  url.searchParams.set('qa', '1');
  await page.goto(url.href);
  await page.waitForFunction(
    () => window.__worldDebug?.sceneObjects().includes('street-foundations-group'),
    undefined,
    { timeout: 75000 },
  );
  const bot = new Bot(page);
  assert.ok(await bot.fixtureTeleport([-10, 2.4, 40], 'start on the contact construction site'));
  const surfaces = await page.evaluate(() => {
    const d = window.__worldDebug;
    const slab = (x, z) => d.probeAsset('street-foundation', [x, 2, z], [0, -1, 0], 0.015);
    const soil = d.castPlayer([-15.85, 7, 38.5], [-15.85, 3.0, 38.5]);
    return { buried: slab(-15.85, 38.5), level: slab(-10, 42), soil };
  });
  const route = await bot.walk(
    [
      [-10, 42],
      [-11, 43],
      [-12, 44],
      [-11, 45],
    ],
    { arrive: 0.36, timeout: 12, maxRecoveries: 1 },
  );
  console.log(
    JSON.stringify({
      mode,
      surfaces,
      legs: route.legs,
      grounded: route.trace.filter((p) => p.g).length,
      samples: route.trace.length,
      errors,
    }),
  );
  if (mode === 'after') assert.equal(surfaces.buried, null);
  else assert.ok(surfaces.buried);
  assert.ok(Math.abs(surfaces.level.point[1] - 1.15) < 0.005);
  assert.match(surfaces.soil.other?.name ?? '', /^island-terrain-(solid-faces|surface-top)$/);
  assert.ok(route.legs.length === 4 && route.legs.every((leg) => leg.reached && !leg.recoveries));
  assert.ok(route.trace.filter((p) => p.g).length >= 0.95 * route.trace.length);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
