import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

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
const failures = [];
const mainlandCamp = [-42, 35];
const isAt = (point, expected) => Math.hypot(point[0] - expected[0], point[1] - expected[1]) < .5;

async function walk(page, start, keys = ['KeyW'], distance = .5) {
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.waitForFunction(([selector, at, distance]) => {
      const dot = document.querySelector(selector);
      return dot && Math.hypot(dot.cx.baseVal.value - at[0], dot.cy.baseVal.value - at[1]) > distance;
    }, [mapDot, start, distance], { timeout: 14_000 });
  } finally { for (const key of keys) await page.keyboard.up(key); }
  return position(page);
}

async function withPage(name, test) {
  if (caseFilter.size && !caseFilter.has(name)) return;
  const client = await context();
  const page = await client.newPage();
  const entries = [];
  // Allow ongoing work to use this dev server without replacing the loaded modules.
  await page.routeWebSocket('**/*', ws => ws.close());
  try {
    const button = page.locator('button.world-camp-return');
    const ready = () => button.and(page.locator(':enabled')).waitFor({ timeout });
    const open = async start => {
      const response = await page.goto(ordinary(start ? '?start=' + start : ''), { waitUntil: 'domcontentloaded' });
      assert.ok(response?.ok());
      entries.push({ start: start ?? null, sha256: createHash('sha256').update(await response.body()).digest('hex') });
    };
    const began = performance.now();
    const details = await test({ page, open, button, ready });
    console.log(JSON.stringify({ ...details, ok: true, entries, elapsedMs: Math.round(performance.now() - began) }));
  } catch (error) {
    failures.push(name);
    console.log(JSON.stringify({ route: name, ok: false, message: String(error), url: page.url(), entries,
      at: await position(page).catch(() => null) }));
  } finally { await client.close(); }
}

async function playerEntry({ page, open, button, ready },site) {
  await open(site.start);
  await ready();
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  const start=await position(page);
  assert.ok(isAt(start,site.at),JSON.stringify(start));
  const legs=[],bot=new Bot(page);
  for(const target of site.walkOut??[]){
    const before=await position(page), deadline=performance.now()+18000;
    let end=before;
    try{
      while(!isAt(end,target)){
        assert.ok(performance.now()<deadline,JSON.stringify({target,before,end}));
        await bot.hold(comboFor(target[0]-end[0],target[1]-end[1]).keys);
        await page.waitForTimeout(110);
        end=await position(page);
      }
    }finally{await bot.release();}
    legs.push({target,before,end});
  }
  const afterWalk=legs.at(-1)?.end??await walk(page,start,site.keys,site.distance);
  await button.click();
  await page.getByText(campNotice).waitFor({timeout});
  const camp=await position(page);
  assert.ok(isAt(camp,mainlandCamp),JSON.stringify(camp));
  return {route:site.start,start,afterWalk,legs,camp,qa:false};
}

async function recoverEntry({page,open,button,ready},venue){
  const faults=[];
  const fail=route=>{faults.push(new URL(route.request().url()).pathname);return route.abort();};
  await page.route(venue.module,fail);
  const error=page.getByRole('alert').filter({hasText:errorMessage});
  await open(venue.start);
  await error.waitFor({timeout});
  assert.equal(await button.isDisabled(),true);
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)),false);
  await error.getByRole('link',{name:'Return to camp'}).click();
  await ready();
  assert.equal(new URL(page.url()).search,'');
  const camp=await position(page);
  assert.ok(isAt(camp,mainlandCamp),JSON.stringify(camp));

  await open(venue.other);
  await ready();
  const other=await position(page);
  assert.ok(isAt(other,venue.otherAt),JSON.stringify(other));
  await open(venue.start);
  await error.waitFor({timeout});
  const retryLoad=page.waitForRequest(venue.module,{timeout});
  await page.unroute(venue.module,fail);
  await error.getByRole('button',{name:'Try again'}).click();
  const retryAsset=new URL((await retryLoad).url()).pathname;
  await ready();
  const restored=await position(page);
  assert.ok(isAt(restored,venue.at),JSON.stringify(restored));
  assert.ok(faults.length>=2,JSON.stringify(faults));
  return {route:venue.start,faults,camp,otherStart:venue.other,other,retryAsset,restored,
    afterWalk:await walk(page,restored,venue.keys,venue.distance),qa:false};
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

  for (const action of ['wait', 'camp']) {
    const name = 'slow-arrival-' + action;
    await withPage(name, async ({ page, open, button, ready }) => {
      const assets = '**/world/alpha-mine/layout.json';
      const held = Promise.withResolvers();
      const requested = page.waitForRequest(assets, { timeout });
      await page.route(assets, async route => {
        await held.promise;
        if (!page.isClosed()) await route.continue().catch(() => {});
      });
      try {
        await open('brain');
        await requested;
        const loader = page.locator('.world-loading');
        const retry = loader.getByRole('button', { name: 'Try again' });
        assert.ok(await button.isDisabled());
        assert.equal(await retry.count(), 0, 'usual startup keeps its compact loading view');
        await retry.waitFor({ timeout: 40_000 });
        assert.ok(await button.isDisabled(), 'late recovery controls cannot enable an unsupported spawn');
        assert.equal(await page.getByRole('alert').count(), 0, 'a slow response stays recoverable');
        if (action === 'camp') {
          await loader.getByRole('link', { name: 'Return to camp' }).click();
          assert.equal(new URL(page.url()).searchParams.get('start'), null);
        }
        held.resolve();
        await ready();
        const start = await position(page);
        assert.ok(isAt(start, action === 'camp' ? mainlandCamp : [-84, -54.5]), JSON.stringify(start));
        const end = await walk(page, start);
        assert.equal(await loader.count(), 0);
        return {route:name, start, end, debug:await page.evaluate(() => Boolean(window.__worldDebug))};
      } finally { held.resolve(); }
    });
  }

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

  await withPage('tent', async ({ page, open, button, ready }) => {
    await open('tent');
    await ready();
    assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
    const start = await position(page);
    assert.ok(Math.hypot(start[0] + 42, start[1] - 20) < .5, JSON.stringify(start));
    const afterWalk = await walk(page, start, ['KeyS', 'KeyA']);
    assert.ok(afterWalk[1] > start[1] + .45);
    await button.click();
    await page.getByText(campNotice).waitFor({ timeout });
    const camp = await position(page);
    assert.ok(Math.hypot(camp[0] + 42, camp[1] - 35) < .5, JSON.stringify(camp));
    return { route: 'tent', start, afterWalk, camp, qa: false };
  });

  await withPage('town-greybox', async ({ page, open, button, ready }) => {
    const asset='**/assets/world/town-craft/T03.glb';
    const at=[14,-2.5], faults=[];
    const fail=route=>{faults.push(new URL(route.request().url()).pathname);return route.abort();};
    await page.route(asset,fail);
    await open('town');
    await ready();
    assert.equal(await page.evaluate(()=>!!window.__worldDebug),false);
    const ordinaryStart=await position(page);
    assert.ok(isAt(ordinaryStart,at));
    const ordinaryWalk=await walk(page,ordinaryStart,['KeyW']);
    await button.click();
    await page.getByText(campNotice).waitFor({timeout});
    assert.ok(isAt(await position(page),mainlandCamp));

    const qa=ordinary('?start=town&qa=1');
    await page.goto(qa);
    await ready();
    const claim=async () => page.evaluate(() => {
      const d=window.__worldDebug, bodies=d.physicsInventory();
      return { claimed:d.claimedGreybox().includes('building'), grounded:d.snapshot().grounded,
        grey:bodies.filter(c=>c.name==='building-moe'), finished:bodies.filter(c=>c.name==='town-collider-building-moe-visual') };
    });
    await page.waitForFunction(()=>window.__worldDebug?.snapshot().grounded,{},{timeout});
    const failed=await claim();
    assert.equal(failed.claimed,false);
    assert.equal(failed.grey.length,1);
    assert.equal(failed.finished.length,0);

    await page.unroute(asset,fail);
    const gate=Promise.withResolvers(), requested=page.waitForRequest(asset,{timeout});
    await page.route(asset,async route=>{await gate.promise;await route.continue();});
    try {
      await page.reload({waitUntil:'domcontentloaded'});
      await requested;
      await ready();
      await page.waitForFunction(()=>window.__worldDebug?.snapshot().grounded,{},{timeout});
      const before=await claim();
      assert.equal(before.claimed,false);
      assert.equal(before.grey.length,1);
      const beforeReload=await position(page);
      const delayedWalk=await walk(page,beforeReload,['KeyW']);
      gate.resolve();
      await page.waitForFunction(()=>window.__worldDebug?.claimedGreybox().includes('building'),{},{timeout});
      await page.waitForFunction(()=> {
        const d=window.__worldDebug,bodies=d.physicsInventory();
        return d.snapshot().grounded && bodies.some(c=>c.name==='town-collider-building-moe-visual')
          && !bodies.some(c=>c.name==='building-moe');
      },{},{timeout});
      const restored=await claim();
      assert.equal(restored.finished.length,1);
      const afterWalk=await walk(page,delayedWalk,['KeyW']);
      assert.ok(faults.length>=2);
      return {route:'town-greybox',ordinaryStart,ordinaryWalk,faults,failed,before,delayedWalk,restored,afterWalk,
        qa:'only observes collision identities; both walks use regular keys'};
    } finally {gate.resolve();}
  });

  const venues = [
    { start: 'ibd', other: 'coaster', otherAt: [50,-125], module: /\/(?:WorldIbdYard\.[^/]+\.js|WorldIbdYard\.tsx)(?:\?|$)/, at: [-88, -143] },
    { start: 'coaster', other: 'ibd', otherAt: [-88,-143], module: /\/(?:WorldIntentCoaster\.[^/]+\.js|WorldIntentCoaster\.tsx)(?:\?|$)/, at: [50, -125] },
    { start: 'exchange', other: 'club', otherAt: [30,39], module: /\/(?:WorldAlphaExchange\.[^/]+\.js|WorldAlphaExchange\.tsx)(?:\?|$)/, at: [60, -52.6] },
    { start: 'club', other: 'exchange', otherAt: [60,-52.6], module: /\/(?:WorldDjcClub\.[^/]+\.js|WorldDjcClub\.tsx)(?:\?|$)/, at: [30, 39] },
    { start: 'factory', other: 'ibd', otherAt: [-88,-143], module: /\/(?:WorldFactory\.[^/]+\.js|WorldFactory\.tsx)(?:\?|$)/, at: [-149,-17] },
    { start: 'alpha', other: 'exchange', otherAt: [60,-52.6], module: '**/world/alpha-mine/layout.json', at: [-84,-54.5] },
    { start: 'alpha-cave', other: 'alpha-waterwheel', otherAt: [206,206], module: '**/assets/world/terrain/cave.bin.gz*', at: [219,156] },
    { start: 'alpha-shallows', module: '**/assets/world/terrain/alpha.bin.gz*', at: [190.25,134], keys: ['KeyW','KeyD'], distance: 1.5,
      walkOut: [[190,136],[189.4,139],[188.1,141.5]] },
    { start: 'alpha-wind', module: '**/assets/world/terrain/alpha.bin.gz*', at: [254,148], keys: ['KeyS','KeyD'], distance: 1.5,
      walkOut: [[252.5,150.7],[250.5,154],[247.5,158]] },
  ];
  for(const venue of venues)await withPage(venue.start,async env=>{
    if(venue.other)return recoverEntry(env,venue);
    const cold=await playerEntry(env,venue);
    // The shared Alpha terrain request can fail independently of the mainland.
    const retry=await recoverEntry(env,{...venue,other:'town',otherAt:[14,-2.5]});
    return {...retry,cold};
  });
  assert.deepEqual(failures,[]);
} finally { await browser.close(); }
