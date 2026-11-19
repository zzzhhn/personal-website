import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'fixed'] = process.argv.slice(2);
assert.ok(['before', 'fixed'].includes(mode));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const bot = new Bot(page);
await page.routeWebSocket('**/*', ws => ws.close());
await page.addInitScript(() => {
  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'Resume standard pad fixture', mapping: 'standard', connected: true, index: 0, axes: [0, 0, 0, 0], buttons, timestamp: 0 };
  let connected = false;
  Object.defineProperty(navigator, 'getGamepads', { value: () => connected ? [pad, null, null, null] : [] });
  window.testPadButton = (index, pressed) => {
    connected = true;
    Object.assign(buttons[index], { pressed, touched: pressed, value: Number(pressed) });
  };
});
const wait = (predicate, arg, timeout = 18_000) => page.waitForFunction(predicate, arg, { timeout });
const pad = (index, pressed) => page.evaluate(([index, pressed]) => window.testPadButton(index, pressed), [index, pressed]);
const read = () => page.evaluate(() => ({
  step: window.__worldDebug.snapshot().physicsStep, paused: window.__worldDebug.state().paused,
  phase: window.__alphaIsland.ride().phase, route: window.__alphaIsland.ride().u,
  leaveRequested: [...document.querySelectorAll('button:disabled')].some(button => button.textContent === 'E · Leave safely'),
}));
try {
  await page.goto(new URL('/world/', base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  await page.goto(new URL('/world/?qa=1', base).href, { waitUntil: 'domcontentloaded' });
  await wait(() => window.__worldDebug?.snapshot().grounded && window.__worldInteract?.list().some(item => item.id === 'alpha-ferry-board-0'), undefined, 60_000);
  assert.ok(await bot.fixtureTeleport([-10, 2.02, 109], 'Ferry embarkation approach after ordinary camp spawn'));
  await wait(() => window.__worldDebug.state().nearbyInteract?.choices.some(row => row.id === 'alpha-ferry-board-0'));
  for (let i = 0; i < 6 && await page.evaluate(() => window.__worldDebug.state().nearbyInteract?.id !== 'alpha-ferry-board-0'); i++) {
    await bot.press('KeyQ'); await page.waitForTimeout(140);
  }
  assert.equal(await page.evaluate(() => window.__worldDebug.state().nearbyInteract?.id), 'alpha-ferry-board-0');
  await bot.press('KeyE');
  const normal = page.getByRole('button', { name: 'Skip travel to arrival', exact: true });
  const leaving = page.getByRole('button', { name: 'Skip return and disembark', exact: true });
  await normal.waitFor({ timeout: 60_000 });
  await bot.press('Escape');
  await wait(() => window.__worldDebug.state().paused);
  const paused = await read();
  await pad(1, true);
  await page.waitForTimeout(240);
  await bot.press('Escape');
  await wait(step => !window.__worldDebug.state().paused && window.__worldDebug.snapshot().physicsStep > step + 20, paused.step);
  const resumed = await read();
  const skippedWithoutFreshInput = await leaving.isVisible();
  assert.equal(skippedWithoutFreshInput, mode === 'before');
  let fresh = null;
  if (mode === 'fixed') {
    assert.equal(await normal.isVisible(), true);
    await pad(1, false);
    await wait(step => window.__worldDebug.snapshot().physicsStep > step + 5, resumed.step);
    await pad(1, true);
    await leaving.waitFor({ timeout: 5_000 });
    fresh = await read();
  }
  await pad(1, false);
  console.log(JSON.stringify({ mode, paused, resumed, skippedWithoutFreshInput, fresh, input: 'simulated standard Gamepad API through production input handler', relocations: bot.fixtureCalls }));
} finally { await bot.release(); await browser.close(); }
