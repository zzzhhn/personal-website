/** Straight-line launch on the QA lane: which body colliders touch anything (incl. surfaces) while accelerating. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Bot,CHROME,loadPlaywright} from '../playtest/lib.mjs';
const base=process.env.WORLD_BASE_URL,out=process.env.WORLD_PLAYTEST_DIR,id=process.env.WORLD_VEHICLE||'coupe',q=process.env.WORLD_QUERY||'?qa=1';
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720}});await page.routeWebSocket('**/*',ws=>ws.close());
const bot=new Bot(page);
await page.goto(base+'/world/'+q,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded,undefined,{timeout:90000});
await page.evaluate(()=>__worldDebug.collisionLane('post',40));
const h={offroad:1.176,coupe:1.054,van:1.452}[id];
await page.evaluate(({id,h})=>__worldDebug.teleportVehicle(id,[100,5+h,120],0),{id,h});await bot.fixtureTeleport([100,6,117.5],'accel probe');await page.waitForTimeout(800);await bot.press('KeyE');await page.waitForTimeout(200);
const rows=[];if(process.env.WORLD_TAP){await bot.hold(['KeyW','KeyA']);await page.waitForTimeout(Number(process.env.WORLD_TAP));}await bot.hold(['KeyW']);const t0=Date.now();
while(Date.now()-t0<3500){rows.push(await page.evaluate(id=>{const s=__worldDebug.snapshot(),v=s.vehicles.find(v=>v.id===id);const m=__worldDebug.motionProbe().vehicles.find(x=>x.id===id),q=m.rotation;return{t:performance.now(),step:s.physicsStep,v:Math.hypot(v.velocity[0],v.velocity[2]),vy:v.velocity[1],pitch:Math.asin(Math.max(-1,Math.min(1,2*(q[0]*q[1]+q[3]*q[2]))))*57.3,susp:m.wheels.map(w=>+(w.position[1]-v.position[1]).toFixed(3)),y:v.position[1],wc:v.wheelContacts,k:__worldDebug.contacts().map(c=>({part:c.selfPart,other:c.other.kind+':'+(c.other.name??c.other.assetId),d:+c.distance.toFixed(3)}))}},id));await page.waitForTimeout(30);}
await bot.release();
const touched={};for(const r of rows)for(const k of r.k){const key=k.part+' -> '+k.other;touched[key]=(touched[key]||0)+1;}
if(process.env.WORLD_DETAIL)for(const r of rows.slice(0,60))console.log(r.step-rows[0].step,r.v.toFixed(2),'pitch',r.pitch.toFixed(2),'vy',r.vy.toFixed(2),r.wc.map(Number).join(''),r.susp.join(','));
console.log(JSON.stringify({samples:rows.length,touched,speed:rows.filter((r,i)=>i%10===0).map(r=>[r.step-rows[0].step,+r.v.toFixed(2),+r.y.toFixed(3),r.wc.map(Number).join('')])}));
await writeFile(path.join(out,`accel-${id}.json`),JSON.stringify(rows));await browser.close();
