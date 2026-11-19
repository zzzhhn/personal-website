import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { createAttractionActorRide } from './actor-ride-adapter.ts';
import { attractionRide, beginAttractionRide, beginDrivenAttractionRide, updateAttractionRide } from './attraction-ride.ts';
import { COASTER_BOARDING, advanceCoasterTransition, returnCoasterToStation } from './coaster-transition.ts';
import { coasterRidePose } from './coaster-track.ts';
import { TransportDriver } from '../rides/transport-driver.ts';
import { transportWorld } from '../rides/transport-route.ts';
import { rideFootRouteClear } from '../rides/ride-clearance.ts';

const port=createAttractionActorRide((p,driven)=>p[0]>200?'alpha':driven?'shore':'coaster');
const ready={at:()=>true,allows:()=>true};
const makeRoute=kind=>({id:`port-${kind}`,kind,transform:{origin:[50,2,-80],yaw:.7},
  path:[[0,0,0],[10,5,0],[20,0,0]],duration:2,
  terminals:[0,20].map((x,i)=>({id:String(i),vehicle:[x,0,0],yaw:0,
    boarding:[[x,0,-3],[x+.6,0,0]],safeExit:[x,0,-4],seat:[0,.48,0],clearance:[3,3,4]}))});
function driveTo(driver,phase) {
  for(let i=0;i<10000&&driver.phase!==phase;i++)updateAttractionRide(driver.step(1/60,false).pose);
  assert.equal(driver.phase,phase);
}

test('legacy coaster capture, all phases and finish are exposed without a transport driver',()=>{
  port.cancel();
  try {
    const pose=coasterRidePose(0,'chase'),from=[...COASTER_BOARDING.approach];
    const revision=port.revision;
    assert.equal(beginAttractionRide(pose,COASTER_BOARDING.exit,from,0),true);
    assert.equal(port.revision,revision+1);assert.equal(port.active,true);assert.equal(port.seatOnly,false);
    port.capture(from,.4,ready);assert.deepEqual(port.actor.root,from);assert.equal(port.actor.yaw,.4);
    port.capture([0,0,0],0,ready);assert.deepEqual(port.actor.root,from);
    assert.deepEqual(port.boardingPath,[from,COASTER_BOARDING.approach]);assert.equal(port.egressPath,undefined);
    assert.equal(port.zone([0,0,0]),'coaster');assert.equal(port.zone([235,0,190]),'alpha');
    port.viewBlocked();assert.equal(attractionRide.transition.exitRequested,false);
    const phases=new Set();
    for(let i=0;i<6000&&!port.complete;i++) {
      if(attractionRide.transition.phase==='riding')returnCoasterToStation(attractionRide.transition);
      advanceCoasterTransition(attractionRide.transition,1/60,false,pose);
      phases.add(port.lifecycle.split(':')[1]);
      assert.equal(port.actor.groundId,'coaster-boarding');
    }
    assert.equal(port.complete,true);assert.ok(phases.has('step-in'));assert.ok(phases.has('step-out'));
    assert.deepEqual(port.actor.root,COASTER_BOARDING.exit);
    port.finish();assert.equal(port.active,false);assert.equal(attractionRide.completed,true);
  } finally {port.cancel();}
});

test('the captured coaster apron can be checked against a new obstruction before boarding', async ()=>{
  await R.init();
  const world=new R.World({x:0,y:-9.81,z:0}), from=COASTER_BOARDING.exit;
  port.cancel();
  try {
    beginAttractionRide(coasterRidePose(0,'chase'),COASTER_BOARDING.exit,from);
    port.capture(from,0,ready);
    const path=port.boardingPath;
    assert.deepEqual(path,[from,COASTER_BOARDING.approach]);
    const player=world.createRigidBody(R.RigidBodyDesc.dynamic());
    for(const step of COASTER_BOARDING.stairs)world.createCollider(R.ColliderDesc.cuboid(...step.size.map(v=>v/2))
      .setTranslation(...step.position).setRotation({x:0,y:Math.sin(step.yaw/2),z:0,w:Math.cos(step.yaw/2)}));
    world.step();
    assert.equal(rideFootRouteClear(world,R,player,path),true,'the standing apron clears the actual first riser');
    const obstacle=world.createCollider(R.ColliderDesc.cuboid(.13,.72,.13).setTranslation(
      (path[0][0]+path[1][0])*.5,from[1]+.75,(path[0][2]+path[1][2])*.5));
    world.step();
    assert.equal(rideFootRouteClear(world,R,player,path),false);
    world.removeCollider(obstacle,false);world.step();
    assert.equal(rideFootRouteClear(world,R,player,path),true);
  }finally{port.cancel();world.free();}
});

test('boarding sees live obstacles while a disabled rider may still be in the query broad phase', async () => {
  await R.init();
  const world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    const rider = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(55, 1.899, -152.4));
    const capsule = world.createCollider(R.ColliderDesc.capsule(.48, .34), rider);
    const path = [[55, 1.079, -152.4], [54.8, 1.08, -152.36]];
    world.step();
    assert.equal(rideFootRouteClear(world, R, undefined, path), false);
    rider.setEnabled(false);
    assert.ok(capsule.isEnabled(), 'the body can be disabled before its shape');
    assert.equal(rideFootRouteClear(world, R, undefined, path), true);
    world.step();
    assert.equal(capsule.isEnabled(), false);
    assert.equal(rideFootRouteClear(world, R, undefined, path), true);
    const obstacle = world.createCollider(R.ColliderDesc.cuboid(.1, .4, .3).setTranslation(54.45, 1.9, -152.4));
    world.step();
    assert.equal(rideFootRouteClear(world, R, undefined, path), false);
    obstacle.setEnabled(false);
    assert.equal(rideFootRouteClear(world, R, undefined, path), true);
    obstacle.setEnabled(true);
    world.step();
    assert.equal(rideFootRouteClear(world, R, undefined, path), false);
  } finally { world.free(); }
});

test('coaster exit request is retained during boarding and standalone seat presentation remains supported',()=>{
  port.cancel();
  try {
    const pose=coasterRidePose(0,'chase');
    beginAttractionRide(pose,COASTER_BOARDING.exit,COASTER_BOARDING.approach);
    port.requestExit();assert.equal(attractionRide.transition.exitRequested,true);
    port.cancel();assert.equal(port.actor,null);
    beginAttractionRide(pose,COASTER_BOARDING.exit);
    assert.equal(port.seatOnly,true);assert.equal(port.actor,null);assert.equal(port.pose,pose);
    assert.equal(port.complete,false);port.cancel();assert.equal(port.active,false);
  } finally {port.cancel();}
});

test('cable, ferry and sled keep live poses, guarded egress and destination ownership in both directions',()=>{
  for(const kind of ['cable','ferry','sled'])for(const source of [0,1]) {
    port.cancel();let released=0,guardCalls=0;
    const route=makeRoute(kind),driver=new TransportDriver(route,source,()=>released++);
    try {
      assert.equal(beginDrivenAttractionRide(driver,driver.sample().pose,driver.safeExit),true);
      port.setMovementGuard(()=>{guardCalls++;return true;});
      const foot=transportWorld(route.terminals[source].boarding[0],route.transform);
      port.capture(foot,.3,ready);assert.deepEqual(port.actor.root,foot);
      assert.ok(port.boardingPath.length>1);assert.ok(guardCalls>0);assert.equal(port.seatOnly,false);
      assert.equal(port.zone([0,0,0]),'shore');assert.equal(port.egressPath,undefined);
      driveTo(driver,'riding');assert.equal(port.egressPath,undefined);
      driveTo(driver,'stand');assert.deepEqual(port.egressPath,driver.egressPath);
      const before=structuredClone(port.actor);
      port.setExitBlocked(true);
      for(let i=0;i<180;i++)updateAttractionRide(driver.step(1/60,false).pose);
      assert.equal(driver.phase,'stand');assert.deepEqual(port.actor.root,before.root);
      assert.equal(port.actor.speed,0);assert.equal(port.actor.clip,'StandUp');
      // The established driver lets standing finish in place while the exit remains blocked.
      assert.equal(port.actor.clipPhase,1);assert.equal(port.actor.seatWeight,0);
      port.setExitBlocked(false);driveTo(driver,'complete');
      assert.equal(port.complete,true);assert.equal(port.egressPath,undefined);
      assert.deepEqual(port.actor.root,driver.safeExit);assert.deepEqual(port.pose.seat,driver.sample().pose.seat);
      assert.deepEqual(port.pose.cameraTarget,[driver.safeExit[0],driver.safeExit[1]+.9,driver.safeExit[2]]);
      port.finish();port.finish();assert.equal(released,1);assert.equal(port.active,false);
    } finally {port.cancel();}
  }
});

test('passage denial holds an occupied transport and view failure requests its own exit policy',()=>{
  port.cancel();let released=0,open=true;
  const driver=new TransportDriver(makeRoute('ferry'),0,()=>released++);
  try {
    beginDrivenAttractionRide(driver,driver.sample().pose,driver.safeExit);
    port.capture(driver.frame.root,0,{at:()=>open,allows:()=>open});
    driveTo(driver,'riding');const u=driver.u;open=false;
    for(let i=0;i<60;i++)driver.step(1/60,false);
    assert.equal(driver.u,u);assert.equal(port.active,true);
    port.viewBlocked();assert.equal(driver.exitRequested,true);assert.equal(driver.destination,0);
    port.cancel();port.cancel();assert.equal(released,1);assert.equal(port.active,false);assert.equal(port.actor,null);
  } finally {port.cancel();}
});
