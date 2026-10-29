import { writeFile, mkdir } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME, openWorld, canvasFacts } from '../playtest/lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR, base=process.env.WORLD_BASE_URL;
await mkdir(out,{recursive:true});
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--use-angle=metal']});
const report={started:new Date().toISOString(),checks:{}};
try {
 const ordinary=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const p=await ordinary.newPage();p.on('pageerror',e=>console.log('PAGEERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});await p.goto(base+'/world/');await p.waitForSelector('canvas',{timeout:60000});await p.waitForTimeout(12000);
 report.ordinaryCanvas=await canvasFacts(p);await p.screenshot({path:out+'/ordinary-default.jpg',type:'jpeg',quality:84});
 // Near view by real keys from ordinary spawn. No query or QA fixture on this page.
 await p.keyboard.down('KeyS');await p.waitForTimeout(1500);await p.keyboard.up('KeyS');await p.keyboard.down('KeyD');await p.waitForTimeout(2400);await p.keyboard.up('KeyD');
 await p.mouse.move(960,540);await p.mouse.wheel(0,250);await p.waitForTimeout(600);
 await p.screenshot({path:out+'/ordinary-near.jpg',type:'jpeg',quality:84});
 await p.keyboard.press('Escape');await p.getByRole('button',{name:'Night',exact:true}).click();await p.keyboard.press('Escape');await p.waitForTimeout(2200);
 await p.screenshot({path:out+'/ordinary-night.jpg',type:'jpeg',quality:84});await ordinary.close();
 const w=await openWorld(browser,base+'/world/?qa=1',{width:1920,height:1080});const page=w.page,bot=new Bot(page);
 await page.waitForFunction(()=>window.__worldEntry);
 report.entry=await page.evaluate(()=>window.__worldEntry.facts());const e=report.entry.position;
 await bot.fixtureTeleport([e[0]-2.7,e[1]+1.05,e[2]],'G28 corridor west start; this is not ordinary-spawn travel');
 const west=(await bot.feedback()).player;
 report.crossing=await bot.walk([[e[0]+2.7,e[2]]],{timeout:12,arrive:.4,maxRecoveries:0});
 report.checks.walkThrough=report.crossing.legs.every(l=>l.reached);
 await bot.fixtureTeleport([e[0]-.8,e[1]+1.05,e[2]],'G28 E interaction reach fixture');await page.waitForTimeout(500);
 report.prompt=await page.evaluate(()=>window.__worldDebug.state().nearbyInteract);
 await bot.press('KeyE');await page.waitForTimeout(350);
 report.checks.eOpensMenu=await page.evaluate(()=>window.__worldDebug.state().paused&&document.querySelector('dialog').open);
 report.checks.staysInWorld=page.url().includes('/world/');
 await bot.press('KeyE');report.checks.repeatedEDoesNotClose=await page.evaluate(()=>window.__worldDebug.state().paused);
 await bot.press('Escape');await page.waitForTimeout(200);report.checks.escapeCloses=await page.evaluate(()=>!window.__worldDebug.state().paused);
 // State fixtures only arrange existing card/seat priorities. Input itself remains a real E press.
 await page.evaluate(()=>window.__worldDebug.set({card:{kind:'about',id:'identity'}}));await page.waitForTimeout(300);await bot.press('KeyE');await page.waitForTimeout(350);
 report.checks.cardWins=await page.evaluate(()=>!window.__worldDebug.state().paused&&!window.__worldDebug.state().card);
 await page.evaluate(p=>window.__worldDebug.set({seat:{id:'G28-priority-fixture',position:p,yaw:0}}),[e[0]-.8,e[1]+.4,e[2]]);
 await page.waitForTimeout(300);await bot.press('KeyE');await page.waitForTimeout(350);report.checks.seatWins=await page.evaluate(()=>!window.__worldDebug.state().paused&&!window.__worldDebug.state().seat);
 // Same camera, freeze simulation and read actual multi-pass frame deltas (one-shot warmup excluded).
 await page.evaluate(()=>window.__worldDebug.set({paused:true}));await page.waitForTimeout(800);
 const sample=async()=>{const a=[];for(let i=0;i<8;i++){await page.waitForTimeout(70);a.push(await page.evaluate(()=>window.__worldDebug.stats()));}return a;};
 report.visible=await sample();await page.evaluate(()=>window.__worldEntry.visible(false));await page.waitForTimeout(500);report.hidden=await sample();await page.evaluate(()=>window.__worldEntry.visible(true));
 report.delta={calls:report.visible[7].calls-report.hidden[7].calls,triangles:report.visible[7].triangles-report.hidden[7].triangles};
 report.physics=await page.evaluate(()=>window.__worldDebug.physicsInventory().filter(x=>x.assetId==='G28'));
 report.checks.noCollider=report.physics.length===0;report.errors=w.errors;report.fixtures=bot.fixtureCalls;report.events=bot.events;
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks:report.checks,entry:report.entry,delta:report.delta,errors:report.errors}));
} finally {await browser.close();}
