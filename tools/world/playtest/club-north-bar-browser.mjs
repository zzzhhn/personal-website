/** Exercise mounted north bar colliders and real keyboard passage in Chrome. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const start=new URL('/world/?start=club',process.argv[2]??'http://127.0.0.1:4343');
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const root='djc-north-bar-contact', viewport={width:1056,height:700}, errors=[],analytics=[];
const near='**/club/bar/djc-north-bar-v1.glb',far='**/club/bar/djc-north-bar-lod1-v1.glb';
function observe(page){
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',event=>{
    if(event.type()!=='error')return;
    const source=event.location().url,message=event.text();
    if(source===new URL('/api/events',start).href&&/\b(404|501)\b/.test(message))analytics.push(message);
    else errors.push({source,message});
  });
}
async function open(page,url){
  observe(page);
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});
  assert.ok(response.ok());
  return createHash('sha256').update(await response.body()).digest('hex');
}
async function installed(page,kind){
  await page.waitForFunction(({root,kind})=>{
    const d=window.__worldDebug, inventory=d?.reviewCollisionInventory();
    if(inventory?.registrations[root]!==6||inventory.errors.some(e=>e.includes(root)))return false;
    return d.physicsInventory().some(row=>row.visualRef===`${root}-${kind}-surface`);
  },{root,kind},{timeout:50000,polling:250});
  return page.evaluate(()=>window.__worldDebug.physicsInventory().filter(row=>row.assetId==='djc-north-bar')
    .map(({visualRef,kind,aabb,handle,shape})=>({name:visualRef,kind,aabb,handle,shape})));
}
function verify(rows,kind){
  assert.equal(rows.length,6);
  assert.ok(rows.every(row=>row.shape==='trimesh'));
  assert.equal(rows.find(row=>row.name===`${root}-${kind}-surface`)?.kind,'surface');
  assert.equal(rows.find(row=>row.name===`${root}-${kind}-solid`)?.kind,'solid');
}
const state=page=>page.evaluate(()=>{const s=window.__worldDebug.snapshot();return {position:s.player,grounded:s.grounded};});
async function place(page,position){
  assert.ok(await page.evaluate(p=>{
    const d=window.__worldDebug, ok=d.teleportPlayer(p);d.set({position:p});return ok;
  },position));
  await page.waitForFunction(p=>{
    const s=window.__worldDebug.snapshot();
    return s.grounded&&Math.hypot(s.player[0]-p[0],s.player[2]-p[2])<.45;
  },position,{timeout:10000});
}
async function go(bot,x,z){
  const page=bot.page, deadline=Date.now()+13000;
  try{
    while(Date.now()<deadline){
      const {position:[px,,pz],yaw}=await page.evaluate(()=>{
        const d=window.__worldDebug;
        return {position:d.snapshot().player,yaw:d.camera().yaw};
      });
      const dx=x-px,dz=z-pz;
      if(Math.hypot(dx,dz)<.28)return;
      const sin=Math.sin(yaw),cos=Math.cos(yaw),right=dx*sin-dz*cos,forward=-dx*cos-dz*sin;
      await bot.hold(comboFor(.8*right-.6*forward,-.6*right-.8*forward).keys);
      await page.waitForTimeout(75);
    }
    assert.fail(`Could not walk to ${x}, ${z}`);
  }finally{await bot.release();}
}
let release, pendingObserved=false, stage='ordinary entrance', activePage;
const hold=new Promise(resolve=>{release=resolve;});
try{
  const ordinary=await browser.newPage({viewport});
  const sha=await open(ordinary,start.href);
  await ordinary.locator('.world-camp-return:enabled').waitFor({timeout:75000});
  await ordinary.keyboard.press('Escape');await ordinary.locator('dialog[open]').waitFor();await ordinary.close();

  stage='pending near asset';
  const qa=new URL(start);qa.searchParams.set('qa','1');qa.searchParams.set('djcBar','near');
  const page=await browser.newPage({viewport});activePage=page;
  await page.route(near,async route=>{pendingObserved=true;await hold;await route.continue();});
  assert.equal(await open(page,qa.href),sha);
  await page.waitForFunction(()=>window.__worldDebug?.state().ready,undefined,{timeout:75000});
  const fallback=await installed(page,'fallback');verify(fallback,'fallback');
  assert.ok(pendingObserved);
  release();

  stage='near real contact';
  const nearRows=await installed(page,'structure');verify(nearRows,'structure');
  assert.deepEqual(nearRows.filter(r=>r.name.includes('stool')).map(r=>r.handle),fallback.filter(r=>r.name.includes('stool')).map(r=>r.handle));
  const planter=await page.evaluate(()=>window.__worldDebug.castPlayer([46.6,2.16,39.2],[45.25,2.16,39.2]));
  assert.ok(planter.hit&&planter.other.name===`${root}-structure-solid`,JSON.stringify(planter));
  stage='keyboard passage across the deck entrance';
  const bot=new Bot(page);await place(page,[40.76,2.05,40.95]);
  await go(bot,40.76,42.98);
  const approach=await state(page);
  await go(bot,40.76,41.15);
  const deck=await state(page);
  assert.ok(deck.grounded&&deck.position[2]<41.45&&Math.abs(deck.position[1]-2.02)<.04,JSON.stringify(deck));
  await go(bot,40.76,42.98);
  const returned=await state(page);
  assert.ok(returned.grounded&&returned.position[2]>42.68,JSON.stringify(returned));
  await page.close();

  stage='far asset same collider bounds';
  const distant=await browser.newPage({viewport});activePage=distant;
  const observed=distant.waitForResponse(response=>response.ok()&&response.url().endsWith(far.slice(2)));
  qa.searchParams.set('djcBar','far');
  assert.equal(await open(distant,qa.href),sha);
  await observed;
  const farRows=await installed(distant,'structure');verify(farRows,'structure');
  const geometry=rows=>rows.map(({name,kind,aabb,shape})=>({name,kind,aabb,shape})).sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(geometry(farRows),geometry(nearRows));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(),sha,fallback,near:nearRows,far:farRows,planter,approach,deck,returned,analytics}));
} catch(error) {
  const current=await activePage?.evaluate(()=>window.__worldDebug?.snapshot()).then(s=>s?.player).catch(()=>null);
  console.error(JSON.stringify({stage,error:String(error),current,errors,analytics}));throw error;
} finally {release();await browser.close();}
