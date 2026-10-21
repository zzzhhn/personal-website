/** Focused final-asset motion/video + retina evidence; does not repeat collision/connection suites. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Bot,loadPlaywright,CHROME,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v2/playtest/motion-final';await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const bot=new Bot(page);
const report={startedAt:new Date().toISOString(),base:process.env.WORLD_BASE_URL||'http://127.0.0.1:4321',errors:[],samples:[],checks:[],sourceAssets:{},retina:null};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
const state=()=>page.evaluate(()=>({snapshot:__worldDebug.snapshot(),actor:__worldDebug.actor(),clock:__worldDebug.animationClock()}));
async function observe(label,ms){const end=Date.now()+ms;while(Date.now()<end){report.samples.push({label,t:bot.now(),...await state()});await page.waitForTimeout(50);}}
try{
 await page.goto(report.base+'/world/?qa=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);await page.waitForTimeout(1000);
 for(const id of ['C03','C04','G16','G17','G18','G19','G20','G21','G22','G23','G24']){const url=`/assets/world/${id==='G24'?'guide':'camp'}/${id}.glb`;const r=await page.request.get(report.base+url);report.sourceAssets[id]={url,sha256:createHash('sha256').update(await r.body()).digest('hex')};}
 await page.screenshot({path:path.join(out,'default-dusk.png')});
 await page.evaluate(()=>__worldDebug.set({zoom:0}));await page.waitForTimeout(1000);
 await startCanvasRecording(page,30);
 await observe('idle',2400);await bot.hold(['KeyA']);await observe('walk',2600);await bot.hold(['KeyA','ShiftLeft']);await observe('run',2000);await bot.release();await observe('stop',1000);await bot.press('Space');await observe('jump-land',2200);
 await stopCanvasRecording(page,path.join(out,'guide-keys.webm'));
 await page.screenshot({path:path.join(out,'guide-near.png')});
 const flight=report.samples.filter(s=>s.label==='jump-land');const initial=report.samples.find(s=>s.label==='idle').snapshot.player[1];
 const readFeet=report.samples.every(s=>s.actor.soles?.left&&s.actor.soles?.right);
 report.checks.push({name:'deformed sole positions readable',passed:readFeet});
 report.checks.push({name:'physical jump and landing',passed:Math.max(...flight.map(s=>s.snapshot.player[1]))-initial>.6&&flight.at(-1).snapshot.grounded});
 const clips=[...new Set(report.samples.map(s=>s.actor.animation))];report.checks.push({name:'Idle Walk Run Jump Land visible in runtime',passed:['Idle','Walk','Run','Jump','Land'].every(s=>clips.includes(s)),clips});
 if(readFeet){const stance=report.samples.filter(s=>s.snapshot.grounded);report.soleMinY=Math.min(...stance.flatMap(s=>[s.actor.soles.left.minY,s.actor.soles.right.minY]));report.solePenetration_m=Math.max(0,4.8-report.soleMinY);}
 // Independent placement for environmental observation, explicitly logged and outside walking metrics.
 await bot.fixtureTeleport([-51,5.68,26],'near tree/cloth observation camera only');await page.waitForTimeout(1100);
 await startCanvasRecording(page,30);await observe('wind-dusk',5500);await stopCanvasRecording(page,path.join(out,'wind-dusk.webm'));
 await page.screenshot({path:path.join(out,'nature-ground-dusk.png')});
 await page.evaluate(()=>__worldDebug.set({light:'night'}));await page.waitForTimeout(2300);
 await startCanvasRecording(page,30);await observe('wind-night',4500);await stopCanvasRecording(page,path.join(out,'wind-night.webm'));await page.screenshot({path:path.join(out,'nature-ground-night.png')});
 await page.evaluate(()=>__worldDebug.set({shot:'camp',light:'dusk'}));await page.waitForTimeout(2300);await page.screenshot({path:path.join(out,'overview-dusk.png')});
 await page.evaluate(()=>__worldDebug.set({light:'night'}));await page.waitForTimeout(2300);await page.screenshot({path:path.join(out,'overview-night.png')});
 const retina=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2});await retina.goto(report.base+'/world/?qa=1',{waitUntil:'networkidle'});await retina.waitForFunction(()=>window.__worldDebug?.actor().loaded);await retina.waitForTimeout(900);
 report.retina=await retina.evaluate(()=>__worldDebug.renderInfo());await retina.screenshot({path:path.join(out,'retina-1280x720-at2.png')});report.checks.push({name:'DPR2 actual 2560x1440',passed:report.retina.pixelRatio===2&&report.retina.drawingBuffer[0]===2560&&report.retina.drawingBuffer[1]===1440});await retina.close();
}catch(e){report.errors.push(e.stack||String(e))}finally{await bot.release().catch(()=>{});report.fixtures=bot.fixtureCalls;report.events=bot.events;report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({checks:report.checks,errors:report.errors,solePenetration_m:report.solePenetration_m},null,2));if(report.errors.length||report.checks.some(x=>!x.passed))process.exitCode=1;}
