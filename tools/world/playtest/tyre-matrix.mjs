/** Isolated obstacle-shape matrix. Fixture placement is explicit; actual keyboard
 * throttle/brake controls speed. This is not coverage of map asset instances. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,loadPlaywright,CHROME,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/tyre-matrix';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),bot=new Bot(page);
// Keep this run on its initially loaded code while parallel workers edit the dev server.
await page.routeWebSocket('**/*',ws=>ws.close());
const report={base,startedAt:new Date().toISOString(),cases:[],errors:[],limits:['Synthetic isolated obstacle shapes, not map-instance coverage.','Finite browser-frame sampling; not every physics microstep.','M5 Pro; no M1 hardware claim.']};
page.on('pageerror',e=>report.errors.push(e.message));
const specs=[{id:'offroad',size:[3.9,1.35,2]},{id:'coupe',size:[4.3,1.05,1.9]},{id:'van',size:[4.5,1.9,2.2]}];
const read=()=>page.evaluate(()=>({t:performance.now(),s:__worldDebug.snapshot(),p:__worldDebug.motionProbe()}));
try{
 await page.goto(base+'/world/?qa=1&qaWheelGuards='+(process.env.WORLD_GUARD_SHAPE||'1')+(process.env.WORLD_LOW_COM==='1'?'&qaLowCom=1':''),{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof __worldDebug?.collisionLane==='function'&&__worldDebug.actor().loaded);
 await startCanvasRecording(page,30);
 for(const spec of specs.filter(s=>!process.env.WORLD_VEHICLES||process.env.WORLD_VEHICLES.split(',').includes(s.id)))for(const kind of (process.env.WORLD_OBSTACLES||'post,trunk,wall').split(','))for(const target of (process.env.WORLD_SPEEDS||'2,5,10').split(',').map(Number)){
  await bot.release();await page.evaluate(()=>__worldDebug.exit());
  await page.evaluate(()=>{__worldDebug.teleportVehicle('offroad',[-26,6.1,34]);__worldDebug.teleportVehicle('coupe',[19.8,2.3,12]);__worldDebug.teleportVehicle('van',[46,2.7,-45]);});
  const half=kind==='post'?.06:kind==='trunk'?.22:.1;
  const lateral=spec.size[2]*.48+.15+half-.08;
  await page.evaluate(({kind,lateral})=>__worldDebug.collisionLane(kind,lateral),{kind,lateral});
  await page.waitForTimeout(250);
  const h=spec.size[1]*.28+.42+Math.min(.5,Math.max(.34,spec.size[1]*.28));
  // Shorter approach at 2 m/s avoids a long unrelated constant-speed straight.
  const startX=target===2?112:target===5?106:96;
  await page.evaluate(({id,h,x})=>__worldDebug.teleportVehicle(id,[x,5+h,120],0),{id:spec.id,h,x:startX});
  await bot.fixtureTeleport([startX,6,117.8],`QA lane ${spec.id}/${kind}/${target} m/s; car placed at x=${startX}`);
  await page.waitForTimeout(600);await bot.press('KeyE');await page.waitForTimeout(150);
  const c={name:`${spec.id}-${kind}-${target}`,targetSpeed:target,fixture:{kind,lateral,startX},samples:[],entered:(await read()).s.activeVehicle===spec.id};
  let started=Date.now(),baseY=null,firstContact=null;
  while(c.entered&&Date.now()-started<12000){
   const r=await read(),v=r.s.vehicles.find(v=>v.id===spec.id),speed=Math.hypot(v.velocity[0],v.velocity[2]);
   const wheels=r.p.vehicles.find(v=>v.id===spec.id).wheels;
   const contacts=wheels.flatMap(w=>w.nearby.filter(n=>n.other.assetId===`QA-lane-${kind}`).map(n=>({wheel:w.index,distance:n.distance})));
   if(contacts.some(c=>c.distance<.05)&&firstContact===null)firstContact=Date.now();
   if(baseY===null&&v.position[0]>startX+.5)baseY=v.position[1];
   c.samples.push({t:r.t,position:v.position,velocity:v.velocity,speed,contacts,upsideDownSeconds:v.upsideDownSeconds});
   if(v.position[0]>126||(firstContact!==null&&Date.now()-firstContact>1500))break;
   await bot.hold(speed<target-.12?['KeyW']:speed>target+.3?['Space']:[]);
   await page.waitForTimeout(16);
  }
  await bot.hold(['Space']);await page.waitForTimeout(400);await bot.release();
  const contactRows=c.samples.filter(r=>r.contacts.length);
  c.closest=contactRows.length?Math.min(...contactRows.flatMap(r=>r.contacts.map(v=>v.distance))):null;
  c.maxPenetration=Math.max(0,-(c.closest??0));
  c.contactSpeed=contactRows[0]?.speed??null;
  // First sampled contact may already include the collision's braking impulse.
  // Keep that value, and separately measure the approach in the preceding 0.2 s.
  const contactTime=contactRows[0]?.t;
  c.approachSpeed=contactTime===undefined?null:Math.max(...c.samples.filter(r=>r.t<=contactTime&&r.t>=contactTime-200).map(r=>r.speed));
  c.maxRise=Math.max(0,...c.samples.map(r=>r.position[1]-(baseY??r.position[1])));
  c.maxVerticalSpeed=Math.max(0,...c.samples.map(r=>Math.abs(r.velocity[1])));
  c.passed=c.entered&&c.closest!==null&&Math.abs(c.approachSpeed-target)<Math.max(.5,target*.15)&&c.maxPenetration<=.05&&c.maxRise<=.15&&c.samples.every(r=>r.upsideDownSeconds===0);
  report.cases.push(c);console.log(JSON.stringify({...c,samples:c.samples.length}));
  await page.screenshot({path:path.join(out,c.name+'.png')});
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 await page.evaluate(()=>__worldDebug.collisionLane(null));
 await stopCanvasRecording(page,path.join(out,'tyre-matrix.webm'));
}catch(e){report.errors.push(e.stack||String(e));}
finally{await bot.release().catch(()=>{});report.finishedAt=new Date().toISOString();report.fixtures=bot.fixtureCalls;report.summary={total:report.cases.length,passed:report.cases.filter(c=>c.passed).length,failed:report.cases.filter(c=>!c.passed).map(c=>c.name),errors:report.errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));await browser.close();if(report.errors.length||report.summary.failed.length)process.exitCode=1;}
