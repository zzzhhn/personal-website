/** Far three-car budget and dusk/night lamps, on the same visible QA ground. */
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from '../playtest/lib.mjs';import {aim} from '../playtest/budget-lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR;await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),bot=new Bot(page),report={views:[],errors:[],fixtures:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.routeWebSocket('**/*',ws=>ws.close());await page.goto(process.env.WORLD_BASE_URL+'/world/?qa=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__worldDebug?.actor().loaded&&__worldDebug.sceneObjects().filter(n=>/^vehicle-(offroad|coupe|van)-body$/.test(n)).length===3);
 await page.evaluate(async()=>{const u=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/components/world/WorldVehicleVisual.tsx').name;window.__vehicleLOD=(await import(u)).vehicleLodSnapshot;});
 await page.waitForFunction(()=>Object.keys(__vehicleLOD()).length===3&&__worldDebug.budget);
 await page.evaluate(()=>__worldDebug.collisionLane('post',40));await page.waitForTimeout(300);
 for(const [id,h,z] of [['offroad',1.176,114],['coupe',1.054,120],['van',1.452,126]]){
  await page.evaluate(({id,h,z})=>__worldDebug.teleportVehicle(id,[100,5+h,z],Math.PI),{id,h,z});report.fixtures.push({id,position:[100,5+h,z],yaw:Math.PI});
 }
 await bot.fixtureTeleport([168,6,120],'three far cars, rear lamps in view');await aim(page,{yaw:0,pitch:.12,distance:12});
 for(const light of ['dusk','night']){
  await page.evaluate(light=>__worldDebug.set({light}),light);await page.waitForTimeout(2300);
  const state=await page.evaluate(()=>__vehicleLOD()),frame=await page.evaluate(()=>__worldDebug.budget.frame(1000));
  report.views.push({light,state,vehicles:frame.byZone.vehicles,total:frame.total,info:frame.info});
  await page.screenshot({path:path.join(out,`far-three-${light}.jpg`),type:'jpeg',quality:82});
 }
 report.passed=report.errors.length===0&&report.views.every(v=>Object.values(v.state).every(s=>s.level===1&&s.distance>=60&&s.l1Triangles/s.l0Triangles<=.30)&&v.vehicles.main.calls===6&&v.vehicles.main.triangles===10290)&&report.views[1].state.coupe.glow[1]>report.views[0].state.coupe.glow[1]&&report.views[1].state.van.glow[3]>report.views[0].state.van.glow[3];
}catch(e){report.errors.push(String(e.stack||e));report.passed=false;}
finally{report.fixtures.push(...bot.fixtureCalls);await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,errors:report.errors,views:report.views.map(v=>({light:v.light,vehicles:v.vehicles}))}));await browser.close();if(!report.passed)process.exitCode=1;}
