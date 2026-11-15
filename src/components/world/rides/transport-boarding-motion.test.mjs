import test from 'node:test';
import assert from 'node:assert/strict';
import { TransportDriver } from './transport-driver.ts';
import { ALPHA_TRANSPORT_ROUTES, alphaFerryRoute } from '../alpha-island/transports/alpha-routes.ts';
import { transportWorld } from './transport-route.ts';
import R from '@dimforge/rapier3d-compat';
import { rideFootRouteClear } from './ride-clearance.ts';
await R.init();

const routes=[...ALPHA_TRANSPORT_ROUTES,alphaFerryRoute()];
const dt=1/60;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const delta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const heading=(a,b)=>Math.atan2(a[2]-b[2],b[0]-a[0]);
const worldPath=(route,index)=>route.terminals[index].boarding.map(p=>transportWorld(p,route.transform));
function stepFacing(driver){
  const before={phase:driver.phase,root:[...driver.frame.root],yaw:driver.frame.yaw};
  const sample=driver.step(dt,false),frame=driver.frame;
  if(['approach','walk-out'].includes(before.phase)){
    const moved=Math.hypot(frame.root[0]-before.root[0],frame.root[2]-before.root[2]);
    if(moved>1e-8){
      assert.ok(Math.abs(delta(frame.yaw,heading(before.root,frame.root)))<Math.PI/12,`${driver.id} ${before.phase} faces actual displacement`);
      assert.ok(Math.abs(delta(before.yaw,frame.yaw))<1e-5,`${driver.id} finishes turning before translating`);
    }else if(distance(before.root,frame.root)<1e-8&&['approach','walk-out'].includes(driver.phase)){
      assert.equal(frame.speed,0);
      assert.ok(Math.abs(delta(before.yaw,frame.yaw))<=Math.PI*dt+1e-8,'stationary turn has bounded angular speed');
    }
  }
  assert.ok(frame.root.every(Number.isFinite));assert.ok(Number.isFinite(frame.yaw));
  assert.deepEqual(frame.seat,sample.pose.seat);
  return before;
}
function run(driver,until,observe=()=>{}){
  for(let i=0;i<12000&&driver.phase!==until;i++){const before=stepFacing(driver);observe(before,driver.frame);}
  assert.equal(driver.phase,until,driver.id);
}

test('actual ferry, cable and sled terminals join forward from front and both side starts',()=>{
  for(const route of routes)for(const index of [0,1])for(const side of [0,-.25,.25]){
    const path=worldPath(route,index),a=path[0],b=path[1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    assert.ok(length>.01);
    const join=a.map((v,k)=>v+(b[k]-v)*.45),root=[join[0]-dz/length*side,join[1],join[2]+dx/length*side];
    const driver=new TransportDriver(route,index);driver.capture(root,heading(a,b)+Math.PI);
    assert.deepEqual(driver.boardingPath[0],root);
    assert.ok(distance(driver.boardingPath[1],side?join:b)<1e-6,`${route.id} ${index} joins current forward position`);
    assert.ok(!driver.boardingPath.slice(1).some(p=>distance(p,a)<1e-6),'does not return to the apron origin');
    let calls=0,movement=0,turns=0;
    driver.setMovementGuard((from,to)=>{calls++;assert.ok(distance(from,to)<=.2+1e-8,'guard receives every bounded walking step');return true;});
    run(driver,'riding',(before,frame)=>{
      if(before.phase==='approach'){
        const forward=(frame.root[0]-root[0])*dx+(frame.root[2]-root[2])*dz;
        // Only the initial joining leg is constrained by the apron direction.
        if(distance(frame.root,join)<.3)assert.ok(forward>=-1e-6,'initial joining leg never retreats');
        if(distance(before.root,frame.root)>1e-8)movement++;else if(Math.abs(delta(before.yaw,frame.yaw))>1e-6)turns++;
      }
    });
    assert.ok(calls>0&&movement>0&&turns>0);
  }
});

test('actual route starts near both interaction-radius edges and beyond the first segment join the remaining route',()=>{
  for(const route of routes)for(const index of [0,1])for(const later of [false,true])for(const side of [-1,1]){
    const path=worldPath(route,index),a=path[later?1:0],b=path[later?2:1],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
    const t=later?.4:Math.min(.4/length,.4),join=a.map((v,k)=>v+(b[k]-v)*t),offset=later?.25:1.8;
    const root=[join[0]-(b[2]-a[2])/length*offset*side,join[1],join[2]+(b[0]-a[0])/length*offset*side];
    if(!later)assert.ok(distance(root,path[0])<2.1,'inside actual interaction radius');
    const driver=new TransportDriver(route,index);driver.setMovementGuard(()=>true);driver.capture(root,heading(a,b)+2);
    assert.ok(distance(driver.boardingPath[1],join)<1e-6,`${route.id} later=${later} joins its nearest forward segment`);
    if(later)assert.ok(!driver.boardingPath.slice(1).some(p=>distance(p,path[0])<1e-6));
    run(driver,'riding');
  }
});

test('a real capsule obstruction on the nearest join selects a clear forward join; no safe join stays rejectable',()=>{
  const route=ALPHA_TRANSPORT_ROUTES[0],path=worldPath(route,0),a=path[0],b=path[1],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
  const point=distance=>a.map((v,k)=>v+(b[k]-v)*distance/length),join=point(.8),side=[-(b[2]-a[2])/length,0,(b[0]-a[0])/length],root=join.map((v,k)=>v+side[k]*1.8);
  const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,-100,0));
  world.createCollider(R.ColliderDesc.cuboid(.17,.9,.17).setTranslation(join[0]+side[0]*.9,join[1]+.9,join[2]+side[2]*.9));world.step();
  const guard=(from,to)=>rideFootRouteClear(world,R,body,[from,to]);assert.equal(guard(root,join),false);
  for(const late of [false,true]){
    const driver=new TransportDriver(route,0);if(!late)driver.setMovementGuard(guard);driver.capture(root,heading(a,b));if(late)driver.setMovementGuard(guard);
    assert.ok(distance(driver.boardingPath[1],join)>.2,'skips blocked nearest connection');
    assert.ok(rideFootRouteClear(world,R,body,driver.boardingPath),'whole remaining route is clear');run(driver,'riding');
  }
  const blocked=new TransportDriver(route,0);blocked.setMovementGuard(()=>false);blocked.capture(root,0);
  assert.ok(blocked.boardingPath.length>1,'retains rejected connection for caller whole-route precheck');
  assert.equal(rideFootRouteClear(world,R,body,blocked.boardingPath),false);
  blocked.step(dt,false);assert.equal(blocked.blockedMotion,true);assert.deepEqual(blocked.frame.root,root);blocked.requestExit();assert.equal(blocked.phase,'complete');
  world.free();
});

test('all actual multi-segment egress routes visit every corner and face each translating segment',()=>{
  for(const route of routes)for(const index of [0,1]){
    const driver=new TransportDriver(route,index),path=worldPath(route,index);driver.capture(path[0],heading(path[0],path[1]));
    run(driver,'sit');driver.requestExit();run(driver,'walk-out');
    const egress=driver.egressPath,visited=new Set([0]);let cornerTurns=0;
    run(driver,'complete',(before,frame)=>{
      egress.forEach((p,i)=>{if(distance(frame.root,p)<1e-6)visited.add(i);});
      if(before.phase==='walk-out'&&distance(before.root,frame.root)<1e-8&&Math.abs(delta(before.yaw,frame.yaw))>1e-6)cornerTurns++;
    });
    assert.equal(visited.size,egress.length,`${route.id} ${index} follows the whole exit, including corners`);
    assert.ok(cornerTurns>0,`${route.id} ${index} turns at its exit corners`);
    assert.deepEqual(driver.frame.root,transportWorld(route.terminals[index].safeExit,route.transform));
  }
});

test('guard rollback freezes progress, ferry feet and camera; removal resumes without replay or cancellation drift',()=>{
  const route=alphaFerryRoute(),driver=new TransportDriver(route,0),path=worldPath(route,0);driver.capture(path[0],heading(path[0],path[1]));
  for(let i=0;i<12;i++)stepFacing(driver);
  const before={root:[...driver.frame.root],yaw:driver.frame.yaw,elapsed:driver.elapsed,phase:driver.phase};
  driver.setMovementGuard(()=>false);
  for(let i=0;i<12;i++){
    const sample=driver.step(dt,false);assert.equal(driver.blockedMotion,true);
    assert.deepEqual(driver.frame.root,before.root);assert.equal(driver.frame.yaw,before.yaw);assert.equal(driver.elapsed,before.elapsed);assert.equal(driver.phase,before.phase);
    assert.equal(driver.frame.speed,0);assert.equal(driver.frame.clip,'Walk');assert.equal(driver.frame.footContactHold,true);assert.equal(driver.frame.footLowering,route.footLowering);
    assert.deepEqual(sample.pose.cameraTarget,[before.root[0],before.root[1]+.9,before.root[2]]);
  }
  const frozen=JSON.stringify(driver);driver.step(.1,true);assert.equal(JSON.stringify(driver),frozen);
  driver.setMovementGuard(()=>true);stepFacing(driver);assert.equal(driver.blockedMotion,false);assert.equal(driver.frame.footContactHold,undefined);assert.ok(distance(driver.frame.root,before.root)>0);
  const cancelled=[...driver.frame.root];driver.requestExit();assert.equal(driver.phase,'complete');assert.equal(driver.destination,0);
  for(let i=0;i<10;i++)driver.step(dt,false);
  assert.deepEqual(driver.frame.root,cancelled);assert.deepEqual(driver.safeExit,cancelled);
});

test('wrapped headings, repeated points and zero horizontal segments remain finite without sideways motion',()=>{
  const route=structuredClone(ALPHA_TRANSPORT_ROUTES[0]);route.transform={origin:[0,0,0],yaw:0};route.terminals[0].boarding=[[0,0,0],[0,0,0],[-2,0,.002],[-2,.2,.002],[-2,.2,.002],[-4,.2,-.002]];
  const driver=new TransportDriver(route,0);driver.capture([0,0,0],-Math.PI+.001);
  const yaw=driver.frame.yaw;stepFacing(driver);assert.ok(Math.abs(driver.frame.yaw-yaw)<.01,'wraps through the short turn');run(driver,'riding');
  const still=structuredClone(route);still.terminals[0].boarding=[[1,0,1],[1,0,1],[1,0,1]];
  const zero=new TransportDriver(still,0);zero.capture([1,0,1],2.8);run(zero,'riding');
});
