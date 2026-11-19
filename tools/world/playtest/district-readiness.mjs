/** Keyboard routes using the public spawns. QA reads physics and placed coordinates only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [base='http://127.0.0.1:4429',...selected] = process.argv.slice(2);
const starts = {'street-park':'town','alpha-lodge':'alpha-shallows','park-fallback':'town','plaza-van':'town'};
assert.ok(selected.length && selected.every(route=>Object.hasOwn(starts,route)));
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const failed = [];
const boardwalk = [[49,-46],[64,-40],[69,-22],[56,-7]];
const heads = [[18,-3],[21,-11],[21,-26],[21,-41],[26,-42],[40,-43.65],[42.7,-42.1],[47.3,-42.1],[50,-44.5],[49,-46]];
const xz = ([x,,z])=>[x,z];

for (const route of selected) {
 const page=await browser.newPage({viewport:{width:1080,height:720}}),bot=new Bot(page);
 const errors=[],marks=[];
 let stage='public entry';
 page.on('pageerror',error=>errors.push(error.message));
 const wait=(fn,arg,timeout=55000)=>page.waitForFunction(fn,arg,{timeout,polling:90});
 const url=new URL('/world/',base),start=starts[route];
 if(start)url.searchParams.set('start',start);
 const ready=()=>page.locator('button.world-camp-return:enabled').waitFor({timeout:75000});
 const actor=()=>page.evaluate(()=>{
  const d=window.__worldDebug,s=d.snapshot();
  return {p:s.player,grounded:s.grounded,step:s.physicsStep,yaw:d.camera()?.yaw,offer:d.state().nearbyInteract?.id};
 });
 const walk=async ([x,z],tolerance=.57,where='',steady=false)=>{
  stage=where||`walk to ${x},${z}`;
  let best=Infinity,progress=(await actor()).step,lowest=Infinity,highest=-Infinity;
  try {
   while(true) {
    const a=await actor(),dx=x-a.p[0],dz=z-a.p[2],distance=Math.hypot(dx,dz);
    lowest=Math.min(lowest,a.p[1]);highest=Math.max(highest,a.p[1]);
    if(distance<tolerance) {
      marks.push({stage,position:a.p,grounded:a.grounded,lowest,highest});
      if(steady) {
        await bot.release();
        await wait(()=>{
          const velocity=window.__worldDebug.snapshot().playerVelocity;
          return Math.hypot(velocity[0],velocity[2])<.18;
        },undefined,5500);
        assert.ok(lowest>1.91&&(await actor()).grounded,JSON.stringify(marks.at(-1)));
      }
      return a;
    }
    if(distance<best-.05){best=distance;progress=a.step;}
    if(a.step-progress>150){
     const contact=await page.evaluate(([x,z])=>{
       const d=window.__worldDebug,p=d.snapshot().player,n=Math.hypot(x-p[0],z-p[2]);
       return {sweep:d.castPlayer(p,[p[0]+(x-p[0])*.8/n,p[1],p[2]+(z-p[2])*.8/n]),
        contacts:d.contacts().filter(c=>c.self==='player')};
     },[x,z]);
     assert.fail(JSON.stringify({stage,target:[x,z],a,best,contact}));
    }
    const d=Math.atan2(.8,.6)-(a.yaw??Math.atan2(.8,.6));
    await bot.hold(comboFor(dx*Math.cos(d)-dz*Math.sin(d),dx*Math.sin(d)+dz*Math.cos(d)).keys);
    if(steady) {
      await page.waitForFunction(step=>window.__worldDebug.snapshot().physicsStep>=step,a.step+3,{timeout:9000,polling:22});
    } else {
      await wait(step=>window.__worldDebug.snapshot().physicsStep>=step,a.step+6,9000);
    }
   }
  }finally{await bot.release();}
 };
 const walkAll=async(points)=>{for(const next of points)await walk(next);};
 const support=async()=>page.evaluate(()=>{
  const d=window.__worldDebug,p=d.snapshot().player;
  return d.castPlayer([p[0],p[1]+.09,p[2]],[p[0],p[1]-.24,p[2]]);
 });
 const pause=async ()=>{
  await bot.press('Escape');
  await page.locator('dialog[open]').waitFor();
  await wait(()=>window.__worldDebug.state().paused);
  const start=await actor();
  await bot.hold(['KeyW']);
  await page.waitForTimeout(420);
  await bot.release();
  const after=await actor();
  assert.deepEqual(after.p,start.p);
  assert.equal(after.step,start.step);
  await bot.press('Escape');
  await page.locator('dialog[open]').waitFor({state:'hidden'});
  await wait(()=>!window.__worldDebug.state().paused);
  return after.p;
 };
 let release,hutRequests=0;
 try {
  const entry=await page.goto(url.href,{waitUntil:'domcontentloaded'});
  const hash=createHash('sha256').update(await entry.body()).digest('hex');
  await ready();
  assert.equal(await page.evaluate(()=>!!window.__worldDebug),false);
  url.searchParams.set('qa','1');
  if(route==='park-fallback') {
    const pending=Promise.withResolvers();release=pending.resolve;
    await page.route('**/hut-runtime.glb',async request=>{hutRequests++;await pending.promise;await request.continue();});
  }
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await ready();
  await wait(()=>window.__worldDebug?.snapshot().grounded);
  const spawn=await actor();
  let result;
  if(route==='alpha-lodge'){
   await walkAll([[190,136],[189.4,139],[188.1,141.5],[181,150],[177,146],[177,155.5],[171,155.5]]);
   const outside=await support();
   await walk([171,154.2],.30,'lodge ramp');
   const threshold=await support();
   await walk([171,151.65],.32,'lodge interior');
   const inside=await support(),paused=await pause();
   assert.ok(Math.abs(paused[1]-5.14)<.20);
   assert.match(inside.other?.name??'',/alpha-dock-lodge/);
   await walk([171,154.2],.34,'lodge exit threshold');
   await walk([171,155.45],.34,'lodge exit apron');
   assert.ok((await actor()).grounded);
   result={outside,threshold,inside,paused};
  } else if(route==='plaza-van'){
   // Approach the actual parked van from the south side of the road.
   await walkAll([[14,-4.8],[18,-4.8],...heads.slice(1,8)]);
   stage='van boarding';
   const parked=()=>page.evaluate(()=>window.__worldDebug.snapshot().vehicles.find(v=>v.id==='van'));
   await wait(()=>window.__worldDebug.state().nearbyVehicle==='van');
   await bot.press('KeyE');
   await wait(()=>window.__worldDebug.snapshot().activeVehicle==='van'
     && !window.__worldDebug.snapshot().vehicles.find(v=>v.id==='van').entering);
   const board=await parked();
   const seam=43.10;
   const wheelPositions=()=>page.evaluate(()=>window.__worldDebug.motionProbe()
    .vehicles.find(v=>v.id==='van').wheels.map(wheel=>wheel.position));
   const driveAcross=async(key,direction)=>{
    const brakes=[];
    for(let i=0;i<12;i++) {
     const startStep=(await actor()).step;
     // Advance at parking speed. Long throttle holds need more room to brake
     // than the distance between the road seam and the pedestrian boardwalk.
     await bot.hold([key]);
     try {
      await page.waitForFunction(step=>window.__worldDebug.snapshot().physicsStep>=step,startStep+24,{timeout:9000,polling:25});
     } finally {await bot.release();}
     await bot.hold(['Space']);
     try {
      await wait(()=>{const row=window.__worldDebug.snapshot().vehicles.find(v=>v.id==='van');
       return Math.hypot(...row.velocity)<.2&&row.wheelContacts.every(Boolean);
      },undefined,9000);
     } finally {await bot.release();}
     const stopped=await parked(),wheels=await wheelPositions();
     brakes.push({position:stopped.position,velocity:stopped.velocity,wheelContacts:stopped.wheelContacts,wheels});
     if(wheels.every(([x])=>(x-seam)*direction>.1))return {stopped,brakes};
    }
    assert.fail(JSON.stringify({seam,direction,brakes}));
   };
   stage='reverse across plaza threshold';
   const reverse=await driveAcross('KeyS',-1),reversed=reverse.stopped;
   stage='drive back to the parking side';
   const forward=await driveAcross('KeyW',1),returned=forward.stopped;
   assert.ok(returned.position[0]<48.5);
   assert.ok(Math.abs(returned.position[2]-board.position[2])<.30);
   assert.ok(Math.abs(returned.position[1]-board.position[1])<.12);
   stage='van exit';
   await bot.press('KeyE');
   await wait(()=>!window.__worldDebug.snapshot().activeVehicle&&window.__worldDebug.snapshot().grounded);
   result={board,reversed,returned,brakes:[...reverse.brakes,...forward.brakes],exit:await actor(),support:await support()};
  } else {
   await walkAll(heads);
   const plaza=await support();
   assert.ok(plaza.hit);
   assert.match(plaza.other?.name??'',/park-walk-structure-plaza/);
   let fallback;
   if(route==='park-fallback') {
    const claims=()=>page.evaluate(()=>({booth:window.__worldDebug.claimedGreybox().includes('booth'),
      park:window.__worldDebug.sceneObjects().includes('park-huts')}));
    assert.equal(hutRequests,1,'the real hut model is held in flight');
    fallback=await claims();
    assert.deepEqual(fallback,{booth:false,park:false});
    assert.ok((await actor()).grounded);
    release();
    await wait(()=>window.__worldDebug.claimedGreybox().includes('booth')&&window.__worldDebug.sceneObjects().includes('park-huts'));
   }
   const huts=await page.evaluate(()=>window.__parkWalk.huts);
   const nearest=(p)=>boardwalk.slice(1).map((b,i)=>{
    const a=boardwalk[i],d=[b[0]-a[0],b[1]-a[1]],u=Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(d[0]**2+d[1]**2)));
    const point=[a[0]+u*d[0],a[1]+u*d[1]];
    return {point,i,u,order:i+u,direction:d.map(v=>v/Math.hypot(...d)),distance:Math.hypot(point[0]-p[0],point[1]-p[1])};
   }).sort((a,b)=>a.distance-b.distance)[0];
   const planned=huts.map(h=>({...h,...nearest(xz(h.spurEnd))})).sort((a,b)=>a.order-b.order);
   const rooms=[];
   let prior=0;
   for(const h of planned) {
    while(prior<h.i)await walk(boardwalk[++prior]);
    const o=xz(h.opening),along=n=>o.map((v,i)=>v+h.front[i]*n);
    // At the finite end of the last boardwalk the full approach lies closer
    // to the park. Stay on that side of the visible edge through the turn.
    const last=h.i===boardwalk.length-2&&h.u===1,inset=last?.95:0;
    const safe=point=>point.map((v,axis)=>v-inset*h.direction[axis]);
    const deck=safe(h.point),spur=safe(xz(h.spurEnd));
    await walk(deck,last?.23:.57,last?'terminal deck approach':'',last);
    await walk(spur,.28,last?'terminal spur approach':'',last);
    await walk(along(.40),.28,`${h.id} entrance`);
    const before=await support();
    await walk(along(-.87),.30,`${h.id} interior`);
    const entered=await actor(),floor=await support();
    assert.ok(entered.grounded&&Math.abs(entered.p[1]-1.96)<.13);
    const paused=rooms.length===0?await pause():null;
    await walk(along(.53),.31,`${h.id} exit`);
    await walk(spur,.28,last?'terminal spur exit':'',last);
    await walk(deck,last?.23:.5,last?'terminal deck return':'',last);
    assert.ok((await actor()).p[1]>1.91);
    assert.match(floor.other?.name??'',new RegExp(h.id));
    rooms.push({id:h.id,entered:entered.p,before,floor,paused});
    if(route==='park-fallback')break;
   }
   result={plaza,rooms,fallback,hutRequests};
  }
  assert.deepEqual(bot.fixtureCalls,[]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({route,ok:true,hash,spawn,marks,...result,relocations:bot.fixtureCalls,errors}));
 }catch(error){
  failed.push(route);
  console.log(JSON.stringify({route,ok:false,stage,error:String(error),actor:await actor().catch(()=>null),marks,errors}));
 }finally{release?.();await bot.release();await page.close();}
}
await browser.close();
assert.deepEqual(failed,[]);
