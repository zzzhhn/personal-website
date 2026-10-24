/** Normal-speed, full-object wind views. Fixtures establish observation points only. */
import {mkdir,writeFile} from 'node:fs/promises';
import {Bot,loadPlaywright,CHROME,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
const dir='docs/world/quality-v2/playtest/motion-r2';await mkdir(dir,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1920,height:1080}}),bot=new Bot(page),log={fixtures:[],observations:[],errors:[]};page.on('pageerror',e=>log.errors.push(e.message));
await page.goto((process.env.WORLD_BASE_URL||'http://127.0.0.1:4321')+'/world/?qa=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
const tree=await page.evaluate(()=>__worldDebug.campColliders().find(r=>r.id==='G16'&&r.instance===0));const tc=[(tree.aabb.min[0]+tree.aabb.max[0])/2,(tree.aabb.min[2]+tree.aabb.max[2])/2];
for(const [label,point]of [['tree-full',[tc[0]+2,5.68,tc[1]+3]],['tent-front',[-42,5.68,18]]]){
 await bot.fixtureTeleport(point,label+' observation only');await page.evaluate(()=>__worldDebug.set({zoom:1,light:'dusk'}));await page.waitForTimeout(1400);
 await startCanvasRecording(page,30);const start=await page.evaluate(()=>__worldDebug.motionInventory());await page.waitForTimeout(5500);const end=await page.evaluate(()=>__worldDebug.motionInventory());await stopCanvasRecording(page,`${dir}/${label}.webm`);await page.screenshot({path:`${dir}/${label}.png`});log.observations.push({label,point,start,end});
}
log.fixtures=bot.fixtureCalls;await writeFile(`${dir}/wind-views.json`,JSON.stringify(log,null,2));await browser.close();console.log(JSON.stringify({views:log.observations.map(x=>x.label),errors:log.errors}));
