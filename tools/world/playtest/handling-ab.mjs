import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from './lib.mjs';
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322',out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/handling-ab';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const report={base,cases:[],errors:[],basis:'Same current scene: guards/COM disabled vs enabled. Real keys; initial fixture placements only.'};
const specs=[{id:'offroad',h:1.176},{id:'coupe',h:1.054},{id:'van',h:1.452}];
try{for(const candidate of [false,true]){
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});await page.routeWebSocket('**/*',ws=>ws.close());
 page.on('pageerror',e=>report.errors.push(e.message));const bot=new Bot(page);
 await page.goto(base+'/world/?qa=1'+(process.env.WORLD_AB_BASE!==undefined?(candidate?process.env.WORLD_AB_CANDIDATE||'':process.env.WORLD_AB_BASE):(candidate?'&qaWheelGuards=1'+(process.env.WORLD_NO_COM==='1'?'':'&qaLowCom=1'):'')),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
 await page.evaluate(()=>{__worldDebug.collisionLane('post',40);window.__handlingStart=null;addEventListener('keydown',e=>{if(e.code==='KeyA'&&!e.repeat){const s=__worldDebug.snapshot();window.__handlingStart={t:performance.now(),step:s.physicsStep,yaw:__worldDebug.motionProbe().vehicles.find(v=>v.id===s.activeVehicle)?.yaw};}});});
 const read=id=>page.evaluate(id=>{const s=__worldDebug.snapshot(),v=s.vehicles.find(v=>v.id===id);return{t:performance.now(),step:s.physicsStep,position:v.position,velocity:v.velocity,active:s.activeVehicle,yaw:__worldDebug.motionProbe().vehicles.find(v=>v.id===id).yaw,rotation:__worldDebug.motionProbe().vehicles.find(v=>v.id===id).rotation}},id);
 async function cruise(id,speed,ms,steer=false){const rows=[],start=Date.now();while(Date.now()-start<ms){const r=await read(id),v=Math.hypot(r.velocity[0],r.velocity[2]);rows.push(r);const keys=v<speed-.1?['KeyW']:v>speed+.3?['Space']:[];if(steer)keys.push('KeyA');await bot.hold(keys);await page.waitForTimeout(30);}return rows;}
 for(const spec of specs.filter(s=>!process.env.WORLD_VEHICLES||process.env.WORLD_VEHICLES.split(',').includes(s.id))){
  await bot.release();await page.evaluate(()=>__worldDebug.exit());
  for(let i=0;i<specs.length;i++)await page.evaluate(({id,i})=>__worldDebug.teleportVehicle(id,[75+i*8,7,155],0),{id:specs[i].id,i});
  await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[100,5+h,120],0),spec);await bot.fixtureTeleport([100,6,117.5],'handling A/B start');await page.waitForTimeout(700);await bot.press('KeyE');await page.waitForTimeout(150);
  const c={name:spec.id,candidate,entered:(await read(spec.id)).active===spec.id,samples:[]};
  // Launch from rest after one short steer tap (60 ms A+W): a perfectly symmetric standing start lets
  // Rapier's raycast controller sit in one of two solver states that differ ~25% in launch force depending
  // on unrelated collider counts (docs/world/vehicles/DESIGN.md 7); the tap makes the launch repeatable.
  await bot.hold(['KeyW','KeyA']);await page.waitForTimeout(60);
  c.approach=await cruise(spec.id,10,2800);
  {const r0=c.approach[0],hit=c.approach.find(r=>Math.hypot(r.velocity[0],r.velocity[2])>=8);c.accelTo8Steps=hit?hit.step-r0.step:null;}c.brakeStart=await read(spec.id);await bot.hold(['Space']);const started=Date.now();
  while(Date.now()-started<5000){const r=await read(spec.id);c.samples.push(r);if(Math.hypot(r.velocity[0],r.velocity[2])<.1)break;await page.waitForTimeout(20);}
  await bot.release();c.brakeEnd=c.samples.at(-1);c.brakeSpeed=Math.hypot(c.brakeStart.velocity[0],c.brakeStart.velocity[2]);c.brakeDistance=Math.hypot(c.brakeEnd.position[0]-c.brakeStart.position[0],c.brakeEnd.position[2]-c.brakeStart.position[2]);
  // Compare the same measured 9 m/s -> rest interval in both runs. The
  // keyboard governor has a small overshoot around 10; v^2 makes raw unequal
  // starts unsuitable for a ±5% stopping-distance comparison.
  const braking=[c.brakeStart,...c.samples];
  for(let i=1;i<braking.length;i++){const a=braking[i-1],b=braking[i],va=Math.hypot(a.velocity[0],a.velocity[2]),vb=Math.hypot(b.velocity[0],b.velocity[2]);if(va>=9&&vb<9){const f=(va-9)/(va-vb),p=[a.position[0]+(b.position[0]-a.position[0])*f,a.position[2]+(b.position[2]-a.position[2])*f];c.brakeDistanceAt9=Math.hypot(c.brakeEnd.position[0]-p[0],c.brakeEnd.position[2]-p[1]);break;}}
  await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[100,5+h,120],0),spec);await page.waitForTimeout(500);await cruise(spec.id,8,2300);c.turnStart=await read(spec.id);c.turn=await cruise(spec.id,8,4500,true);await bot.release();
  let angle=0,steadyAngle=0,arc=0;for(let i=1;i<c.turn.length;i++){const a=c.turn[i-1],b=c.turn[i],da=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));angle+=da;if(a.t-c.turnStart.t>2500){steadyAngle+=da;arc+=Math.hypot(b.position[0]-a.position[0],b.position[2]-a.position[2]);}}
  c.turnRadius=arc/Math.abs(steadyAngle);c.turnAngle=angle;c.radiusMeasurement={arc,steadyAngle,window:'last 2 seconds; actual horizontal path / unwrapped yaw'};
  c.inputStart=await page.evaluate(()=>window.__handlingStart);
  c.responseMs=c.turn.find(r=>Math.abs(Math.atan2(Math.sin(r.yaw-c.turnStart.yaw),Math.cos(r.yaw-c.turnStart.yaw)))>.1)?.t-c.turnStart.t;
  const origin=c.inputStart;
  if(origin){const rows=[{step:origin.step,yaw:origin.yaw,t:origin.t},...c.turn.filter(r=>r.step>origin.step)];for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],aa=Math.abs(Math.atan2(Math.sin(a.yaw-origin.yaw),Math.cos(a.yaw-origin.yaw))),bb=Math.abs(Math.atan2(Math.sin(b.yaw-origin.yaw),Math.cos(b.yaw-origin.yaw)));if(aa<.1&&bb>=.1){const f=(.1-aa)/(bb-aa);c.responseMsFixed=((a.step-origin.step)+(b.step-a.step)*f)*1000/60;c.responseWallMs=(a.t-origin.t)+(b.t-a.t)*f;break;}}}
  const pitch=r=>{const q=r.rotation;return q?Math.asin(Math.max(-1,Math.min(1,2*(q[0]*q[1]+q[3]*q[2]))))*180/Math.PI:null};
  const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
  c.pitchDegrees={accelerationMedian:median(c.approach.filter(r=>Math.hypot(r.velocity[0],r.velocity[2])>2&&Math.hypot(r.velocity[0],r.velocity[2])<8).map(pitch)),brakingMedian:median(c.samples.filter(r=>Math.hypot(r.velocity[0],r.velocity[2])>2&&Math.hypot(r.velocity[0],r.velocity[2])<8).map(pitch))};
  c.peakSideslipRadians=Math.max(...c.turn.map(r=>Math.abs(Math.atan2(Math.sin(Math.atan2(-r.velocity[2],r.velocity[0])-r.yaw),Math.cos(Math.atan2(-r.velocity[2],r.velocity[0])-r.yaw)))));
  report.cases.push(c);console.log(JSON.stringify({id:spec.id,candidate,brakeSpeed:c.brakeSpeed,brakeDistance:c.brakeDistance,turnRadius:c.turnRadius,responseMs:c.responseMs}));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 await page.close();
}
report.comparisons=specs.filter(s=>!process.env.WORLD_VEHICLES||process.env.WORLD_VEHICLES.split(',').includes(s.id)).map(s=>{const a=report.cases.find(c=>c.name===s.id&&!c.candidate),b=report.cases.find(c=>c.name===s.id&&c.candidate);return{id:s.id,brakeDelta:(b.brakeDistanceAt9/a.brakeDistanceAt9-1),brakeDistanceAt9:[a.brakeDistanceAt9,b.brakeDistanceAt9],radiusDelta:(b.turnRadius/a.turnRadius-1),responseDelta:(b.responseMsFixed/a.responseMsFixed-1),responseFixedMs:[a.responseMsFixed,b.responseMsFixed],accelDelta:(b.accelTo8Steps/a.accelTo8Steps-1),accelTo8Steps:[a.accelTo8Steps,b.accelTo8Steps],sideslipRatio:b.peakSideslipRadians/a.peakSideslipRadians,pitch:[a.pitchDegrees,b.pitchDegrees],brakeSpeeds:[a.brakeSpeed,b.brakeSpeed]};});
}catch(e){report.errors.push(e.stack||String(e));}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({comparisons:report.comparisons,errors:report.errors}));await browser.close();}
