import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout.ts';
import { orbitDirection } from './actor-physics.ts';
import { cameraCollisionRadius, cameraLookTarget, sweepCamera } from './camera-collision.ts';
await R.init();
const radius=cameraCollisionRadius(.1,50,16/9),identity={x:0,y:0,z:0,w:1};
const player={x:57.05,y:6.36,z:-81.99};
const reported={x:57.0480825879763,y:6.96892865005,z:-81.98900796913836};
const solid=c=>!c.isSensor();
const endpoint=(from,dir,d)=>({x:from.x+dir[0]*d,y:from.y+dir[1]*d,z:from.z+dir[2]*d});
const sweep=(world,from,to)=>sweepCamera(world,R,from,to,radius,undefined,solid);
function overlaps(world,p){
  let hit=false;
  world.intersectionsWithShape(p,identity,new R.Ball(radius),()=>{hit=true;return false;});return hit;
}
function withExchange(run){
  const built=buildAlphaExchangeGeometry(),world=new R.World({x:0,y:0,z:0});
  try{
    for(const mesh of Object.values(built.colliders)){
      const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_EXCHANGE_ORIGIN));
      world.createCollider(R.ColliderDesc.trimesh(mesh.vertices,mesh.indices),body);
    }world.step();run(world);
  }finally{world.free();built.body.dispose();built.glass.dispose();}
}
function viewDirection(position,target,dir){
  const camera=new PerspectiveCamera(50,16/9,.1,600),aim=cameraLookTarget(position,target,dir);
  camera.position.copy(position);camera.lookAt(aim.x,aim.y,aim.z);
  assert.ok(camera.quaternion.toArray().every(Number.isFinite));
  return camera.getWorldDirection(new Vector3());
}

test('actual mezzanine contact is the clock beam outer edge, not an overlapping sweep start or an internal mesh edge',t=>withExchange(world=>{
  const desired={...player,y:player.y+.65},dir=orbitDirection(4.711,.455);
  assert.equal(overlaps(world,player),false);
  assert.equal(overlaps(world,desired),true,'the unconstrained head-height pivot reaches the clock beam');
  const pivot=sweep(world,player,desired);
  assert.equal(overlaps(world,pivot.position),false);
  assert.equal(overlaps(world,reported),false,'reported camera is clear, despite its near-zero orbit distance');
  const cast=(w,stop)=>w.castShape(reported,identity,{x:dir[0],y:dir[1],z:dir[2]},new R.Ball(radius),0,13.5,stop);
  const hit=cast(world,true),leaving=cast(world,false);
  assert.ok(hit.time_of_impact>.049&&hit.time_of_impact<.051);
  assert.ok(Math.abs(hit.time_of_impact-leaving.time_of_impact)<1e-6,'stopAtPenetration is not causing this contact');
  assert.ok(Math.abs(hit.witness1.x-57.2)<.001&&Math.abs(hit.witness1.y-7.15)<.001);
  // Production geometry: box([0,6.12,-27.12],[5.6,.22,.65]) under the clock.
  const beam=new R.World({x:0,y:0,z:0});
  try{
    beam.createCollider(R.ColliderDesc.cuboid(2.8,.11,.325).setTranslation(60,7.26,-82.12));beam.step();
    const primitive=cast(beam,true);
    assert.ok(Math.abs(hit.time_of_impact-primitive.time_of_impact)<.001,'one convex beam reproduces the production mesh edge');
  }finally{beam.free();}
  const orbit=sweep(world,reported,endpoint(reported,dir,13.5));
  assert.ok(orbit.distance<.001);assert.equal(overlaps(world,orbit.position),false);
  const facing=viewDirection(orbit.position,reported,dir);
  assert.ok(facing.dot(new Vector3(...dir).negate())>1-1e-10,'near-zero framing retains the requested orbit orientation');
  const closer={...reported,y:reported.y+.002},closed=sweep(world,closer,endpoint(closer,dir,13.5));
  assert.equal(overlaps(world,closer),false);
  assert.equal(closed.distance,0,'a legal pivot 2 mm higher exercises the actual zero-distance Rapier result');
  assert.ok(viewDirection(closed.position,closer,dir).dot(new Vector3(...dir).negate())>1-1e-10);
  t.diagnostic(`beam TOI=${hit.time_of_impact.toFixed(6)} m; legal orbit after margin=${orbit.distance.toFixed(6)} m; witness=${JSON.stringify(hit.witness1)}`);
}));

test('reported drag sequence remains collision-safe and keeps manual yaw/pitch when the orbit fully compresses',t=>withExchange(world=>{
  const desired=new Vector3(player.x,player.y+.65,player.z),target=desired.clone(),yaw0=Math.atan2(.8,.6);
  let actual=13.5,last,closed=0;
  for(let frame=0;frame<220;frame++){
    const yaw=frame<20?yaw0:frame<40?yaw0+117*.0055:yaw0+(117+571)*.0055;
    const pitch=frame<40?.125:.455,dir=orbitDirection(yaw,pitch);
    target.lerp(desired,1-Math.exp(-10/60));
    const pivot=sweep(world,player,target);target.copy(pivot.position);
    const orbit=sweep(world,target,endpoint(target,dir,13.5));
    actual=orbit.distance<actual?orbit.distance:actual+(orbit.distance-actual)*(1-Math.exp(-4/60));
    const position=endpoint(target,dir,actual),facing=viewDirection(position,target,dir);
    assert.equal(overlaps(world,target),false,`frame ${frame}: pivot`);
    assert.equal(overlaps(world,position),false,`frame ${frame}: camera`);
    if(frame>=40)assert.ok(position.y<7.15,'compressed camera never lifts through the beam or onto another storey');
    assert.ok(facing.dot(new Vector3(...dir).negate())>1-1e-10,`frame ${frame}: manual heading`);
    if(actual<.001)closed++;
    last={pivot:target.toArray(),distance:actual,position};
  }
  assert.ok(closed>100,'exercise the zero-distance state, not only the first sweep');
  assert.ok(last.distance<.001);
  t.diagnostic(`220 production-style frames; ${closed} near-zero frames; final ${JSON.stringify(last)}`);
}));

test('normal exterior and seated framing preserve their exact target, including seated compression',()=>withExchange(world=>{
  for(const sample of [
    {body:{x:40,y:1.97,z:-40},target:{x:40,y:2.62,z:-40},aim:{x:40,y:2.62,z:-40},dir:orbitDirection(Math.atan2(.8,.6),.455)},
    // Runtime seated sweep is cushion+.92, with its independent chest aim at cushion+.45.
    {body:{x:60,y:2.02,z:-70},target:{x:60,y:2.06,z:-70},aim:{x:60,y:1.59,z:-70},dir:orbitDirection(Math.PI/2,.455)},
  ]){
    const pivot=sweep(world,sample.body,sample.target),orbit=sweep(world,pivot.position,endpoint(pivot.position,sample.dir,5));
    assert.equal(overlaps(world,orbit.position),false);
    const aim=cameraLookTarget(orbit.position,sample.aim,sample.dir);
    assert.equal(aim,sample.aim,'ordinary exterior/seated framing is unchanged');
    const expected=new Vector3(sample.aim.x-orbit.position.x,sample.aim.y-orbit.position.y,sample.aim.z-orbit.position.z).normalize();
    assert.ok(viewDirection(orbit.position,sample.aim,sample.dir).dot(expected)>1-1e-10);
  }
  const chest={...reported,y:reported.y-.47},dir=orbitDirection(4.711,.455);
  assert.equal(cameraLookTarget(reported,chest,dir),chest,'compressed seated view still frames the chest');
  assert.ok(viewDirection(reported,reported,dir).dot(new Vector3(...dir).negate())>1-1e-10,'exact-zero lookAt is also deterministic');
}));
