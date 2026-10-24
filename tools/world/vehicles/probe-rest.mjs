/** Settled ride height of the three parked cars (body centre vs suspended wheel centres). Read-only. */
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {CHROME,loadPlaywright} from '../playtest/lib.mjs';
const base=process.env.WORLD_BASE_URL,out=process.env.WORLD_PLAYTEST_DIR;await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
await page.goto(base+'/world/?qa=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__worldDebug?.actor().loaded,undefined,{timeout:90000});
await page.waitForTimeout(4000);
const r=await page.evaluate(()=>{const p=__worldDebug.motionProbe(),s=__worldDebug.snapshot();return p.vehicles.map(v=>{const c=v.position,w=v.wheels;return{id:v.id,center:c,wheelCenterRel:w.map(x=>+(x.position[1]-c[1]).toFixed(4)),radius:w[0].radius,contacts:s.vehicles.find(q=>q.id===v.id).wheelContacts,bodyAboveGround:+(c[1]-(w.reduce((a,x)=>a+x.position[1],0)/4-w[0].radius)).toFixed(4)}})});
console.log(JSON.stringify(r,null,1));await writeFile(path.join(out,'rest.json'),JSON.stringify(r,null,2));await browser.close();
