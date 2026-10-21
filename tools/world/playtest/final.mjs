/** Integrated acceptance runner. Isolated start teleports are explicitly logged; all movement
 * afterwards uses real keyboard input. Run against an already built local/CF preview.
 * Optional WORLD_CASES=G19,G20 narrows a repair rerun; omitted runs the complete batch. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, loadPlaywright, CHROME } from './lib.mjs';
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4321';
const out=path.resolve(process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v2/playtest/final');
const selected=process.env.WORLD_CASES?.split(',');
const ids=selected||['C03','C04','C05','C06','C07','C08','C09','C10','G16','G17','G18','G19','G20','G21','G22','G23'];
await mkdir(out,{recursive:true});
const {chromium}=loadPlaywright();
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal','--enable-webgl']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();const bot=new Bot(page);
const report={base,startedAt:new Date().toISOString(),scope:selected?'targeted repair rerun':'integrated batch',collisions:[],checks:[],errors:[],networkErrors:[],fixtures:[],route:null,animations:[],quality:[],motion:{},limits:[]};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
page.on('response',r=>{if(r.status()>=400)report.networkErrors.push({url:r.url(),status:r.status()})});
const debug=fn=>page.evaluate(fn);
const check=(name,passed,evidence)=>report.checks.push({name,passed:!!passed,evidence});
const snap=()=>debug(()=>({s:__worldDebug.snapshot(),a:__worldDebug.actor(),contacts:__worldDebug.contacts()}));
const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png')});return name+'.png'};
const union=rows=>({min:[0,1,2].map(i=>Math.min(...rows.map(r=>r.aabb.min[i]))),max:[0,1,2].map(i=>Math.max(...rows.map(r=>r.aabb.max[i])))});
try {
 await page.goto(base+'/world/?qa=1',{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>window.__worldDebug?.actor().loaded&&__worldDebug.campColliders().length>50,undefined,{timeout:45000});
 await page.waitForTimeout(1300);await page.locator('canvas').click({position:{x:960,y:540}});
 report.inventory=await debug(()=>({physics:__worldDebug.physicsInventory(),visual:__worldDebug.visualInventory(),camp:__worldDebug.campColliders(),motion:__worldDebug.motionInventory(),render:__worldDebug.renderInfo(),stats:__worldDebug.stats()}));
 check('No asset fallback',!(await debug(()=>__worldDebug.sceneObjects().some(n=>/camp-(fallback|loading)/.test(n)))));
 if(!selected){
  await shot('01-default-dusk');
  // One continuous, real-key tour from spawn, through the large tent and around the parked car.
  report.route=await bot.walk([[-42,40],[-32,40],[-30,28],[-34,20],[-42,17],[-42,12.5],[-42,17],[-30,28],[-22,30],[-22,34],[-18.8,34]],{timeout:22,arrive:.4,maxRecoveries:2});
  check('Continuous spawn to tent to exit keyboard tour',report.route.legs.every(l=>l.reached),report.route.legs);
  await shot('02-exit');
 }
 const records=report.inventory.camp;
 const directions=[['east',1,0],['west',-1,0],['south',0,1],['north',0,-1]];
 for(const id of ids){
  let rows=records.filter(r=>r.id===id&&r.instance===0);
  if(id==='C10'&&rows.some(r=>r.part==='base'))rows=rows.filter(r=>r.part==='base');
  if(!rows.length){report.collisions.push({id,passed:false,error:'No fitted collider record'});continue;}
  const box=union(rows),center=[(box.min[0]+box.max[0])/2,(box.min[2]+box.max[2])/2];
  for(const [direction,dx,dz] of directions){
   const edge=dx?(box.max[0]-box.min[0])/2:(box.max[2]-box.min[2])/2;
   const start=[center[0]+dx*(edge+.82),5.68,center[1]+dz*(edge+.82)];
   await bot.fixtureTeleport(start,`${id}/${direction}: isolated approach start only`);
   const contacts=[];const before=await snap();
   const result=await bot.walk([center],{timeout:7,arrive:.18,stopOnBlocked:true,onTick:async(fb,row)=>{
    for(const contact of fb.extra.contacts||[])if(contact.other.assetId===id)contacts.push({...contact,t:row.t,player:fb.player});
   }});
   const after=await snap(), own=contacts.filter(c=>c.other.assetId===id), otherIds=[...new Set(result.trace.flatMap(r=>(r.contacts||[]).filter(c=>c.other.kind==='solid').map(c=>c.other.assetId||c.other.name)))];
   const door=(id==='C03'||id==='C04')&&direction==='south';
   let exit=null;
   if(door&&result.legs.every(l=>l.reached)){
    await shot(`${id}-inside`);
    exit=await bot.walk([[start[0],start[2]]],{timeout:8,arrive:.3,stopOnBlocked:true});
   }
   const sideContacts=own.filter(c=>Math.hypot(c.normal[0],c.normal[2])>.2&&c.points.length);
   const gaps=[];
   for(const c of sideContacts.slice(-6)){
    const q=c.points[0], n=c.normal, l=Math.hypot(...n)||1, normal=n.map(x=>x/l);
    const visual=await page.evaluate(({q,n,id})=>__worldDebug.visualRaycast(q.map((v,i)=>v+n[i]*.4),n.map(v=>-v),id),{q,n:normal,id});
    if(visual.length)gaps.push(Math.min(...visual.map(h=>Math.abs(h.distance-.4))));
   }
   const reached=result.legs.every(l=>l.reached);
   let elevatedProbe=null;
   if(id==='C08')elevatedProbe=await page.evaluate(({id,center,box,dx,dz,edge})=>{
    const origin=[center[0]+dx*(edge+.82),box.max[1]-.08,center[1]+dz*(edge+.82)];
    return {origin,direction:[-dx,0,-dz],result:__worldDebug.probeAsset(id,origin,[-dx,0,-dz],.05)};
   },{id,center,box,dx,dz,edge});
   const elevatedPass=id==='C08'&&otherIds.includes('C07')&&elevatedProbe?.result?.visualBoundaryGap!=null&&elevatedProbe.result.visualBoundaryGap<=.15;
   let passed=door?(reached&&exit?.legs.every(l=>l.reached)):(own.length>0&&Math.min(...own.map(c=>c.distance))>-.15)||elevatedPass;
   const status=door?(passed?'door-enter-exit':'door-blocked'):own.length?(reached?'contact-and-stepped-over':'contact-and-blocked'):otherIds.length?'occluded-by-other-solid':'no-target-contact';
   const visibleHeight=Math.max(0,box.max[1]-4.8);
   const lift=Math.max(...result.trace.map(t=>t.p[1]))-Math.min(...result.trace.map(t=>t.p[1]));
   if(reached&&!door&&own.length&&lift<visibleHeight*.5)passed=false;
   const row={id,direction,passed,status,elevatedProbe,visibleHeight_m:visibleHeight,playerLift_m:lift,stepOverValid:!reached||door||lift>=visibleHeight*.5,start,before,after,result,exit,contactSamples:own.length,otherIds,visualBoundaryGaps_m:gaps,visualBoundaryWithin15cm:gaps.length?Math.max(...gaps)<=.15:null,
    maxPenetration_m:own.length?Math.max(0,-Math.min(...own.map(c=>c.distance))):null};
   report.collisions.push(row);
   if(direction==='east'||!passed)row.screenshot=await shot(`${id}-${direction}-${status}`);
   console.log(JSON.stringify({id,direction,passed,status,contacts:own.length,gapMax:gaps.length?Math.max(...gaps):null}));
  }
 }
 if(!selected){
  // Actor inputs use fixture only to establish an unobstructed start. Every state is a real key event.
  await bot.fixtureTeleport([-42,5.68,39],'unobstructed actor/animation start');
  await bot.release();await page.waitForTimeout(500);report.animations.push({label:'idle',...await snap()});
  await bot.hold(['KeyA']);await page.waitForTimeout(900);report.animations.push({label:'walk',...await snap()});
  await bot.hold(['KeyA','ShiftLeft']);await page.waitForTimeout(700);report.animations.push({label:'run',...await snap()});
  await bot.release();await page.waitForTimeout(500);const jumpStart=await snap();await bot.press('Space');
  for(let i=0;i<15;i++){await page.waitForTimeout(90);report.animations.push({label:'jump-and-land',...await snap()});}
  const clips=[...new Set(report.animations.map(x=>x.a.animation))];
  check('Actual Idle Walk Run Jump clips', ['Idle','Walk','Run','Jump'].every(c=>clips.includes(c)),clips);
  const flight=report.animations.filter(x=>x.label==='jump-and-land');
  check('Jump physically rises then lands',Math.max(...flight.map(x=>x.s.player[1]))-jumpStart.s.player[1]>.6&&flight.some(x=>!x.s.grounded)&&flight.at(-1).s.grounded,{start:jumpStart.s.player,peak:Math.max(...flight.map(x=>x.s.player[1])),land:flight.at(-1).s.player});
  await bot.fixtureTeleport([-26,5.68,36.2],'E enter/exit interaction start beside offroad');
  await bot.press('KeyE');await page.waitForTimeout(250);const entered=await snap();
  await bot.press('KeyE');await page.waitForTimeout(400);const exited=await snap();
  check('Real E enters then exits',entered.s.activeVehicle==='offroad'&&exited.s.activeVehicle===null,{entered,exited});
  await bot.fixtureTeleport([-42,5.68,35],'render and pause observation start');
  await bot.release();await page.waitForTimeout(600);
  const prior=await snap();await bot.press('Escape');await page.waitForTimeout(200);
  const pauseA=await debug(()=>({clock:__worldDebug.animationClock(),actor:__worldDebug.actor(),step:__worldDebug.snapshot().physicsStep}));
  await page.waitForTimeout(750);const pauseB=await debug(()=>({clock:__worldDebug.animationClock(),actor:__worldDebug.actor(),step:__worldDebug.snapshot().physicsStep}));
  check('Esc freezes physics and all motion clocks',pauseA.step===pauseB.step&&JSON.stringify(pauseA.clock)===JSON.stringify(pauseB.clock)&&pauseA.actor.mixerTime===pauseB.actor.mixerTime,{pauseA,pauseB,prior});
  await bot.press('Escape');await page.waitForTimeout(100);
  await debug(()=>__worldDebug.set({shot:'camp'}));await page.waitForTimeout(200);
  const shotA=await debug(()=>({clock:__worldDebug.animationClock(),actor:__worldDebug.actor(),step:__worldDebug.snapshot().physicsStep}));
  await page.waitForTimeout(650);const shotB=await debug(()=>({clock:__worldDebug.animationClock(),actor:__worldDebug.actor(),step:__worldDebug.snapshot().physicsStep}));
  check('Evidence shot freezes physics and motion',shotA.step===shotB.step&&JSON.stringify(shotA.clock)===JSON.stringify(shotB.clock)&&shotA.actor.mixerTime===shotB.actor.mixerTime,{shotA,shotB});
  await shot('03-camp-overview-dusk');await debug(()=>__worldDebug.set({light:'night'}));await page.waitForTimeout(2300);await shot('04-camp-overview-night');
  await debug(()=>__worldDebug.set({shot:null,light:'dusk',zoom:0}));await page.waitForTimeout(2300);await shot('05-guide-near');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(2200);report.motion.reduced=await debug(()=>__worldDebug.motionInventory());
  check('Reduced motion damps environmental motion',report.motion.reduced.strength<.02,report.motion.reduced.strength);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(2200);report.motion.normal=await debug(()=>__worldDebug.motionInventory());
  check('Cloth has two pinned curtain shells per asset',report.motion.normal.meshes.filter(m=>m.cloth).every(m=>m.curtainShells===2),report.motion.normal.meshes.filter(m=>m.cloth));
  check('Nature has matching deformed shadow materials',report.motion.normal.meshes.filter(m=>m.wind).length>=10&&report.motion.normal.meshes.filter(m=>m.wind).every(m=>m.matchingDepth&&m.matchingDistance));
  for(const size of [[1920,1080],[2560,1440]]){
   await page.setViewportSize({width:size[0],height:size[1]});await page.waitForTimeout(900);
   const info=await debug(()=>__worldDebug.renderInfo());const png=await shot(`06-quality-${size[0]}x${size[1]}`);
   report.quality.push({requested:size,info,png});check(`${size[0]}x${size[1]} actual buffer`,info.drawingBuffer[0]===size[0]&&info.drawingBuffer[1]===size[1],info);
  }
  await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(500);
  report.frameIntervals=await debug(()=>new Promise(resolve=>{const a=[];let last=performance.now();const next=t=>{a.push(t-last);last=t;if(a.length>=180)resolve(a);else requestAnimationFrame(next)};requestAnimationFrame(next)}));
  report.limits.push('Frame intervals on the current M5 Pro only; display cadence is not GPU headroom or an M1 Air performance claim.');
 }
 check('No page/console errors',report.errors.length===0,report.errors);check('No failed HTTP responses',report.networkErrors.length===0,report.networkErrors);
} catch(e){report.errors.push(e.stack||String(e));await shot('runner-failure').catch(()=>{});}
finally{
 await bot.release().catch(()=>{});report.fixtures=bot.fixtureCalls;report.events=bot.events;report.finishedAt=new Date().toISOString();
 report.summary={checksPassed:report.checks.filter(x=>x.passed).length,checksTotal:report.checks.length,collisionPasses:report.collisions.filter(x=>x.passed).length,collisionCases:report.collisions.length,
  unresolved:report.collisions.filter(x=>!x.passed||x.visualBoundaryWithin15cm===false).map(x=>({id:x.id,direction:x.direction,status:x.status,boundary15cm:x.visualBoundaryWithin15cm})),errors:report.errors.length};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));await browser.close();
 if(report.errors.length||report.checks.some(x=>!x.passed)||report.summary.unresolved.length)process.exitCode=1;
}
