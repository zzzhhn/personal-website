import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const [base, version = 'after'] = process.argv.slice(2);
assert.ok(['before', 'markers', 'after'].includes(version));
const url = new URL('/world/', base ?? 'http://127.0.0.1:4343');
const browser = await loadPlaywright().chromium.launch({executablePath: CHROME, args:['--use-angle=metal']});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({timeout:75000});
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)), false);
  url.searchParams.set('qa','1');
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__worldDebug?.sceneObjects().includes('brain-quarry-approach'), undefined, {timeout:75000});
  const bot = new Bot(page);
  assert.ok(await bot.fixtureTeleport([-54,2.15,-36], 'start on the approach from the mainland'));
  const probes = await page.evaluate(()=>{
    const d=window.__worldDebug, result=[];
    const length=Math.hypot(14,7);
    for (const distance of [4,8,12]) for (const side of [-1,1]) {
      const x=-54+(-14*distance-7*2.4*side)/length, z=-36+(-7*distance+14*2.4*side)/length;
      result.push({x,z,...d.castPlayer([x-.85,2.04,z],[x+.85,2.04,z])});
    }
    return result;
  });
  const route=await bot.walk([[-57.58,-37.79],[-61.16,-39.58],[-64.73,-41.37],[-68,-43],[-71.2,-45.4],[-74.4,-47.8],[-77.6,-50.2],[-80.8,-52.6]],{arrive:.43,timeout:15,maxRecoveries:1});
  const grounded=route.trace.filter(row=>row.g).length;
  console.log(JSON.stringify({version,placements:bot.fixtureCalls,probes,legs:route.legs,blocking:route.trace.slice(-6).flatMap(r=>r.contacts?.map(c=>({name:c.other.name,asset:c.other.assetId,normal:c.normal}))),grounded,samples:route.trace.length,errors}));
  assert.ok(probes.every(row=>version!=='before' ? row.other?.name==='brain-quarry-marker-sides' : !row.hit),JSON.stringify(probes));
  if (version==='after') {
    assert.ok(route.legs.length===8 && route.legs.every(leg=>leg.reached && !leg.recoveries));
  } else {
    assert.equal(route.legs.at(-1).reached,false);
    assert.ok(route.trace.some(row=>row.contacts?.some(c=>c.other.name==='street-knock-rail-guard-3-2')));
  }
  assert.ok(grounded>route.trace.length*.95);
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
