/** Three real-key approaches into the final vehicle hulls. Only start placements are fixtures. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from '../playtest/lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR;await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const report={cases:[],errors:[],limits:['Side approach at parked cars; no claim of every articulated/steered-wheel contact.','Real WASD; logged player fixture starts.']};
try{
 for(const id of ['offroad','coupe','van']){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.routeWebSocket('**/*',ws=>ws.close());
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(process.env.WORLD_BASE_URL+'/world/?qa=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
  const v=await page.evaluate(id=>__worldDebug.snapshot().vehicles.find(v=>v.id===id),id),bot=new Bot(page);
  const yaw=await page.evaluate(id=>__worldDebug.motionProbe().vehicles.find(v=>v.id===id).yaw,id);
  const start=[v.position[0]+Math.sin(yaw)*4,v.position[1]+1,v.position[2]+Math.cos(yaw)*4];
  await bot.fixtureTeleport(start,`walk into parked ${id} side`);await page.waitForTimeout(600);
  const contacts=[];
  const run=await bot.walk([[v.position[0],v.position[2]]],{timeout:5,maxRecoveries:0,stopOnBlocked:true,onTick:(fb)=>{contacts.push(...(fb.extra.contacts??[]).filter(c=>c.self==='player'&&c.other.kind==='vehicle'));}});
  const end=await bot.feedback(),car=end.vehicles.find(v=>v.id===id),last=run.legs.at(-1);
  const distance=Math.hypot(end.player[0]-car.position[0],end.player[2]-car.position[2]);
  const c={id,fixtures:bot.fixtureCalls,run,contacts,distance,carDisplacement:Math.hypot(car.position[0]-v.position[0],car.position[2]-v.position[2]),passed:!last.reached&&!!last.blockedAt&&contacts.length>0&&distance>.65};
  report.cases.push(c);console.log(JSON.stringify({id,passed:c.passed,distance,carDisplacement:c.carDisplacement,contacts:contacts.length}));await page.screenshot({path:path.join(out,id+'.jpg'),type:'jpeg',quality:80});await page.close();
 }
}catch(e){report.errors.push(String(e.stack||e));}
finally{report.passed=report.errors.length===0&&report.cases.length===3&&report.cases.every(c=>c.passed);await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();if(!report.passed)process.exitCode=1;}
