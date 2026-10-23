/** Three actual map roadblock impacts. Reload restores actual spawn states;
 * only vehicle/player initial positions are fixtures, all motion uses keys. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from './lib.mjs';
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4322';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/playtest/dynamic-roadblock';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const report={base,cases:[],errors:[],limits:['Map roadblock at [24,1.64,-18], directed 5 m/s frontal impact; not every impact angle.','QA fixture starts only; real keyboard acceleration and braking.']};
try{for(const spec of [{id:'offroad',h:1.176},{id:'coupe',h:1.054},{id:'van',h:1.452}]){
 const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.routeWebSocket('**/*',ws=>ws.close());
 page.on('pageerror',e=>report.errors.push(e.message));const bot=new Bot(page);
 await page.goto(base+'/world/?qa=1&qaWheelGuards=1&qaLowCom=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
 await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[24,1.14+h,-7],Math.PI/2),spec);
 await bot.fixtureTeleport([26.5,2.05,-7],'Actual coastal road start for 5 m/s orange-roadblock impact');await page.waitForTimeout(700);await bot.press('KeyE');await page.waitForTimeout(150);
 const read=()=>page.evaluate(id=>{const s=__worldDebug.snapshot(),p=__worldDebug.motionProbe();return{t:performance.now(),step:s.physicsStep,active:s.activeVehicle,car:s.vehicles.find(v=>v.id===id),obstacles:p.obstacles,contacts:__worldDebug.contacts()};},spec.id);
 const initial=await read();const obstacle=initial.obstacles.reduce((a,b)=>Math.hypot(b.position[0]-24,b.position[2]+18)<Math.hypot(a.position[0]-24,a.position[2]+18)?b:a);
 const c={name:spec.id,initial,obstacleHandle:obstacle.handle,samples:[],fixtures:bot.fixtureCalls};
 let first=null;const started=Date.now();
 while(Date.now()-started<16000){
  const r=await read(),v=Math.hypot(r.car.velocity[0],r.car.velocity[2]);c.samples.push(r);
  if(first===null&&r.contacts.some(k=>k.other.kind==='obstacle'))first=r.t;
  if(r.active!==spec.id||(first!==null&&r.t-first>2500))break;
  await bot.hold(first!==null?[]:v<4.95?['KeyW']:v>5.15?['Space']:[]);await page.waitForTimeout(16);
 }
 await bot.release();
 const at=c.samples.findIndex(r=>r.t===first);const pre=at<0?[]:c.samples.filter(r=>r.t<=first&&r.t>=first-200);
 c.approachSpeed=pre.length?Math.max(...pre.map(r=>Math.hypot(r.car.velocity[0],r.car.velocity[2]))):null;
 c.maxObstacleRise=Math.max(0,...c.samples.map(r=>(r.obstacles.find(o=>o.handle===obstacle.handle)?.position[1]??obstacle.position[1])-obstacle.position[1]));
 const contactY=at<0?initial.car.position[1]:c.samples[Math.max(0,at-1)].car.position[1];
 c.maxCarRise=Math.max(0,...c.samples.filter(r=>first!==null&&r.t>=first).map(r=>r.car.position[1]-contactY));
 c.passed=initial.active===spec.id&&first!==null&&Math.abs(c.approachSpeed-5)<.5&&c.maxObstacleRise<=1&&c.maxCarRise<=.15;
 await page.screenshot({path:path.join(out,spec.id+'.png')});report.cases.push(c);console.log(JSON.stringify({name:c.name,approachSpeed:c.approachSpeed,maxObstacleRise:c.maxObstacleRise,maxCarRise:c.maxCarRise,passed:c.passed}));
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await page.close();
}}catch(e){report.errors.push(e.stack||String(e));}finally{report.summary={total:report.cases.length,passed:report.cases.filter(c=>c.passed).length,failed:report.cases.filter(c=>!c.passed).map(c=>c.name),errors:report.errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));await browser.close();if(report.errors.length||report.summary.failed.length)process.exitCode=1;}
