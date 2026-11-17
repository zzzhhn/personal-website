import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Object3D } from 'three';
import { holdWorldArrival, worldArrivalBlocked, activatePlayerArrival } from './world-arrival-readiness.ts';
import { namedAlphaArrival, alphaTerrainColliderMounted } from './alpha-island/alpha-arrival.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { updateHeadSubmersion } from './safe-landing.ts';
import { worldActorArrival } from './world-actor-sites.ts';
await R.init();

function scene() {
  const world=new R.World({x:0,y:-12.5,z:0}), ground=namedAlphaArrival('alpha-waterwheel');
  const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(ground[0],ground[1]+PLAYER_CENTER_HEIGHT,ground[2]).setCanSleep(false));
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);
  body.setEnabled(false);
  return {world,body,ground};
}
function terrain(world) {
  const parent=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(235,0,190));
  const collider=world.createCollider(R.ColliderDesc.trimesh(new Float32Array([-39,24,6,-19,24,6,-39,24,26,-19,24,26]),new Uint32Array([0,2,1,1,2,3])),parent);
  const group=new Object3D();group.name='alpha-terrain-patch';const object=new Object3D();group.add(object);
  return {parent,collider,state:{object}};
}

test('only exact named Alpha arrivals use the initial support gate',()=>{
  assert.deepEqual(namedAlphaArrival('alpha-waterwheel'),[206,24,206]);
  assert.deepEqual(namedAlphaArrival('alpha-cave'),[220,24.12,155]);
  for(const key of [null,'camp','alpha','factory','constructor','toString'])assert.equal(namedAlphaArrival(key),null);
});

test('arrival blockers clean up idempotently across strict remounts and independent leases',()=>{
  const pending=()=>true,first=holdWorldArrival(pending),second=holdWorldArrival(pending);
  assert.equal(worldArrivalBlocked(),true);first();first();assert.equal(worldArrivalBlocked(),true);
  second();assert.equal(worldArrivalBlocked(),false);
  const remounted=holdWorldArrival(()=>true);assert.equal(worldArrivalBlocked(),true);remounted();assert.equal(worldArrivalBlocked(),false);
});

test('cold Alpha arrival cannot fall or enter rescue before its actual terrain collider mounts',()=>{
  const {world,body,ground}=scene(),states=new Map();
  const entry=worldActorArrival('?start=alpha-waterwheel',false);
  assert.deepEqual(entry.ground,ground);
  assert.equal(entry.collidersReady(world,states),false);
  const release=holdWorldArrival(()=>!entry.collidersReady(world,states));
  try {
    const original={...body.translation()};let wet=0,rescues=0;
    assert.equal(worldArrivalBlocked(),true);
    for(let frame=0;frame<300;frame++){
      assert.equal(activatePlayerArrival(world,R,body,ground,-.7),null);
      world.step();const p=body.translation(),submerged=updateHeadSubmersion(wet,1/60,p.y,-.7);wet=submerged.submergedSeconds;
      if(submerged.shouldRescue||p.y< -80)rescues++;
    }
    assert.deepEqual({...body.translation()},original);assert.equal(body.isEnabled(),false);assert.equal(rescues,0);
    const mounted=terrain(world);
    assert.equal(alphaTerrainColliderMounted(world,states),false,'asset/mesh availability alone is not collider registration');
    states.set(mounted.collider.handle,mounted.state);
    assert.equal(entry.collidersReady(world,states),true);
    assert.equal(alphaTerrainColliderMounted(world,states),true,'the real fixed Rapier trimesh is registered');
    assert.equal(worldArrivalBlocked(),false,'paused loading can finish without waiting for an enabled actor or Physics');
    assert.equal(activatePlayerArrival(world,R,body,ground,-.7),null,'spatial queries still wait for their first actual pipeline update');
    world.step();
    body.setLinvel({x:2,y:-30,z:1},true);body.setAngvel({x:1,y:2,z:3},true);
    let next=null;const setNext=body.setNextKinematicTranslation.bind(body);
    body.setNextKinematicTranslation=p=>{next={...p};setNext(p);};
    const landing=activatePlayerArrival(world,R,body,ground,-.7);
    assert.ok(landing);assert.equal(body.isEnabled(),true);
    assert.ok(Math.abs(landing[1]-24-PLAYER_CENTER_HEIGHT)<1e-5);
    assert.deepEqual(next,{x:landing[0],y:landing[1],z:landing[2]});
    for(const axis of ['x','y','z'])assert.ok(Math.abs(body.translation()[axis]-next[axis])<1e-5,'Rapier float32 translation matches the verified station');assert.deepEqual({...body.linvel()},{x:0,y:0,z:0});assert.deepEqual({...body.angvel()},{x:0,y:0,z:0});
    release();assert.equal(worldArrivalBlocked(),false);
    for(let frame=0;frame<90;frame++)world.step();
    assert.ok(body.translation().y>24.8&&body.translation().y<24.9,'normal dynamic contact runs after activation');
    world.removeRigidBody(mounted.parent);
    for(let frame=0;frame<90;frame++)world.step();
    assert.ok(body.translation().y<20,'the initial gate does not permanently force grounded or pin the player');
  } finally {release();world.free();}
});

test('terrain registration ignores sensors, dynamic objects and colliders outside the named patch',()=>{
  const {world,body}=scene(),states=new Map();
  try {
    const mounted=terrain(world);states.set(mounted.collider.handle,mounted.state);
    mounted.collider.setSensor(true);assert.equal(alphaTerrainColliderMounted(world,states),false);
    mounted.collider.setSensor(false);mounted.parent.setBodyType(R.RigidBodyType.Dynamic,true);assert.equal(alphaTerrainColliderMounted(world,states),false);
    mounted.parent.setBodyType(R.RigidBodyType.Fixed,true);mounted.state.object.parent.name='unrelated-mesh';assert.equal(alphaTerrainColliderMounted(world,states),false);
    world.removeRigidBody(mounted.parent);assert.equal(alphaTerrainColliderMounted(world,states),false);
    assert.equal(body.isEnabled(),false);
  } finally {world.free();}
});
