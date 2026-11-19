/** Chrome ordinary club entry, then physical ramp, daybed and pool routes using real keys. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const base=process.argv[2]??'http://127.0.0.1:4343', url=new URL('/world/',base);
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const viewport={width:1056,height:700},errors=[],analytics=[];
async function entry(query){
  const page=await browser.newPage({viewport});
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',event=>{
    if(event.type()!=='error')return;
    const location=event.location().url,message=event.text();
    if(location===new URL('/api/events',url).href&&/\b(404|501)\b/.test(message))analytics.push(message);
    else errors.push({location,message});
  });
  const response=await page.goto(new URL(query,url).href,{waitUntil:'domcontentloaded'});
  assert.ok(response.ok());
  return {page,sha:createHash('sha256').update(await response.body()).digest('hex')};
}
let stage='ordinary entry',qa;
try{
  const {page:ordinary,sha}=await entry('?start=club');
  await ordinary.locator('.world-camp-return:enabled').waitFor({timeout:75000});
  await ordinary.keyboard.press('Escape');
  await ordinary.locator('dialog[open]').waitFor();

  const {page,sha:qaSha}=await entry('?qa=1');qa=page;
  assert.equal(qaSha,sha);
  const bot=new Bot(page);
  const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:15000});
  await page.waitForFunction(()=>window.__worldDebug?.state().ready&&window.__worldInteract?.list().some(i=>i.id==='djc-daybed-0-1'),undefined,{timeout:75000});
  assert.equal(await page.evaluate(()=>window.__worldDebug.state().quality),'balanced');
  const actor=()=>page.evaluate(()=>{const d=window.__worldDebug,s=d.snapshot(),u=d.state();return {player:s.player,grounded:s.grounded,seat:u.seat?.id,near:u.nearbyInteract?.id,clubMode:u.clubMode};});
  async function place(p,reason){
    bot.fixtureCalls.push({to:p,reason});
    assert.ok(await page.evaluate(p=>{const d=window.__worldDebug;const ok=d.teleportPlayer(p);d.set({position:p});return ok;},p));
    await wait(p=>{const s=window.__worldDebug.snapshot();return s.grounded&&Math.hypot(s.player[0]-p[0],s.player[2]-p[2])<.25;},p);
  }
  async function walk(x,z,arrive=.42){
    const r=await bot.walk([[x,z]],{timeout:13,arrive,stopOnBlocked:true});
    assert.ok(r.legs[0].reached,JSON.stringify(r.legs[0]));return actor();
  }
  stage='stage ascent and descent';
  await place([31,2.2,41.5],'foot of club stage ramp');
  const rampStart=await actor(), rampTop=await walk(31,52.8,.72);
  assert.ok(rampTop.grounded&&rampTop.player[1]>rampStart.player[1]+.75);
  stage='stage controller collision';
  const controller=await page.evaluate(()=>window.__worldDebug.castPlayer([34.1,3.84,55.3],[32.9,3.84,55.3]));
  assert.ok(controller.hit&&controller.other.name==='djc-solid-same-mesh',JSON.stringify(controller));
  stage='stage descent';
  const rampDown=await walk(31,41.8,.72);
  assert.ok(rampDown.grounded&&rampDown.player[1]<rampTop.player[1]-.66);

  stage='daybed ramp and seat';
  await place([62.38,2.5,35.2],'foot of first daybed ramp');
  const bed=await walk(62.38,40.3);
  await wait(()=>window.__worldDebug.state().nearbyInteract?.id?.startsWith('djc-daybed-0-'));
  await bot.press('KeyE');
  await wait(()=>window.__worldDebug.state().seat?.id?.startsWith('djc-daybed-0-'));
  const seated=await actor();
  await bot.press('KeyE');
  await wait(()=>!window.__worldDebug.state().seat&&window.__worldDebug.snapshot().grounded);

  stage='west pool exit';
  await place([54.5,1.92,56.2],'inside west pool exit');
  const inside=await actor(), keys=comboFor(-1,0).keys;
  try {
    await bot.hold(keys);
    await wait(()=>{ const s=window.__worldDebug.snapshot();return s.player[0]<51.1&&s.player[1]>2.17&&s.grounded; });
  } finally { await bot.release(); }
  const outside=await actor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(),sha,rampStart,rampTop,controller,rampDown,bed,seated,inside,outside,fixtures:bot.fixtureCalls,events:bot.events,analytics}));
}catch(error){
  const player=await qa?.evaluate(()=>window.__worldDebug?.snapshot()).then(s=>s?.player).catch(()=>null);
  console.error(JSON.stringify({stage,player,error:String(error),errors,analytics}));throw error;
}finally{await browser.close();}
