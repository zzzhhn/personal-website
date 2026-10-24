/** Focused, fixture-separated G24 final-pose evidence. Every sit/stand/vehicle action uses real E.
 * Fixtures happen with recording stopped; complete transition windows remain in each case. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME, startCanvasRecording, stopCanvasRecording } from '../playtest/lib.mjs';
import { aim } from '../playtest/budget-lib.mjs';
import { summarize } from './motion-metrics.mjs';
const out=process.env.WORLD_PLAYTEST_DIR,base=process.env.WORLD_BASE_URL,only=process.env.G24_CLOSE_ONLY;
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const report={errors:[],cases:[],assetSha256:createHash('sha256').update(await readFile('public/assets/world/guide/G24.glb')).digest('hex')};
const views=[];
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/world/?qa=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__worldDebug?.actor().loaded&&window.__parkExhibits?.().P16,undefined,{timeout:90000});
 await page.waitForTimeout(1800);const bot=new Bot(page);
 const photo=n=>page.screenshot({path:`${out}/${n}.jpg`,type:'jpeg',quality:88});
 const begin=async label=>{const skinTopology=await page.evaluate(()=>__worldDebug.actor('skin:topology'));await page.evaluate(()=>__worldDebug.actor('record:skin',3000));return{label,skinTopology};};
 const end=async(view,row)=>{const samples=await page.evaluate(()=>{__worldDebug.actor('record:stop');return __worldDebug.actor('record:take');});
  row.metrics=summarize(samples);row.frames=samples.length;row.animations=[...new Set(samples.map(f=>f.anim))];row.vehicleFrames=samples.filter(f=>f.veh).length;
  row.rootStepMax_mm=Math.max(0,...samples.slice(1).map((f,i)=>Math.hypot(...f.root.map((x,j)=>x-samples[i].root[j]))))*1000;
  views.push({...view,assetSha256:report.assetSha256,samples:samples.map(f=>({...f,label:view.label}))});report.cases.push(row);await writeFile(`${out}/${view.label}-frames.json`,JSON.stringify(samples.map(({skin,actor,...f})=>f)));};
 // C06 and P16, using the actual registered interaction anchors.
 for(const [label,prefix] of [['C06','camp-bench-0-a'],['P16','park-P16-']]){
  if(only&&only!==label)continue;
  const anchor=await page.evaluate(prefix=>__worldInteract.list().find(i=>i.id.startsWith(prefix)),prefix);
  if(!anchor)throw Error('Missing registered '+label);
  await bot.fixtureTeleport([anchor.position[0],anchor.position[1]+.3,anchor.position[2]],'clear approach to real '+anchor.id);
  await page.waitForTimeout(1400);const from=await bot.feedback();
  const row={label,anchor,from,prompt:await page.evaluate(()=>__worldDebug.state().nearbyInteract)};
  const view=await begin(label);await page.waitForTimeout(300);await bot.press('KeyE');await page.waitForTimeout(2600);
  row.seat=await page.evaluate(()=>__worldDebug.state().seat);row.seated=await page.evaluate(()=>__worldDebug.actor());
  if(!row.seat)throw Error(label+' real E did not sit');
  await aim(page,{yaw:-row.seat.yaw+(label==='P16'?.4:Math.PI/2),pitch:label==='P16'?-.15:.35,distance:5});await photo(label+'-side');
  await aim(page,{yaw:-row.seat.yaw+(label==='P16'?-.4:2.3),pitch:label==='P16'?-.15:.5,distance:5});await photo(label+'-q34');
  await page.evaluate(()=>__worldDebug.set({light:'night'}));await page.waitForTimeout(2100);await photo(label+'-night');
  await page.evaluate(()=>__worldDebug.set({light:'dusk'}));await page.waitForTimeout(2100);
  await bot.press('KeyE');await page.waitForTimeout(2200);row.after=await bot.feedback();row.stood=!await page.evaluate(()=>__worldDebug.state().seat);await photo(label+'-stood');
  await end(view,row);
 }
 // Idle and its natural variation. A real opposite key requests the stationary turn-before-move.
 if(!only){await bot.fixtureTeleport([-34,6,30],'open camp patch for idle/turn');await page.waitForTimeout(1400);
 {const view=await begin('idle-turn'),row={label:'idle-turn'};await page.waitForTimeout(10000);
 await bot.hold(['KeyS']);await page.waitForTimeout(100);await bot.release();await page.waitForTimeout(1200);await photo('turn-settled');await end(view,row);}}
 // Actual E enter and exit. Clip names remain gait names; veh/fade are the authoritative flags.
 if(!only||only==='vehicle'){const car=await page.evaluate(()=>__worldDebug.snapshot().vehicles.find(v=>v.id==='offroad').position);
 await bot.fixtureTeleport([car[0]-.5,car[1]+.6,car[2]+2.4],'live offroad door approach');await page.waitForTimeout(1400);
 {const view=await begin('vehicle'),row={label:'vehicle'};await page.waitForTimeout(250);await bot.press('KeyE');await page.waitForTimeout(280);await photo('vehicle-enter');await page.waitForTimeout(700);
 row.entered=await page.evaluate(()=>__worldDebug.state().activeVehicle);await bot.press('KeyE');await page.waitForTimeout(280);await photo('vehicle-exit');await page.waitForTimeout(1000);row.exited=!await page.evaluate(()=>__worldDebug.state().activeVehicle);await end(view,row);}}
 report.fixtures=bot.fixtureCalls;
 await writeFile(`${out}/runtime-skin.json`,JSON.stringify({views}));
 await page.close();
 // Ordinary entry, 1080p, real inputs only. No QA state or fixture used in this pass.
 if(!only){const normal=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});normal.on('pageerror',e=>report.errors.push(e.message));
 await normal.goto(base+'/world/',{waitUntil:'networkidle'});await normal.waitForTimeout(7000);const nb=new Bot(normal);
 report.normal={url:normal.url(),debugPresent:await normal.evaluate(()=>'__worldDebug'in window)};
 await normal.screenshot({path:`${out}/normal-default.jpg`,type:'jpeg',quality:88});await startCanvasRecording(normal,30);
 await normal.waitForTimeout(3000);await nb.hold(['KeyW']);await normal.waitForTimeout(600);await nb.release();await normal.waitForTimeout(1000);
 await nb.hold(['KeyS']);await normal.waitForTimeout(140);await nb.release();await normal.waitForTimeout(1000);
 for(let i=0;i<7;i++)await nb.wheel(-180);await normal.waitForTimeout(900);await normal.screenshot({path:`${out}/normal-near.jpg`,type:'jpeg',quality:88});
 await stopCanvasRecording(normal,`${out}/normal-1080p.webm`);await normal.close();}
}catch(e){report.errors.push(String(e.stack||e));}
finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,1));console.log(JSON.stringify({errors:report.errors,cases:report.cases.map(c=>({label:c.label,frames:c.frames,seat:c.seat,stood:c.stood,rootStepMax_mm:c.rootStepMax_mm,vehicleFrames:c.vehicleFrames,entered:c.entered,exited:c.exited}))}));}
