import assert from 'node:assert/strict';
import {Bot,CHROME,loadPlaywright} from './lib.mjs';

const [base='http://127.0.0.1:4343',variant='normal']=process.argv.slice(2);
const root=new URL('/world/',base);
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,args:['--use-angle=metal']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(root.href);
  await page.locator('button.world-camp-return:enabled').waitFor({timeout:60000});
  assert.equal(await page.evaluate(()=>Boolean(window.__worldDebug)),false);
  root.searchParams.set('qa','1');
  if(variant==='legacy')root.searchParams.set('campSiteCraft','legacy');
  await page.goto(root.href);
  await page.waitForFunction(()=>window.__worldDebug?.snapshot().grounded&&window.__worldCampContent?.hard().filter(p=>p.id.startsWith('L01-')).length===2,undefined,{timeout:75000});
  const bot=new Bot(page),start=(await bot.feedback()).player;
  assert.ok(Math.hypot(start[0]+42,start[2]-35)<.5);
  const path=[[-39,37.8],[-33.5,37.8],[-31.4,35],[-28.3,34]];
  const walk=await bot.walk(path,{arrive:.48,timeout:20,maxRecoveries:2});
  const probes=await page.evaluate(()=>{
    const d=window.__worldDebug;
    // Sweep above the sloping paving. The preceding real walk separately exercises foot support.
    const cross=z=>d.castPlayer([-31.4,6.18,z],[-28.6,6.18,z]);
    return [31,34,37].map(cross);
  });
  console.log(JSON.stringify({variant,start,legs:walk.legs,probes,errors,placements:bot.fixtureCalls}));
  assert.ok(walk.legs.length===path.length&&walk.legs.every(leg=>leg.reached));
  assert.ok(probes[0].hit&&probes[2].hit&&!probes[1].hit);
  assert.ok(probes[0].other.name.includes('L01')&&probes[2].other.name.includes('L01'));
  assert.deepEqual(errors,[]);assert.equal(bot.fixtureCalls.length,0);
} finally {await browser.close();}
