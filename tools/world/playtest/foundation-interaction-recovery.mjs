/** Real Chrome keyboard, an emulated standard pad, and physical actor recovery. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CHROME, loadPlaywright } from './lib.mjs';

const world=new URL('/world/',process.argv[2]??'http://127.0.0.1:4343');
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const viewport={width:1056,height:700}, errors=[], analytics=[];
const watch=page=>{
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',line=>{
    if(line.type()!=='error')return;
    const source=line.location().url,message=line.text();
    if(source===new URL('/api/events',world).href&&/\b(404|501)\b/.test(message))analytics.push(message);
    else errors.push({source,message});
  });
};
async function open(page,url){
  watch(page);
  const entry=await page.goto(url.href,{waitUntil:'domcontentloaded'});
  assert.ok(entry.ok());
  return createHash('sha256').update(await entry.body()).digest('hex');
}
const report=(route,data)=>console.log(JSON.stringify({route,ok:true,...data}));
let currentPage,stage='ordinary entry';
try{
  const ordinary=await browser.newPage({viewport});
  const entrySha256=await open(ordinary,world);
  await ordinary.locator('.world-camp-return:enabled').waitFor({timeout:75000});
  await ordinary.keyboard.press('Escape');
  await ordinary.locator('dialog[open]').waitFor();
  await ordinary.close();
  console.log(JSON.stringify({route:'ordinary entry',entrySha256,browser:browser.version()}));

  const page=await browser.newPage({viewport});currentPage=page;
  await page.addInitScript(()=>{
    const buttons=Array.from({length:18},()=>({pressed:false,touched:false,value:0}));
    const pad={id:'Foundation recovery standard pad',mapping:'standard',connected:true,index:0,axes:[0,0,0,0],buttons,timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad,null,null,null]});
    window.fixtureY=pressed=>Object.assign(buttons[3],{pressed,touched:pressed,value:Number(pressed)});
  });
  assert.equal(await open(page,new URL('?qa=1',world)),entrySha256);
  const wait=(fn,arg,timeout=25000)=>page.waitForFunction(fn,arg,{timeout,polling:80});
  await wait(()=>window.__worldDebug?.state().ready,undefined,75000);
  const state=()=>page.evaluate(()=>{
    const d=window.__worldDebug,s=d.state(),actor=d.snapshot();
    return {position:actor.player,step:actor.physicsStep,near:s.nearbyInteract?.id,label:s.nearbyInteract?.label.en,
      card:s.card?.id,toast:s.toast?.en,grounded:actor.grounded};
  });
  const frames=async n=>wait(target=>window.__worldDebug.snapshot().physicsStep>=target,(await state()).step+n);
  async function fixture(position,id){
    assert.ok(await page.evaluate(p=>{
      const d=window.__worldDebug, moved=d.teleportPlayer(p);d.set({position:p,lang:'en'});return moved;
    },position));
    await wait(({id,position:[x,,z]})=>{
      const d=window.__worldDebug,s=d.snapshot();
      return s.grounded&&Math.hypot(s.player[0]-x,s.player[2]-z)<.35
        &&d.state().nearbyInteract?.choices.some(row=>row.id===id);
    },{id,position});
    await choose(id);
  }
  async function choose(id){
    for(let tries=0;tries<4&&(await state()).near!==id;tries++){
      await page.keyboard.press('KeyQ');
      await frames(3);
    }
    assert.equal((await state()).near,id);
  }
  async function pulseY(){
    await frames(4);
    await page.evaluate(()=>window.fixtureY(true));
    try{await frames(7);}finally{await page.evaluate(()=>window.fixtureY(false));}
  }
  const camp=[-42.4,6.38,15.04],campId='camp-about-tent';
  stage='camp card shared input';
  await fixture(camp,campId);
  await page.evaluate(()=>{
    window.addEventListener('keydown',event=>{if(event.code==='KeyE')window.fixtureY(true);},{capture:true,once:true});
  });
  await page.keyboard.press('KeyE');
  try{
    await frames(10);
    assert.equal((await state()).card,'identity','a Y edge in the E physics step cannot close the card just opened');
  }finally{await page.evaluate(()=>window.fixtureY(false));}
  const close=page.locator('.world-card-close');
  await close.click();
  await wait(()=>!window.__worldDebug.state().card&&window.__worldDebug.state().nearbyInteract?.id==='camp-about-tent');
  await pulseY();
  await wait(()=>window.__worldDebug.state().card?.id==='identity');
  await page.keyboard.press('KeyE');
  await wait(()=>!window.__worldDebug.state().card&&window.__worldDebug.state().nearbyInteract?.id==='camp-about-tent');
  await page.keyboard.press('KeyE');
  await wait(()=>window.__worldDebug.state().card?.id==='identity');
  await close.click();
  report('camp-card-input', {id:campId,steps:['same-step E + Y opens once','click close','Y reopens','E closes and reopens']});

  stage='shared moving target';
  await fixture(camp,campId);
  const origin=(await state()).position, synthetic='qa-shared-approach';
  await page.evaluate(({origin:[x,y,z],synthetic})=>{
    const anchor=[x,y,z+1.55],stand=[x,y,z+1.04], counters={commits:0};
    const unregister=window.__worldInteract.register({
      id:synthetic,kind:'exhibit',position:anchor,radius:2,
      label:{en:'QA test approach',zh:'测试走近'},
      approach:{target:()=>anchor,ready:p=>Math.hypot(p[0]-stand[0],p[2]-stand[2])<.17,candidates:()=>[stand]},
      onInteract:()=>{counters.commits++;}
    });
    window.fixtureSharedApproach={counters,unregister,move:()=>{anchor[0]+=.3;stand[0]+=.3;}};
  },{origin,synthetic});
  const count=()=>page.evaluate(()=>window.fixtureSharedApproach.counters.commits);
  try{
    await wait(id=>window.__worldDebug.state().nearbyInteract?.choices.some(row=>row.id===id),synthetic);
    await choose(synthetic);
    await page.keyboard.press('KeyE');
    await wait(z=>window.__worldDebug.snapshot().player[2]>z+.10,origin[2]);
    await page.evaluate(()=>window.fixtureSharedApproach.move());
    await wait(()=>window.__worldDebug.state().toast?.en==='The object or action changed. Approach again.');
    assert.equal(await count(),0);
    await wait(id=>window.__worldDebug.state().nearbyInteract?.choices.some(row=>row.id===id),synthetic);
    await choose(synthetic);
    await pulseY();
    await wait(()=>window.fixtureSharedApproach.counters.commits===1);
    await frames(15);
    assert.equal(await count(),1);
    report('shared-moving-target',{id:synthetic,fixture:'QA registered target, real Rapier ground and actor',movedMetres:.3,commits:1});
  }finally{await page.evaluate(()=>window.fixtureSharedApproach.unregister());}

  stage='cave miner lamp keyboard cancel and retry';
  async function anchor(id){
    const handle=await wait(id=>window.__worldInteract.list().find(row=>row.id===id)?.position,id,45000);
    try{return await handle.jsonValue();}finally{await handle.dispose();}
  }
  const lamp='alpha-cave-miner-lamp', [mx,my,mz]=await anchor(lamp);
  const lampStart=[mx+1.18,my,mz];
  await fixture(lampStart,lamp);
  const before=await state();
  await page.keyboard.press('KeyE');
  await wait(x=>window.__worldDebug.snapshot().player[0]<x-.10,before.position[0]);
  await page.keyboard.down('KeyD');
  try{await wait(()=>window.__worldDebug.state().toast?.en==='Approach cancelled. You can move again.');}
  finally{await page.keyboard.up('KeyD');}
  assert.notEqual((await state()).label,'Hang the miner lamp back');
  await wait(id=>window.__worldDebug.state().nearbyInteract?.id===id,lamp);
  await frames(12);
  await pulseY();
  await wait(()=>window.__worldDebug.state().nearbyInteract?.label.en==='Hang the miner lamp back');
  const taken=await state();
  await page.keyboard.press('KeyE');
  await wait(()=>window.__worldDebug.state().nearbyInteract?.label.en==='Take the miner lamp');
  report('lamp-cancel-retry',{id:lamp,before,taken,returned:await state()});

  stage='park P14 waypoint';
  const dj='park-P14-djc',conversation='park-P16-accompany';
  async function parkStand(id){
    const [x,y,z]=await anchor(id);
    await fixture([x,y+.25,z],id);
  }
  await parkStand(dj);
  await pulseY();
  await wait(()=>window.__worldDebug.state().toast?.en==='DJC is at the beach. Follow the map marker to the club.');
  const waypoint=await page.evaluate(()=>window.__worldDebug.state().waypoint);
  assert.ok(Array.isArray(waypoint)&&waypoint.length===2);
  report('park-djc-waypoint',{id:dj,waypoint});

  stage='park P16 conversation';
  await parkStand(conversation);
  await page.keyboard.press('KeyE');
  await wait(()=>window.__worldDebug.state().seat?.id==='park-seat-accompany'&&window.__parkExhibits?.().P16?.bubbles>=1);
  await pulseY();
  await wait(()=>!window.__worldDebug.state().seat&&window.__worldDebug.snapshot().grounded);
  report('park-conversation',{id:conversation,seated:'park-seat-accompany',returned:await state()});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({route:'recovery-summary',entrySha256,analytics,errors}));
}catch(error){
  const actor=await currentPage?.evaluate(()=>({player:window.__worldDebug?.snapshot().player,
    near:window.__worldDebug?.state().nearbyInteract,toasts:window.__worldDebug?.state().toast,
    pad:window.__worldDebug?.camera().gamepad,keys:window.__worldDebug?.inputState()})).catch(()=>null);
  console.error(JSON.stringify({stage,error:String(error),actor,errors,analytics}));
  throw error;
}finally{await browser.close();}
