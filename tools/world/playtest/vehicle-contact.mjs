/** Usage: WORLD_BROWSER_MODULES=/path/to/browser WORLD_PLAYTEST_DIR=/path/to/evidence
 * node tools/world/playtest/vehicle-contact.mjs http://127.0.0.1:4393 [normal|baseline|fallback] */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const origin=process.argv[2]??'http://127.0.0.1:4393', mode=process.argv[3]??'normal';
const out=process.env.WORLD_PLAYTEST_DIR;
const vehicles=['offroad','coupe','van'];
const drivenVehicles=process.env.WORLD_TEST_VEHICLES?.split(',')??vehicles;
const root=id=>`world-vehicle-${id}-contact`;
const player='world-player-contact';
const contactCounts={offroad:39,coupe:16,van:33},fallbackCounts={offroad:15,coupe:14,van:16};
const fixtureHeight={offroad:1.176,coupe:1.054,van:1.452};
const standX={offroad:.05,coupe:-.56,van:1.33};
const report={origin,mode,errors:[],assetFailures:[],requests404:[],legs:[]};
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',error=>{
  const knownFailure=mode==='fallback'&&error.message.includes('responded with 404')&&report.requests404.some(url=>error.message.includes(url));
  (knownFailure?report.assetFailures:report.errors).push(String(error.stack??error));
});

const snapshot=()=>page.evaluate(()=>__worldDebug.snapshot());
const vehicle=(frame,id)=>frame.vehicles.find(car=>car.id===id);
async function inventory() {
  const d=await page.evaluate(()=>__worldDebug.reviewCollisionInventory());
  const owned=k=>/world-(player|vehicle)-|world-guide-camera-visibility|vehicle-.*-visual/.test(k);
  const subset=values=>Object.fromEntries(Object.entries(values).filter(([k])=>owned(k)));
  return {gaps:subset(d.mountedGapsByRegion),registered:subset(d.registrations),
    errors:d.errors.filter(owned),held:d.heldColliderIds};
}
async function verifyScope(held,counts) {
  const current=await inventory();
  if(mode==='baseline')return current;
  assert.deepEqual(current.errors,[]);
  assert.deepEqual(current.gaps,{});
  assert.equal(current.registered[player],held?0:1);
  assert.equal(current.held.includes('player-capsule'),held);
  for(const id of vehicles)assert.equal(current.registered[root(id)],counts[id]);
  return current;
}
async function steps(count) {
  const start=(await snapshot()).physicsStep;
  await page.waitForFunction(end=>__worldDebug.snapshot().physicsStep>=end,start+count,{polling:120,timeout:25000});
}

async function playerShape() {
  return page.evaluate(async name=>{
    const d=window.__worldDebug,a=d.actor(),s=await d.reviewCollisionSources(name);
    const capsule=s.colliders.find(c=>c.name==='player-capsule');
    const soleY=capsule.translation.y-capsule.shape.radius-capsule.shape.halfHeight;
    return {capsule,soleY,skinnedSoles:a.soles,modelSources:s.meshes.map(m=>({path:m.path,surface:m.declaration?.surface,policy:m.declaration?.policy}))};
  },player);
}

try{
  if(mode==='fallback'){
    const reject=route=>{
      report.requests404.push(route.request().url());
      return route.fulfill({status:404,body:'Test fallback for missing render asset'});
    };
    await page.route('**/assets/world/vehicles/**',reject);
    await page.route('**/assets/world/guide/G24.glb',reject);
  }
  await page.goto(new URL('/world/?qa=1',origin).href,{waitUntil:'domcontentloaded'});
  if(mode==='fallback'){
    await page.waitForFunction(()=>window.__worldDebug?.sceneObjects().includes('world-guide-capsule-fallback')
      && __worldDebug.sceneObjects().includes('vehicle-van-hull-lower-fallback'),undefined,{timeout:65000,polling:250});
    await steps(100);
    report.fallback=await verifyScope(false,fallbackCounts);
    assert.ok(report.requests404.some(url=>url.endsWith('/G24.glb')));
    for(const asset of ['G25','G26','G27'])assert.ok(report.requests404.some(url=>url.endsWith(`/${asset}.glb`)));
    if(out){await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'404-fallback.jpg'),type:'jpeg',quality:78});}
  }else{
    await page.waitForFunction(()=>window.__worldDebug?.actor().loaded
      && ['offroad','coupe','van'].every(id=>__worldDebug.sceneObjects().includes(`vehicle-${id}-body`)),undefined,{timeout:65000,polling:250});
    // Published coastal ring geometry supplies the height. Debug only establishes the starts.
    const location=[-46,0,75.3];
    const road=await page.evaluate(()=>__worldDebug.layout().roads['ring-south']);
    location[1]=road.reduce((best,point)=>Math.abs(point[0]-location[0])<Math.abs(best[0]-location[0])?point:best)[1]+.08;
    await page.evaluate(point=>__worldDebug.teleportPlayer(point),[location[0],location[1]+.95,location[2]+2.55]);
    for(const id of drivenVehicles){
      const parked=vehicle(await snapshot(),id), bot=new Bot(page);
      const start=[location[0],location[1]+fixtureHeight[id],location[2]];
      const row={id,start,yaw:0};report.legs.push(row);
      try{
        assert.ok(await page.evaluate(({id,start})=>__worldDebug.teleportVehicle(id,start,0),{id,start}));
        await bot.fixtureTeleport([location[0]+standX[id],location[1]+.95,location[2]+2.55],'existing south coastal ring road');
        await page.waitForFunction(id=>__worldDebug.snapshot().grounded&&__worldDebug.state().nearbyVehicle===id,id,{timeout:14000,polling:180});
        row.ground=await verifyScope(false,contactCounts);
        await bot.press('KeyE');
        await page.waitForFunction(id=>__worldDebug.snapshot().activeVehicle===id,id,{timeout:11000,polling:140});
        row.boarding=await verifyScope(true,contactCounts);
        await page.waitForFunction(id=>__worldDebug.snapshot().vehicles.find(v=>v.id===id)?.entering===false,id,{timeout:35000,polling:200});
        row.before=vehicle(await snapshot(),id);
        for(const [key,delay] of [['KeyW',720],['KeyD',90],['Space',1000]]){
          bot.events.push({t:bot.now(),press:key,heldMs:delay});
          await page.keyboard.press(key,{delay});
        }
        await steps(28);
        row.driven=vehicle(await snapshot(),id);
        row.metres=Math.hypot(row.driven.position[0]-row.before.position[0],row.driven.position[2]-row.before.position[2]);
        assert.ok(row.metres>.35,`${id} moved down the road`);
        assert.ok(row.driven.wheelContacts.every(Boolean),`${id} four tyres support the stopped vehicle`);
        await bot.press('KeyE');
        await page.waitForFunction(()=>__worldDebug.snapshot().activeVehicle===null&&__worldDebug.snapshot().grounded,undefined,{timeout:35000,polling:180});
        row.exit=await verifyScope(false,contactCounts);
        if(mode==='normal'){
          const geometry=await page.evaluate(root=>__worldDebug.reviewCollisionSources(root),root(id));
          row.geometry=geometry.colliders;
          assert.equal(row.geometry.filter(c=>c.enabled&&!c.sensor).length,contactCounts[id]);
          if(!report.player)report.player=await playerShape();
        }
        if(out){await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,`${id}-exit.jpg`),type:'jpeg',quality:78});}
        await page.evaluate(({id,p,yaw})=>__worldDebug.teleportVehicle(id,p,yaw),{id,p:parked.position,yaw:parked.yaw});
      }finally{row.keys=bot.events;row.fixtures=bot.fixtureCalls;await bot.release();}
    }
  }
}catch(error){report.errors.push(String(error.stack??error));}
finally{
  await browser.close();
  if(out){await mkdir(out,{recursive:true});await writeFile(path.join(out,`vehicle-contact-${mode}.json`),JSON.stringify(report,null,2));}
  console.log(JSON.stringify(report));
  if(report.errors.length)process.exitCode=1;
}
