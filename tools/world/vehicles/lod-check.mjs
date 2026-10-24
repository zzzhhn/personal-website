/** Narrow LOD proof: actual camera distance, hysteresis, material roles, instance/shadow follow.
 * QA platform and logged fixture poses only; no handling or collision acceptance is rerun here. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from '../playtest/lib.mjs';
import {aim} from '../playtest/budget-lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR;await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),bot=new Bot(page);
const report={cases:[],fixtures:[],errors:[],limits:['Explicit QA ground/start fixtures; no renewed collision/handling claim.','Distances are camera to the vehicle rigid-body origin in 3D.','60m outward/58m inward hysteresis; same live mesh identities, material, wheel matrices and physics.']};
page.on('pageerror',e=>report.errors.push(e.message));
const read=id=>page.evaluate(id=>window.__vehicleLOD()[id],id);
const selected=(process.env.WORLD_LOD_VEHICLES||'offroad,coupe,van').split(',');
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1e-5);
const shadowsFollow=r=>r.shadowProxies?.length===3&&r.shadowProxies.every(p=>
 same(p.worldMatrix,r.wheelWorldMatrix)&&(!/#sun[01]$/.test(p.name)||p.geometry===r.wheelGeometry)&&
 Array.from({length:p.count},(_,i)=>p.matrices.slice(i*16,i*16+16)).every(m=>[0,1,2,3].some(i=>same(m,r.wheelMatrices.slice(i*16,i*16+16)))));
try{
 await page.routeWebSocket('**/*',ws=>ws.close());await page.goto(process.env.WORLD_BASE_URL+'/world/?qa=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__worldDebug?.actor().loaded&&__worldDebug.sceneObjects().filter(n=>/^vehicle-(offroad|coupe|van)-body$/.test(n)).length===3,{},{timeout:90000});
 await page.evaluate(async()=>{const u=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/components/world/WorldVehicleVisual.tsx').name;window.__vehicleLOD=(await import(u)).vehicleLodSnapshot;});
 await page.waitForFunction(()=>Object.keys(__vehicleLOD()).length===3&&__worldDebug.budget);
 await page.evaluate(()=>__worldDebug.collisionLane('post',40));await page.waitForTimeout(300);
 for(const [id,h] of [['offroad',1.176],['coupe',1.054],['van',1.452]]){
  if(!selected.includes(id))continue;
  await page.evaluate(()=>__worldDebug.exit());
  for(const [i,other] of ['offroad','coupe','van'].entries())await page.evaluate(({id,i})=>__worldDebug.teleportVehicle(id,[75+i*8,7,155],0),{id:other,i});
  await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[100,5+h,120],0),{id,h});
  report.fixtures.push({id,car:[100,5+h,120],yaw:0});
  await bot.fixtureTeleport([145,6,120],`${id} LOD measurement start`);await page.waitForTimeout(400);
  await aim(page,{yaw:0,pitch:.08,distance:12});
  const c={id,samples:[]};
  for(const [target,expected] of [[59.5,0],[60.5,1],[59,1],[57.5,0],[80,1],[18,0]]){
   let x=100+target-12*Math.cos(.08);
   for(let n=0;n<3;n++){
    await bot.fixtureTeleport([x,6,120],`${id} camera distance target ${target}m`);await page.waitForTimeout(700);
    await page.waitForFunction(({id,target})=>Math.abs(__vehicleLOD()[id].distance-target)<.12,{id,target},{timeout:3000}).catch(()=>{});
    const r=await read(id);if(Math.abs(r.distance-target)<.12)break;x+=target-r.distance;
   }
   const r=await read(id),frame=await page.evaluate(()=>__worldDebug.budget.frame(1000));
   const row={target,expected,...r,shadowsFollow:shadowsFollow(r),passed:r.level===expected&&Math.abs(r.distance-target)<.2&&r.l1Triangles/r.l0Triangles<=.30&&shadowsFollow(r)&&JSON.stringify(r.roles[0])===JSON.stringify(r.roles[1]),frame:{total:frame.total,info:frame.info,vehicles:frame.byZone.vehicles,draws:frame.top.filter(x=>x.name.startsWith(`vehicle-${id}-`))}};
   c.samples.push(row);console.log(JSON.stringify({id,target,distance:r.distance,level:r.level,expected,passed:row.passed,triangles:expected?r.l1Triangles:r.l0Triangles}));
   if(target===80||target===18||target===60.5)await page.screenshot({path:path.join(out,`${id}-${target}m.jpg`),type:'jpeg',quality:80});
  }
  c.identityStable=c.samples.every(r=>r.bodyUuid===c.samples[0].bodyUuid&&r.wheelUuid===c.samples[0].wheelUuid);
  // Explicit pose fixture proves the selected low geometry and its wheel shadows follow a moving body.
  await bot.fixtureTeleport([168,6,120],`${id} far shadow pose fixture`);await page.waitForTimeout(700);
  c.beforeMove=await read(id);await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[103,5+h,121],.3),{id,h});await page.waitForTimeout(700);
  c.afterMove=await read(id);
  c.shadowAfter=await page.evaluate(()=>__worldDebug.budget.frame(1000));
  c.shadowAfter.top=c.shadowAfter.top.filter(x=>x.name.startsWith(`vehicle-${id}-`));delete c.shadowAfter.topCalls;
  c.movedWithBody=Math.hypot(c.afterMove.center[0]-c.beforeMove.center[0],c.afterMove.center[2]-c.beforeMove.center[2])>2.5&&c.afterMove.level===1;
  c.shadowPoseFollows=shadowsFollow(c.afterMove);
  c.passed=c.samples.every(r=>r.passed)&&c.identityStable&&c.movedWithBody&&c.shadowPoseFollows;report.cases.push(c);
 }
}catch(e){report.errors.push(String(e.stack||e));}
finally{report.fixtures.push(...bot.fixtureCalls);report.passed=report.errors.length===0&&report.cases.length===selected.length&&report.cases.every(c=>c.passed);await writeFile(path.join(out,'lod-check.json'),JSON.stringify(report,null,2));await browser.close();if(!report.passed)process.exitCode=1;}
