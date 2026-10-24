/** Actual keyboard runs across visible QA profiles. A/B uses identical geometry
 * and initial conditions. This is distinct from the real-map coast-route test. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from './lib.mjs';
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322',out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/transition-ab';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const allSpecs=[{id:'offroad',h:1.176},{id:'coupe',h:1.054},{id:'van',h:1.452}];
const specs=allSpecs.filter(s=>!process.env.WORLD_VEHICLES||process.env.WORLD_VEHICLES.split(',').includes(s.id));
const report={base,cases:[],errors:[],limits:['Visible QA profile fixtures outside the island, not actual map steps.','Curb 18cm, pad 10cm, coplanar bridge seam, 15/30cm stair pair; actual keyboard traversal.','Finite browser samples; no M1 claim.']};
const windows=[['curb',104,113],['pad',115,124],['bridge-seam',126,136],['stairs',140,152]];
try{for(const candidate of [false,true]){
 const page=await browser.newPage({viewport:{width:1280,height:720}});await page.routeWebSocket('**/*',ws=>ws.close());const bot=new Bot(page);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/world/?qa=1'+(process.env.WORLD_AB_BASE!==undefined?(candidate?process.env.WORLD_AB_CANDIDATE||'':process.env.WORLD_AB_BASE):(candidate?'&qaWheelGuards=1&qaLowCom=1':'')),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
 await page.evaluate(()=>__worldDebug.collisionLane('profiles'));
 const read=id=>page.evaluate(id=>{const s=__worldDebug.snapshot(),p=__worldDebug.motionProbe().vehicles.find(v=>v.id===id);return{t:performance.now(),step:s.physicsStep,active:s.activeVehicle,car:s.vehicles.find(v=>v.id===id),rotation:p.rotation};},id);
 for(const spec of specs)for(const speed of [5,12]){
  await bot.release();await page.evaluate(()=>__worldDebug.exit());
  for(let i=0;i<allSpecs.length;i++)await page.evaluate(({id,i})=>__worldDebug.teleportVehicle(id,[80+i*8,7,150],0),{id:allSpecs[i].id,i});
  await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[80,5+h,120],0),spec);await bot.fixtureTeleport([80,6,117.5],'QA transition A/B start');await page.waitForTimeout(600);await bot.press('KeyE');await page.waitForTimeout(150);
  const c={id:spec.id,candidate,targetSpeed:speed,samples:[],fixtures:bot.fixtureCalls},started=Date.now();
  while(Date.now()-started<26000){const r=await read(spec.id),v=Math.hypot(r.car.velocity[0],r.car.velocity[2]);c.samples.push(r);if(r.active!==spec.id||r.car.position[0]>154)break;await bot.hold(v<speed-.1?['KeyW']:v>speed+.3?['Space']:[]);await page.waitForTimeout(16);}
  await bot.release();c.reached=c.samples.at(-1)?.car.position[0]>154;
  c.profiles=windows.map(([name,a,b])=>{const rows=c.samples.filter(r=>r.car.position[0]>=a&&r.car.position[0]<=b),pre=c.samples.filter(r=>r.car.position[0]>=a-2&&r.car.position[0]<a),baseY=pre.length?pre.at(-1).car.position[1]:5+spec.h;return{name,samples:rows.length,maxRise:rows.length?Math.max(...rows.map(r=>r.car.position[1]-baseY)):null,maxPitch:rows.length?Math.max(...rows.map(r=>{const q=r.rotation;return Math.abs(Math.asin(Math.max(-1,Math.min(1,2*(q[0]*q[1]+q[3]*q[2])))));})):null,minSpeed:rows.length?Math.min(...rows.map(r=>Math.hypot(r.car.velocity[0],r.car.velocity[2]))):null,approachSpeed:pre.length?Math.hypot(pre.at(-1).car.velocity[0],pre.at(-1).car.velocity[2]):null};});
  report.cases.push(c);console.log(JSON.stringify({id:c.id,candidate,speed,reached:c.reached,profiles:c.profiles}));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 await page.close();
}
report.comparisons=[];
for(const spec of specs)for(const speed of [5,12]){const a=report.cases.find(c=>c.id===spec.id&&c.targetSpeed===speed&&!c.candidate),b=report.cases.find(c=>c.id===spec.id&&c.targetSpeed===speed&&c.candidate);for(let i=0;i<windows.length;i++){const x=a.profiles[i],y=b.profiles[i],valid=x.samples>0&&y.samples>0,riseDelta=valid?y.maxRise-x.maxRise:null,pitchRatio=valid&&x.maxPitch>1e-3?y.maxPitch/x.maxPitch:null;report.comparisons.push({id:spec.id,speed,profile:x.name,valid,reason:valid?'measured':'not reached; no comparison',riseDelta,pitchRatio,baseline:x,candidate:y,passed:valid&&a.reached&&b.reached&&riseDelta<=.05&&(pitchRatio===null?y.maxPitch<=1e-3:pitchRatio<=1.2)});}}
}catch(e){report.errors.push(e.stack||String(e));}finally{report.summary={comparisons:report.comparisons?.length??0,failed:report.comparisons?.filter(c=>!c.passed)??[],errors:report.errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));await browser.close();if(report.errors.length||report.summary.failed.length)process.exitCode=1;}
