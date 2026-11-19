/** Keep the real GLB pending while checking the fallback, then release its actual request. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CHROME, loadPlaywright } from './lib.mjs';

const start = new URL('/world/?start=club', process.argv[2] ?? 'http://127.0.0.1:4343');
const families = {
  'pool-lantern': { request:'**/club/lantern/pool-lantern-v2.glb', legacy:'djcLanterns', count:10, height:.91 },
  umbrella: { request:'**/club/umbrella/umbrella-v1.glb', legacy:'djcUmbrellas', count:2, height:1.2 },
  furniture: { request:'**/club/furniture/furniture-v1.glb', legacy:'djcFurniture', count:5, height:.85,
    target:'djc-furniture-contact-console-0', fromEast:1.8 },
  daybed: { request:'**/club/daybed/daybed-ao-v1.glb', legacy:'djcDaybeds', count:4, height:.88, fromEast:2.2 },
};
const family = process.argv[3] ?? 'pool-lantern', options=families[family];
assert.ok(options,`Unknown DJC contact family ${family}`);
const root = `djc-${family}-contact`;
const browser = await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const viewport = {width:1056,height:700}, errors = [], analytics = [];
function observe(page){
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{
    if(m.type()!=='error')return;
    const detail=m.text(), source=m.location().url;
    if(source===new URL('/api/events',start).href&&/\b(404|501)\b/.test(detail))analytics.push(detail);
    else errors.push({detail,source});
  });
}
async function load(page,url){
  const r=await page.goto(url,{waitUntil:'domcontentloaded'});
  assert.ok(r.ok());
  return createHash('sha256').update(await r.body()).digest('hex');
}
async function registration(page,count){
  await page.waitForFunction(({root,count})=>{
    const inv=window.__worldDebug?.reviewCollisionInventory();
    return inv?.registrations[root]===count&&inv.errors.every(e=>!e.includes(root));
  },{root,count},{timeout:50000,polling:250});
  const rows=await page.evaluate(root=>window.__worldDebug.physicsInventory().filter(x=>x.visualRef?.startsWith(root))
    .map(x=>({name:x.visualRef,shape:x.shape,translation:x.translation})),root);
  assert.equal(rows.length,count);
  assert.ok(rows.every(x=>x.shape==='trimesh'));
  return rows;
}
let release, requestObserved=false;
const pending=new Promise(resolve=>{release=resolve;});
try{
  const ordinary=await browser.newPage({viewport});observe(ordinary);
  const sha=await load(ordinary,start.href);
  await ordinary.locator('.world-camp-return:enabled').waitFor({timeout:75000});
  await ordinary.keyboard.press('Escape');
  await ordinary.locator('dialog[open]').waitFor();
  await ordinary.close();

  const qa=new URL(start);qa.searchParams.set('qa','1');
  const page=await browser.newPage({viewport});observe(page);
  await page.route(options.request,async route=>{requestObserved=true;await pending;await route.continue();});
  assert.equal(await load(page,qa.href),sha);
  await page.waitForFunction(()=>window.__worldDebug?.state().ready,undefined,{timeout:75000});
  const fallback=await registration(page,1);
  assert.equal(fallback[0].name,`${root}-fallback`);
  assert.ok(requestObserved,'the real asset request was held');
  release();
  const promoted=await registration(page,options.count);
  const target=options.target ? promoted.find(row=>row.name===options.target) : promoted[0];
  assert.ok(target);
  const contact=await page.evaluate(({p:[x,y,z],height,fromEast})=>window.__worldDebug.castPlayer([x+fromEast,y+height,z],[x-.50,y+height,z]),
    {p:target.translation,height:options.height,fromEast:options.fromEast??.85});
  assert.ok(contact.hit&&contact.other.name===target.name,JSON.stringify(contact));
  await page.close();

  const legacy=await browser.newPage({viewport});observe(legacy);
  qa.searchParams.set(options.legacy,'legacy');
  assert.equal(await load(legacy,qa.href),sha);
  await legacy.waitForFunction(()=>window.__worldDebug?.state().ready,undefined,{timeout:75000});
  assert.deepEqual(await registration(legacy,1),fallback);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(),sha,fallback,promoted,legacyFallback:1,contact,analytics}));
}finally{release();await browser.close();}
