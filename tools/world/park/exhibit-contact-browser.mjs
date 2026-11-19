/** Ordinary entry and the P18 flip, contact, occupied sweep, and retry using real keys. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from '../playtest/lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4343';
const url = new URL('/world/', base).href;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const viewport = { width: 1056, height: 700 };
const errors = [], localAnalytics = [];
let qa, stage = 'ordinary entry';
async function entry(path) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text(), source = message.location().url;
    if (source === new URL('/api/events', url).href && /\b(404|501)\b/.test(text)) localAnalytics.push({ text, source });
    else errors.push({ text, source });
  });
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  assert.ok(response.ok());
  return { page, sha: createHash('sha256').update(await response.body()).digest('hex') };
}
try {
  const { page: ordinary, sha: entrySha256 } = await entry(url);
  await ordinary.locator('.world-camp-return:enabled').waitFor({ timeout: 75000 });
  await ordinary.keyboard.press('Escape');
  await ordinary.locator('dialog[open]').waitFor();

  stage = 'QA scene and collider registration';
  const { page, sha } = await entry(`${url}?qa=1`);
  qa = page;
  assert.equal(sha, entrySha256);
  await page.waitForFunction(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().player, undefined, { timeout: 75000 });
  const bot = new Bot(page);
  await page.waitForFunction(() => window.__parkWalk?.huts && window.__parkExhibits?.().P18, undefined, { timeout: 40000 });
  const registrations = await page.evaluate(() => window.__worldDebug.physicsInventory()
    .filter(row => /^park-exhibit-.+-P1[3-8]-/.test(row.visualRef ?? '') || /^exhibit-P1[45]-(crate|stool)$/.test(row.assetId ?? ''))
    .map(row => ({ name: row.visualRef, asset: row.assetId, shape: row.shape })).sort((a,b) => a.name.localeCompare(b.name)));
  assert.equal(registrations.length, 19, JSON.stringify(registrations));
  assert.equal(new Set(registrations.map(row => row.name)).size, 19);
  const inventory = await page.evaluate(() => {
    const { registrations, errors } = window.__worldDebug.reviewCollisionInventory();
    return { registrations: Object.fromEntries(Object.entries(registrations).filter(([key]) => key.startsWith('park-exhibit-set-'))),
      errors: errors.filter(error => error.includes('park-exhibit-set-')) };
  });
  assert.deepEqual(inventory, { registrations: { 'park-exhibit-set-evalforge': 2, 'park-exhibit-set-djc': 2, 'park-exhibit-set-hepai': 11,
    'park-exhibit-set-accompany': 2, 'park-exhibit-set-interactive-learning': 2 }, errors: [] });
  const hut = await page.evaluate(() => window.__parkWalk.huts.find(h => h.id === 'interactive-learning'));
  const at = (offset, y = 0) => [hut.anchor[0] + hut.front[0] * offset, hut.anchor[1] + y, hut.anchor[2] + hut.front[1] * offset];
  const wait = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 15_000 });
  const walk = async offset => {
    const [x,,z] = at(offset);
    const result = await bot.walk([[x,z]], { timeout: 8, arrive: .13, stopOnBlocked: true });
    assert.ok(result.legs[0].reached, JSON.stringify(result.legs[0]));
  };
  const ahead = [-hut.front[0], 0, -hut.front[1]];
  const sampleInPage = ({ origin, direction, during }) => {
    const debug = window.__worldDebug;
    const board = window.__parkExhibits().P18;
    if (during && (board.angle < .5 || board.angle > 1.4)) return false;
    const contacts = debug.physicsInventory().filter(row => row.visualRef === 'park-exhibit-interactive-learning-P18-board');
    return { visible: debug.visualRaycast(origin, direction, 'P18-board')[0],
      collider: debug.probeAsset('P18-board', origin, direction, .02), contacts, board };
  };
  const args = { origin: at(0,1.62), direction: ahead };
  const contact = async during => {
    const p = during ? await (await wait(sampleInPage, { ...args, during })).jsonValue() : await page.evaluate(sampleInPage, args);
    assert.ok(p.visible && p.collider, JSON.stringify(p));
    assert.equal(p.contacts.length, 1);
    assert.equal(p.contacts[0].shape, 'trimesh');
    // An oblique sphere sweep contacts off the ray's axis. Compare the Rapier
    // witness to the visual cast along its own normal, at that actual point.
    assert.ok(p.collider.visualBoundaryGap !== null && p.collider.visualBoundaryGap < .002, JSON.stringify(p));
    return { angle: p.board.angle, distance: p.visible.distance, contact: p.collider.toi,
      boundaryGap: p.collider.visualBoundaryGap, rotation: p.contacts[0].rotation };
  };
  await bot.fixtureTeleport(at(0,.75), 'P18 approach on its hut deck');
  await wait(() => window.__worldDebug.state().nearbyInteract?.id === 'park-P18-interactive-learning');
  stage = 'first flip and moving contact';
  const before = await contact();
  const movingContact = contact(true);
  await bot.press('KeyE');
  const turning = await movingContact;
  assert.ok(turning.distance < before.distance - .03);
  stage = 'first flip completes';
  await wait(() => window.__worldDebug.state().nearbyInteract?.id === 'park-P18-interactive-learning'
    && window.__parkExhibits().P18.runs === 1);
  const flipped = await contact();
  assert.ok(Math.abs(flipped.angle - Math.PI) < .001);
  assert.ok(Math.abs(flipped.distance - before.distance) < .004);

  stage = 'walk into the sweep and request a second flip';
  await walk(-.48);
  await bot.press('KeyE');
  await wait(() => window.__parkExhibits().P18.blocked);
  const heldAt = (await bot.feedback()).player;
  const held = await page.evaluate(() => window.__parkExhibits().P18);
  await bot.press('KeyE');
  const step = await page.evaluate(() => window.__worldDebug.snapshot().physicsStep);
  await wait(step => window.__worldDebug.snapshot().physicsStep >= step + 25, step);
  assert.deepEqual(await page.evaluate(() => window.__parkExhibits().P18), held);
  const still = (await bot.feedback()).player;
  assert.ok(Math.hypot(still[0] - heldAt[0], still[2] - heldAt[2]) < .03);
  stage = 'walk clear and resume';
  const retreatKeys = comboFor(...hut.front).keys;
  try {
    await bot.hold(retreatKeys);
    await wait(({ from, front }) => {
      const p = window.__worldDebug.snapshot().player;
      return (p[0] - from[0]) * front[0] + (p[2] - from[2]) * front[1] > .62;
    }, { from: still, front: hut.front });
  } finally { await bot.release(); }
  const steppedBack = (await bot.feedback()).player;
  await wait(() => window.__worldDebug.state().nearbyInteract?.id === 'park-P18-interactive-learning'
    && window.__parkExhibits().P18.runs === 2);
  const restored = await contact();
  assert.ok(Math.abs(restored.angle - 2 * Math.PI) < .001);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, browser: browser.version(), entrySha256, inventory, registrations, before, turning, flipped, held, heldAt,
    steppedBack, retreatKeys, restored,
    fixtures: bot.fixtureCalls, input: bot.events, localAnalytics }));
} catch (error) {
  const game = await qa?.evaluate(() => ({ board: window.__parkExhibits?.().P18, player: window.__worldDebug?.snapshot().player,
    nearby: window.__worldDebug?.state().nearbyInteract?.id })).catch(() => null);
  console.error(JSON.stringify({ stage, error: String(error), game, errors, localAnalytics }));
  throw error;
} finally {
  await browser.close();
}
