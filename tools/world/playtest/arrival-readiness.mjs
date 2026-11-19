import assert from 'node:assert/strict';
import { CHROME, loadPlaywright } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4343';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const context = () => browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const ordinary = path => new URL('/world/' + path, base).href;
const errorMessage = 'Your starting area could not load. Try again or start at camp.';
const campNotice = 'Back at camp. Your ore and research are kept.';
const timeout = 60_000;
const mapDot = 'aside.world-location svg circle[r="2.6"]';
const position = page => page.locator(mapDot).evaluate(el => [el.cx.baseVal.value, el.cy.baseVal.value]);
const caseFilter = new Set(process.argv.slice(3));

async function withPage(name, test) {
  if (caseFilter.size && !caseFilter.has(name)) return;
  const client = await context();
  const page = await client.newPage();
  // Allow ongoing work to use this dev server without replacing the loaded modules.
  await page.routeWebSocket('**/*', ws => ws.close());
  try {
    const button = page.locator('button.world-camp-return');
    const ready = () => button.and(page.locator(':enabled')).waitFor({ timeout });
    const open = start => page.goto(ordinary(start ? '?start=' + start : ''), { waitUntil: 'domcontentloaded' });
    const began = performance.now();
    const details = await test({ page, open, button, ready });
    console.log(JSON.stringify({ ...details, elapsedMs: Math.round(performance.now() - began) }));
  } finally { await client.close(); }
}

try {
  await withPage('quarry', async ({ page, open, button, ready }) => {
    const assets = '**/world/alpha-mine/layout.json';
    const release = Promise.withResolvers();
    await page.route(assets, async route => { await release.promise; await route.continue(); });
    const requested = page.waitForRequest(assets, { timeout });
    await open('brain');
    try {
      await requested;
      await page.locator('canvas').first().waitFor({ timeout });
      await page.locator('.world-loading[aria-busy=true]').waitFor({ timeout });
      assert.equal(await button.isDisabled(), true, 'quarry spawn remains held while its actual layout request is delayed');
    } finally { release.resolve(); }
    await ready();
    // Returning through the ordinary menu exercises the synchronous, paused path.
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').getByRole('button', { name: 'Return to camp' }).click();
    await page.getByText(campNotice).waitFor({ timeout });
    return { route: 'quarry', result: 'delayed scene held startup, then ready; paused return succeeded' };
  });

  await withPage('waterwheel', async ({ page, open, button, ready }) => {
    let faults = 0;
    const assets = '**/assets/world/terrain/waterwheel.bin.gz*';
    const fail = route => { faults++; return route.abort(); };
    await page.route(assets, fail);
    await open('alpha-waterwheel');
    const error = page.getByRole('alert').filter({ hasText: errorMessage });
    await error.waitFor({ timeout });
    assert.equal(await button.isDisabled(), true);
    assert.ok(faults > 0);
    await error.getByRole('link', { name: 'Return to camp' }).click();
    await ready();
    assert.equal(new URL(page.url()).search, '');
    await open('alpha-summit');
    await ready();
    await open('alpha-waterwheel');
    await error.waitFor({ timeout });
    await page.unroute(assets, fail);
    await error.getByRole('button', { name: 'Try again' }).click();
    await ready();
    assert.equal(new URL(page.url()).searchParams.get('start'), 'alpha-waterwheel');
    return { route: 'waterwheel', result: 'failed start offered camp and retry; camp and summit remained playable; retry reached waterwheel', faults };
  });

  await withPage('cave', async ({ open, button, ready, page }) => {
    await open('alpha-cave');
    await ready();
    await button.click();
    await page.getByText(campNotice).waitFor({ timeout });
    return { route: 'cave', result: 'public cave spawn and return ready' };
  });

  const parks = [
    { start: 'ibd', other: 'coaster', module: /\/(?:WorldIbdYard\.[^/]+\.js|WorldIbdYard\.tsx)(?:\?|$)/, at: [-88, -143] },
    { start: 'coaster', other: 'ibd', module: /\/(?:WorldIntentCoaster\.[^/]+\.js|WorldIntentCoaster\.tsx)(?:\?|$)/, at: [50, -125] },
  ];
  for (const park of parks) await withPage(park.start, async ({ page, open, button, ready }) => {
    const faults = [];
    const fail = route => { faults.push(new URL(route.request().url()).pathname); return route.abort(); };
    await page.route(park.module, fail);
    await open(park.start);
    const error = page.getByRole('alert').filter({ hasText: errorMessage });
    await error.waitFor({ timeout });
    assert.equal(await button.isDisabled(), true);
    assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
    await error.getByRole('link', { name: 'Return to camp' }).click();
    await ready();
    assert.equal(new URL(page.url()).search, '');
    const camp = await position(page);
    assert.ok(Math.hypot(camp[0] + 42, camp[1] - 35) < .5, JSON.stringify(camp));

    await open(park.other);
    await ready();
    const other = await position(page);
    const otherAt = parks.find(row => row.start === park.other).at;
    assert.ok(Math.hypot(other[0] - otherAt[0], other[1] - otherAt[1]) < .5, JSON.stringify(other));
    await open(park.start);
    await error.waitFor({ timeout });
    await page.unroute(park.module, fail);
    await error.getByRole('button', { name: 'Try again' }).click();
    await ready();
    const restored = await position(page);
    assert.ok(Math.hypot(restored[0] - park.at[0], restored[1] - park.at[1]) < .5, JSON.stringify(restored));
    assert.ok(faults.length >= 2, JSON.stringify(faults));
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(([selector, at]) => {
        const dot = document.querySelector(selector);
        return dot && Math.hypot(dot.cx.baseVal.value - at[0], dot.cy.baseVal.value - at[1]) > .5;
      }, [mapDot, restored], { timeout: 10_000 });
    } finally { await page.keyboard.up('KeyW'); }
    return { route: park.start, faults, camp, other, restored, afterWalk: await position(page), qa: false };
  });
} finally { await browser.close(); }
