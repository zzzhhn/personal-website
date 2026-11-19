import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4343';
const only = new Set(process.argv.slice(3));
const timeout = 60_000;
const waiting = 'The area ahead is preparing. Please wait.';
const recovered = 'Back on safe ground. Shallow water is still walkable.';
const vehicleRecovered = 'Recovered to a clear road. Ready to drive.';
const coasterModule = /\/(?:WorldIntentCoaster\.[^/]+\.js|WorldIntentCoaster\.tsx)(?:\?|$)/;
const ibdModule = /\/(?:WorldIbdYard\.[^/]+\.js|WorldIbdYard\.tsx)(?:\?|$)/;
const dot = 'aside.world-location svg circle[r="2.6"]';
const horizontal = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });

function observe(page, vehicle) {
  return page.evaluate(id => {
    const debug = window.__worldDebug, snapshot = debug.snapshot();
    const body = id ? snapshot.vehicles.find(v => v.id === id) : { position: snapshot.player, velocity: snapshot.playerVelocity };
    return {
      position: body.position, velocity: body.velocity, grounded: snapshot.grounded,
      activeVehicle: snapshot.activeVehicle, throttle: body.throttleInput, wheelContacts: body.wheelContacts, wetSeconds: body.waterSeconds,
      step: snapshot.physicsStep, keys: debug.inputState(), toast: debug.state().toast?.en,
    };
  }, vehicle);
}

async function advance(page, step) {
  await page.waitForFunction(step => window.__worldDebug.snapshot().physicsStep >= step, step, { timeout });
}

async function boot(page, search = '') {
  await page.goto(new URL(`/world/${search}`, base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout });
}

async function scenario(name, module, test) {
  if (only.size && !only.has(name)) return;
  const client = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await client.newPage();
  const bot = new Bot(page);
  const release = Promise.withResolvers();
  const files = [];
  await page.routeWebSocket('**/*', ws => ws.close());
  try {
    await boot(page);
    assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
    const publicCamp = await page.locator(dot).evaluate(el => [el.cx.baseVal.value, el.cy.baseVal.value]);
    assert.ok(Math.hypot(publicCamp[0] + 42, publicCamp[1] - 35) < .5, JSON.stringify(publicCamp));
    // Same camp spawn. Enable observations and the one declared setup placement on a fresh page load.
    await page.route(module, async route => {
      const path = new URL(route.request().url()).pathname;
      files.push(path);
      await release.promise;
      await route.continue();
    });
    await boot(page, '?qa=1');
    await page.waitForFunction(() => window.__worldDebug?.snapshot().grounded, undefined, { timeout });
    const camp = await observe(page);
    assert.ok(horizontal(camp.position, [-42, 0, 35]) < .5, JSON.stringify(camp));
    const detail = await test({ page, bot, release: release.resolve });
    assert.ok(files.length, 'Region chunk was not requested');
    console.log(JSON.stringify({ route: name, publicCamp, qaCamp: camp.position, files, placement: bot.fixtureCalls, ...detail }));
  } finally {
    await bot.release();
    release.resolve();
    await client.close();
  }
}

async function assertHeld(page, vehicle, axis, range) {
  await page.getByText(waiting, { exact: true }).waitFor({ timeout });
  // The first refusal can occur during suspension travel. Start measuring after braking settles.
  await advance(page, (await observe(page, vehicle)).step + 30);
  const first = await observe(page, vehicle);
  await advance(page, first.step + 36);
  const last = await observe(page, vehicle);
  assert.ok(last.keys.includes('KeyW') || last.keys.includes('KeyD'), JSON.stringify(last));
  if (vehicle) assert.ok(last.activeVehicle === vehicle && last.throttle > .95, JSON.stringify(last));
  else assert.equal(last.grounded, true, JSON.stringify(last));
  assert.ok([first, last].every(({ position }) => position[axis] >= range[0] && position[axis] <= range[1]),
    JSON.stringify({ first, last }));
  assert.ok(horizontal(first.position, last.position) < .15 && Math.hypot(last.velocity[0], last.velocity[2]) < .2,
    JSON.stringify({ first, last }));
  return { first, last };
}

async function boardSuv(page, bot, car, player, yaw, reason) {
  assert.equal(await page.evaluate(({ car, yaw }) => window.__worldDebug.teleportVehicle('offroad', car, yaw), { car, yaw }), true);
  assert.equal(await bot.fixtureTeleport(player, reason), true);
  await page.waitForFunction(() => window.__worldDebug.state().nearbyVehicle === 'offroad', undefined, { timeout });
  await bot.press('KeyE');
  await page.waitForFunction(() => window.__worldDebug.snapshot().activeVehicle === 'offroad', undefined, { timeout });
  return observe(page, 'offroad');
}

async function rescue({ page, bot }) {
  assert.equal(await bot.fixtureTeleport([235.8, 2.15, -376.5], 'East coastline just outside the Coaster region'), true);
  await bot.hold(['KeyS', 'KeyD']);
  await page.waitForFunction(() => window.__worldDebug.snapshot().player[1] < -1.6, undefined, { timeout });
  const wet = await observe(page);
  assert.ok(wet.position[0] > 235.34, JSON.stringify(wet));
  await bot.release();
  await page.getByText(recovered, { exact: true }).waitFor({ timeout });
  await page.waitForFunction(() => window.__worldDebug.snapshot().grounded, undefined, { timeout });
  const landing = await observe(page);
  assert.ok(landing.position[1] > 0 && horizontal(wet.position, landing.position) > 1, JSON.stringify(landing));
  const [x, , z] = landing.position;
  const nearCoaster = x >= -8.34 && x <= 235.34 && z >= -412.34 && z <= -113.66;
  assert.equal(nearCoaster, false, JSON.stringify(landing));
  await bot.hold(['KeyW']);
  await page.waitForFunction(at => {
    const p = window.__worldDebug.snapshot().player;
    return Math.hypot(p[0] - at[0], p[2] - at[2]) > .6;
  }, landing.position, { timeout: 10_000 });
  const resumed = await observe(page);
  assert.equal(resumed.grounded, true, JSON.stringify(resumed));
  await bot.release();
  return { wet, landing, resumed, coasterStayedDelayedUntilAfterRecovery: true };
}

try {
  await scenario('walk', coasterModule, async ({ page, bot, release }) => {
    assert.equal(await bot.fixtureTeleport([-13.5, 2.1, -123], 'Coaster approach road west of the readiness boundary'), true);
    await page.waitForFunction(() => window.__worldDebug.snapshot().grounded, undefined, { timeout });
    const start = await observe(page);
    await bot.hold(['KeyS', 'KeyD']);
    const held = await assertHeld(page, null, 0, [-8.65, -8.33]);
    assert.ok(held.last.position[0] - start.position[0] > 4);
    release();
    await page.waitForFunction(() => window.__worldDebug.snapshot().player[0] > -5, undefined, { timeout });
    const entered = await observe(page);
    assert.equal(entered.grounded, true, JSON.stringify(entered));
    assert.ok(entered.keys.includes('KeyS') && entered.keys.includes('KeyD'));
    assert.notEqual(entered.toast, waiting, JSON.stringify(entered));
    await bot.release();
    return { start, held, entered };
  });

  await scenario('drive', ibdModule, async ({ page, bot, release }) => {
    const vehicle = 'offroad', carPlacement = [-88, 1.8, -136.5];
    const start = await boardSuv(page, bot, carPlacement, [-86.15, 2.045, -136.5], Math.PI / 2,
      'Standalone approach at the SUV driver door in front of the yard');
    await bot.hold(['KeyW']);
    const held = await assertHeld(page, vehicle, 2, [-141.6, -139.9]);
    assert.ok(start.position[2] - held.last.position[2] > 3);
    release();
    await page.waitForFunction(id => window.__worldDebug.snapshot().vehicles.find(v => v.id === id).position[2] < -145.5, vehicle, { timeout });
    const entered = await observe(page, vehicle);
    assert.equal(entered.activeVehicle, vehicle);
    assert.ok(entered.keys.includes('KeyW') && entered.throttle > .95);
    assert.ok(entered.wheelContacts.filter(Boolean).length >= 2, JSON.stringify(entered));
    assert.notEqual(entered.toast, waiting, JSON.stringify(entered));
    await bot.release();
    return { carPlacement, start, held, entered };
  });

  await scenario('rescue', coasterModule, rescue);
  await scenario('vehicle-rescue', coasterModule, async ({ page, bot }) => {
    const carPlacement = [244, 2.1, -289];
    const start = await boardSuv(page, bot, carPlacement, [244, 2.045, -287.15], 0,
      'SUV driver door on the dry shelf beyond the east Coaster boundary');
    await bot.hold(['KeyW']);
    await page.waitForFunction(() => window.__worldDebug.snapshot().vehicles.find(v => v.id === 'offroad').waterSeconds > .15,
      undefined, { timeout });
    const wet = await observe(page, 'offroad');
    await bot.release();
    await page.getByText(vehicleRecovered, { exact: true }).waitFor({ timeout });
    const landing = await observe(page, 'offroad');
    assert.ok(landing.activeVehicle === 'offroad' && landing.position[1] > 0 && horizontal(wet.position, landing.position) > 2,
      JSON.stringify(landing));
    assert.ok(landing.position[0] < -11, JSON.stringify(landing));
    await bot.hold(['KeyW']);
    await page.waitForFunction(at => {
      const car = window.__worldDebug.snapshot().vehicles.find(v => v.id === 'offroad');
      return car.wheelContacts.every(Boolean) && Math.hypot(car.position[0] - at[0], car.position[2] - at[2]) > 1;
    }, landing.position, { timeout: 10_000 });
    const resumed = await observe(page, 'offroad');
    await bot.release();
    return { carPlacement, start, wet, landing, resumed, coasterStayedDelayedUntilAfterRecovery: true };
  });
} finally { await browser.close(); }
