import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from './lib.mjs';
const [base='http://127.0.0.1:4343', mode='after']=process.argv.slice(2);
assert.ok(['before','after'].includes(mode));
const url=new URL('/world/',base);
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,args:['--use-angle=metal']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({timeout:75000});
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)),false);
  url.searchParams.set('qa','1');
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__worldDebug?.sceneObjects().includes('alpha-physical-sand-route-model'),undefined,{timeout:75000});
  const bot=new Bot(page);
  assert.ok(await bot.fixtureTeleport([171,6,151.1],'stand at the sand-table button'));
  await page.waitForFunction(()=>window.__worldDebug.snapshot().grounded && window.__worldDebug.state().nearbyInteract?.id==='alpha-sand',undefined,{timeout:12000});
  const actionBefore=await page.evaluate(()=>window.__alphaIsland.motion().sandAt);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(t=>window.__alphaIsland.motion().sandAt>t,actionBefore,{timeout:16000});
  const samples=await page.evaluate(async()=>{
    const d=window.__worldDebug,out=[];
    for(let i=0;i<8;i++){
      const info=await d.reviewCollisionSources('alpha-sand-route-ball');
      const p=info.meshes[0].matrixWorld.slice(12,15);
      const probe=d.probeAsset('alpha-sand-model',[p[0],p[1]+.7,p[2]],[0,-1,0],.075);
      out.push({p,body:probe?.toi??null});
      await new Promise(resolve=>setTimeout(resolve,120));
    }
    return out;
  });
  assert.ok(new Set(samples.map(s=>s.p[0].toFixed(3))).size>4);
  assert.ok(samples.every(({body})=>mode==='before'?body===null:body!==null&&Math.abs(body-.7)<.005));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mode,samples,fixtures:bot.fixtureCalls,errors}));
} finally {await browser.close();}
