import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorActivities } from './actor-activities.ts';
import { registerCampActivity } from './camp-actor-activity.ts';
import { campPropActor, campPropHand, startCampPropInteraction, cancelCampPropInteraction, currentCampPropInteraction } from './camp-prop-interactions.ts';
import { registerMineActivity } from './alpha-mine-activity.ts';
import { mineActor, resetMineSession } from './alpha-mine-state.ts';
import { useWorldStore } from './store.ts';

function fixture() {
  cancelCampPropInteraction();resetMineSession();
  useWorldStore.setState({paused:false,poolInspect:false,shot:null});
  const registry=createActorActivities(),dispose=registerCampActivity(registry);
  registry.sync({position:[0,1,0],yaw:0,grounded:true,available:true});
  let releases=0;
  const hold=(id='camp-tool')=>startCampPropInteraction({id,anchor:[0,1,0],release(){releases++;}});
  return {registry,dispose,hold,releases:()=>releases};
}

test('camp reserves the actor from other scenes without locking walking or its own commands',()=>{
  const f=fixture(),removeMine=registerMineActivity(f.registry);
  try {
    f.hold();f.registry.sync({available:true});
    assert.equal(campPropActor.available,true);assert.equal(mineActor.available,false);
    assert.equal(f.registry.busy(),false);assert.equal(f.registry.carrying(),false);
    assert.equal(f.registry.movementLocked(),false);
    assert.equal(f.registry.allowsInteraction('camp-tool-return'),true);
    f.registry.input(true);f.registry.advance(.2);f.registry.clearInput();
    assert.ok(currentCampPropInteraction());assert.equal(f.releases(),0);
    cancelCampPropInteraction();f.registry.sync({available:true});
    assert.equal(mineActor.available,true);
  } finally {removeMine();f.dispose();}
});

test('suitcase towing retains slack-based speed and disables sprint only while held',()=>{
  const f=fixture();
  try {
    f.hold('camp-prop-suitcase');campPropHand.mode='grip';
    for(const [distance,speed] of [[.4,2],[.56,1],[.7,0]]) {
      campPropHand.target=[distance,1,0];
      const rule=f.registry.locomotion();
      assert.ok(Math.abs(rule.speedLimit-speed)<1e-9);assert.equal(rule.sprintAllowed,false);
    }
    campPropHand.facing=[1,1,2];
    assert.deepEqual(f.registry.idleFacing(),[1,1,2]);
    f.registry.sync({position:[.3,1,0],yaw:1,grounded:false});
    assert.equal(campPropActor.yaw,1);assert.equal(campPropActor.grounded,false);
    assert.equal(f.registry.locomotion().speedLimit,2);
    f.registry.clearInput('owner-change');
    assert.deepEqual(f.registry.locomotion(),{speedLimit:Infinity,sprintAllowed:true});
    assert.equal(f.registry.idleFacing(),null);assert.equal(f.releases(),1);
  } finally {f.dispose();}
});

test('ride unavailability, recovery, pause and unmount each release the live body exactly once',()=>{
  for(const stop of [f=>f.registry.sync({available:false}),f=>f.registry.interrupt('recovery'),
    f=>{useWorldStore.setState({paused:true});f.registry.sync({available:true});},f=>f.dispose()]) {
    const f=fixture();f.hold();campPropHand.target=[0,1,0];campPropHand.palm=[0,1,0];
    stop(f);f.dispose();
    assert.equal(f.releases(),1);assert.equal(currentCampPropInteraction(),null);
    assert.equal(campPropActor.available,false);assert.equal(campPropHand.target,null);assert.equal(campPropHand.palm,null);
  }
});

test('generic movement constraints compose by the smallest valid cap and disappear with their registration',()=>{
  const f=fixture();
  const register=(id,state)=>f.registry.register({id,read:()=>({busy:false,carrying:false,...state}),
    sync(){},input(){},advance(){},command(){return false;},interrupt(){},dispose(){}});
  const a=register('slow',{speedLimit:1.2}),b=register('slower',{speedLimit:.7,sprintAllowed:false});
  const bad=register('invalid',{speedLimit:NaN,idleFacing:[NaN,0,0]});
  assert.deepEqual(f.registry.locomotion(),{speedLimit:.7,sprintAllowed:false});
  b();assert.deepEqual(f.registry.locomotion(),{speedLimit:1.2,sprintAllowed:true});
  assert.equal(f.registry.idleFacing(),null);
  a();bad();f.dispose();
});
