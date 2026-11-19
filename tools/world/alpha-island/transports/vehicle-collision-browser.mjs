import assert from 'node:assert/strict';
import { CHROME,loadPlaywright } from '../../playtest/lib.mjs';

const base=process.argv[2]??'http://127.0.0.1:4343';
const layout=process.argv.includes('--layout=v3')?'v3':'v4';
const registrationsOnly=process.argv.includes('--registrations-only');
const browser=await loadPlaywright().chromium.launch({headless:true,executablePath:CHROME,args:['--use-angle=metal']});
const routes=[
  {kind:'ferry',approach:[-10,1.14,109],exit:[156,1.527951,148]},
  {kind:'cable',approach:[260,38,148],exit:[260,73,218]},
  {kind:'sled',approach:[256,76,232],exit:[171,3.8,163]},
];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await page.routeWebSocket('**/*',ws=>ws.close());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL(`/world/?qa=1&layout=${layout}`,base).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__worldDebug?.state().ready && window.__alphaIsland &&
    window.__worldDebug.physicsInventory().some(part=>part.visualRef==='alpha-ferry-contact-body') &&
    window.__worldDebug.physicsInventory().some(part=>part.visualRef==='alpha-sled-contact-body') &&
    window.__worldDebug.physicsInventory().some(part=>part.visualRef==='alpha-cable-contact-grip'),undefined,{timeout:60_000});
  const geometry=await page.evaluate(()=>{
    const d=window.__worldDebug;
    return {physics:d.physicsInventory().filter(part=>/^alpha-(ferry|sled|cable)-contact-/.test(part.visualRef??'')),coverage:d.reviewCollisionInventory()};
  });
  assert.equal(geometry.physics.length,4);
  assert.ok(geometry.physics.every(part=>part.kind==='trimesh'||part.shape==='trimesh'));
  const expected=new Map([
    ['alpha-cable-vehicle-model',2], ['alpha-ferry-vehicle-model',1], ['alpha-sled-vehicle-model',1],
    ['cable-lower-canopy-structure',5], ['cable-upper-canopy-structure',5],
    ...routes.flatMap(({kind})=>[0,1].map(end=>[`alpha-${kind}-gangway-${end}`,1])),
  ]);
  for(const [id,count] of expected) assert.equal(geometry.coverage.registrations[id],count,id);
  const scopeErrors=geometry.coverage.errors.filter(error=>[...expected.keys()].some(id=>error.includes(id)));
  assert.deepEqual(scopeErrors,[]);
  console.log(JSON.stringify({layout,registrations:expected.size,activeColliders:[...expected.values()].reduce((a,b)=>a+b,0)}));
  for(const {kind,approach,exit} of registrationsOnly?[]:routes){
    const id=`alpha-${kind}`;
    const status=()=>page.evaluate(()=>({ride:window.__alphaIsland.ride(),actor:window.__worldDebug.snapshot(),toast:window.__worldDebug.state().toast,nearby:window.__worldDebug.state().nearbyInteract,paused:window.__worldDebug.state().paused}));
    try {
      // Only entrance placement uses QA. E, the HUD skip, egress and W use normal game paths.
      assert.equal(await page.evaluate(([x,y,z])=>window.__worldDebug.teleportPlayer([x,y+.9,z]),approach),true);
      await page.waitForFunction(id=>{
        const d=window.__worldDebug;
        return d.snapshot().grounded && d.state().nearbyInteract?.id===`${id}-board-0`;
      },id,{timeout:20_000});
      await page.keyboard.press('e');
      const skip=page.getByRole('button',{name:'Skip travel to arrival',exact:true});
      await skip.waitFor({timeout:55_000});
      const boarding=await status();
      assert.equal(boarding.ride.phase,'riding');
      await skip.click();
      await page.waitForFunction(()=>!window.__alphaIsland.ride().active && window.__worldDebug.snapshot().grounded,undefined,{timeout:45_000});
      const arrival=await status();
      const [x,y,z]=arrival.actor.player;
      assert.ok(Math.hypot(x-exit[0],z-exit[2])<.25,`${id}: ends at its authored terminal`);
      assert.ok(Math.abs(y-exit[1]-.82)<.16,`${id}: physical landing near terminal height`);
      await page.keyboard.down('w');
      await page.waitForTimeout(700);
      await page.keyboard.up('w');
      const leave=(await status()).actor.player;
      assert.ok(Math.hypot(leave[0]-x,leave[2]-z)>.25,`${id}: walking controls restored`);
      console.log(JSON.stringify({id,boarded:boarding.ride.phase,arrival:[x,y,z],grounded:arrival.actor.grounded,walkedAway:Math.hypot(leave[0]-x,leave[2]-z)}));
    } catch(error) {
      console.error(JSON.stringify({id,status:await status(),pageErrors:errors}));
      throw error;
    }
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
