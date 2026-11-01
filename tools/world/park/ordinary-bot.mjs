/** Ordinary /world/ boot: no QA URL, no fixture teleports, real WASD from camp to park.
 * Read-only state import supplies feedback; all navigation, language, light and card actions use UI. */
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {loadPlaywright,CHROME,Bot} from '../playtest/lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR, report={url:process.env.WORLD_BASE_URL+'/world/',errors:[],fixtures:[]};
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
try {
 const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(report.url,{waitUntil:'domcontentloaded'});
 const state=()=>page.evaluate(async()=>{const {useWorldStore} = await import('/src/components/world/store.ts');const s=useWorldStore.getState();return {player:s.position,extra:{contacts:null},grounded:true,activeVehicle:s.activeVehicle,vehicles:[],ready:s.ready,card:s.card,nearbyInteract:s.nearbyInteract,light:s.light,lang:s.lang};});
 await page.waitForFunction(async()=>{const m=await import('/src/components/world/store.ts');return m.useWorldStore.getState().ready;},undefined,{timeout:90000});
 await page.waitForTimeout(3000);await page.addStyleTag({content:'astro-dev-toolbar{display:none!important}'});
 await page.screenshot({path:path.join(out,'ordinary-spawn.jpg'),type:'jpeg',quality:85});
 const bot=new Bot(page);bot.feedback=state;
 report.route=await bot.walk([[-34,34],[-30,34],[-18,34],[-5,29],[6,24],[22,24],[22,9],[22,-10],[26,-30],[26,-42],[43,-44],[49,-46]],{run:true,timeout:18,arrive:1.1});
 report.arrival=await state();await page.screenshot({path:path.join(out,'ordinary-park-default.jpg'),type:'jpeg',quality:85});
 if(report.route.legs.length===12&&report.route.legs.every(l=>l.reached)){
  const h=await page.evaluate(async()=>{const m=await import('/src/components/world/WorldParkLayout.ts');const h=m.HUTS[0];return {spurEnd:h.spur?.to??h.local(0,0,.6),opening:h.local(0,0,.6),anchor:h.local(0,0,-1.25),sign:h.local(h.width/2-.72,0,.25)};});
  report.hut=await bot.walk([[h.spurEnd[0],h.spurEnd[2]],[h.opening[0],h.opening[2]],[h.anchor[0],h.anchor[2]]],{timeout:14,arrive:.5});
  await bot.press('KeyE');await page.waitForTimeout(4600);await bot.wheel(-450);await page.screenshot({path:path.join(out,'ordinary-exhibit-near.jpg'),type:'jpeg',quality:85});
  await bot.wheel(450);report.sign=await bot.walk([[h.opening[0],h.opening[2]],[h.sign[0],h.sign[2]]],{timeout:12,arrive:.4});
  report.beforeCard=await state();await bot.press('KeyE');await page.waitForTimeout(700);report.card=await state();await page.screenshot({path:path.join(out,'ordinary-project-card.jpg'),type:'jpeg',quality:85});await bot.press('KeyE');
  await bot.press('Escape');await page.getByRole('button',{name:'中文',exact:true}).click();await page.getByRole('button',{name:'夜晚',exact:true}).click();await bot.press('Escape');await page.waitForTimeout(2600);await page.screenshot({path:path.join(out,'ordinary-park-night-zh.jpg'),type:'jpeg',quality:85});
 }
 report.final=await state();report.events=bot.events;report.fixtures=bot.fixtureCalls;
}catch(e){report.fatal=String(e.stack||e);}finally{await browser.close();await writeFile(path.join(out,'ordinary-bot.json'),JSON.stringify(report,null,1));console.log(JSON.stringify({legs:report.route?.legs.map(l=>l.reached),arrival:report.arrival,card:report.card?.card,fatal:report.fatal,errors:report.errors}));}
