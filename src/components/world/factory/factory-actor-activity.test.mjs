import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorActivities, activityApproachMotion } from '../actor-activities.ts';
import { registerFactoryActivity } from './factory-actor-activity.ts';
import { registerMineActivity } from '../alpha-mine-activity.ts';
import { resetMineSession, useAlphaMineStore, mineActor } from '../alpha-mine-state.ts';
import { useWorldStore } from '../store.ts';
import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import { createFactoryGame, requestFactoryAction, finishFactoryAction } from './factory-game.ts';
import { FACTORY_STATIONS, FACTORY_DISPATCH_VIEWS, FACTORY_WORK_VIEWS, factoryWorld, factoryStation } from './factory-layout.ts';
import { factoryActor, factoryControl, factoryOperatorAt, useFactoryStore, closeFactoryStation, canOpenFactoryStation,
  openFactoryStation, startFactoryOperation, tickFactoryOperation } from './factory-store.ts';

function fixture(){
  closeFactoryStation();resetMineSession();
  useFactoryStore.setState({game:createFactoryGame('activity-test'),active:true,dispatchView:'dock'});
  useWorldStore.setState({paused:false,poolInspect:false,card:null,activeVehicle:null,seat:null,clubMode:null,shot:null});
  const registry=createActorActivities(),release=registerFactoryActivity(registry);
  const stand=(id,dx=0)=>{const p=factoryWorld(factoryStation(id).at);return [p[0]+dx,p[1]+PLAYER_CENTER_HEIGHT,p[2]];};
  const groundRoute=(_from,to)=>[to[0],to[1]+PLAYER_CENTER_HEIGHT,to[2]];
  const sync=(id='raw',dx=0,extra={})=>registry.sync({position:stand(id,dx),yaw:0,grounded:true,available:true,handsOccupied:false,mode:'guide',groundRoute,...extra});
  sync();return {registry,release,stand,sync};
}

test('all factory workstations provide live input ownership, the original approach speed and a finite camera',()=>{
  const f=fixture();
  try{
    for(const station of FACTORY_STATIONS){
      closeFactoryStation();f.sync(station.id,.6);assert.equal(canOpenFactoryStation(station.id),true);
      assert.equal(openFactoryStation(station.id),true);f.sync(station.id,.6);
      assert.equal(factoryActor.available,true,'workstation occupation must not disable its own operator');
      assert.equal(f.registry.inputOwner(),`factory:${station.id}`);
      assert.equal(factoryOperatorAt(station.id),false,'operations stay disabled during approach');
      const stance=f.registry.approach(),motion=activityApproachMotion(f.stand(station.id,.6),stance);
      assert.equal(motion.vx,-1.4);assert.equal(stance.yaw,station.yaw-Math.PI/2);
      const view=f.registry.camera();assert.equal(view.fov,50);assert.equal(view.smoothing,6);assert.equal(view.priority,30);
      f.sync(station.id);assert.equal(factoryOperatorAt(station.id),true);
      assert.ok([...view.target,...view.eye].every(Number.isFinite));
    }
    closeFactoryStation();assert.equal(f.registry.inputOwner(),null);assert.equal(f.registry.camera(),null);
  }finally{f.release();}
});

test('dispatch camera follows printer selection and crafted machine views retain their authored framing',()=>{
  const f=fixture();
  try{
    f.sync('frame');openFactoryStation('frame');
    assert.deepEqual(f.registry.camera().target,factoryWorld(FACTORY_WORK_VIEWS.frame.target));
    assert.deepEqual(f.registry.camera().eye,factoryWorld(FACTORY_WORK_VIEWS.frame.eye));
    closeFactoryStation();f.sync('release');openFactoryStation('release');
    for(const dispatchView of ['dock','printer']){
      useFactoryStore.setState({dispatchView});const view=f.registry.camera();
      assert.deepEqual(view.target,factoryWorld(FACTORY_DISPATCH_VIEWS[dispatchView].target));
      assert.deepEqual(view.eye,factoryWorld(FACTORY_DISPATCH_VIEWS[dispatchView].eye));
    }
  }finally{f.release();}
});

test('opening and operation commits recheck actor ownership, support and active scene state',()=>{
  const f=fixture(),releaseMine=registerMineActivity(f.registry);
  try{
    useAlphaMineStore.setState({carried:'REVERSAL_5'});f.sync();
    assert.equal(canOpenFactoryStation('raw'),false);assert.equal(openFactoryStation('raw'),false);
    useAlphaMineStore.setState({carried:null});f.sync('raw',0,{handsOccupied:true});assert.equal(openFactoryStation('raw'),false);
    f.sync('raw',0,{grounded:false});assert.equal(openFactoryStation('raw'),false);
    f.sync();assert.equal(openFactoryStation('raw'),true);f.sync();assert.equal(mineActor.available,false);
    f.sync('raw',0,{grounded:false});assert.equal(startFactoryOperation({type:'extract',module:'frame'}),false);
    f.sync();assert.equal(startFactoryOperation({type:'extract',module:'frame'}),true);
    useFactoryStore.setState({active:false});f.sync();assert.equal(factoryActor.available,false);
    assert.equal(useWorldStore.getState().factoryStation,null);assert.equal(useFactoryStore.getState().game.pending,null);
    assert.equal(openFactoryStation('raw'),false);
  }finally{releaseMine();f.release();resetMineSession();}
});

test('registry input reset clears controls, owns no production clock and recovery cancels only pending work',()=>{
  const f=fixture();
  try{
    const previous=requestFactoryAction(useFactoryStore.getState().game,{type:'extract',module:'wheels'});
    useFactoryStore.setState({game:finishFactoryAction(previous,previous.pending)});
    openFactoryStation('raw');f.sync();assert.equal(startFactoryOperation({type:'extract',module:'frame'}),true);
    const operation=factoryControl.operation,game=useFactoryStore.getState().game;
    Object.assign(factoryControl.input,{x:1,z:-1,held:true,confirm:true});
    const before=structuredClone(operation);f.registry.advance(1);assert.deepEqual(operation,before);
    f.registry.clearInput();assert.deepEqual(factoryControl.input,{x:0,z:0,held:false,confirm:false});
    f.registry.interrupt('motion');assert.equal(factoryControl.operation,operation);
    f.registry.interrupt('recovery');
    assert.equal(useWorldStore.getState().factoryStation,null);assert.equal(factoryControl.operation,null);
    const recovered=useFactoryStore.getState().game;assert.equal(recovered.pending,null);
    assert.deepEqual(recovered.materials,game.materials);
    assert.equal(recovered.materials.wheels.status,'extracted');assert.equal(recovered.materials.frame.status,'source');
    tickFactoryOperation(1);assert.equal(useFactoryStore.getState().game,recovered);
  }finally{f.release();}
});

test('blocked stance or unmount exits its console and releases the generic camera and input owner',()=>{
  const f=fixture();
  openFactoryStation('raw');f.registry.interrupt('blocked');assert.equal(f.registry.inputOwner(),null);
  f.sync();openFactoryStation('raw');assert.equal(startFactoryOperation({type:'extract',module:'frame'}),true);
  f.release();assert.equal(f.registry.inputOwner(),null);assert.equal(f.registry.camera(),null);
  assert.equal(factoryActor.available,false);assert.equal(factoryControl.operation,null);
  assert.equal(useFactoryStore.getState().game.pending,null);
});
