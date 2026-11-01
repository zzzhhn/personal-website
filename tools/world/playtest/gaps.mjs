/** Previously unverified cases. Fixtures only place starts; all movement is real keyboard. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,loadPlaywright,CHROME,canvasFacts,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
/** The coupe's parked spot comes from the running layout (layout v4 moves it to the avenue lay-by);
 * v3 resolves to the same 19.8,2.3,12. Offroad and van are protected and keep their script values. */
const layoutParks=async(page,specs,key)=>{const v=await page.evaluate(()=>__worldDebug.layout?.().vehicles??null),p=v?.coupe?.position,s=specs.find(x=>x.id==='coupe');if(p&&s)s[key]=[p[0],p[1]+s[key][1]-1.14,p[2]];};
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/gaps';
const scope=process.env.WORLD_GAPS||'motion,slope,vehicle,occlusion';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await page.routeWebSocket('**/*',ws=>ws.close()); // Freeze loaded dev modules for this evidence run.
const bot=new Bot(page), report={base,scope,startedAt:new Date().toISOString(),checks:[],cases:[],errors:[],limits:['Isolated fixture starts are not a continuous all-island traversal.','M5 Pro browser; no M1 Air hardware certification.','Sampled cases, not every instance or every collision angle.']};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
const check=(name,passed,evidence)=>report.checks.push({name,passed:!!passed,evidence});
const read=()=>page.evaluate(()=>({snapshot:__worldDebug.snapshot(),actor:__worldDebug.actor(),probe:__worldDebug.motionProbe(),contacts:__worldDebug.contacts()}));
async function sample(label,ms,rows){let start=Date.now();while(Date.now()-start<ms){rows.push({label,t:bot.now(),...await read()});await page.waitForTimeout(40);}}
async function saveCase(c){report.cases.push(c);await writeFile(path.join(out,'report.json'),JSON.stringify({...report,fixtures:bot.fixtureCalls,events:bot.events},null,2));}
try{
 await page.goto(base+'/world/?qa=1'+(process.env.WORLD_WHEEL_GUARDS==='1'?'&qaWheelGuards=1':''),{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>__worldDebug?.actor().loaded&&typeof __worldDebug.motionProbe==='function',undefined,{timeout:45000});
 await page.waitForTimeout(700);report.canvas=await canvasFacts(page);
 await startCanvasRecording(page,30);
 if(scope.includes('motion'))for(const run of [false,true]){
  await bot.fixtureTeleport([-42,5.68,39],`${run?'run':'walk'} jump approach start`);await page.waitForTimeout(500);
  const c={name:run?'run-jump':'walk-jump',samples:[]};
  await bot.hold(run?['KeyW','ShiftLeft']:['KeyW']);await sample('approach',1000,c.samples);
  await bot.press('Space');await sample('jump',1250,c.samples);await bot.release();await sample('land-stop',1000,c.samples);
  const air=c.samples.filter(r=>!r.snapshot.grounded),ground=c.samples.filter(r=>r.label==='land-stop'&&r.snapshot.grounded);
  c.airSamples=air.length;c.clips=[...new Set(c.samples.map(r=>r.actor.animation))];
  c.maxRise=Math.max(...c.samples.map(r=>r.snapshot.player[1]))-c.samples[0].snapshot.player[1];
  c.airHorizontalTravel=air.length>1?Math.hypot(air.at(-1).snapshot.player[0]-air[0].snapshot.player[0],air.at(-1).snapshot.player[2]-air[0].snapshot.player[2]):0;
  check(`${c.name}: takeoff and landing`,air.length>3&&ground.length>3&&c.maxRise>.8,{airSamples:c.airSamples,clips:c.clips,maxRise:c.maxRise,airHorizontalTravel:c.airHorizontalTravel});
  await page.screenshot({path:path.join(out,c.name+'.png')});await saveCase(c);
 }
 if(scope.includes('slope')){
  await bot.fixtureTeleport([-17,5.5,34],'road ramp upper approach');await page.waitForTimeout(600);
  const c={name:'ramp-walk-down-up',samples:[]};
  c.down=await bot.walk([[-14,32.46],[-10,30.92],[-6,29.38]],{timeout:15,arrive:.4,onTick:async()=>c.samples.push(await read())});
  c.up=await bot.walk([[-10,30.92],[-14,32.46],[-17,34]],{timeout:15,arrive:.4,onTick:async()=>c.samples.push(await read())});
  c.groundedClearances=c.samples.filter(r=>r.snapshot.grounded).flatMap(r=>r.probe.soles.map(s=>s.clearance).filter(x=>x!==null));
  check('road ramp traversed both directions',c.down.legs.every(l=>l.reached)&&c.up.legs.every(l=>l.reached),{down:c.down.legs,up:c.up.legs});
  c.maxSoleBelowSurface=Math.max(0,-Math.min(...c.groundedClearances));
  check('road ramp soles no penetration beyond 3 cm',c.maxSoleBelowSurface<=.03,{maxBelow:c.maxSoleBelowSurface,note:'Includes active swing soles; finite frame sampling, not all slopes'});
  await page.screenshot({path:path.join(out,'ramp.png')});await saveCase(c);
 }
 if(scope.includes('vehicle')||scope.includes('wheel')||scope.includes('drive')){
  const specs=[{id:'offroad',size:[3.9,1.35,2],spawn:[-26,6.1,34]},{id:'coupe',size:[4.3,1.05,1.9],spawn:[19.8,2.3,12]},{id:'van',size:[4.5,1.9,2.2],spawn:[46,2.7,-45]}];await layoutParks(page,specs,'spawn');
  const resetCars=async()=>{await page.evaluate(specs=>{for(const s of specs)__worldDebug.teleportVehicle(s.id,s.spawn,0)},specs);report.cases.push({name:'reset-cars-fixture',t:bot.now(),placements:specs.map(s=>({id:s.id,p:s.spawn}))});};
  const records=await page.evaluate(()=>__worldDebug.campColliders());
  const targetId=process.env.WORLD_WHEEL_TARGET||'G16';
  const targetInstance=Number(process.env.WORLD_WHEEL_INSTANCE||'0');
  const trunk=records.find(r=>r.id===targetId&&r.instance===targetInstance&&/trunk|stem/i.test(r.part))||records.find(r=>r.id===targetId&&r.instance===targetInstance);
  report.treeFixture=trunk;
  for(const spec of specs){
   const radius=Math.min(.5,Math.max(.34,spec.size[1]*.28)),height=spec.size[1]*.28+.42+radius;
   if(scope.includes('vehicle')||scope.includes('drive')){
   await bot.release();await page.evaluate(()=>__worldDebug.exit());await resetCars();
   await page.evaluate(({id,p})=>__worldDebug.teleportVehicle(id,p,Math.PI/2),{id:spec.id,p:[22,1.14+height,-10]});
   await bot.fixtureTeleport([24,3,-10],`${spec.id} high-speed road start; car placed separately`);
   await page.waitForTimeout(900);await bot.press('KeyE');await page.waitForTimeout(200);
   const c={name:spec.id+'-high-speed',samples:[]};await bot.hold(['KeyW']);await sample('accelerate',4200,c.samples);await bot.hold(['Space']);await sample('brake',1600,c.samples);await bot.release();
   c.maxSpeed=Math.max(...c.samples.map(r=>Math.hypot(...r.snapshot.vehicles.find(v=>v.id===spec.id).velocity)));
   c.entered=c.samples[0].snapshot.activeVehicle===spec.id;
   c.minY=Math.min(...c.samples.map(r=>r.snapshot.vehicles.find(v=>v.id===spec.id).position[1]));
   c.solidContacts=c.samples.flatMap(r=>r.contacts.filter(c=>c.other.kind==='solid'));
   check(c.name+' real acceleration/brake',c.entered&&c.maxSpeed>8&&c.minY>0,{entered:c.entered,maxSpeed:c.maxSpeed,minY:c.minY});
   await page.screenshot({path:path.join(out,c.name+'.png')});await saveCase(c);
   }
   if(!trunk||scope==='drive')continue;
   await page.evaluate(()=>__worldDebug.exit());await resetCars();
   const x=(trunk.aabb.min[0]+trunk.aabb.max[0])/2;
   const probeY=Math.min(5.3,trunk.aabb.max[1]-.04);
   const boundary=await page.evaluate(({x,z,id,y})=>__worldDebug.probeAsset(id,[x,y,z-1.5],[0,0,1],.03),{x,z:trunk.aabb.min[2],id:targetId,y:probeY});
   const z=(boundary?.point[2]??trunk.aabb.min[2])-spec.size[2]*.48-.15+.08;
   const p=[x+6,4.8+height,z];
   await page.evaluate(({id,p})=>__worldDebug.teleportVehicle(id,p,Math.PI),{id:spec.id,p});
   await bot.fixtureTeleport([p[0],p[1],p[2]-2],`${spec.id} glancing tree / outer tyre approach; car placed separately`);await page.waitForTimeout(600);
   await bot.press('KeyE');await page.waitForTimeout(200);
   const side={name:spec.id+'-wheel-side-'+targetId,probeBoundary:boundary,samples:[]};await bot.hold(['KeyW']);await sample('tree-graze',1800,side.samples);await bot.hold(['Space']);await sample('brake',500,side.samples);await bot.release();
   side.maxWheelPenetration=Math.max(0,...side.samples.flatMap(r=>r.probe.vehicles.find(v=>v.id===spec.id).wheels.flatMap(w=>w.overlaps.map(o=>o.depth??0))));
   side.entered=side.samples[0].snapshot.activeVehicle===spec.id;
   side.nearestTreeWheelDistance=Math.min(Infinity,...side.samples.flatMap(r=>r.probe.vehicles.find(v=>v.id===spec.id).wheels.flatMap(w=>(w.nearby??[]).filter(o=>o.other.assetId===targetId).map(o=>o.distance))));
   check(side.name+' no >3cm visual tyre penetration',side.entered&&side.nearestTreeWheelDistance<.08&&side.maxWheelPenetration<=.03,{entered:side.entered,maxWheelPenetration:side.maxWheelPenetration,nearestTreeWheelDistance:side.nearestTreeWheelDistance});
   await page.screenshot({path:path.join(out,side.name+'.png')});await saveCase(side);
  }
 }
 if(scope.includes('post')){
  const specs=[{id:'offroad',size:[3.9,1.35,2],spawn:[-26,6.1,34]},{id:'coupe',size:[4.3,1.05,1.9],spawn:[19.8,2.3,12]},{id:'van',size:[4.5,1.9,2.2],spawn:[46,2.7,-45]}];await layoutParks(page,specs,'spawn');
  for(const spec of specs){
   await bot.release();await page.evaluate(()=>__worldDebug.exit());
   await page.evaluate(specs=>{for(const s of specs)__worldDebug.teleportVehicle(s.id,s.spawn,0)},specs);
   const height=spec.size[1]*.28+.42+Math.min(.5,Math.max(.34,spec.size[1]*.28));
   const z=40+spec.size[2]*.48+.12;
   await page.evaluate(z=>__worldDebug.wheelFixture(true,z),z);
   await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[-48,4.8+h,40],0),{id:spec.id,h:height});
   await bot.fixtureTeleport([-48,5.85,38],'isolated visible QA tyre-side post, real engine/input, not a map-instance coverage claim');
   await page.waitForTimeout(700);await bot.press('KeyE');await page.waitForTimeout(200);
   const c={name:spec.id+'-tyre-only-post',fixture:{post:[-42,5.1,z],halfExtents:[.12,.3,.06]},samples:[]};
   await bot.hold(['KeyW']);await sample('graze',2000,c.samples);await bot.hold(['Space']);await sample('brake',600,c.samples);await bot.release();
   const contacts=c.samples.flatMap(r=>r.probe.vehicles.find(v=>v.id===spec.id).wheels.flatMap(w=>w.nearby.filter(o=>o.other.assetId==='QA-wheel-post')));
   c.entered=c.samples[0].snapshot.activeVehicle===spec.id;c.closest=contacts.length?Math.min(...contacts.map(c=>c.distance)):null;
   c.maxPenetration=Math.max(0,...contacts.map(c=>-c.distance));
   check(c.name+' tyre volume responds',c.entered&&c.closest!==null&&c.maxPenetration<=.03,{entered:c.entered,closest:c.closest,maxPenetration:c.maxPenetration});
   await page.screenshot({path:path.join(out,c.name+'.png')});await saveCase(c);await page.evaluate(()=>__worldDebug.wheelFixture(false));
  }
 }
 if(scope.includes('occlusion')){
  await bot.release();await page.evaluate(()=>__worldDebug.exit());
  for(const [name,p] of [['building',[0,1.9,8]],['tree',[-60.5,5.68,31.8]],['tent',[-42.7,5.8,12.5]]]){
   await bot.fixtureTeleport(p,name+' near-camera visibility start');await page.waitForTimeout(1400);
   const c={name:'occlusion-'+name,samples:[]};await sample('idle',300,c.samples);await page.screenshot({path:path.join(out,c.name+'-blocked.png')});await bot.hold(['KeyA']);await sample('move',1500,c.samples);await bot.release();await sample('clear',1000,c.samples);
   c.fadedMaterials=[...new Set(c.samples.flatMap(r=>(r.probe.occlusion.fades??[]).filter(m=>m.amount>.5).map(m=>m.name)))];
   check(c.name+' affected geometry fades locally',c.fadedMaterials.length>0,{faded:c.fadedMaterials});
   await page.screenshot({path:path.join(out,c.name+'.png')});await saveCase(c);
  }
 }
 await stopCanvasRecording(page,path.join(out,'gaps.webm'));
}catch(e){report.errors.push(e.stack||String(e));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{await bot.release().catch(()=>{});report.fixtures=bot.fixtureCalls;report.events=bot.events;report.finishedAt=new Date().toISOString();report.summary={passed:report.checks.filter(c=>c.passed).length,total:report.checks.length,failed:report.checks.filter(c=>!c.passed).map(c=>({name:c.name,evidence:c.name.includes('takeoff')?'see case':c.evidence})),errors:report.errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));await browser.close();if(report.errors.length||report.summary.failed.length)process.exitCode=1;}
