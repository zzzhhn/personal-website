import {CHROME,loadPlaywright} from '../playtest/lib.mjs';
const base=process.env.WORLD_BASE_URL;
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
for(const q of (process.env.WORLD_QUERIES||'?qa=1&qaVehicleLegacy=1|?qa=1&qaComDrop=0|?qa=1').split('|')){
 const page=await browser.newPage({viewport:{width:800,height:600}});await page.routeWebSocket('**/*',ws=>ws.close());
 await page.goto(base+'/world/'+q,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded,undefined,{timeout:90000});await page.waitForTimeout(1500);
 console.log(q,JSON.stringify(await page.evaluate(()=>__worldDebug.snapshot().vehicles.map(v=>({id:v.id,mass:+v.mass.toFixed(1),com:v.com.map(x=>+x.toFixed(3)),inertia:v.inertia.map(x=>Math.round(x)),frame:v.inertiaFrame.map(x=>+x.toFixed(3))})))));
 await page.close();}
await browser.close();
