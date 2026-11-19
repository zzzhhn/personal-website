import assert from 'node:assert/strict';
import {Bot,CHROME,loadPlaywright} from './lib.mjs';

const [base='http://127.0.0.1:4343',version='after']=process.argv.slice(2);
assert.ok(['before','after'].includes(version));
const url=new URL('/world/',base);
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,args:['--use-angle=metal']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({timeout:75000});
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)),false);
  url.searchParams.set('qa','1');url.searchParams.set('start','coaster');
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__worldSoftBush && window.__worldDebug?.sceneObjects().includes('coaster-vegetation'),undefined,{timeout:75000});
  const bot=new Bot(page);
  // Approach the authored G19 at ground level from the south. The adjacent tree stays clear.
  const x=6.99,z=-237.79;
  assert.ok(await bot.fixtureTeleport([x,2.04,z+2.3],'start on the western shoulder of the coaster garden'));
  await page.waitForFunction(()=>window.__worldDebug.snapshot().grounded,undefined,{timeout:10000});
  const soft=()=>page.evaluate(()=>window.__worldSoftBush.state());
  const before=await soft();let inside=0;
  const walk=await bot.walk([[x,z],[x,z-2]],{arrive:.28,timeout:14,maxRecoveries:0,
    onTick:async()=>{if((await soft()).lastInside.some(a=>a.kind==='person' && a.vh>.05))inside++;}});
  const after=await soft(), inventory=await page.evaluate(()=>window.__worldDebug.reviewCollisionInventory());
  const row={version,entry:base,placements:bot.fixtureCalls,legs:walk.legs,inside,horizontalImpulse:after.horizontalImpulseTotal-before.horizontalImpulseTotal,
    registrations:inventory.registrations['coaster-vegetation']??null,inventoryErrors:inventory.errors.filter(s=>s.includes('coaster-vegetation')),errors};
  console.log(JSON.stringify(row));
  assert.ok(walk.legs.length===2 && walk.legs.every(l=>l.reached && !l.recoveries));
  if(version==='after'){
    assert.ok(inside>0 && row.horizontalImpulse>0);
    assert.equal(row.registrations,48);
  } else assert.equal(inside,0);
  assert.deepEqual(row.inventoryErrors,[]);assert.deepEqual(errors,[]);
} finally { await browser.close(); }
