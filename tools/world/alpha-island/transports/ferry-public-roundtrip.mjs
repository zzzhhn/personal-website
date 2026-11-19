import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from '../../playtest/lib.mjs';

const [origin = 'http://127.0.0.1:4343'] = process.argv.slice(2);
const url = new URL('/world/?qa=1', origin);
const mac = process.platform === 'darwin';
const browser = await loadPlaywright().chromium.launch({
  headless: true,
  executablePath: process.env.WORLD_CHROME || (mac ? CHROME : undefined),
  ...(mac ? { args: ['--use-angle=metal'] } : {}),
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const bot = new Bot(page);
const record = { url: url.href, walk: [], rides: [], pageErrors: [], analyticsErrors: [] };
page.on('pageerror', error => record.pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const errors = message.location().url === new URL('/api/events', url).href
    ? record.analyticsErrors : record.pageErrors;
  errors.push(message.text());
});

const wait = (predicate, value, timeout = 30_000) => page
  .waitForFunction(predicate, value, { timeout, polling: 100 }).then(handle => handle.dispose());
const waitStep = step => wait(step => window.__worldDebug.snapshot().physicsStep >= step, step);
const status = () => page.evaluate(() => {
  const world = window.__worldDebug;
  const actor = world.snapshot(), state = world.state(), ride = window.__alphaIsland.ride();
  return { position: actor.player, step: actor.physicsStep, grounded: actor.grounded,
    yaw: world.camera()?.yaw, activeVehicle: actor.activeVehicle, shot: state.shot, paused: state.paused,
    nearby: state.nearbyInteract?.id ?? null, input: world.inputState(),
    ride: { active: ride.active, phase: ride.phase, u: ride.u } };
});

async function walk([x, z, tolerance = .55]) {
  const begin = await status();
  const leg = { target: [x, z], begin, headings: [] };
  record.walk.push(leg);
  let best = Infinity, lastProgress = begin.step;
  try {
    for (let i = 0; i < 155; i++) {
      const actor = await status();
      const dx = x - actor.position[0], dz = z - actor.position[2];
      const remaining = Math.hypot(dx, dz);
      assert.equal(actor.activeVehicle, null);
      if (remaining < tolerance) {
        leg.end = actor;
        assert.ok(actor.grounded, 'lost ground at walking checkpoint ' + [x, z]);
        return;
      }
      if (remaining < best - .06) {
        best = remaining;
        lastProgress = actor.step;
      }
      assert.ok(actor.step - lastProgress <= 150, 'walking blocked at ' + [x, z]);
      const yawOffset = Math.atan2(.8, .6) - (actor.yaw ?? Math.atan2(.8, .6));
      const cosine = Math.cos(yawOffset), sine = Math.sin(yawOffset);
      const { keys } = comboFor(dx * cosine - dz * sine, dx * sine + dz * cosine);
      if (leg.headings.at(-1)?.keys.join() !== keys.join()) {
        leg.headings.push({ step: actor.step, position: actor.position, keys });
      }
      await bot.hold(keys);
      await waitStep(actor.step + 8);
    }
    assert.fail('walking did not reach ' + [x, z]);
  } finally {
    await bot.release();
  }
}

async function board(terminal, [x, y, z]) {
  const id = `alpha-ferry-board-${terminal}`;
  const ride = { id, input: ['KeyE', 'Skip travel to arrival'] };
  record.rides.push(ride);
  await wait(id => {
    const world = window.__worldDebug;
    return world.snapshot().grounded && world.state().nearbyInteract?.choices
      .some(choice => choice.id === id && choice.label.en.startsWith('Board the '));
  }, id);
  for (let i = 0; i < 5 && (await status()).nearby !== id; i++) await bot.press('KeyQ');
  ride.before = await status();
  assert.equal(ride.before.nearby, id);
  await bot.press('KeyE');
  const skip = page.getByRole('button', { name: 'Skip travel to arrival', exact: true });
  await skip.waitFor({ timeout: 55_000 });
  ride.boarded = await status();
  assert.equal(ride.boarded.ride.phase, 'riding');
  const { u } = ride.boarded.ride;
  assert.ok(terminal === 0 ? u < .15 : u > .85, 'departed from the requested terminal');
  await skip.click();
  await wait(([x, z]) => {
    const actor = window.__worldDebug.snapshot();
    return !window.__alphaIsland.ride().active && actor.grounded
      && Math.hypot(actor.player[0] - x, actor.player[2] - z) < .28;
  }, [x, z], 55_000);
  ride.landing = await status();
  assert.ok(Math.abs(ride.landing.position[1] - y) < .12, 'landed on the terminal deck');
  return ride.landing;
}

try {
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  assert.ok(response?.ok(), 'production world is available');
  record.htmlSha256 = createHash('sha256').update(await response.body()).digest('hex');
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 75_000 });
  await wait(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().grounded
    && window.__alphaIsland && window.__worldCampContent?.hard().filter(part => part.id.startsWith('L01-')).length === 2
    && window.__worldDebug.physicsInventory().some(part => part.visualRef === 'alpha-ferry-contact-body'), undefined, 90_000);
  record.spawn = await status();
  const [x, , z] = record.spawn.position;
  assert.ok(Math.hypot(x + 42, z - 35) < .55, 'expected the default public camp birth');
  assert.ok(!record.spawn.shot && !record.spawn.paused && record.spawn.activeVehicle === null);
  // Walk between the lamps before turning around the parked offroad. Follow the coastal
  // carriageway around the raised Contact foundation, then turn onto the mainland pier.
  for (const target of [
    [-39, 37.8, .48], [-33.5, 37.8, .48], [-31.4, 35, .48], [-28.3, 34, .48],
    [-28.1, 35.85, .30], [-23.2, 35.85, .28], [-18, 34], [-14, 32], [-5, 29],
    [5, 29.4], [17, 30], [18.1, 36.7], [14.4, 45.7], [11.4, 51.9], [3.5, 59.9],
    [-4, 67.5], [-10, 69.7], [-10, 72], [-10, 91], [-10, 103], [-10, 109],
  ]) await walk(target);
  await board(0, [156, 2.348, 148]);
  const landing = await board(1, [-10, 1.960, 109]);
  await bot.hold(['KeyW']);
  await waitStep(landing.step + 30);
  await bot.release();
  const after = await status();
  const distance = Math.hypot(after.position[0] - landing.position[0], after.position[2] - landing.position[2]);
  record.egress = { key: 'KeyW', distance, after };
  assert.ok(distance > .3 && after.grounded && !after.ride.active, 'walking restored on the mainland');
  assert.deepEqual(bot.fixtureCalls, []);
  assert.deepEqual(record.pageErrors, []);
  record.ok = true;
} catch (error) {
  record.ok = false;
  record.error = error.message;
  record.failedAt = await status().catch(() => null);
  record.contacts = await page.evaluate(() => window.__worldDebug?.contacts()
    .filter(contact => contact.self === 'player')).catch(() => null);
  throw error;
} finally {
  console.log(JSON.stringify({ ...record, keys: bot.events, fixtureCalls: bot.fixtureCalls }));
  await bot.release();
  await browser.close();
}
