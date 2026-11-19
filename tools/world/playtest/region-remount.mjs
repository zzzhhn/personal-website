/** Unmount the actual scene from under a player who reached it through a public spawn. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const [base='http://127.0.0.1:4343',...selected]=process.argv.slice(2);
const sites=[
  {start:'factory',region:'factory',at:[-149,-17],keys:['KeyA'],meters:1,colliders:['factory-walk-contact']},
  {start:'alpha',region:'brain',at:[-84,-54.5],meters:.7,colliders:['alpha-mine-surface','alpha-mine-solid']},
  {start:'brain',region:'brain',at:[-84,-54.5],meters:.7,colliders:['alpha-mine-surface','alpha-mine-solid']},
  {start:'alpha-shallows',region:'alpha-island',at:[190.25,134],keys:['KeyW','KeyD'],meters:.8,colliders:['alpha-ground-floor','alpha-ground-walls']},
  {start:'alpha-wind',region:'alpha-island',at:[254,148],keys:['KeyS','KeyD'],meters:.8,colliders:['alpha-ground-floor','alpha-ground-walls']},
  {start:'alpha-cave',region:'alpha-cave',at:[219,156],meters:.6,colliders:['alpha-cave/floor/stone']},
  {start:'alpha-waterwheel',region:'alpha-waterwheel',at:[206,206],meters:.6,colliders:['alpha-waterwheel/floor/stone']},
  {start:'ibd',region:'ibd',at:[-88,-143],meters:.6,colliders:['ibd-paving','ibd-gallery-walk']},
  {start:'coaster',region:'coaster',at:[50,-125],keys:['KeyD'],meters:.6,colliders:['coaster-station-surfaces','coaster-relief-surface']},
  {start:'exchange',region:'exchange',at:[60,-52.6],meters:2.1,colliders:['alpha-exchange-surface','alpha-exchange-solid']},
  {start:'club',region:'club',at:[30,39],meters:.6,colliders:['djc-surface-same-mesh','djc-solid-same-mesh']},
];
const options=new Map(sites.flatMap(site=>[[site.start,site],[site.start+'-rescue',site]]));
options.set('ibd-suv',{...options.get('ibd'),start:'camp',at:[-42,35],vehicle:'offroad'});
const cave=options.get('alpha-cave'),island=options.get('alpha-shallows');
// The island owns two terrain shapes and the cave has its own independently loaded surface.
options.set('alpha-cave-multiple',{...cave,region:island.region,colliders:[...cave.colliders,...island.colliders]});
assert.ok(selected.every(id=>options.has(id)),'unknown region remount route');
const targets=selected.length?selected:sites.map(site=>site.start);
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const waitFor=(page,predicate,arg,timeout=45000)=>page.waitForFunction(predicate,arg,{timeout,polling:90});
const dot='aside.world-location svg circle[r="2.6"]';
const campNotice='Back at camp. Your ore and research are kept.';
const waiting='The area ahead is preparing. Please wait.';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const failures=[];
const guideBody='world-player-contact';
const vehicleBody=id=>`vehicle-${id}-body-frame`;
const vehicleWalkingBody=id=>`vehicle-${id}-walking-frame`;

function bodies(page,site){
  const names=[guideBody,...(site.vehicle?[vehicleBody(site.vehicle),vehicleWalkingBody(site.vehicle)]:[])];
  return page.evaluate(({region,names})=>{
    return window.__worldRegionFault.bodies(region).filter(body=>names.includes(body.name));
  },{region:site.region,names});
}

function actualBody(records,name=guideBody){
  const matches=records.filter(record=>record.name===name);
  assert.equal(matches.length,1,JSON.stringify(records));
  assert.ok(matches[0].colliders.length>0);
  return matches[0];
}

function ownership(body,enabled,regionHeld){
  assert.deepEqual({enabled:body.enabled,regionHeld:body.regionHeld},{enabled,regionHeld},JSON.stringify(body));
  assert.ok(body.heldColliders.every(handle=>body.colliders.includes(handle)));
  assert.equal(body.heldColliders.length>0,regionHeld,JSON.stringify(body));
}

function actor(page,vehicle){
  return page.evaluate(vehicle=>{
    const d=window.__worldDebug,s=d.snapshot();
    const car=vehicle?s.vehicles.find(candidate=>candidate.id===vehicle):null;
    return {position:car?.position??s.player,velocity:car?.velocity??s.playerVelocity,grounded:car?car.wheelContacts.some(Boolean):s.grounded,
      wheelContacts:car?.wheelContacts??null,step:s.physicsStep,
      keys:d.inputState(),toast:d.state().toast?.en,displayedNotice:document.querySelector('.world-notice')?.textContent,
      card:d.state().card,activeVehicle:s.activeVehicle};
  },vehicle);
}
function colliders(page,names){
  return page.evaluate(names=>{
    const d=window.__worldDebug, inventory=d.physicsInventory(), scene=d.sceneObjects();
    return {scene:names.filter(name=>scene.includes(name)),
      handles:inventory.filter(c=>names.includes(c.name)||names.includes(c.visualRef)).map(c=>({handle:c.handle,name:c.name,shape:c.shape}))};
  },names);
}
async function boot(page,site,qa){
  const url=new URL('/world/',base);
  if(site.start!=='camp')url.searchParams.set('start',site.start);
  if(qa){
    url.searchParams.set('qa','1');url.searchParams.set('qaRegionFault','1');
  }
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded'});
  assert.ok(response?.ok());
  await page.locator('button.world-camp-return:enabled').waitFor({timeout:70000});
  const entry=await page.locator(dot).evaluate(el=>[el.cx.baseVal.value,el.cy.baseVal.value]);
  assert.ok(Math.hypot(entry[0]-site.at[0],entry[1]-site.at[1])<.5,JSON.stringify(entry));
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)),qa);
  assert.equal(await page.evaluate(()=>Boolean(window.__worldRegionFault)),qa);
  return {point:entry,sha256:createHash('sha256').update(await response.body()).digest('hex')};
}
async function advance(page,frames){await waitFor(page,step=>window.__worldDebug.snapshot().physicsStep>=step,(await actor(page)).step+frames);}
async function setRemoved(page,id,removed){
  assert.ok(await page.evaluate(({id,removed})=>window.__worldRegionFault.remove(id,removed),{id,removed}));
}
async function driveIntoYard(page,bot){
  const car=[-88,1.8,-136.5], guide=[-86.15,2.045,-136.5];
  assert.equal(await page.evaluate(car=>window.__worldDebug.teleportVehicle('offroad',car,Math.PI/2),car),true);
  assert.equal(await bot.fixtureTeleport(guide,'On the regular road beside the SUV driver door'),true);
  await waitFor(page,()=>window.__worldDebug.state().nearbyVehicle==='offroad');
  await bot.press('KeyE');
  await waitFor(page,()=>window.__worldDebug.snapshot().activeVehicle==='offroad',undefined,75000);
  const boarded=await actor(page,'offroad');
  await bot.hold(['KeyW']);
  await waitFor(page,()=>{
    const car=window.__worldDebug.snapshot().vehicles.find(candidate=>candidate.id==='offroad');
    return car.position[2]<-144&&car.wheelContacts.filter(Boolean).length>=2;
  },undefined,90000);
  await bot.release();
  return {boarded,entered:await actor(page,'offroad'),placements:[{vehicle:'offroad',car,yaw:Math.PI/2},...bot.fixtureCalls]};
}

async function stepAway(page,keys,meters){
  const previous=await actor(page);
  for(const key of keys)await page.keyboard.down(key);
  try{
    await waitFor(page,({at,meters})=>{
      const s=window.__worldDebug.snapshot(),p=s.player;
      return s.grounded&&Math.hypot(p[0]-at[0],p[2]-at[2])>=meters;
    },{at:previous.position,meters},20000);
  }finally{
    for(const key of keys)await page.keyboard.up(key);
  }
  return actor(page);
}

try{
  for(const name of targets){
    const site=options.get(name),keys=site.keys??['KeyW'],testRescue=name.endsWith('-rescue');
    const client=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const page=await client.newPage(),bot=new Bot(page),errors=[],analytics=[];
    await page.routeWebSocket('**/*',ws=>ws.close());
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',line=>{
      if(line.type()!=='error')return;
      const source=line.location().url,message=line.text();
      if(source===new URL('/api/events',base).href&&/\b(404|501)\b/.test(message))analytics.push(message);
      else errors.push({source,message});
    });
    let stage='public-entry', lastHeld;
    try{
      const ordinary=await boot(page,site,false), qa=await boot(page,site,true);
      assert.equal(ordinary.sha256,qa.sha256);
      await waitFor(page,id=>window.__worldRegionFault.registered().includes(id),site.region);
      await waitFor(page,names=>names.every(name=>window.__worldDebug.sceneObjects().includes(name)),site.colliders);
      stage='approach';
      const initial=await actor(page,site.vehicle);
      const approach=site.vehicle?await driveIntoYard(page,bot):{entered:await stepAway(page,keys,site.meters),placements:[]};
      const {entered,placements}=approach;
      const bodyName=site.vehicle?vehicleBody(site.vehicle):guideBody;
      const walkingName=site.vehicle?vehicleWalkingBody(site.vehicle):null;
      await advance(page,12);
      const mounted=await colliders(page,site.colliders),activeBodies=await bodies(page,site);
      const activeBody=actualBody(activeBodies,bodyName);
      ownership(activeBody,true,false);
      if(walkingName){
        ownership(actualBody(activeBodies),false,false);
        ownership(actualBody(activeBodies,walkingName),true,false);
      }
      assert.ok(mounted.handles.length>0,JSON.stringify(mounted));
      stage='unmount';
      await setRemoved(page,site.region,true);
      await bot.hold(keys);
      await waitFor(page,({region,bodyNames,names,waiting})=>{
        const d=window.__worldDebug,records=window.__worldRegionFault.bodies(region);
        return bodyNames.every(name=>records.some(body=>body.name===name&&body.regionHeld))
          &&d.state().toast?.en===waiting&&names.every(name=>!d.sceneObjects().includes(name));
      },{region:site.region,bodyNames:walkingName?[bodyName,walkingName]:[bodyName],names:site.colliders,waiting},20000);
      const held=await actor(page,site.vehicle),removed=await colliders(page,site.colliders),heldBodies=await bodies(page,site);
      lastHeld=held;
      const heldBody=actualBody(heldBodies,bodyName);
      ownership(heldBody,false,true);
      assert.equal(heldBody.handle,activeBody.handle);
      assert.deepEqual(heldBody.colliders,activeBody.colliders);
      assert.deepEqual(heldBody.position,held.position);
      if(walkingName){
        ownership(actualBody(heldBodies),false,false);
        assert.ok(heldBody.heldColliders.length<heldBody.colliders.length,'mass and other contact-free shapes remain excluded');
        const walking=actualBody(heldBodies,walkingName);
        ownership(walking,false,true);
        assert.deepEqual(walking.position,heldBody.position);
        assert.equal(walking.handle,actualBody(activeBodies,walkingName).handle);
      }else assert.deepEqual(heldBody.heldColliders,heldBody.colliders);
      assert.deepEqual(removed,{scene:[],handles:[]});
      await advance(page,60);
      const still=await actor(page,site.vehicle),stillBodies=await bodies(page,site),stillBody=actualBody(stillBodies,bodyName);
      assert.deepEqual(stillBody,heldBody);
      if(walkingName)assert.deepEqual(actualBody(stillBodies,walkingName),actualBody(heldBodies,walkingName));
      assert.ok(keys.every(key=>still.keys.includes(key)));
      assert.deepEqual(still.position,held.position,'the actual capsule did not move or drop');
      assert.deepEqual(still.velocity,[0,0,0]);
      let result;
      if(testRescue){
        stage='camp-rescue';
        await bot.release();
        const button=page.locator('button.world-camp-return:enabled');
        const notice=await page.evaluateHandle(()=>{
          const seen=[];
          new MutationObserver(()=>{
            const text=document.querySelector('.world-notice')?.textContent;
            if(text&&!seen.includes(text))seen.push(text);
          }).observe(document.body,{childList:true,subtree:true,characterData:true});
          return seen;
        });
        await button.click();
        await waitFor(page,()=>{
          const {grounded,player:[x,,z]}=window.__worldDebug.snapshot();
          return grounded&&Math.hypot(x+42,z-35)<.5;
        });
        const landing=await actor(page);
        assert.ok(distance(landing.position,[-42,0,35])<.5);
        assert.deepEqual(await colliders(page,site.colliders),removed);
        const resumed=await stepAway(page,['KeyW'],.6);
        const notices=await notice.jsonValue();
        await notice.dispose();
        assert.ok(landing.toast===campNotice||notices.some(text=>text===campNotice||text.startsWith('已回到营地')),
          JSON.stringify({landing,notices}));
        const resumedBodies=await bodies(page,site);
        ownership(actualBody(resumedBodies),true,false);
        assert.equal(actualBody(resumedBodies).handle,activeBody.handle);
        result={landing,resumed,resumedBodies,notices,regionStayedAbsent:true};
      }else{
        stage='remount';
        await setRemoved(page,site.region,false);
        await waitFor(page,({at,waiting,vehicle})=>{
          const d=window.__worldDebug,s=d.snapshot(),car=vehicle?s.vehicles.find(candidate=>candidate.id===vehicle):null;
          const p=car?.position??s.player, grounded=car?car.wheelContacts.filter(Boolean).length>=2:s.grounded;
          return grounded&&Math.hypot(p[0]-at[0],p[2]-at[2])>.5&&d.state().toast?.en!==waiting;
        },{at:still.position,waiting,vehicle:site.vehicle},38000);
        const resumed=await actor(page,site.vehicle),remounted=await colliders(page,site.colliders),resumedBodies=await bodies(page,site);
        const resumedBody=actualBody(resumedBodies,bodyName);
        ownership(resumedBody,true,false);
        assert.equal(resumedBody.handle,activeBody.handle);
        assert.deepEqual(resumedBody.colliders,activeBody.colliders);
        if(walkingName){
          assert.equal(resumed.activeVehicle,site.vehicle);
          ownership(actualBody(resumedBodies),false,false);
          const walking=actualBody(resumedBodies,walkingName);
          ownership(walking,true,false);
          assert.deepEqual(walking.position,resumedBody.position);
          assert.equal(walking.handle,actualBody(heldBodies,walkingName).handle);
          assert.deepEqual(walking.colliders,actualBody(heldBodies,walkingName).colliders);
        }
        assert.deepEqual(remounted.scene,mounted.scene);
        assert.equal(remounted.handles.length,mounted.handles.length);
        assert.ok(remounted.handles.every(newRecord=>!mounted.handles.some(old=>old.handle===newRecord.handle)));
        assert.ok(keys.every(key=>resumed.keys.includes(key)));
        result={resumed,remounted,resumedBodies};
      }
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({route:name,ok:true,region:site.region,browser:browser.version(),ordinary,qa,initial,entered,
        mounted,held,still,removed,activeBodies,heldBodies,boarding:approach.boarded,...result,errors,analytics,placements}));
    }catch(error){
      failures.push(name);
      console.log(JSON.stringify({route:name,ok:false,region:site.region,stage,message:String(error),lastHeld,actor:await actor(page,site.vehicle).catch(()=>null),bodies:await bodies(page,site).catch(()=>[]),
        colliders:await colliders(page,site.colliders).catch(()=>null),errors,analytics}));
    }finally{await bot.release();await client.close();}
  }
  assert.deepEqual(failures,[]);
}finally{await browser.close();}
