/** Focused integration: QA stop cancelled by real E, and one uninstrumented rAF timing window. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Bot,loadPlaywright,CHROME,frameTiming,canvasFacts} from './lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v2/playtest/guide-integration';
await mkdir(out,{recursive:true});
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:4321';
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const bot=new Bot(page);
const report={base,startedAt:new Date().toISOString(),errors:[],checks:[],views:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
try{
 await page.goto(base+'/world/?qa=1&qaStop=1&qaPhase=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);await page.waitForTimeout(600);
 report.canvas=await canvasFacts(page);
 const timing=frameTiming(page,5); // No skin/debug polling inside this timing window.
 await bot.hold(['KeyA']);await page.waitForTimeout(1300);
 await bot.hold(['KeyA','ShiftLeft']);await page.waitForTimeout(1500);
 await bot.release();await page.waitForTimeout(1700);report.frameTiming=await timing;
 report.timingLimit='rAF cadence on this machine, not GPU headroom or M1 Air certification';
 await bot.fixtureTeleport([-26,5.68,36.2],'same known offroad-side interaction start as final.mjs; not continuous route');
 await page.waitForTimeout(300);
 const r=await page.request.get(base+'/assets/world/guide/G24.glb');
 const view={zoom:1,assetSha256:createHash('sha256').update(await r.body()).digest('hex'),skinTopology:await page.evaluate(()=>__worldDebug.actorSkin(true)),samples:[]};report.views.push(view);
 async function sample(label,ms){const start=bot.now();while(bot.now()-start<ms/1000){view.samples.push({label,t:bot.now(),...await page.evaluate(()=>({snapshot:__worldDebug.snapshot(),actor:__worldDebug.actor(),skin:__worldDebug.actorSkin()}))});await page.waitForTimeout(16);}}
 await bot.hold(['KeyA']);await sample('approach',450);await bot.release();await sample('pre-enter',400);
 const before=view.samples.at(-1);await bot.press('KeyE');await sample('entered',350);
 const entered=view.samples.at(-1);await bot.press('KeyE');await sample('exited',700);const exited=view.samples.at(-1);
 report.checks.push({name:'E interrupts active settle',passed:before.actor.stop.state==='settling',before:before.actor.stop.state});
 report.checks.push({name:'E enters and clears visual lock',passed:entered.snapshot.activeVehicle==='offroad'&&!entered.actor.visible&&entered.actor.stop.state==='off'});
 report.checks.push({name:'E exits with visible idle and no lock',passed:exited.snapshot.activeVehicle===null&&exited.actor.visible&&exited.actor.stop.state==='off'});
 await page.screenshot({path:path.join(out,'after-exit.png')});
}catch(e){report.errors.push(e.stack||String(e));}finally{
 await bot.release().catch(()=>{});report.fixtures=bot.fixtureCalls;report.events=bot.events;report.finishedAt=new Date().toISOString();
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
 console.log(JSON.stringify({checks:report.checks,frameTiming:report.frameTiming,errors:report.errors},null,2));
 if(report.errors.length||report.checks.some(c=>!c.passed))process.exitCode=1;
}
