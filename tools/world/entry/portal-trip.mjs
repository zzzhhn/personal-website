import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright } from '../playtest/lib.mjs';

const [base='http://127.0.0.1:4343', mode='delayed'] = process.argv.slice(2);
const ordinary = new URL('/world/',base).href;
const browser = await loadPlaywright().chromium.launch({ executablePath:CHROME,headless:true,args:['--use-angle=metal'] });
const ctx = await browser.newContext({viewport:{width:1056,height:700}});
const page = await ctx.newPage(), bot = new Bot(page);
const asset = '**/assets/world/entry/G28.glb*', gate = Promise.withResolvers();
const errors = [], routes = [];
const failed = mode === 'failed';
page.on('pageerror',error=>errors.push(error.message));
const camp = {id:'camp',position:[-33.5,4.8,34],yaw:0};
let intercepted = 0;
async function snapshot() {
  return page.evaluate(() => {
    const d=window.__worldDebug, s=d.snapshot();
    return { p:s.player,grounded:s.grounded,yaw:d.camera().yaw,toast:d.state().toast?.en??'' };
  });
}
function at(site,x,z) {
  const [a,y,b]=site.position,c=Math.cos(site.yaw),s=Math.sin(site.yaw);
  return [a+c*x+s*z,y+.9,b-s*x+c*z];
}
async function approach(site, duration) {
  const [x,,z]=at(site,0,-1);
  const keys=[['KeyW',0,1],['KeyS',0,-1],['KeyD',1,0],['KeyA',-1,0],
    ['KeyW KeyA',-1,1],['KeyW KeyD',1,1],['KeyS KeyA',-1,-1],['KeyS KeyD',1,-1]];
  const trail=[];let state;
  try {
    const end=Date.now()+duration;
    while(Date.now()<end) {
      state=await snapshot();
      const [px,,pz]=state.p;
      trail.push([px,pz]);
      if(Math.hypot(px-site.position[0],pz-site.position[2])>10)break;
      const dx=x-px,dz=z-pz,c=Math.cos(state.yaw),s=Math.sin(state.yaw);
      let score=-Infinity,best;
      for(const [key,h,v] of keys){
        const dot=((h*s-v*c)*dx+(-h*c-v*s)*dz)/Math.hypot(h,v);
        if(dot>score){score=dot;best=key;}
      }
      await bot.hold(best.split(' ')); await page.waitForTimeout(60);
    }
  } finally { await bot.release(); }
  return {...state, steps:trail.length,closestZ:Math.min(...trail.map(p=>p[1]-site.position[2]))};
}
try {
  if(failed) {
    // No QA parameter. A single missing gate must leave a playable world and a working settings menu.
    await page.route(asset,r=>{intercepted++;return r.abort();});
    await page.goto(ordinary);
    await page.locator('button.world-camp-return:enabled').waitFor({timeout:55_000});
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({timeout:10_000});
    assert.ok(intercepted>0);
    console.log(JSON.stringify({mode,intercepted,ordinaryMenu:true,errors}));
  } else {
    if(mode === 'delayed' || mode === 'before') {
      await page.route(asset,async r=>{intercepted++;await gate.promise;await r.continue();});
    }
    await page.goto(ordinary+'?qa=1');
    await page.waitForFunction(()=>window.__worldDebug?.state().ready&&window.__worldDebug.snapshot().grounded,undefined,{timeout:90_000});
    if(mode !== 'trip') {
      assert.ok(intercepted>0);
      await bot.fixtureTeleport(at(camp,0,4.2),'camp approach before gate download');
      const blocked=await approach(camp,2800);
      console.log(JSON.stringify({mode,heldAsset:true,blocked,intercepted}));
      if(mode==='before') {assert.ok(blocked.closestZ<1.5,'before: original body could enter missing structure');}
      else {assert.ok(blocked.closestZ>2.4&&blocked.closestZ<3.5,'wait in front of pending ramp');
        assert.match(blocked.toast,/preparing/i);}
      gate.resolve();
    }
    await page.waitForFunction(()=>window.__worldEntry?.facts().sites.length===5,undefined,{timeout:60_000});
    const sites=await page.evaluate(()=>window.__worldEntry.facts().sites);
    if(mode!=='before') {
      for(const site of mode==='trip'?sites:[camp]) {
        if (process.env.WORLD_PORTAL_SITE && site.id!==process.env.WORLD_PORTAL_SITE) continue;
        await bot.fixtureTeleport(at(site,0,4.3),site.id+' outside gate to allow rearming');
        await page.waitForTimeout(2300);
        const approachPoint=site.entryApproachCandidates[0];
        await bot.fixtureTeleport([approachPoint[0],approachPoint[1]+.85,approachPoint[2]],site.id+' authored ramp approach');
        const end=await approach(site,5500);
        const destination=sites.find(d=>d.id!==site.id&&Math.hypot(end.p[0]-d.position[0],end.p[2]-d.position[2])<5);
        if (!destination) {
          const probe=await page.evaluate(({position,target})=>window.__worldDebug.castPlayer(position,target),
            {position:end.p,target:at(site,0,-.6)});
          console.log(JSON.stringify({site:site.id,failedApproach:end,probe}));
        }
        assert.ok(destination,site.id+' did not transfer: '+JSON.stringify(end));
        await page.waitForFunction(()=>window.__worldDebug.snapshot().grounded,undefined,{timeout:5000});
        const start=await snapshot();await bot.hold(['KeyW']);await page.waitForTimeout(450);await bot.release();
        const after=await snapshot(),distance=Math.hypot(start.p[0]-after.p[0],start.p[2]-after.p[2]);
        assert.ok(distance>.15,site.id+' arrival movement '+distance);
        routes.push({from:site.id,to:destination.id,walkingAfterMetres:distance}); console.log(JSON.stringify(routes.at(-1)));
      }
    }
    assert.deepEqual(errors,[]); console.log(JSON.stringify({mode,routes,errors,fixtures:bot.fixtureCalls}));
  }
} finally {gate.resolve();await ctx.close();await browser.close();}
