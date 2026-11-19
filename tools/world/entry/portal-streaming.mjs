import assert from 'node:assert/strict';
import { Bot, CHROME, comboFor, loadPlaywright } from '../playtest/lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'delayed'] = process.argv.slice(2);
assert.ok(['before', 'delayed', 'failed', 'cancelled', 'cancelled-escape'].includes(mode));
const cancelled = mode.startsWith('cancelled');
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1056, height: 700 } });
const page = await context.newPage(), bot = new Bot(page);
const worker = /\/coaster-structure\.worker(?:-[^/]+\.js|\.ts)(?:\?|$)/;
const release = Promise.withResolvers();
const requests = [];
const pageErrors = [];
let selectedPortalCall = false;
const camp = [-33.5, 34], quarry = [-78, -47], coaster = [60, -122];
const point = page.locator('aside.world-location svg circle[r="2.6"]');
const position = () => point.evaluate(el => [el.cx.baseVal.value, el.cy.baseVal.value]);
const nearby = (at, target, metres) => Math.hypot(at[0] - target[0], at[1] - target[1]) < metres;
const notice = message => page.getByRole('status').filter({ hasText: message }).waitFor({ timeout: 18_000 });

// The camera keeps its default heading over these on-foot routes. Read the
// public minimap only.
async function walk(target, from, radius = .35) {
  const deadline = Date.now() + 16_000;
  try {
    while (Date.now() < deadline) {
      const at = await position();
      if (nearby(at, target, radius) || !nearby(at, from, 15)) return at;
      await bot.hold(comboFor(target[0] - at[0], target[1] - at[1]).keys);
      await page.waitForTimeout(55);
    }
    assert.fail(`Could not reach ${target} from ${from}: ${await position()}`);
  } finally { await bot.release(); }
}

async function stageCamp() {
  assert.ok(nearby(await walk([-42, 39], camp), [-42, 39], .35));
  assert.ok(nearby(await walk([-37, 39], camp), [-37, 39], .35));
  assert.ok(nearby(await walk([-33.5, 37.3], camp), [-33.5, 37.3], .35));
  assert.ok(nearby(await walk([-33.5, 34.75], camp, .30), [-33.5, 34.75], .30));
}

async function holdAcrossCamp() { await bot.hold(comboFor(0, -1).keys); }

async function confirmArrival(destination, label) {
  await notice(label);
  await bot.release();
  const start = await position();
  assert.ok(nearby(start, destination, 4), JSON.stringify(start));
  const outward = start[1] > destination[1] ? 1 : -1;
  const target = [start[0], start[1] + outward * 1.05];
  const end = await walk(target, destination, .35);
  assert.ok(nearby(end, target, .35), JSON.stringify({ end, target }));
  assert.ok(Math.hypot(start[0] - end[0], start[1] - end[1]) > .6);
  return { start, end };
}

try {
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.routeWebSocket('**/*', ws => ws.close());
  await page.route('**/_astro/WorldRuntime.*.js', async route => {
    // Fix only G28's random sample in the production bundle. A global RNG
    // override corrupts Three's UUID-based caches while cold assets load.
    const response = await route.fetch();
    const body = await response.text();
    const call = mode === 'before'
      ? /Math\.floor\(Math\.random\(\)\*\w+\.length\)(?=;\w+\.armed=!1,\w+\.cooldown=2)/
      : /Math\.random\(\)(?=\)\{const \w+=\w+\.filter\(\w+=>\w+\.id!==\w+\.id\),\w+=Math\.floor\(\w+\*\w+\.length\);return\{source:\w+,enteredFrom:)/;
    const calls = body.match(new RegExp(call.source, 'g'));
    assert.equal(calls?.length, 1, 'fixture must patch exactly one production gate choice');
    const seeded = body.replace(call, sample => sample.replace('Math.random()', '.999999'));
    selectedPortalCall = true;
    await route.fulfill({ response, body: seeded });
  });
  await page.route(worker, async route => {
    requests.push(new URL(route.request().url()).pathname);
    if (requests.length === 1 && mode === 'failed') return route.abort();
    if (requests.length === 1 && (mode === 'delayed' || cancelled)) await release.promise;
    await route.continue().catch(error => {
      // A cancelled departure terminates its Worker while the request is held.
      if (!cancelled) throw error;
    });
  });
  await page.goto(new URL('/world/', base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 60_000 });
  const spawn = await position();
  assert.ok(nearby(spawn, [-42, 35], .6));
  assert.ok(selectedPortalCall, 'expected the ordinary production actor bundle');
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  await stageCamp();
  assert.deepEqual(requests, [], 'no near-coaster worker on camp entry or walk toward the gate');
  await holdAcrossCamp();

  if (mode === 'before') {
    const landed = await confirmArrival(quarry, 'Arrived at WorldQuant quarry');
    assert.deepEqual(requests, []);
    console.log(JSON.stringify({ mode, spawn, landed, nearRequests: requests, fixtureTeleports: bot.fixtureCalls }));
  } else if (mode === 'failed') {
    const fallback = await confirmArrival(quarry, 'The first exit could not open. Arrived at WorldQuant quarry.');
    assert.equal(requests.length, 1);
    assert.ok(nearby(await walk([-78, -42.8], quarry), [-78, -42.8], .35));
    await page.waitForTimeout(2200);
    assert.ok(nearby(await walk([-78, -46.25], quarry, .30), [-78, -46.25], .30));
    await bot.hold(comboFor(0, -1).keys);
    const retried = await confirmArrival(coaster, 'Arrived at Intent coaster');
    assert.equal(requests.length, 2);
    console.log(JSON.stringify({ mode, spawn, fallback, retried, nearRequests: requests, fixtureTeleports: bot.fixtureCalls }));
  } else {
    await notice('Preparing a safe exit');
    const atGate = await position();
    await page.waitForTimeout(750);
    const held = await position();
    assert.ok(nearby(atGate, camp, .8) && nearby(held, atGate, .15), JSON.stringify({ atGate, held }));
    assert.equal(requests.length, 1);
    if (cancelled) {
      await bot.release();
      if (mode === 'cancelled-escape') {
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ timeout: 5_000 });
      } else await bot.hold(comboFor(0, 1).keys);
      if (mode === 'cancelled-escape') {
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5_000 });
      }
      await notice('Gate travel cancelled');
      await bot.release();
      release.resolve();
      assert.ok(nearby(await walk([-33.5, 38.2], camp), [-33.5, 38.2], .35));
      await page.waitForTimeout(2200);
      assert.ok(nearby(await walk([-33.5, 34.75], camp, .30), [-33.5, 34.75], .30));
      await holdAcrossCamp();
    } else release.resolve();
    const landed = await confirmArrival(coaster, 'Arrived at Intent coaster');
    assert.equal(requests.length, cancelled ? 2 : 1);
    console.log(JSON.stringify({ mode, spawn, atGate, held, landed, nearRequests: requests, fixtureTeleports: bot.fixtureCalls }));
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(bot.fixtureCalls, []);
} finally { release.resolve(); await bot.release(); await context.close(); await browser.close(); }
