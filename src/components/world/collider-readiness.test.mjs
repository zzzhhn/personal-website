import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Object3D } from 'three';
import { mountedCollidersReady, FIXED_TRIMESH } from './collider-readiness.ts';
import { worldActorArrival, arrivalColliderRequirements } from './world-actor-sites.ts';
import { holdWorldArrival, worldArrivalBlocked, activateReadyArrival } from './world-arrival-readiness.ts';
await R.init();

function fixture() {
  const world=new R.World({x:0,y:-9.81,z:0}),states=new Map();
  const mount=(name,mesh=true)=>{
    const body=world.createRigidBody(R.RigidBodyDesc.fixed());
    const desc=mesh?R.ColliderDesc.trimesh(new Float32Array([-4,0,-4,4,0,-4,-4,0,4,4,0,4]),new Uint32Array([0,2,1,1,2,3])):R.ColliderDesc.cuboid(1,.1,1);
    const collider=world.createCollider(desc,body),parent=new Object3D(),object=new Object3D();
    parent.name=name;parent.add(object);states.set(collider.handle,{object});
    return {body,collider,object,parent};
  };
  return {world,states,mount};
}

test('readiness requires every live fixed collider group, including shape and distinct handle counts',()=>{
  const f=fixture(),requirements=[{name:'floor',shape:FIXED_TRIMESH},{name:'walls',count:2}];
  try {
    assert.equal(mountedCollidersReady(f.world,f.states,requirements),false);
    const floor=f.mount('floor',false);f.mount('walls');
    assert.equal(mountedCollidersReady(f.world,f.states,requirements),false,'a box does not satisfy a required mesh');
    f.world.removeRigidBody(floor.body);const actual=f.mount('floor');
    assert.equal(mountedCollidersReady(f.world,f.states,requirements),false,'one wall handle is insufficient');
    f.mount('walls');assert.equal(mountedCollidersReady(f.world,f.states,requirements),true);
    actual.collider.setSensor(true);assert.equal(mountedCollidersReady(f.world,f.states,requirements),false);
    actual.collider.setSensor(false);actual.collider.setEnabled(false);assert.equal(mountedCollidersReady(f.world,f.states,requirements),false);
    actual.collider.setEnabled(true);actual.body.setBodyType(R.RigidBodyType.Dynamic,true);assert.equal(mountedCollidersReady(f.world,f.states,requirements),false);
    actual.body.setBodyType(R.RigidBodyType.Fixed,true);assert.equal(mountedCollidersReady(f.world,f.states,requirements),true);
    actual.body.setEnabled(false);assert.equal(mountedCollidersReady(f.world,f.states,requirements),false,'a disabled parent cannot support the actor');
    actual.body.setEnabled(true);assert.equal(mountedCollidersReady(f.world,f.states,requirements),true);
    f.world.removeRigidBody(actual.body);assert.equal(mountedCollidersReady(f.world,f.states,requirements),false,'a stale scene node is not a registered collider');
  } finally {f.world.free();}
});

test('every regular mainland entry waits for its base and venue colliders; unrelated groups cannot release loading',()=>{
  for(const start of ['camp','town','tent','factory','factory-raw','ibd','coaster','alpha','brain','exchange','club','club-dance']) {
    const f=fixture(),entry=worldActorArrival(`?start=${start}`,true);
    const release=holdWorldArrival(()=>!entry.collidersReady(f.world,f.states));
    try {
      assert.equal(entry.waitForColliders,true,start);assert.equal(worldArrivalBlocked(),true,start);
      f.mount('unrelated-loaded-model');assert.equal(worldArrivalBlocked(),true);
      const needs=arrivalColliderRequirements(start),handles=[];
      for(let i=0;i<needs.length;i++) {
        assert.equal(entry.collidersReady(f.world,f.states),false,`${start}: partial mount`);
        handles.push(f.mount(needs[i].name,needs[i].shape!==undefined));
      }
      assert.equal(entry.collidersReady(f.world,f.states),true,start);assert.equal(worldArrivalBlocked(),false);
      handles.at(-1).collider.setEnabled(false);assert.equal(worldArrivalBlocked(),true,'loss before activation restores the blocker');
    } finally {release();f.world.free();}
  }
});

test('rejected dev entry falls back to camp requirements and deliberate QA starts keep their bypass',()=>{
  const f=fixture();
  try {
    for(const need of arrivalColliderRequirements(null))f.mount(need.name);
    for(const start of ['factory-raw','factory-missing','club-dance','constructor']) {
      const entry=worldActorArrival(`?start=${start}`,false);
      assert.equal(entry.collidersReady(f.world,f.states),true,`${start}: camp fallback does not wait for a foreign venue`);
    }
    assert.equal(worldActorArrival('?start=wade&qa=1',true).waitForColliders,false);
    assert.equal(worldActorArrival('?start=brain-exit&qa=1',true).waitForColliders,false);
    assert.equal(worldActorArrival('?start=alpha-waterwheel&qa=1',true).waitForColliders,true);
    assert.equal(worldActorArrival('?start=wade&qa=1',false).waitForColliders,true);
  } finally {f.world.free();}
});

test('ordinary initial body stays disabled through cold physics steps and resumes only after both terrain groups mount',()=>{
  const f=fixture(),entry=worldActorArrival('',false);
  const body=f.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,2,0));
  f.world.createCollider(R.ColliderDesc.capsule(.3,.2),body);body.setEnabled(false);
  try {
    for(let i=0;i<120;i++) {
      assert.equal(activateReadyArrival(entry,f.world,f.states,R,body,-.7),null);
      f.world.step();
    }
    assert.deepEqual({...body.translation()},{x:0,y:2,z:0});assert.equal(body.isEnabled(),false);
    f.mount('island-terrain-surface-top');
    assert.equal(activateReadyArrival(entry,f.world,f.states,R,body,-.7),null);
    f.mount('island-terrain-solid-faces');
    assert.deepEqual(activateReadyArrival(entry,f.world,f.states,R,body,-.7),[0,2,0]);
    assert.equal(body.isEnabled(),true);
    for(let i=0;i<120;i++)f.world.step();
    assert.ok(body.translation().y>.45&&body.translation().y<.55,'normal gravity/contact resumes, without a permanent height lock');
  } finally {f.world.free();}
});
