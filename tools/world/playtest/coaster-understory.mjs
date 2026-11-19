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
  await page.waitForFunction(()=>window.__worldSoftBush && window.__worldDebug?.snapshot().grounded && window.__worldDebug.state().ready && window.__worldDebug.sceneObjects().includes('coaster-vegetation'),undefined,{timeout:75000});
  const bot=new Bot(page);
  const x=6.99,z=-237.79;
  const yaw=await page.evaluate(()=>window.__worldDebug.camera().yaw);
  const dx=-Math.cos(yaw), dz=-Math.sin(yaw);
  assert.ok(await bot.fixtureTeleport([x-dx*2.5,2.04,z-dz*2.5],'line up with the shrub along the actual camera heading'));
  await page.waitForFunction(()=>window.__worldDebug.snapshot().grounded,undefined,{timeout:30000});
  const before=await page.evaluate(()=>window.__worldSoftBush.state());
  await page.evaluate(()=>{
    let inside=0,closest=Infinity;
    window.coasterBushSamples=()=>({inside,closest});
    function sample(){
      const d=window.__worldDebug,p=d.snapshot().player;
      closest=Math.min(closest,Math.hypot(p[0]-6.99,p[2]+237.79));
      if(window.__worldSoftBush.state().lastInside.some(body=>body.kind==='person'&&body.vh>.05))inside++;
      if(!window.coasterBushFinished)requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await bot.hold(['KeyW']);
  try {
    await page.waitForFunction(([x,z,dx,dz])=>{
      const p=window.__worldDebug.snapshot().player;
      return (p[0]-x)*dx+(p[2]-z)*dz>1.6;
    },[x,z,dx,dz],{timeout:18000});
  } finally { await bot.release(); }
  const observed=await page.evaluate(()=>{
    window.coasterBushFinished=true;
    return {...window.coasterBushSamples(),position:window.__worldDebug.snapshot().player,
      physics:window.__worldSoftBush.state(),inventory:window.__worldDebug.reviewCollisionInventory()};
  });
  const {inside,closest,position,physics,inventory}=observed;
  const row={version,entry:base,placements:bot.fixtureCalls,keys:['W'],closest,position,inside,
    horizontalImpulse:physics.horizontalImpulseTotal-before.horizontalImpulseTotal,
    registrations:inventory.registrations['coaster-vegetation']??null,inventoryErrors:inventory.errors.filter(s=>s.includes('coaster-vegetation')),errors};
  console.log(JSON.stringify(row));
  assert.ok(closest<.4,JSON.stringify(row));
  if(version==='after'){
    assert.ok(inside>0 && row.horizontalImpulse>0);
    assert.equal(row.registrations,48);
  } else assert.equal(inside,0);
  assert.deepEqual(row.inventoryErrors,[]);assert.deepEqual(errors,[]);
} finally { await browser.close(); }
