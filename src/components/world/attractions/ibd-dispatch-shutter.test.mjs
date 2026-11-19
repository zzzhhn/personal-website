import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from '../actor-physics.ts';
import { collisionInventory } from '../world-collision-inventory.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdWorld } from './ibd-yard-layout.ts';
import { createIbdMotionClock,createIbdSafety,IBD_SAFETY_GAP,stepIbdSafeMotion } from './ibd-yard-safety.ts';
import { createIbdDispatchShutter,ibdDispatchShutterAt,ibdDispatchShutterEnvelope,
  IBD_DISPATCH_SHUTTER_FACE,IBD_DISPATCH_SHUTTER_ROOT,IBD_DISPATCH_SHUTTER_YAW } from './ibd-dispatch-shutter.ts';

await R.init();
const identity={x:0,y:0,z:0,w:1}, zero={x:0,y:0,z:0};
const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),IBD_DISPATCH_SHUTTER_YAW);
const capsule=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);

test('one active kinematic face matches the actual shutter and its rub strip through the full lift',t=>{
  const {geometry,contact}=createIbdDispatchShutter(), before=new R.World(zero), now=new R.World(zero);
  const material=new MeshBasicMaterial({side:DoubleSide}), draw=new Mesh(geometry,material), raycaster=new Raycaster();
  const body=now.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...ibdDispatchShutterAt(0)).setRotation(yaw));
  const priorBody=before.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ibdDispatchShutterAt(0)).setRotation(yaw));
  const prior=before.createCollider(R.ColliderDesc.cuboid(.065,1.5,4.4),priorBody);
  const physical=now.createCollider(R.ColliderDesc.trimesh(contact.vertices,contact.indices),body);
  const root=new Group(), scene=new Scene(), named=new Object3D();
  root.name=IBD_DISPATCH_SHUTTER_ROOT;scene.add(root);root.add(draw,named);named.name=contact.id;
  draw.userData={worldCollision:'solid',surfaceId:IBD_DISPATCH_SHUTTER_FACE};
  const registration=collisionInventory(scene,[draw],[named],[root.name]);
  assert.equal(registration.registrations[root.name],1);assert.deepEqual(registration.errors,[]);
  assert.ok(collisionInventory(scene,[draw],[],[root.name]).errors.length);
  assert.equal(geometry.index.count,contact.indices.length);
  const cast=(collider,from,direction,max)=>collider.castRay(new R.Ray(from,direction),max,false);
  const scan=(from,direction,max)=>{
    raycaster.set(from,direction);raycaster.far=max;
    const hit=cast(physical,from,direction,max), seen=raycaster.intersectObject(draw)[0];
    assert.equal(hit>=0,Boolean(seen));
    if(seen)assert.ok(Math.abs(seen.distance-hit)<.00002,`${from.toArray()}: ${seen.distance} vs ${hit}`);
    return hit<0?null:hit;
  };
  const groundY=[];
  try{
    for(let i=0;i<=32;i++){
      const [x,y,z]=ibdDispatchShutterAt(i/32);
      body.setNextKinematicTranslation({x,y,z});now.step();
      draw.position.set(x,y,z);draw.quaternion.copy(yaw);draw.updateMatrixWorld(true);
      const baseY=y+geometry.boundingBox.min.y;
      assert.ok(scan(new Vector3(6.3,baseY+.055,18.6),new Vector3(0,0,1),1.4)!==null);
      assert.equal(scan(new Vector3(6.3,baseY-.015,18.6),new Vector3(0,0,1),1.4),null);
      if(i%8===0)groundY.push(baseY);
    }
    const traverse=(world,y)=>world.castShape({x:7,y,z:18.25},identity,{x:0,y:0,z:2.5},capsule,0,1,false);
    assert.equal(traverse(now,.94),null,'fully lifted gate leaves a standing capsule clear');
    now.step();
    body.setTranslation({x:7,y:1.65,z:19.3},true);now.step();
    draw.position.set(...ibdDispatchShutterAt(0));draw.updateMatrixWorld(true);
    assert.ok(traverse(now,.94),'closed gate stops the same route');
    const close=[];
    for(const [from,dir] of [[[6.3,.095,18.6],[0,0,1]],[[6.3,3.07,18.6],[0,0,1]],[[7,1.65,20],[0,0,-1]]]){
      const a=new Vector3(...from),d=new Vector3(...dir),legacy=cast(prior,a,d,1.4),installed=scan(a,d,1.4);
      close.push({from,legacy:legacy<0?null:legacy,installed});
    }
    assert.equal(close[0].legacy,null);assert.ok(close[0].installed!==null);
    assert.ok(close[1].legacy!==null);assert.equal(close[1].installed,null);
    assert.ok(close[2].legacy-close[2].installed>.06);
    t.diagnostic(JSON.stringify({phases:groundY,closed:close,triangles:contact.indices.length/3}));
  }finally{before.free();now.free();geometry.dispose();material.dispose();}
});

test('the swept safety volume includes the real outer rub strip and resumes after a player retreats',t=>{
  const game=createIbdYardGame();game.pending={token:1,seconds:1.25,action:{kind:'release',station:'dispatch'}};
  const clock=createIbdMotionClock(), safety=createIbdSafety(R,game), envelope=ibdDispatchShutterEnvelope();
  const occupant=([x,y,z])=>{
    const [wx,wy,wz]=ibdWorld([x,y,z]);
    return {position:{x:wx,y:wy,z:wz},rotation:identity,velocity:zero,shape:capsule};
  };
  assert.ok(Math.abs(envelope.center[0]-(-.0325))<.00001);
  assert.ok(Math.abs(envelope.half[1]-1.485)<.00001);
  const nearStrip=occupant([7,.94,19.92]), clear=occupant([7,.94,20.35]);
  const [x,y,z]=ibdWorld(ibdDispatchShutterAt(0));
  const oldShape=new R.Cuboid(.065,1.5,4.4);
  assert.ok(!oldShape.contactShape({x,y,z},yaw,nearStrip.shape,nearStrip.position,nearStrip.rotation,IBD_SAFETY_GAP));
  assert.equal(safety.blocked(0,1,nearStrip),true,'previous box missed this location near the physical strip');
  assert.equal(safety.blocked(0,1,clear),false);
  const wait=stepIbdSafeMotion(clock,1.25,1/60,safety,nearStrip,true);
  assert.equal(wait.wait,'path-occupied');assert.equal(clock.elapsed,0);
  for(let i=0;i<100;i++){
    const r=stepIbdSafeMotion(clock,1.25,1/60,safety,clear,true);
    if(r.done) break;
  }
  assert.equal(clock.elapsed,1.25);
  t.diagnostic(JSON.stringify({bounds:envelope,wait:wait.wait,resumedY:ibdDispatchShutterAt(clock.elapsed/1.25)[1]}));
});
