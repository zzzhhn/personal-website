/** Closed-loop keyboard driver. Fixtures set initial conditions only; the route, steering, braking,
 * recovery button and entry/exit use real keyboard events.
 *
 * Routes come from the running page (__worldDebug.layout()), never hand-copied coordinates. Layout v4
 * (WORLD_LAYOUT=v4, spec §12.6) adds the affected set: three-car ring loop, offroad hill climb and
 * return, representative new-shore water recovery (dry-land hit vs road fallback, real support check)
 * and junction furniture contact. WORLD_ROUTE_ONLY=1 keeps only the route cases;
 * WORLD_V4_CASES=timeline,ring,hill,shore,furniture narrows a v4 rerun. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/drive-route';
const flags=(process.env.WORLD_CANDIDATE==='1'?'&qaWheelGuards=1&qaLowCom=1':'')+(process.env.WORLD_LAYOUT?`&layout=${process.env.WORLD_LAYOUT}`:'');
const v4cases=(process.env.WORLD_V4_CASES||'timeline,ring,hill,shore,furniture').split(',');
const specs=[{id:'offroad',size:[3.9,1.35,2],limit:22},{id:'coupe',size:[4.3,1.05,1.9],limit:29},{id:'van',size:[4.5,1.9,2.2],limit:18}];
const only=s=>!process.env.WORLD_VEHICLES||process.env.WORLD_VEHICLES.split(',').includes(s.id);
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await page.routeWebSocket('**/*',ws=>ws.close());
const bot=new Bot(page),report={base,flags,layout:null,cases:[],errors:[],fixtures:[],limits:['Explicit fixture starts; no claim of starting the route from the normal spawn.','Maximum-speed straight uses an isolated visible QA lane.','M5 Pro only; frame timings during parallel work are not an idle-machine benchmark.']};
page.on('pageerror',e=>report.errors.push(e.message));
const read=id=>page.evaluate(id=>{const s=__worldDebug.snapshot(),v=s.vehicles.find(v=>v.id===id),p=__worldDebug.motionProbe();return{t:performance.now(),active:s.activeVehicle,player:s.player,vehicle:v,yaw:p.vehicles.find(v=>v.id===id).yaw,camera:p.camera,contacts:__worldDebug.contacts(),canRecover:s.canRecover}},id);
async function reset(id,p,yaw){report.fixtures.push({t:bot.now(),type:'vehicle',id,p,yaw});await page.evaluate(({id,p,yaw})=>__worldDebug.teleportVehicle(id,p,yaw),{id,p,yaw});}
const heightOf=spec=>spec.size[1]*.28+.42+Math.min(.5,Math.max(.34,spec.size[1]*.28));
/** Pure-pursuit target on a 2D polyline [[x,z],...] with arclength; `from` limits the search window
 * so a route that passes the same place twice (ring start / end, hill stem) is followed in order. */
function pursuer(route,windowed=true){
 const L=[0];for(let i=1;i<route.length;i++)L.push(L[i-1]+Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]));
 let progress=0;
 return(p,lookahead)=>{
  let best=Infinity,at=0,frac=0;
  for(let i=0;i<route.length-1;i++){if(windowed&&(L[i+1]<progress-2||L[i]>progress+25))continue;const a=route[i],b=route[i+1],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(p[0]-a[0]-dx*t,p[2]-a[1]-dz*t);if(d<best){best=d;at=i;frac=t;}}
  progress=Math.max(progress,L[at]+(L[at+1]-L[at])*frac);
  let distance=lookahead;
  for(let i=at;i<route.length-1;i++){const a=route[i],b=route[i+1],len=L[i+1]-L[i],from=i===at?frac:0,rest=len*(1-from);if(distance<=rest){const t=from+distance/len;return{point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],segment:at,crossTrack:best,progress,total:L.at(-1)};}distance-=rest;}
  return{point:route.at(-1),segment:at,crossTrack:best,progress,total:L.at(-1)};
 };
}
/** Drive `spec` along route with real keys until within 2.5 m of the end (after `minProgress`). */
async function follow(spec,route,{name,timeout=110000,cruise=6,slow=3.5,minProgress=0,legacy=false}){
 const pursue=pursuer(route,!legacy),end=route.at(-1),c={name,samples:[],reached:false};
 const start=Date.now();
 while(Date.now()-start<timeout){
  const r=await read(spec.id),v=r.vehicle,speed=Math.hypot(v.velocity[0],v.velocity[2]),goal=pursue(v.position,(spec.id==='van'?8:3.5)+speed*.25),dx=goal.point[0]-v.position[0],dz=goal.point[1]-v.position[2],wanted=Math.atan2(-dz,dx),err=Math.atan2(Math.sin(wanted-r.yaw),Math.cos(wanted-r.yaw));
  c.samples.push({...r,goal,error:err});
  if(r.active!==spec.id||v.position[1]< -.3)break;
  if(goal.progress>=Math.max(minProgress,goal.total-6)&&Math.hypot(v.position[0]-end[0],v.position[2]-end[1])<2.5){c.reached=true;break;}
  // v4: speed drops only for the actual curve ahead (heading error), never by route segment index.
  // v3 (legacy): the original segment-based targets, kept for comparability with earlier reports.
  const target=legacy?(spec.id==='van'&&goal.segment>=6?3:Math.abs(err)>.35?3.5:goal.segment===0?5:6):Math.abs(err)>.35?slow:cruise;
  const keys=speed>target+.7?['Space']:speed<target-.1?['KeyW']:[];
  if(err>.055)keys.push('KeyA');else if(err<-.055)keys.push('KeyD');
  await bot.hold(keys);await page.waitForTimeout(40);
 }
 await bot.hold(['Space']);await page.waitForTimeout(700);await bot.release();
 c.maxCrossTrack=Math.max(...c.samples.map(r=>r.goal.crossTrack));c.minY=Math.min(...c.samples.map(r=>r.vehicle.position[1]));
 c.maxY=Math.max(...c.samples.map(r=>r.vehicle.position[1]));c.passed=c.reached&&c.minY>0;
 // Contacts with solid / obstacle colliders along the way (fixed rails, posts, furniture).
 c.solidContacts=[...new Set(c.samples.flatMap(r=>(r.contacts||[]).filter(k=>k.self===spec.id&&(k.other.kind==='solid'||k.other.kind==='obstacle')).map(k=>k.other.name||k.other.assetId)))];
 await page.screenshot({path:path.join(out,name+'.png')});report.cases.push(c);
 console.log(JSON.stringify({name,reached:c.reached,maxCrossTrack:+c.maxCrossTrack.toFixed(2),minY:+c.minY.toFixed(2),maxY:+c.maxY.toFixed(2),solidContacts:c.solidContacts,last:c.samples.at(-1)?.vehicle.position}));
 return c;
}
async function enterAt(spec,p,yaw,walkTo){
 await bot.release();await page.evaluate(()=>__worldDebug.exit());
 for(let i=0;i<specs.length;i++)await reset(specs[i].id,[90+i*8,7,125],0);
 await reset(spec.id,[p[0],p[1]+heightOf(spec),p[2]],yaw);await bot.fixtureTeleport(walkTo,`${spec.id} start`);await page.waitForTimeout(600);await bot.press('KeyE');
 // Concurrent Chrome/Blender work can delay the physics step that consumes the E edge.
 // Wait for the actual entry, and record a failed entry instead of calling it a driving failure.
 await page.waitForFunction(id=>__worldDebug.snapshot().activeVehicle===id,spec.id,{timeout:4000});
}
const yawAlong=(r,i=0)=>Math.atan2(-(r[i+1][2]-r[i][2]),r[i+1][0]-r[i][0]);
/** Player standing point 2.5 m to the car's left (+Z side when heading +X). */
const beside=(p,yaw)=>[p[0]-Math.sin(yaw)*2.5,p[1]+1,p[2]-Math.cos(yaw)*2.5];
try{
 await page.goto(base+'/world/?qa=1'+flags,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
 await page.waitForFunction(()=>!String(__worldDebug.layout().version).endsWith('loading'),undefined,{timeout:30000}).catch(()=>{});
 const layout=report.layout=await page.evaluate(()=>__worldDebug.layout());
 const v4=layout.version==='v4';
 report.surfaceAudit=await page.evaluate(()=>__worldDebug.surfaceAudit());
 await startCanvasRecording(page,30);
 const timeline=layout.timeline.map(p=>[p[0],p[2]]);
 for(const spec of specs.filter(only)){
  if(v4&&!v4cases.includes('timeline'))break;
  await page.evaluate(()=>__worldDebug.collisionLane('post',8));
  // Fixture: offroad's frozen camp-exit start (route point 0 moved 1 m east, as before).
  const s0=[layout.timeline[0][0]+1,layout.timeline[0][1],layout.timeline[0][2]];
  await enterAt(spec,s0,0,[s0[0],s0[1]+.96,s0[2]+2.5]);
  await follow(spec,timeline,{name:spec.id+(v4?'-timeline-route':'-coast-route'),cruise:6,slow:spec.id==='van'?3:3.5,legacy:!v4});
  if(process.env.WORLD_ROUTE_ONLY==='1'||v4){await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));continue;}
  // v3 only (unchanged): long straight, flip and water recovery, exit/enter.
  const h=heightOf(spec);
  await reset(spec.id,[70,5+h,120],0);await page.waitForTimeout(600);
  const straight={name:spec.id+'-maximum-straight',samples:[]};await bot.hold(['KeyW']);
  let begin=Date.now();while(Date.now()-begin<15000){const r=await read(spec.id);straight.samples.push(r);if(r.vehicle.position[0]>165)break;await page.waitForTimeout(40);}
  await bot.hold(['Space']);await page.waitForTimeout(1000);await bot.release();
  straight.maxSpeed=Math.max(...straight.samples.map(r=>Math.hypot(r.vehicle.velocity[0],r.vehicle.velocity[2])));straight.passed=straight.maxSpeed>spec.limit*.94;report.cases.push(straight);
  await reset(spec.id,[130,5+h,120],0);await page.waitForTimeout(500);
  report.fixtures.push({t:bot.now(),type:'flip',id:spec.id});await page.evaluate(id=>__worldDebug.flip(id),spec.id);await page.waitForTimeout(2700);const before=await read(spec.id);await bot.press('KeyR');await page.waitForTimeout(500);const after=await read(spec.id);
  report.cases.push({name:spec.id+'-flip-recovery',before,after,passed:before.canRecover&&!after.canRecover&&after.vehicle.upsideDownSeconds===0});
  report.fixtures.push({t:bot.now(),type:'water',id:spec.id});await page.evaluate(id=>__worldDebug.water(id),spec.id);await page.waitForTimeout(2500);const dry=await read(spec.id);report.cases.push({name:spec.id+'-water-recovery',after:dry,passed:dry.vehicle.position[1]>0&&dry.vehicle.waterSeconds===0});
  await bot.press('KeyE');await page.waitForTimeout(400);const exit=await read(spec.id);await bot.press('KeyE');await page.waitForTimeout(300);const enter=await read(spec.id);report.cases.push({name:spec.id+'-exit-enter',exit,enter,passed:exit.active===null&&enter.active===spec.id});
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 if(v4&&process.env.WORLD_ROUTE_ONLY!=='1'){
  // Three-car ring loop: coastal ring + avenue, starting just past J1 on the south ring.
  if(v4cases.includes('ring'))for(const spec of specs.filter(only)){
   const r=layout.ring,i=2,p=r[i],yaw=yawAlong(r,i);
   await enterAt(spec,p,yaw,beside(p,yaw));
   const route=r.slice(i).map(q=>[q[0],q[2]]).concat(r.slice(1,i+1).map(q=>[q[0],q[2]]));
   await follow(spec,route,{name:spec.id+'-ring-loop',timeout:150000,cruise:8,slow:spec.id==='van'?3:4});
   await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  // Offroad up the hill road, past the windmill platform and back down to J5 (no reversing).
  if(v4cases.includes('hill'))for(const spec of specs.filter(s=>s.id==='offroad'&&only(s))){
   const r=layout.hill,p=r[0],yaw=yawAlong(r,0);
   await enterAt(spec,p,yaw,beside(p,yaw));
   const c=await follow(spec,r.map(q=>[q[0],q[2]]),{name:'offroad-hill-climb-return',timeout:120000,cruise:5,slow:3,minProgress:80});
   c.topY=layout.ridge.topY;c.climbed=c.maxY>layout.ridge.topY+.4;c.passed=c.passed&&c.climbed;
   await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  // Representative new-shore water recovery: player + one car per sample; record which branch ran
  // (dry-land search vs road fallback) and the real support under the landing point.
  if(v4cases.includes('shore'))for(const s of layout.shoreSamples){
   for(const who of ['player','van']){
    await bot.release();await page.evaluate(()=>__worldDebug.exit());
    const probe=await page.evaluate(([x,z])=>__worldDistricts.recoveryProbe(x,z),s.p);
    report.fixtures.push({t:bot.now(),type:'shore-splash',who,at:s.p});
    if(who==='player')await page.evaluate(([x,z])=>__worldDebug.teleportPlayer([x,1.2,z]),s.p);
    else await reset('van',[s.p[0],1.2,s.p[1]],0);
    // Sample the body every 100 ms. Recovery is the one-sample jump of > 3 m; the sample before it is
    // where the body was when recovery ran (a zero-friction capsule slides on the seabed for those 2 s),
    // so both branches are probed from that point, not from the splash point.
    const track=[];const t0=Date.now();
    while(Date.now()-t0<4200){const n=await page.evaluate(()=>__worldDebug.snapshot());track.push(who==='player'?n.player:n.vehicles.find(v=>v.id==='van').position);await page.waitForTimeout(100);}
    const jump=track.findIndex((q,i)=>i>0&&Math.hypot(q[0]-track[i-1][0],q[2]-track[i-1][2])>3);
    const before=jump>0?track[jump-1]:null;
    const atRecovery=before?await page.evaluate(([x,z])=>__worldDistricts.recoveryProbe(x,z),[before[0],before[2]]):probe;
    const at=track.at(-1);
    const support=await page.evaluate(([x,z,y])=>__worldDistricts.supportAt(x,z,y+3),[at[0],at[2],at[1]]);
    const d=(q)=>q?Math.hypot(q[0]-at[0],q[2]-at[2]):Infinity;
    const branch=atRecovery.dry&&d(atRecovery.dry)<1.5?'dry-land':d(atRecovery.road)<2.5?'road-fallback':'unclassified';
    const c={name:`shore-${s.id}-${who}`,splash:s.p,landing:at,probe,atRecovery,positionAtRecovery:before,recovered:jump>0,branch,support,
     passed:!!support&&support.kind==='surface'&&!support.overWater&&at[1]>-.1&&branch!=='unclassified'};
    report.cases.push(c);console.log(JSON.stringify({name:c.name,branch,landing:at.map(v=>+v.toFixed(2)),support}));
   }
  }
  // Furniture contact: layout-derived approaches (straight, paved, clear corridor); van at ~5 m/s.
  if(v4cases.includes('furniture')){
   const spec=specs.find(s=>s.id==='van');
   report.furnitureTargets=layout.furniture.map(f=>f.id);
   for(const {id,start:startP,yaw,target:p} of layout.furniture){
    const t={id,position:p};
    const before=await page.evaluate(()=>__worldDistricts.knockables());
    await enterAt(spec,startP,yaw,beside(startP,yaw));
    const c={name:`furniture-${t.id}`,target:t,samples:[]};const t0=Date.now();
    while(Date.now()-t0<9000){const r=await read(spec.id),v=r.vehicle,speed=Math.hypot(v.velocity[0],v.velocity[2]);c.samples.push({p:v.position,speed});if(Math.hypot(v.position[0]-startP[0],v.position[2]-startP[2])>18)break;await bot.hold(speed<5?['KeyW']:[]);await page.waitForTimeout(40);}
    await bot.hold(['Space']);await page.waitForTimeout(1200);await bot.release();
    const after=await page.evaluate(()=>__worldDistricts.knockables()),row=after.find(k=>k.id===t.id),pre=before.find(k=>k.id===t.id);
    const lift=Math.max(...c.samples.map(s=>s.p[1]))-c.samples[0].p[1];
    Object.assign(c,{preSleeping:pre?.sleeping,postDisplacement:row?.displacement,knocked:row?.knocked,chassisLift:lift,awake:await page.evaluate(()=>__worldDistricts.awakeKnockables()),
     passed:pre?.sleeping===true&&(row?.displacement??0)>.3&&lift<=.15});
    report.cases.push(c);console.log(JSON.stringify({name:c.name,preSleeping:c.preSleeping,displacement:c.postDisplacement,lift:+lift.toFixed(3),awake:c.awake}));
   }
  }
 }
 await stopCanvasRecording(page,path.join(out,'drive.webm'));
}catch(e){report.errors.push(e.stack||String(e));}
finally{await bot.release().catch(()=>{});report.inputFixtures=bot.fixtureCalls;report.summary={total:report.cases.length,passed:report.cases.filter(c=>c.passed).length,failed:report.cases.filter(c=>!c.passed).map(c=>c.name),errors:report.errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));await browser.close();if(report.errors.length||report.cases.some(c=>!c.passed))process.exitCode=1;}
