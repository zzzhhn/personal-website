/** Usage: WORLD_BROWSER_MODULES=/path/to/existing/playwright/package node tools/world/playtest/foundation-interactions.mjs [origin] [route ...]
 * Routes: ferry, cable, sled, coaster, lamp, factory, yard, park. Omit route names to run them all.
 * The optional coaster-obstacle route requires a development server for its Rapier box fixture.
 * The ordinary entry is checked first. QA then stages positions and the coaster save. Interactions
 * use the shipping keyboard, controller mapping and panel buttons, and finish with the real actor. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const [origin='http://127.0.0.1:4343', ...routes] = process.argv.slice(2);
const url = new URL('/world/', origin);
const rides = {
  ferry: { start: [-10,2.02,109], exit: [156,148] },
  cable: { start: [260,38.88,148], exit: [260,218] },
  sled: { start: [256,76.88,232], exit: [171,163] },
  coaster: { start: [55.361930289,1.95,-151.945030559], exit: [55.361930289,-151.945030559] },
};
const available = [...Object.keys(rides), 'lamp', 'factory', 'yard', 'park'];
const gangwayLoss = ['ferry-gangway-loss','cable-gangway-loss','sled-gangway-loss'];
assert.ok(routes.every(route => available.includes(route) || gangwayLoss.includes(route) || route === 'coaster-obstacle'), 'unknown route');
const selected = routes.length ? routes : available;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const viewport = { width: 1056, height: 700 };
const page = await browser.newPage({ viewport });
const bot = new Bot(page);
const errors = [], previewAnalytics = [], failures = [], registry = new Set();
const report = (route, fields) => console.log(JSON.stringify({ route, ...fields }));
const wait = (predicate, arg, timeout=30_000) => page.waitForFunction(predicate, arg, { timeout, polling: 200 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function watchErrors(surface, entryMode) {
  surface.on('pageerror', error => errors.push({ entryMode, pageError: error.stack || error.message }));
  surface.on('console', message => {
    if (message.type() !== 'error') return;
    const error = { entryMode, text: message.text(), url: message.location().url };
    if (error.url === new URL('/api/events', url).href && /\b(404|501)\b/.test(error.text)) previewAnalytics.push(error);
    else errors.push(error);
  });
}
watchErrors(page, 'qa');
await page.addInitScript(() => {
  if (new URLSearchParams(location.search).get('qa') !== '1') return;
  localStorage.setItem('bobby-world.intent-coaster.progress.v1', JSON.stringify({
    version: 1, bankRevision: 'original-20261027-v1', passed: ['T1','T2','T3','T4','T5','T6'], clarified: [],
    chestOpen: true, keyTaken: true, gateOpen: true,
  }));
  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'Foundation standard pad fixture', mapping: 'standard', connected: true, index: 0, axes: [0,0,0,0], buttons, timestamp: 0 };
  let connected = false;
  Object.defineProperty(navigator, 'getGamepads', { value: () => connected ? [pad,null,null,null] : [null,null,null,null] });
  window.foundationPad = ({ index, pressed, axes }) => {
    if (!connected) {
      connected = true;
      window.dispatchEvent(new Event('gamepadconnected'));
    }
    if (index !== null) Object.assign(buttons[index], { pressed, touched: pressed, value: Number(pressed) });
    if (axes) pad.axes = axes;
  };
});

const actor = () => page.evaluate(() => {
  const snap = window.__worldDebug.snapshot(), state = window.__worldDebug.state();
  return { player: snap.player, grounded: snap.grounded, near: state.nearbyInteract?.id, toast: state.toast?.en };
});
const step = () => page.evaluate(() => window.__worldDebug.snapshot().physicsStep);
const advance = async (count=6) => wait(target => window.__worldDebug.snapshot().physicsStep >= target, (await step())+count, 12_000);
const pad = (index, pressed, axes) => page.evaluate(values => window.foundationPad(values), { index, pressed, axes });
async function pressPad(index) {
  await pad(null, false);
  await advance();
  await pad(index, true);
  try { await advance(); } finally { await pad(index, false); }
}
async function collectRegistry() {
  const ids = await page.evaluate(() => window.__worldInteract.list().map(item => item.id));
  for (const id of ids) registry.add(id);
}
async function choose(id, gamepad=false) {
  await wait(id => window.__worldDebug.state().nearbyInteract?.choices.some(row => row.id === id), id);
  for (let i=0; i<4 && (await actor()).near !== id; i++) {
    if (gamepad) await pressPad(13);
    else await bot.press('KeyQ');
    await advance();
  }
  assert.equal((await actor()).near, id);
}
async function place(position, id) {
  // Publish the fixture to the region loader in the same browser task as the capsule move.
  // A physics frame between those calls could publish the previous region again.
  bot.fixtureCalls.push({ t: bot.now(), to: position, reason: id });
  assert.ok(await page.evaluate(position => {
    const world = window.__worldDebug;
    if (!world.teleportPlayer(position)) return false;
    world.set({ position });
    return true;
  }, position));
  await wait(([x,,z]) => {
    const { player, grounded } = window.__worldDebug.snapshot();
    return grounded && player && Math.hypot(x-player[0], z-player[2]) < .3;
  }, position);
  await choose(id);
  await collectRegistry();
}

async function ride(kind, removeGangway=false) {
  const coaster = kind === 'coaster';
  const { start, exit } = rides[kind];
  await place(start, coaster ? 'intent-board' : `alpha-${kind}-board-0`);
  const before = await actor();
  if (coaster) {
    const button = page.locator('.intent-workshop-summary .intent-primary');
    assert.match(await button.innerText(), /Board the train/);
    await button.click();
  } else if (kind === 'cable') await pressPad(3);
  else await bot.press('KeyE');
  const skip = page.getByRole('button', { name: coaster ? 'Skip travel and return to station' : 'Skip travel to arrival', exact: true });
  await skip.waitFor({ timeout: 55_000 });
  if (coaster) {
    await bot.press('KeyE');
    await page.getByRole('button', { name: 'Exit requested. Leaving at the station', exact: true }).waitFor({ timeout: 12_000 });
  }
  let held = null;
  if (removeGangway) {
    const region=`alpha-${kind}-gangway-1`, collider=region+'-contact';
    const handle = () => page.evaluate(name=>window.__worldDebug.physicsInventory().find(c=>c.name===name)?.handle,collider);
    await wait(name=>window.__worldRegionFault?.registered().includes(name),region);
    const original = await handle();
    assert.equal(typeof original,'number');
    assert.equal(await page.evaluate(id=>window.__worldRegionFault.remove(id,true),region),true);
    await wait(name=>!window.__worldDebug.physicsInventory().some(c=>c.name===name),collider);
    await skip.click();
    await page.getByText('The route is not ready or is blocked. Wait or return to camp.',{exact:true}).waitFor();
    const currentRide = () => page.evaluate(()=> {
      const { phase,u,frame } = window.__alphaIsland.ride();
      const player = window.__worldDebug.snapshot().player;
      return { phase,u,root:frame?.root,player };
    });
    held=await currentRide();
    assert.equal(held.phase,'riding');
    assert.ok(held.u<.98);
    await advance(50);
    assert.deepEqual(await currentRide(),held,'the rider and vehicle hold before the unavailable station');
    assert.equal(await page.evaluate(id=>window.__worldRegionFault.remove(id,false),region),true);
    await wait(({name,old})=>window.__worldDebug.physicsInventory().some(c=>c.name===name&&c.handle!==old),{name:collider,old:original});
  } else await skip.click();
  await wait(([x,z]) => {
    const { player, grounded } = window.__worldDebug.snapshot();
    return grounded && player && Math.hypot(x-player[0], z-player[2]) < .3;
  }, exit, 50_000);
  await wait(() => !document.querySelector('.intent-riding') && !window.__alphaIsland?.ride()?.active);
  const landing = await actor();
  await bot.hold(['KeyW']);
  try { await advance(30); } finally { await bot.release(); }
  const { player } = await actor();
  const walked = Math.hypot(landing.player[0]-player[0], landing.player[2]-player[2]);
  assert.ok(walked > .15, 'player can walk after disembarking');
  return { before, held, landing, walked, boarding: coaster ? 'panel' : kind === 'cable' ? 'simulated Y' : 'keyboard E' };
}

async function coasterObstacle() {
  const start = rides.coaster.start;
  const panel = page.locator('.intent-workshop-summary .intent-primary');
  const status = page.locator('.intent-riding [role="status"]');
  const setBox = async position => assert.ok(await page.evaluate(position =>
    window.__worldDebug.rideObstacle(position, [.36,1.36,.36]), position), 'the obstruction fixture requires a development server');
  const hold = async expected => {
    await status.getByText(expected).waitFor({ timeout: 15_000 });
    const first = (await actor()).player;
    await advance(30);
    const second = (await actor()).player;
    assert.ok(Math.hypot(...second.map((n,i)=>n-first[i])) < .02, 'blocked actor must hold its last clear position');
    return first;
  };
  const finishOnPlatform = async () => {
    await page.locator('.intent-riding').waitFor({ state: 'hidden', timeout: 20_000 });
    const exit = await actor();
    assert.ok(exit.grounded && Math.hypot(exit.player[0]-start[0],exit.player[2]-start[2]) < .2);
    await choose('intent-board');
    return exit;
  };
  await place(start,'intent-board');
  try {
    await panel.click();
    await wait(() => window.__worldDebug.snapshot().player[0] < 53.71, undefined, 15_000);
    await setBox([52.31275,2.54339,-152.44564]); // fourth tread, beyond the actor
    const ascent = await hold(/boarding path is blocked/);
    assert.ok(ascent[0] > 52.58);
    await bot.press('KeyE');
    await setBox([53.73373,1.95585,-152.21235]); // reopen ahead, obstruct the return route
    const retreat = await hold(/path to the platform is blocked/);
    assert.ok(retreat[0] >= ascent[0]-.02 && retreat[0] < 53.73373);
    await setBox(null);
    const cancelledAt = await finishOnPlatform();

    await panel.click();
    await page.getByRole('button',{name:'Skip travel and return to station',exact:true}).click({timeout:25_000});
    await page.getByText('Walking down the steps',{exact:true}).waitFor({timeout:15_000});
    await setBox([51.09407,2.93509,-152.64572]); // door threshold while the actor is leaving
    const descent = await hold(/path to the platform is blocked/);
    await bot.press('KeyE');
    assert.deepEqual(await hold(/path to the platform is blocked/),descent);
    await setBox(null);
    const finishedAt = await finishOnPlatform();
    return { ascent, retreat, cancelledAt, descent, finishedAt };
  } finally {
    await page.evaluate(()=>window.__worldDebug.rideObstacle(null));
  }
}

async function lamp() {
  const id = 'alpha-cave-miner-lamp';
  await wait(id => window.__worldInteract?.list().some(item => item.id === id), id);
  const [x,y,z] = await page.evaluate(id => window.__worldInteract.list().find(item => item.id === id).position, id);
  await place([x+1.18,y,z], id);
  const before = await actor();
  await pressPad(3);
  await wait(() => window.__worldDebug.state().nearbyInteract?.label.en === 'Hang the miner lamp back');
  const after = await actor();
  assert.match(after.toast, /Lamp secured/);
  return { before, after, input: 'simulated Y' };
}

async function factory() {
  await place([-234.5,2,-13.5], 'factory-raw');
  const before = await actor();
  await pressPad(3);
  const panel = page.getByRole('region', { name: 'Magnetic intake', exact: true });
  const collect = panel.getByRole('button', { name: 'Collect frame', exact: true });
  await collect.click({ timeout: 20_000 });
  const standing = await actor();
  assert.ok(Math.abs(standing.player[2]+12.5) <= .25);
  await advance(); // The machine has sampled neutral after starting this operation.
  await pad(null, false, [-.8575,.5145,0,0]);
  try {
    await panel.getByText('Aligned. Press E / Y to pick up.', { exact: true }).waitFor({ timeout: 16_000 });
  } finally { await pad(null, false, [0,0,0,0]); }
  await pressPad(3);
  await panel.getByText(/Picking up|Move to the hopper|Over the hopper/).waitFor({ timeout: 12_000 });
  await panel.getByRole('button', { name: 'Leave console' }).click();
  await panel.waitFor({ state: 'hidden' });
  return { before, standing, input: 'simulated Y, panel, left stick, Y' };
}

async function yard() {
  await place([-91,2.1,-150], 'ibd-manifest');
  await bot.press('KeyE');
  const hud = page.locator('[data-ibd-hud]');
  await hud.getByRole('button', { name: 'Hide guidance' }).click();
  await place([-94,2.1,-157], 'ibd-kit');
  await bot.press('KeyE');
  await advance(60);
  const benches = [];
  for (const [id,x] of [['ibd-parts-a',-75.93],['ibd-parts-b',-67.93]]) {
    await place([x,2.15,-186.5], id);
    await bot.press('KeyE');
    await wait(id => window.__worldDebug.state().nearbyInteract?.choices.some(row => row.id === id && row.label.en.includes('Count, gauge')), id);
    await choose(id, true);
    const before = await actor();
    await hud.getByRole('button', { name: /Count, gauge and inspect contents/ }).click();
    const bench = hud.getByRole('region', { name: 'Pocket inspection bench', exact: true });
    await bench.waitFor();
    if (id === 'ibd-parts-a') await bench.getByRole('button', { name: 'Present selected pocket', exact: true }).click();
    else await pressPad(3);
    await bench.getByRole('button', { name: 'Close and read', exact: true }).click({ timeout: 24_000 });
    await bench.getByText('M8', { exact: true }).waitFor({ timeout: 18_000 });
    benches.push({ id, before, after: await actor(), reading: 'M8' });
    await bench.getByRole('button', { name: 'Put back and leave', exact: true }).click();
    await bench.waitFor({ state: 'hidden', timeout: 18_000 });
  }
  return { benches };
}

async function park() {
  const exhibits = [];
  for (const [tag,id] of [['P13','park-P13-evalforge'],['P15','park-P15-hepai'],['P18','park-P18-interactive-learning']]) {
    const offer = await page.waitForFunction(({id,tag}) => {
      if (!window.__parkExhibits?.()?.[tag]) return false;
      return window.__worldInteract?.list().find(item => item.id === id)?.position;
    }, {id,tag}, {timeout:45_000}).catch(error => {
      throw new Error(`Park exhibit ${id} (${tag}) did not register after world startup`, {cause:error});
    });
    const [x,y,z] = await offer.jsonValue();
    await offer.dispose();
    await place([x,y+.25,z], id);
    const before = await page.evaluate(tag => window.__parkExhibits()[tag].runs, tag);
    await bot.press('KeyE');
    await wait(id => window.__worldInteract.list().find(item => item.id === id)?.enabled === false, id);
    await bot.press('KeyE');
    await wait(id => window.__worldInteract.list().find(item => item.id === id)?.enabled === true, id);
    const runs = await page.evaluate(tag => window.__parkExhibits()[tag].runs, tag);
    assert.equal(runs, before+1);
    exhibits.push({ id, runs });
  }
  return { exhibits };
}

try {
  // Keep the two sessions separate so QA startup cannot abort the ordinary entry's lazy assets.
  const ordinary = await browser.newPage({ viewport });
  watchErrors(ordinary, 'ordinary');
  const entry = await ordinary.goto(url.href, { waitUntil: 'domcontentloaded' });
  const entrySha256 = hash(await entry.body());
  const menu = ordinary.locator('dialog[open]');
  await ordinary.locator('.world-camp-return:enabled').waitFor({ timeout: 75_000 });
  await ordinary.keyboard.press('Escape');
  await menu.waitFor();
  await ordinary.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await ordinary.keyboard.press('Escape');
  await menu.waitFor(); // Leave the ordinary scene paused while QA owns the browser.
  report('ordinary entry', { url: url.href, browser: await browser.version(), entrySha256 });

  const fixtures=selected.some(name=>gangwayLoss.includes(name))?'?qa=1&qaRegionFault=1':'?qa=1';
  const qa = await page.goto(new URL(fixtures, url).href, { waitUntil: 'domcontentloaded' });
  assert.equal(hash(await qa.body()), entrySha256, 'ordinary and QA routes use the same build');
  await wait(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().player, undefined, 75_000);
  assert.equal(await page.evaluate(() => window.__worldDebug.state().quality), 'balanced');
  await page.evaluate(() => window.__worldDebug.set({ lang: 'en', timeRunning: false, light: 'noon', worldMinutes: 720 }));
  const cases = { lamp, factory, yard, park, 'coaster-obstacle':coasterObstacle };
  for (const route of selected) {
    try { report(route, { ok: true, ...(gangwayLoss.includes(route) ? await ride(route.split('-')[0],true)
      : Object.hasOwn(rides, route) ? await ride(route) : await cases[route]()) }); }
    catch (error) {
      failures.push(route);
      report(route, { ok: false, error: error.message, actor: await actor().catch(() => null) });
    }
  }
  report('census', { ids: [...registry].sort(), fixtures: bot.fixtureCalls, keys: bot.events, previewAnalytics, errors, failures });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally { await browser.close(); }
