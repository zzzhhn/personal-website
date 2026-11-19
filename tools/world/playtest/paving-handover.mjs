import assert from 'node:assert/strict';
import {Bot,CHROME,loadPlaywright} from './lib.mjs';

const url = new URL('/world/',process.argv[2] ?? 'http://127.0.0.1:4343');
const browser = await loadPlaywright().chromium.launch({executablePath:CHROME,args:['--use-angle=metal']});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({timeout:75000});
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)),false);
  url.searchParams.set('qa','1');
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__worldDebug?.sceneObjects().includes('park-walk-structure-plaza'),undefined,{timeout:75000});
  const bot = new Bot(page);
  assert.ok(await bot.fixtureTeleport([40,2,-47.5],'start on the road before the formal plaza'));
  const route = await bot.walk([[42,-47.5],[44.2,-47.5],[47,-47.5],[44.2,-47.5],[42,-47.5]],{arrive:.35,timeout:15,maxRecoveries:1});
  const trace = route.trace;
  const observation = await page.evaluate(()=>{
    const d=window.__worldDebug;
    return {toast:d.state().toast,region:d.state().zone,casts:[1.97,2.15,2.45,2.8].map(y=>d.castPlayer([42.95,y,-47.5],[44.35,y,-47.5])),
      text:document.body.innerText.slice(-700)};
  });
  console.log(JSON.stringify({placements:bot.fixtureCalls,legs:route.legs,observation,positions:trace.map(row=>({p:row.p,grounded:row.g,contacts:row.contacts?.map(c=>({name:c.other.name,normal:c.normal}))})),errors}));
  assert.ok(route.legs.length===5&&route.legs.every(leg=>leg.reached&&leg.recoveries===0),'road to plaza and back');
  const edge=trace.filter(row=>Math.abs(row.p[0]-43.6)<.8);
  assert.ok(edge.length>=2 && edge.every(row=>row.g),'continuous foot support across the shared edge');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
