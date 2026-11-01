/** Focused grass checks: real-key player/car motion, recovery, pause, 64 m non-alias, airborne rejection.
 * QA fixture teleports are logged; no scripted movement. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { CHROME, loadPlaywright, ensureDir, openWorld, Bot } from '../playtest/lib.mjs';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR), report = { cases: [], errors: [], fixtures: [] };
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
try {
 const {page,errors}=await openWorld(browser,process.env.WORLD_BASE_URL+'/world/?qa=1',{width:1920,height:1080});const bot=new Bot(page);
 await page.waitForFunction(()=>__worldEnv.groundDetail().grassBuildMs>0);
 const probe=(p)=>page.evaluate(([x,z])=>({local:__worldEnv.trampleAt(x,z),alias:__worldEnv.trampleAt(x+64,z),grass:__worldEnv.grass()}),p);
 for(const [name,start,end] of [['west-meadow',[-66,1.98,-38],[-58,-38]],['south-meadow',[-30,1.98,62],[-22,62]]]) {
  await bot.fixtureTeleport(start,name);await page.waitForTimeout(600);
  const r=await bot.walk([end],{timeout:10,maxRecoveries:0});
  // A point halfway down the trail, sufficiently behind the stopped player.
  const ps=r.trace.filter(t=>t.p[0]>start[0]+3&&t.p[0]<start[0]+6).map(t=>[t.p[0],t.p[2]]);
  let vals=await page.evaluate(ps=>ps.map(([x,z])=>__worldEnv.trampleAt(x,z)),ps);const p=ps[vals.indexOf(Math.max(...vals))]??[start[0]+4,start[2]];
  const before=await probe(p);await page.evaluate(()=>__worldDebug.set({paused:true}));await page.waitForTimeout(150);const frozen=await probe(p);await page.waitForTimeout(900);const paused=await probe(p);
  await page.evaluate(()=>__worldDebug.set({paused:false}));const curve=[];
  for(let i=0;i<12;i++){curve.push((await probe(p)).local);await page.waitForTimeout(500);}
  const after=await probe(p),pass=r.legs.every(l=>l.reached)&&before.local>.35&&before.alias===0&&Math.abs(frozen.local-paused.local)<.001&&after.local<.02;
  report.cases.push({name,pass,point:p,reached:r.legs.every(l=>l.reached),before:before.local,alias:before.alias,frozen:frozen.local,paused:paused.local,after:after.local,curve,triangles:before.grass.triangles,bytes:before.grass.trampleBytes});
  await page.screenshot({path:path.join(out,name+'.jpg'),type:'jpeg',quality:86});
 }
 // A car crosses an unobstructed western meadow. Wheel-height body fixture, then real W / Space.
 const id='offroad',car=[-72,2.42,-38];report.fixtures.push({type:'vehicle',id,p:car});
 await page.evaluate(p=>__worldDebug.teleportVehicle('offroad',p,0),car);
 await bot.fixtureTeleport([-72,1.98,-35.5],'board car');await page.waitForTimeout(800);await page.keyboard.press('KeyE');await page.waitForTimeout(300);
 const active=await page.evaluate(()=>__worldDebug.snapshot().activeVehicle);await bot.hold(['KeyW']);await page.waitForTimeout(2100);await bot.hold(['Space']);await page.waitForTimeout(500);await bot.release();
 const v=await page.evaluate(()=>__worldDebug.snapshot().vehicles.find(v=>v.id==='offroad'));const p=[v.position[0]-3,v.position[2]],during=await probe(p);
 await page.keyboard.press('KeyE');await bot.fixtureTeleport([v.position[0]+4,2.1,v.position[2]+4],'observe tyre tracks');
 await page.screenshot({path:path.join(out,'vehicle-trail.jpg'),type:'jpeg',quality:90});await page.waitForTimeout(5300);const after=await probe(p);
 report.cases.push({name:'vehicle-grass',active,travel:v.position[0]-car[0],during:during.local,after:after.local,pass:active===id&&v.position[0]-car[0]>6&&during.local>.35&&after.local<.02});
 // An airborne fixture must not bend the grass beneath it before contact.
 await bot.fixtureTeleport([-65,20,-48],'airborne rejection');const air=await probe([-65,-48]);
 report.cases.push({name:'airborne-no-imprint',value:air.local,pass:air.local===0});
 report.fixtures.push(...bot.fixtureCalls);report.errors=errors;
} catch(e) {report.errors.push(String(e));} finally {await browser.close();await writeFile(path.join(out,'trample.json'),JSON.stringify(report,null,1));}
console.log(JSON.stringify(report));
