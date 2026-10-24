/** 1920x1080 vehicle shots (WORLD_QUERY, default ?qa=1 because fixtures need __worldDebug; rendering is the
 * same as the normal entry, qa only registers debug hooks): each car parked (default camera), a close
 * orbit, driving (real keys), and dusk/night lamps. Fixture teleports are logged. Read-only otherwise.
 * Env: WORLD_VEHICLES=offroad,coupe,van  WORLD_SHOTS=parked,close,drive,night */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from '../playtest/lib.mjs';
import {aim} from '../playtest/budget-lib.mjs';
const base=process.env.WORLD_BASE_URL,out=process.env.WORLD_PLAYTEST_DIR;await mkdir(out,{recursive:true});
const ids=(process.env.WORLD_VEHICLES||'offroad,coupe,van').split(','),shots=(process.env.WORLD_SHOTS||'parked,close,drive,night').split(',');
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={base,entry:'/world/'+(process.env.WORLD_QUERY??'?qa=1'),shots:[],errors:[],fixtures:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite]'))report.errors.push(m.text())});
page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
const bot=new Bot(page);
const snap=async name=>{const f=path.join(out,name+'.jpg');await page.screenshot({path:f,type:'jpeg',quality:82});const st=await page.evaluate(()=>__worldDebug.stats());const state=await page.evaluate(()=>({activeVehicle:__worldDebug.snapshot().activeVehicle,light:__worldDebug.state().light,render:__worldDebug.renderInfo(),vehicles:__worldDebug.sceneObjects().filter(n=>n.startsWith('vehicle-'))}));report.shots.push({name,file:f,stats:st,...state});console.log(name,JSON.stringify({calls:st.calls,tris:st.triangles,...state}));};
const orbit=async(dx,dy)=>{const b=await page.locator('canvas').first().boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:12});await page.mouse.up();};
try{
 await page.routeWebSocket('**/*',ws=>ws.close());
 await page.goto(base+'/world/'+(process.env.WORLD_QUERY??'?qa=1'),{waitUntil:'networkidle'});
 if(report.entry==='/world/'){
  // Normal entry keeps QA disabled. Expose only the already-loaded actor fixture methods to this
  // test page; no alternate rendering, physics, vehicle assets or production source are installed.
  await page.waitForSelector('canvas',{timeout:90000});
  await page.evaluate(async()=>{
   // Vite may timestamp imports after another worker's edit; use exactly the instances the page
   // loaded so a second, unmounted module cannot return a null camera or a separate store.
   const loaded=file=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===file)?.name??file;
   const [{worldActorDebug},{useWorldStore},{VEHICLES}]=await Promise.all([import(loaded('/src/components/world/WorldActors.tsx')),import(loaded('/src/components/world/store.ts')),import(loaded('/src/components/world/layout.ts'))]);
   window.__worldDebug={...worldActorDebug,state:()=>useWorldStore.getState(),layout:()=>({vehicles:Object.fromEntries(VEHICLES.map(v=>[v.id,v]))}),stats:()=>({calls:null,triangles:null}),sceneObjects:()=>[],renderInfo:()=>{const c=document.querySelector('canvas');return{drawingBuffer:[c.width,c.height],cssSize:[c.clientWidth,c.clientHeight]};}};
  });
  report.normalAdapter='test-only actor fixture adapter; no QA URL, no rendering/physics changes; budget unavailable';
 }
 await page.waitForFunction(()=>window.__worldDebug?.actor().loaded,undefined,{timeout:90000});
 await page.waitForFunction(()=>window.__worldDebug?.camera(),undefined,{timeout:30000});
 await page.waitForTimeout(3000);
 if(report.entry==='/world/')await snap('normal-entry-default');
 const layout=await page.evaluate(()=>__worldDebug.layout?.().vehicles??null);
 for(const id of ids){
  const v=layout?.[id];const p=v.position,yaw=v.yaw??0;
  // stand 5.5 m beside the parked car (fixture), default orbit camera
  const side=[p[0]+Math.sin(yaw)*5.5,p[1]+1.2,p[2]+Math.cos(yaw)*5.5];
  await bot.fixtureTeleport(side,`stand beside parked ${id}`);await page.waitForTimeout(1800);
  await aim(page,{yaw:Math.atan2(.8,.6),pitch:Math.PI/4,distance:12});
  if(shots.includes('parked'))await snap(`${id}-parked-dusk`);
  if(shots.includes('close')){
   // close views from the driver's seat camera: enter, scroll in, orbit with the mouse, leave
   await bot.fixtureTeleport([p[0]+Math.sin(yaw)*2.6,p[1]+1.2,p[2]+Math.cos(yaw)*2.6],`step to ${id} door (close views)`);await page.waitForTimeout(400);
   await bot.press('KeyE');await page.waitForTimeout(600);
   if(await page.evaluate(()=>__worldDebug.snapshot().activeVehicle)!==id)throw new Error(`Could not enter ${id} for close views`);
   const distance=id==='van'?7.5:6.5;
   await aim(page,{yaw:-yaw+.65,pitch:.28,distance});await snap(`${id}-close-front`);
   await aim(page,{yaw:-yaw+1.57,pitch:.22,distance});await snap(`${id}-close-side`);
   await aim(page,{yaw:-yaw+2.5,pitch:.28,distance});await snap(`${id}-close-rear`);
   await bot.press('KeyE');await page.waitForTimeout(600);
  }
  if(shots.includes('drive')||shots.includes('night')){
   await bot.fixtureTeleport([p[0]+Math.sin(yaw)*2.6,p[1]+1.2,p[2]+Math.cos(yaw)*2.6],`step to ${id} door`);await page.waitForTimeout(500);
   await bot.press('KeyE');await page.waitForTimeout(400);
   if(await page.evaluate(()=>__worldDebug.snapshot().activeVehicle)!==id)throw new Error(`Could not enter ${id} for lamp/drive views`);
   if(shots.includes('drive')){await bot.hold(['KeyW']);await page.waitForTimeout(1600);await bot.hold(['KeyW','KeyA']);await page.waitForTimeout(700);await snap(`${id}-driving`);await bot.hold(['Space']);await page.waitForTimeout(500);await snap(`${id}-braking`);await bot.release();await page.waitForTimeout(1200);}
   if(shots.includes('night')){await page.evaluate(()=>document.querySelector('.world-interaction')&&0);await page.keyboard.press('Escape');await page.waitForTimeout(400);
    const btn=page.locator('dialog button',{hasText:/night|夜/i}).first();if(await btn.count())await btn.click();await page.keyboard.press('Escape');await page.waitForTimeout(2600);
    await snap(`${id}-night-driving`);await bot.hold(['Space']);await page.waitForTimeout(300);await snap(`${id}-night-brake`);await bot.hold(['KeyS']);await page.waitForTimeout(900);await snap(`${id}-night-reverse`);await bot.release();
    await page.keyboard.press('Escape');await page.waitForTimeout(300);const d=page.locator('dialog button',{hasText:/dusk|黄昏/i}).first();if(await d.count())await d.click();await page.keyboard.press('Escape');await page.waitForTimeout(2400);}
   await bot.press('KeyE');await page.waitForTimeout(400);
  }
 }
}catch(e){report.errors.push(e.stack||String(e));}
report.fixtures=bot.fixtureCalls;await writeFile(path.join(out,'showcase.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({errors:report.errors}));await browser.close();
