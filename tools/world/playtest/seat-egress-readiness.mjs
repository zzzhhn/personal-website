import assert from 'node:assert/strict';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [base = 'http://127.0.0.1:4388', mode = 'fixed'] = process.argv.slice(2);
assert.ok(['before', 'fixed', 'ordinary'].includes(mode));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const bot = new Bot(page);
await page.routeWebSocket('**/*', ws => ws.close());
const wait = (predicate, arg, timeout = 14_000) => page.waitForFunction(predicate, arg, { timeout });
const marker = page.locator('aside.world-location svg circle[r="2.6"]');
const pos = () => marker.evaluate(el => [el.cx.baseVal.value, el.cy.baseVal.value]);
async function approach(point, radius = .38) {
  const deadline = Date.now() + 18_000;
  while (true) {
    const [x, z] = await pos();
    if (Math.hypot(point[0] - x, point[1] - z) < radius) break;
    assert.ok(Date.now() < deadline, JSON.stringify({ point, x, z }));
    await bot.hold(comboFor(point[0] - x, point[1] - z).keys);
    await page.waitForTimeout(55);
  }
  await bot.release();
}

const read = () => page.evaluate(() => {
  const d = window.__worldDebug, s = d.snapshot(), c = d.camera(), state = d.state();
  return { p: s.player, step: s.physicsStep, grounded: s.grounded, seat: state.seat,
    camera: { target: c.target, yaw: c.yaw, collision: c.collided }, notice: state.toast?.en, contacts: d.contacts().map(row => row.other.name) };
});

try {
  const ordinary = mode === 'ordinary';
  await page.goto(new URL(ordinary ? '/world/' : '/world/?qa=1', base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 90_000 });
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), !ordinary);
  const spawn = await pos();
  assert.ok(Math.hypot(spawn[0] + 42, spawn[1] - 35) < .7);
  await approach([-41.2, 33.2], .52);
  const seatId = 'camp-bench-0-a';
  const anchor = ordinary ? [-38.784, 34.502] : await page.evaluate(id => {
    const seat = window.__worldInteract.list().find(item => item.id === id);
    if (!seat) throw new Error(id);
    return [seat.position[0], seat.position[2]];
  }, seatId);
  await approach(anchor, .66);
  if (ordinary) {
    const active = page.locator('.world-prompt li.is-active');
    for (let i = 0; i < 5 && !(await active.getByText('Sit', { exact: true }).count()); i++) {
      await bot.press('KeyQ'); await page.waitForTimeout(150);
    }
    await active.getByText('Sit', { exact: true }).waitFor();
    await bot.press('KeyE');
    await page.waitForTimeout(900);
    const seated = await pos();
    await bot.press('KeyE');
    await page.waitForTimeout(800);
    const standing = await pos();
    assert.ok(Math.hypot(seated[0] - standing[0], seated[1] - standing[1]) > .35);
    console.log(JSON.stringify({ mode, spawn, seated, standing, events: bot.events, relocations: bot.fixtureCalls }));
  } else {
    await wait(id => window.__worldDebug.state().nearbyInteract?.choices.some(offer => offer.id === id), seatId);
    for (let i = 0; i < 5 && await page.evaluate(id => window.__worldDebug.state().nearbyInteract?.id !== id, seatId); i++) {
      await bot.press('KeyQ'); await page.waitForTimeout(150);
    }
    assert.equal(await page.evaluate(() => window.__worldDebug.state().nearbyInteract?.id), seatId);
    await bot.press('KeyE');
    await wait(id => window.__worldDebug.state().seat?.id === id, seatId);
    await page.waitForTimeout(800);
    const seated = await read();
    const block = [seated.p[0], seated.p[1] + .1, seated.p[2]];
    assert.equal(await page.evaluate(p => window.__worldDebug.rideObstacle(p, [4, 3, 4]), block), true, 'The obstacle fixture is development QA only');
    await wait(step => window.__worldDebug.snapshot().physicsStep > step + 6, seated.step);
    await bot.press('KeyE');
    await page.waitForTimeout(700);
    const refused = await read();
    console.log(JSON.stringify({ mode, spawn, anchor, block, seated, refused, relocations: bot.fixtureCalls }));
    if (mode === 'before') {
      assert.equal(refused.seat, null, 'Baseline discards the seat despite blocked egress');
    } else {
      assert.equal(refused.seat?.id, seatId);
      assert.ok(Math.hypot(...refused.p.map((coordinate, i) => coordinate - seated.p[i])) < .001);
      assert.equal(refused.notice, 'The way out is blocked. Stay seated and try again when clear.');
      await bot.hold(['KeyW']); await page.waitForTimeout(300); await bot.release();
      assert.equal((await read()).seat?.id, seatId);
      assert.equal(await page.evaluate(() => window.__worldDebug.rideObstacle(null)), true);
      await page.waitForTimeout(200);
      await bot.press('KeyE');
      await wait(() => !window.__worldDebug.state().seat && window.__worldDebug.snapshot().grounded);
      const standing = await read();
      assert.ok(Math.hypot(standing.p[0] - seated.p[0], standing.p[2] - seated.p[2]) > .4);
      await bot.hold(comboFor(standing.p[0] - seated.p[0], standing.p[2] - seated.p[2]).keys);
      try {
        await wait(at => {
          const p = window.__worldDebug.snapshot().player;
          return Math.hypot(p[0] - at[0], p[2] - at[2]) > .35;
        }, standing.p, 6_000);
      } finally { await bot.release(); }
      const moving = await read();
      assert.ok(Math.hypot(moving.p[0] - standing.p[0], moving.p[2] - standing.p[2]) > .35);
      console.log(JSON.stringify({ mode, standing, moving }));
    }
  }
  assert.deepEqual(bot.fixtureCalls, []);
} finally { await bot.release(); await browser.close(); }
