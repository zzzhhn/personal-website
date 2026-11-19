import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Object3D } from 'three';
import { holdWorldArrival, worldArrivalBlocked, worldArrivalFailed, activatePlayerArrival } from './world-arrival-readiness.ts';
import { namedAlphaArrival } from './alpha-island/alpha-arrival.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { findSafeSeatExit, updateHeadSubmersion } from './safe-landing.ts';
import { worldActorArrival, arrivalColliderRequirements, worldActorSites } from './world-actor-sites.ts';
import { reportRegionLoadFailure } from './region-load-failure.ts';
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
  assert.deepEqual(namedAlphaArrival('alpha-cave'),[219,23.69,156]);
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
    assert.equal(entry.collidersReady(world,states),false,'asset/mesh availability alone is not collider registration');
    states.set(mounted.collider.handle,mounted.state);
    assert.equal(entry.collidersReady(world,states),false,'waterwheel structure has its own readiness gate');
    for(const requirement of arrivalColliderRequirements('alpha-waterwheel'))for(let i=0;i<(requirement.count??1)-(requirement.name==='alpha-terrain-patch'?1:0);i++) {
      const parent=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(1000+i,0,1000));
      const collider=world.createCollider(R.ColliderDesc.trimesh(new Float32Array([0,0,0,1,0,0,0,0,1]),new Uint32Array([0,2,1])),parent);
      const group=new Object3D(),object=new Object3D();group.name=requirement.name;group.add(object);states.set(collider.handle,{object});
    }
    assert.equal(entry.collidersReady(world,states),true);
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

test('Alpha arrival and regional passage require both fixed terrain parts on their live physics parents', () => {
  const {world,body}=scene(), states=new Map();
  const entry=worldActorArrival('?start=alpha-shallows',false), passage=worldActorSites.passage(world,states);
  const install = name => {
    const mounted=terrain(world);
    mounted.state.object.parent.name=name;
    states.set(mounted.collider.handle,mounted.state);
    return mounted;
  };
  try {
    for(const requirement of arrivalColliderRequirements(null))install(requirement.name);
    install('alpha-terrain-patch');
    assert.equal(entry.collidersReady(world,states),false);
    assert.equal(passage.at(entry.position),false);
    const last=install('alpha-terrain-patch');
    assert.equal(entry.collidersReady(world,states),true);
    assert.equal(passage.at(entry.position),true);
    last.collider.setSensor(true);
    assert.equal(entry.collidersReady(world,states),false);
    assert.equal(passage.at(entry.position),false);
    last.collider.setSensor(false);
    last.parent.setBodyType(R.RigidBodyType.Dynamic,true);
    assert.equal(entry.collidersReady(world,states),false);
    last.parent.setBodyType(R.RigidBodyType.Fixed,true);
    world.removeRigidBody(last.parent);
    assert.equal(entry.collidersReady(world,states),false);
    assert.equal(body.isEnabled(),false);
  } finally {world.free();}
});

test('only a failed active arrival is diagnosed; a stale failure is dropped on remount', () => {
  const cave = worldActorArrival('?start=alpha-cave', false);
  const camp = worldActorArrival('', false);
  const ready = { cave: false, camp: false };
  const holdCave = holdWorldArrival(() => !ready.cave, cave.loadFailed);
  const holdCamp = holdWorldArrival(() => !ready.camp, camp.loadFailed);
  const other = reportRegionLoadFailure('alpha-waterwheel');
  const first = reportRegionLoadFailure('alpha-cave');
  const second = reportRegionLoadFailure('alpha-cave');
  try {
    assert.equal(worldArrivalFailed(), true);
    first(); first();
    assert.equal(worldArrivalFailed(), true, 'first scene cleanup leaves its replacement failure');
    second();
    assert.equal(worldArrivalFailed(), false, 'another site failure does not interrupt this arrival');
    assert.equal(worldArrivalBlocked(), true, 'an unmounted scene can still be preparing');
    ready.cave = ready.camp = true;
    assert.equal(worldArrivalBlocked(), false);
  } finally { first(); second(); other(); holdCamp(); holdCave(); }
});

test('a seated capsule only exits onto clear dry support in an admitted region', () => {
  const { world, body } = scene();
  const seat = [206, 24.46, 206], approach = [205.25, 24 + PLAYER_CENTER_HEIGHT, 206];
  const position = { ...body.translation() };
  const exit = (ready = () => true) => findSafeSeatExit(world, R, body, seat, 0, approach, -.7, ready);
  try {
    let floor = terrain(world);
    world.step();
    const first = exit();
    assert.ok(first.landing[0] > 206.6 && first.waiting === null);
    const alternate = exit(p => p[0] < 206.4);
    assert.ok(alternate.landing[0] < 206.4 && alternate.waiting === null);
    const obstacle = world.createCollider(R.ColliderDesc.cuboid(2, 1.5, 2).setTranslation(206, 25, 206));
    world.step();
    assert.deepEqual(exit(), { landing: null, waiting: null });
    world.removeCollider(obstacle, true);
    world.removeRigidBody(floor.parent);
    world.step();
    const unloaded = exit(() => floor.collider.isValid());
    assert.equal(unloaded.landing, null);
    assert.ok(unloaded.waiting);
    assert.deepEqual(exit(), { landing: null, waiting: null }, 'an empty old approach position is not support');
    floor = terrain(world);
    world.step();
    assert.deepEqual(exit(() => floor.collider.isValid()), first);
    assert.deepEqual({ ...body.translation() }, position);
    assert.equal(body.isEnabled(), false);
  } finally { world.free(); }
});

test('a raised seat prefers the walk-in level over a lower floor below its front', () => {
  const world = new R.World({ x: 0, y: -12.5, z: 0 });
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), body);
  body.setEnabled(false);
  try {
    world.createCollider(R.ColliderDesc.cuboid(3, .1, 3).setTranslation(0, -.1, 0));
    world.createCollider(R.ColliderDesc.cuboid(.8, .06, .8).setTranslation(-.9, .44, 0));
    world.step();
    const standing = findSafeSeatExit(world, R, body, [0, .75, 0], 0,
      [-.9, .5 + PLAYER_HALF_HEIGHT + PLAYER_RADIUS, 0], -.7, () => true);
    assert.ok(standing.landing && standing.landing[0] < 0);
    assert.ok(Math.abs(standing.landing[1] - (.5 + PLAYER_HALF_HEIGHT + PLAYER_RADIUS + .01)) < 1e-6);
    assert.equal(body.isEnabled(), false);
  } finally { world.free(); }
});
