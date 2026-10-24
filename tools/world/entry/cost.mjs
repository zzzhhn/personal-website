import { writeFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME, openWorld } from '../playtest/lib.mjs';
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--use-angle=metal']});
try {
 const {page,errors}=await openWorld(browser,process.env.WORLD_BASE_URL+'/world/?qa=1',{width:1920,height:1080});const bot=new Bot(page);
 await page.waitForFunction(()=>window.__worldDebug.budget&&window.__worldEntry);
 await bot.fixtureTeleport([-34.3,5.85,34],'G28 local render-cost view');const result={views:[],errors};
 for(const light of ['dusk','night']){
  await page.evaluate(light=>window.__worldDebug.set({light}),light);await page.waitForTimeout(2500);
  const frames=[];for(let i=0;i<4;i++){frames.push(await page.evaluate(()=>window.__worldDebug.budget.frame(1000)));}
  result.views.push({light,frames:frames.map(f=>({total:f.total,byPass:f.byPass,entry:f.top.filter(o=>o.name.includes('G28'))}))});
 }
 await bot.fixtureTeleport([30,2,34],'G28 60m LOD boundary evidence only');await page.waitForTimeout(800);result.far=await page.evaluate(()=>window.__worldEntry.facts());
 await bot.fixtureTeleport([130,2,34],'G28 140m cull evidence only');await page.waitForTimeout(800);result.culled=await page.evaluate(()=>window.__worldEntry.facts());
 result.fixtures=bot.fixtureCalls;await writeFile(process.env.WORLD_PLAYTEST_DIR+'/cost.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser.close();}
