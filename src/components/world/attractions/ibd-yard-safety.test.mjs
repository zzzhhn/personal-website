import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createIbdSafety, createIbdMotionClock, stepIbdSafeMotion } from './ibd-yard-safety.ts';
import { ibdCargoPose, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import { createIbdYardGame, finishIbdYardAction } from './ibd-yard-game.ts';
import { ibdWorld } from './ibd-yard-layout.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';
await RAPIER.init();
const dt=1/60, identity={x:0,y:0,z:0,w:1}, zero={x:0,y:0,z:0};
function operation(kind='load',slot='parts-a') {
  const game=createIbdYardGame(); game.started=true; game.equipped=true;
  game.pending={token:1,seconds:3,action:{kind,slot,station:slot==='parts-a'?'load-a':'load-b'}};
  return game;
}
function capsule(local,velocity=zero) {
  const [x,y,z]=ibdWorld(local);
  return {shape:new RAPIER.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),position:{x,y,z},rotation:identity,velocity};
}
test('reported A lever position blocks before any motion; the reported outer B position stays clear',()=>{
  const game=operation(), safety=createIbdSafety(RAPIER,game), clock=createIbdMotionClock();
  const player=capsule([8.68,.9,-6.22]);
  for(let i=0;i<300;i++) assert.equal(stepIbdSafeMotion(clock,3,dt,safety,player,true).wait,'path-occupied');
  assert.equal(clock.elapsed,0); assert.equal(clock.started,false);
  assert.equal(createIbdSafety(RAPIER,operation('load','parts-b')).blocked(0,1,capsule([21.69,.9,-4.69])),false);
});
test('clearing the lane resumes without catch-up; pause and missing collider cannot advance or finish',()=>{
  const game=operation(), safety=createIbdSafety(RAPIER,game), clock=createIbdMotionClock();
  const unsafe=capsule([8.68,.9,-6.22]), safe=capsule([7,.9,-5.8]);
  for(let i=0;i<90;i++) stepIbdSafeMotion(clock,3,dt,safety,unsafe,true);
  const held=clock.elapsed;
  for(let i=0;i<90;i++) stepIbdSafeMotion(clock,3,dt,safety,safe,false);
  assert.equal(clock.elapsed,held);
  assert.equal(stepIbdSafeMotion(clock,3,dt,safety,null,true).wait,'player-unavailable');
  for(let i=0;i<300&&clock.elapsed<3;i++) {
    const before=clock.elapsed; stepIbdSafeMotion(clock,3,dt,safety,safe,true);
    assert.ok(clock.elapsed-before<=dt+1e-9);
  }
  assert.equal(clock.elapsed,3);
  const finished=finishIbdYardAction(game,1,{active:true,local:[7,.9,-5.8]});
  assert.deepEqual(finished.core.loaded,['parts-a']);
});
test('a player walking into an already running lane stops the actual Rapier cargo before it can push them',()=>{
  const game=operation(), safety=createIbdSafety(RAPIER,game), clock=createIbdMotionClock();
  const world=new RAPIER.World(zero); world.timestep=dt;
  const [px,py,pz]=ibdWorld([6,.9,0]);
  const player=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(px,py,pz).lockRotations().setCanSleep(false));
  const pc=world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0),player);
  const initial=ibdWorld(ibdCargoPose(game,'parts-a',0).at);
  const cargo=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...initial));
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.4,.55,1.3).setTranslation(0,.45,0).setFriction(.8),cargo);
  let blocked=false, heldPosition, heldCargo, heldTime, clearStarted=false;
  try {
    for(let i=0;i<420;i++) {
      if(!blocked) player.setLinvel({x:4,y:0,z:0},true);
      else if(i<130) player.setLinvel(zero,true);
      else { player.setLinvel({x:-4,y:0,z:0},true); clearStarted=true; }
      const result=stepIbdSafeMotion(clock,3,dt,safety,{shape:pc.shape,position:pc.translation(),rotation:pc.rotation(),velocity:player.linvel()},true);
      const at=ibdWorld(ibdPhysicalCargoPose(game,'parts-a',result.progress).at);
      cargo.setNextKinematicTranslation({x:at[0],y:at[1],z:at[2]});
      world.step();
      if(result.wait&&!blocked) {
        blocked=true; heldPosition=player.translation(); heldCargo=cargo.translation(); heldTime=clock.elapsed;
        player.setLinvel(zero,true);
      } else if(blocked&&!clearStarted) {
        assert.equal(clock.elapsed,heldTime);
        assert.ok(Math.hypot(player.translation().x-heldPosition.x,player.translation().z-heldPosition.z)<.015,'stationary player must not be carried');
        assert.ok(Math.hypot(cargo.translation().x-heldCargo.x,cargo.translation().z-heldCargo.z)<.015,'waiting cargo must stay put');
      }
      if(result.done) break;
    }
    assert.equal(blocked,true,'late entrant must trigger a stop'); assert.equal(clock.elapsed,3,'retreat allows completion');
    assert.ok(Math.abs(cargo.translation().z-ibdWorld([16,2,10.5])[2])<.001);
  } finally {world.free();}
});
test('rotation, raised cargo and gate queries use full 3D geometry rather than a flat radius',()=>{
  const turn=createIbdSafety(RAPIER,operation('turn','coil-front'));
  assert.equal(turn.blocked(0,1,capsule([-12,.9,-1.7])),true);
  assert.equal(turn.blocked(0,1,capsule([-8,.9,-3])),false);
  const crane=createIbdSafety(RAPIER,operation('crane','coil-front'));
  assert.equal(crane.blocked(0,1,capsule([-16,PLAYER_CENTER_HEIGHT,-4])),false,'the lifted coil clears a grounded capsule plus the safety gap between its pads');
  assert.equal(crane.blocked(0,1,capsule([-16,.91,-4])),true,'less than the safety gap below the coil blocks');
  assert.equal(crane.blocked(0,1,capsule([-16,3,-4])),true,'same x/z at coil height blocks');
  const gate=createIbdSafety(RAPIER,operation('release'));
  assert.equal(gate.blocked(0,1,capsule([7,.9,19.3])),true);
  assert.equal(gate.blocked(0,1,capsule([7,.9,16.8])),false);
});
test('replacement has two continuous bodies, with no physical sweep between quarantine and spare spawn',()=>{
  for(const slot of ['parts-a','coil-front']) {
    const game=operation('replace',slot);
    for(const incoming of [false,true]) {
      let prev=ibdPhysicalCargoPose(game,slot,0,incoming).at;
      for(let i=1;i<=300;i++) {
        const at=ibdPhysicalCargoPose(game,slot,i/300,incoming).at;
        assert.ok(Math.hypot(...at.map((n,j)=>n-prev[j]))<.7,`${slot} continuous ${incoming}`); prev=at;
      }
    }
    assert.deepEqual(ibdPhysicalCargoPose(game,slot,.5,false).at,ibdPhysicalCargoPose(game,slot,1,false).at);
    const spawn=ibdPhysicalCargoPose(game,slot,0,true).at;
    assert.equal(createIbdSafety(RAPIER,game).blocked(0,1,capsule([spawn[0],.9,spawn[2]])),true);
  }
});
test('blocked-path retries are bounded and stopping does not replace the pending action object',()=>{
  const game=operation(), pending=game.pending, real=createIbdSafety(RAPIER,game), clock=createIbdMotionClock();
  let calls=0; const safety={...real,blocked:()=>{calls++;return true;}};
  for(let i=0;i<600;i++) stepIbdSafeMotion(clock,3,dt,safety,capsule([8.68,.9,-6.22]),true);
  assert.ok(calls<=101,`${calls} retries in ten seconds`); assert.equal(game.pending,pending); assert.equal(clock.elapsed,0);
});
