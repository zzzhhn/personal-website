/** Map-instance tyre side grazes (spec v3 §6): real G18 trunk, real G16 trunk and a real camp exit lamp post,
 * three vehicles, 2 / 5 / 10 m/s. Only the start pose is placed (logged fixtures); entering is the E key and
 * every metre of approach is real W/Space keyboard control. Each case parks all vehicles first so no car
 * blocks the lane. A case passes only if the target was actually reached at the target speed. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Bot,loadPlaywright,CHROME,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
/** The coupe's parked spot comes from the running layout (layout v4 moves it to the avenue lay-by);
 * v3 resolves to the same 19.8,2.3,12. Offroad and van are protected and keep their script values. */
const layoutParks=async(page,specs,key)=>{const v=await page.evaluate(()=>__worldDebug.layout?.().vehicles??null),p=v?.coupe?.position,s=specs.find(x=>x.id==='coupe');if(p&&s)s[key]=[p[0],p[1]+s[key][1]-1.14,p[2]];};
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/map-graze';
const query=process.env.WORLD_QUERY||'?qa=1&qaWheelGuards=1&qaLowCom=1';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),bot=new Bot(page);
await page.routeWebSocket('**/*',ws=>ws.close()); // freeze loaded modules: parallel HMR must not swap code mid-run
// Code version actually served for this run (HMR is cut after load): hash of the source at start, plus the
// centre-of-mass values in effect (qaLowCom: offroad/van -0.5 m, coupe -0.3 m at the time of writing).
const actorsSource=readFileSync('src/components/world/WorldActors.tsx','utf8');
const comLine=actorsSource.split('\n').find(l=>l.includes('centerOfMass'))?.trim()??null;
const report={base,query,startedAt:new Date().toISOString(),codeVersion:{worldActorsSha256:createHash('sha256').update(actorsSource).digest('hex'),centerOfMassLine:comLine},targets:[],cases:[],errors:[],
 limits:['Map instances in place; only three targets (two trunks, one lamp post), one approach side each.','Finite browser-frame sampling (~16 ms), not every physics substep.','Penetration = motionProbe signed distance of the visual wheel cylinder to the target collider (collider, not render mesh).','M5 Pro dev server; no M1 claim.']};
page.on('pageerror',e=>report.errors.push(e.message));
// HMR is deliberately cut (routeWebSocket), so Vite's own reconnect noise is not an app error.
page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('[vite]'))report.errors.push(m.text())});
const specs=[{id:'offroad',size:[3.9,1.35,2],park:[-24,6.1,42]},{id:'coupe',size:[4.3,1.05,1.9],park:[19.8,2.3,12]},{id:'van',size:[4.5,1.9,2.2],park:[46,2.7,-45]}];
const radiusOf=s=>Math.min(.5,Math.max(.34,s.size[1]*.28)), heightOf=s=>s.size[1]*.28+.42+radiusOf(s);
const read=()=>page.evaluate(()=>({t:performance.now(),s:__worldDebug.snapshot(),p:__worldDebug.motionProbe(),c:__worldDebug.contacts()}));
const speeds=(process.env.WORLD_SPEEDS||'2,5,10').split(',').map(Number);
try{
 await page.goto(base+'/world/'+query,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>__worldDebug?.actor().loaded&&typeof __worldDebug.motionProbe==='function',undefined,{timeout:60000});
 await page.waitForTimeout(800);
 await layoutParks(page,specs,'park');
 const recs=await page.evaluate(()=>__worldDebug.campColliders());
 const inv=await page.evaluate(()=>__worldDebug.physicsInventory().filter(c=>c.kind==='solid'&&c.shape==='cuboid'&&c.aabb.min[1]>4.7&&c.aabb.max[1]-c.aabb.min[1]>2&&c.aabb.max[0]-c.aabb.min[0]<.4&&Math.abs((c.aabb.min[0]+c.aabb.max[0])/2+30)<.5&&Math.abs((c.aabb.min[2]+c.aabb.max[2])/2-31)<.5).map(c=>({name:c.name,aabb:c.aabb})));
 const g18=recs.find(r=>r.id==='G18'&&r.instance===0&&r.part==='trunk'), g16=recs.find(r=>r.id==='G16'&&r.instance===0&&r.part==='trunk'), post=inv[0];
 // Targets: lane axis, travel direction, side of the obstacle the tyre passes, run start along the axis.
 const targets=[
  g18&&{name:'G18-trunk',match:{assetId:'G18'},aabb:g18.aabb,axis:'z',dir:-1,yaw:Math.PI/2,side:+1,start:21.6,passAt:(g18.aabb.min[2]+g18.aabb.max[2])/2,probe:true},
  post&&{name:'camp-exit-lamp-post',match:{name:post.name},aabb:post.aabb,axis:'x',dir:-1,yaw:Math.PI,side:+1,start:-19.5,passAt:(post.aabb.min[0]+post.aabb.max[0])/2,probe:false},
  g16&&{name:'G16-trunk-south',match:{assetId:'G16'},aabb:g16.aabb,axis:'x',dir:-1,yaw:Math.PI,side:+1,start:-50.6,passAt:(g16.aabb.min[0]+g16.aabb.max[0])/2,probe:true},
 ].filter(Boolean).filter(t=>!process.env.WORLD_TARGETS||process.env.WORLD_TARGETS.split(',').some(k=>t.name.startsWith(k)));
 for(const T of targets){
  // Obstacle boundary on the lane side at wheel-centre height. Trunks: Rapier shape cast against the real
  // collider (probeAsset); the lamp post is an exact cuboid, so its AABB face is its boundary.
  T.boundary={};
  for(const spec of specs){
   const y=4.8+radiusOf(spec);
   if(T.probe){
    const mid=[(T.aabb.min[0]+T.aabb.max[0])/2,y,(T.aabb.min[2]+T.aabb.max[2])/2];
    const from=T.axis==='z'?[T.aabb.max[0]+1.5,y,mid[2]]:[mid[0],y,T.aabb.max[2]+1.5];
    const dirv=T.axis==='z'?[-1,0,0]:[0,0,-1];
    const hit=await page.evaluate(({from,dirv,id})=>__worldDebug.probeAsset(id,from,dirv,.03),{from,dirv,id:T.match.assetId});
    T.boundary[spec.id]={probe:hit,value:hit?(T.axis==='z'?hit.point[0]:hit.point[2]):null};
   }else T.boundary[spec.id]={value:T.axis==='z'?T.aabb.max[0]:T.aabb.max[2]};
  }
  report.targets.push(T);
 }
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 for(const T of targets)for(const spec of specs)for(const target of speeds){
  await bot.release();await page.evaluate(()=>__worldDebug.exit());
  await page.evaluate(specs=>{for(const s of specs)__worldDebug.teleportVehicle(s.id,s.park,0)},specs);
  const b=T.boundary[spec.id].value;
  const c={name:`${T.name}-${spec.id}-${target}`,target:T.name,vehicle:spec.id,targetSpeed:target,boundary:b,samples:[]};
  if(b===null){c.passed=false;c.reason='target boundary not found by probe';report.cases.push(c);continue;}
  // Wheel outer face intended GRAZE m inside the obstacle face (default 8 cm, as in the isolated matrix).
  const graze=Number(process.env.WORLD_GRAZE_DEPTH||'.08');
  const lateral=b+T.side*(spec.size[2]*.48+.15-graze);
  const h=4.8+heightOf(spec);
  const pos=T.axis==='z'?[lateral,h,T.start]:[T.start,h,lateral];
  const playerAt=T.axis==='z'?[lateral+T.side*2.2,5.9,T.start]:[T.start,5.9,lateral+T.side*2.2];
  await page.evaluate(({id,pos,yaw})=>__worldDebug.teleportVehicle(id,pos,yaw),{id:spec.id,pos,yaw:T.yaw});
  await bot.fixtureTeleport(playerAt,`start pose ${c.name}: car ${JSON.stringify(pos.map(v=>+v.toFixed(3)))} yaw ${T.yaw.toFixed(3)}; other cars parked`);
  c.fixture={car:pos,yaw:T.yaw,player:playerAt,lateral};
  await page.waitForTimeout(700);await bot.press('KeyE');await page.waitForTimeout(200);
  c.entered=(await read()).s.activeVehicle===spec.id;
  const record=target===speeds.at(-1)&&process.env.WORLD_RECORD!=='0';
  if(record&&c.entered)await startCanvasRecording(page,30);
  let started=Date.now(),baseY=null,firstContact=null;
  const along=v=>T.axis==='z'?v.position[2]:v.position[0];
  while(c.entered&&Date.now()-started<14000){
   const r=await read(),v=r.s.vehicles.find(v=>v.id===spec.id),speed=Math.hypot(v.velocity[0],v.velocity[2]);
   const wheels=r.p.vehicles.find(v=>v.id===spec.id).wheels;
   const hits=wheels.flatMap(w=>w.nearby.filter(n=>T.match.assetId?n.other.assetId===T.match.assetId:n.other.name===T.match.name).map(n=>({wheel:w.index,distance:n.distance})));
   const solver=r.c.filter(k=>T.match.assetId?k.other.assetId===T.match.assetId:k.other.name===T.match.name).map(k=>({distance:k.distance,normal:k.normal}));
   if(baseY===null&&Math.abs(along(v)-T.start)>.5)baseY=v.position[1];
   if(firstContact===null&&(hits.some(h=>h.distance<.05)||solver.length))firstContact=r.t;
   c.samples.push({t:r.t,position:v.position,velocity:v.velocity,speed,wheelHits:hits,solverContacts:solver,upsideDownSeconds:v.upsideDownSeconds,lateral:T.axis==='z'?v.position[0]:v.position[2]});
   const passed=(along(v)-T.passAt)*T.dir>2.5;
   if(passed||(firstContact!==null&&r.t-firstContact>1200))break;
   await bot.hold(speed<target-.12?['KeyW']:speed>target+.3?['Space']:[]);
   await page.waitForTimeout(16);
  }
  await bot.hold(['Space']);await page.waitForTimeout(600);
  await page.screenshot({path:path.join(out,c.name+'.png')});
  if(record&&c.entered){await stopCanvasRecording(page,path.join(out,c.name+'.webm'));c.video=c.name+'.webm';}
  await bot.release();
  const contact=c.samples.filter(s=>s.wheelHits.length);
  c.closestWheelDistance=contact.length?Math.min(...contact.flatMap(s=>s.wheelHits.map(h=>h.distance))):null;
  c.maxPenetration=Math.max(0,-(c.closestWheelDistance??0));
  // Target reached = the visual wheel came within 5 cm OR the vehicle (body / wheel guard) had a solver
  // contact with the target. Both are recorded separately so a body/guard stop is not mistaken for a tyre graze.
  const tWheel=c.samples.find(s=>s.wheelHits.some(h=>h.distance<.05))?.t, tSolver=c.samples.find(s=>s.solverContacts.length)?.t;
  c.wheelReached=tWheel!==undefined;c.vehicleContact=tSolver!==undefined;
  const t0=[tWheel,tSolver].filter(x=>x!==undefined).sort((a,b)=>a-b)[0];
  c.reachedTarget=t0!==undefined;
  c.approachSpeed=t0===undefined?null:Math.max(...c.samples.filter(s=>s.t<=t0&&s.t>=t0-200).map(s=>s.speed));
  // Rise / vertical speed inside the interaction window only (contact-0.3 s .. contact+1.0 s): past the lane
  // the camp plateau ends, and a later drop must not be booked as a contact effect.
  const win=t0===undefined?[]:c.samples.filter(s=>s.t>=t0-300&&s.t<=t0+1000);
  c.maxRise=win.length?Math.max(0,...win.map(s=>s.position[1]-(baseY??s.position[1]))):null;
  c.maxVerticalSpeed=win.length?Math.max(...win.map(s=>Math.abs(s.velocity[1]))):null;
  c.lateralDeflection=win.length?Math.max(...win.map(s=>Math.abs(s.lateral-lateral))):null;
  c.upsideDown=c.samples.some(s=>s.upsideDownSeconds>0);
  // Outcome after contact: blocked (came to rest at the obstacle) vs passed by it.
  const after=t0===undefined?[]:c.samples.filter(s=>s.t>=t0+300&&s.t<=t0+1000);
  c.speedAfterContact=after.length?Math.min(...after.map(s=>s.speed)):null;
  c.blocked=c.speedAfterContact!==null&&c.speedAfterContact<.3;
  c.passedObstacle=c.samples.length>0&&((T.axis==='z'?c.samples.at(-1).position[2]:c.samples.at(-1).position[0])-T.passAt)*T.dir>2.5;
  const speedOk=c.approachSpeed!==null&&Math.abs(c.approachSpeed-target)<=Math.max(.5,target*.15);
  // Tyre side-graze evidence needs the visual wheel itself within 5 cm of the target. A body or wheel-guard
  // stop with the tyre farther away is a coverage gap ('partial'), never a tyre pass.
  c.verdict=!c.entered||!c.reachedTarget?'not-reached':!c.wheelReached?'partial-body-or-guard-only':(speedOk&&c.maxPenetration<=.05&&c.maxRise<=.15&&!c.upsideDown)?'tyre-pass':'tyre-fail';
  c.passed=c.verdict==='tyre-pass';
  c.reason=c.passed?'ok':c.verdict==='partial-body-or-guard-only'?`body/guard contact only; closest visual wheel ${c.closestWheelDistance===null?'none within 25 cm probe':(c.closestWheelDistance*100).toFixed(1)+' cm'}`:!c.entered?'did not enter vehicle':!c.reachedTarget?'target not reached (no wheel within 5 cm, no vehicle contact)':!speedOk?`approach speed ${c.approachSpeed?.toFixed(2)} vs ${target}`:c.maxPenetration>.05?'penetration > 5 cm':c.maxRise>.15?'rise > 15 cm':'upside down';
  c.sampleCount=c.samples.length;
  report.cases.push(c);
  console.log(JSON.stringify({verdict:c.verdict,name:c.name,entered:c.entered,reached:c.reachedTarget,wheel:c.wheelReached,body:c.vehicleContact,closest:c.closestWheelDistance&&+c.closestWheelDistance.toFixed(3),blocked:c.blocked,passedBy:c.passedObstacle,approach:c.approachSpeed&&+c.approachSpeed.toFixed(2),pen:+(c.maxPenetration*100).toFixed(2),rise:c.maxRise&&+(c.maxRise*100).toFixed(2),vy:c.maxVerticalSpeed&&+c.maxVerticalSpeed.toFixed(2),passed:c.passed,reason:c.reason}));
  await writeFile(path.join(out,'report.json'),JSON.stringify({...report,fixtures:bot.fixtureCalls},null,2));
 }
}catch(e){report.errors.push(e.stack||String(e));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 await bot.release().catch(()=>{});
 report.finishedAt=new Date().toISOString();report.fixtures=bot.fixtureCalls;report.events=bot.events;
 report.summary={total:report.cases.length,passed:report.cases.filter(c=>c.passed).length,verdicts:report.cases.reduce((a,c)=>(a[c.verdict]=(a[c.verdict]||0)+1,a),{}),failed:report.cases.filter(c=>!c.passed).map(c=>({name:c.name,reason:c.reason})),errors:report.errors};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.summary));
 await browser.close();
 if(report.errors.length||report.summary.failed.length)process.exitCode=1;
}
