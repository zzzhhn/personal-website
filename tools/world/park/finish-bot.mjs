/** Focused final park checks: sign E/card exclusivity, all four blackboard pages, paused exhibit/audio. */
import path from 'node:path';import {writeFile} from 'node:fs/promises';
import {loadPlaywright,CHROME,openWorld,Bot} from '../playtest/lib.mjs';
import {aim,look} from '../playtest/budget-lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR,report={signs:[],board:[]};
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
try{
 const {page,errors}=await openWorld(browser,process.env.WORLD_BASE_URL+'/world/?qa=1',{width:1920,height:1080});
 await page.waitForFunction(()=>window.__parkExhibits?.().P18);await page.waitForTimeout(1800);const bot=new Bot(page);
 const park=await page.evaluate(()=>window.__parkWalk),state=()=>page.evaluate(()=>window.__parkExhibits());
 const photo=n=>page.screenshot({path:path.join(out,n+'.jpg'),type:'jpeg',quality:87});
 await page.addStyleTag({content:'astro-dev-toolbar{display:none!important}'});
 for(const sign of await page.evaluate(()=>window.__worldInteract.list().filter(x=>x.id.startsWith('park-project-')))){
  await bot.fixtureTeleport([sign.position[0],2.3,sign.position[2]],'front of sign '+sign.id);await page.waitForTimeout(600);
  const before=await page.evaluate(()=>__worldDebug.state().nearbyInteract);await bot.press('KeyE');await page.waitForTimeout(500);
  const card=await page.evaluate(()=>__worldDebug.state().card);await photo(sign.id+'-card');await bot.press('KeyE');await page.waitForTimeout(200);
  report.signs.push({id:sign.id,prompt:before?.id,card,closed:await page.evaluate(()=>!__worldDebug.state().card)});
 }
 for(const id of ['alpha-agent','accompany','interactive-learning']){
  const h=park.huts.find(h=>h.id===id);await bot.fixtureTeleport([h.anchor[0],2.35,h.anchor[2]],'exhibit front '+id);await page.waitForTimeout(650);
  await aim(page,{yaw:look(-h.front[0],-h.front[1]),pitch:.25,distance:4.8});
  await bot.press('KeyE');
  if(id==='alpha-agent'){
   await page.waitForTimeout(650);await bot.press('KeyE');const active=await state();await bot.press('Escape');const paused=await state();await page.waitForTimeout(1000);const held=await state();await bot.press('Escape');await page.waitForTimeout(5000);
   report.alpha={active:active.P12,paused:paused.P12,held:held.P12,final:(await state()).P12};await photo('alpha-final');
  }else if(id==='accompany'){
   await page.waitForTimeout(5600);report.seat=(await state()).P16;await photo('kindred-dusk');await page.evaluate(()=>__worldDebug.set({light:'night',lang:'zh'}));await page.waitForTimeout(2500);await photo('kindred-night-zh');await bot.press('KeyE');await page.waitForTimeout(1200);report.stood=(await state()).P16;
  }else{
   for(let n=0;n<4;n++) {if(n)await bot.press('KeyE');await page.waitForTimeout(3700);report.board.push((await state()).P18);await photo('board-page-'+n);}
  }
 }
 const dj=park.huts.find(h=>h.id==='djc');await bot.fixtureTeleport([dj.anchor[0],2.35,dj.anchor[2]],'DJ pause check');await page.waitForTimeout(700);await bot.press('KeyE');await page.waitForTimeout(500);await bot.press('Escape');await page.waitForTimeout(300);report.audioPaused=await page.evaluate(()=>__parkAudio.ctx?.state);await bot.press('Escape');await page.waitForTimeout(300);report.audioRunning=await page.evaluate(()=>__parkAudio.ctx?.state);
 const h=park.huts[0],sign=await page.evaluate(()=>__worldInteract.list().find(x=>x.id==='park-project-alpha-agent'));await bot.fixtureTeleport([sign.position[0],2.3,sign.position[2]],'sign view');await aim(page,{yaw:look(-h.front[0],-h.front[1]),pitch:.25,distance:5.5});await photo('wood-sign-night-zh');await page.evaluate(()=>__worldDebug.set({light:'dusk',lang:'en'}));await page.waitForTimeout(2300);await photo('wood-sign-dusk-en');
 report.fixtures=bot.fixtureCalls;report.errors=errors;report.finalStats=await page.evaluate(()=>__worldDebug.stats());
}catch(e){report.fatal=String(e.stack||e);}finally{await browser.close();await writeFile(path.join(out,'finish-bot.json'),JSON.stringify(report,null,1));console.log(JSON.stringify({signs:report.signs,alpha:report.alpha,board:report.board,seat:report.seat,stood:report.stood,audio:[report.audioPaused,report.audioRunning],fatal:report.fatal,errors:report.errors?.slice(0,5)}));}
