import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorActivities, activityApproachMotion } from './actor-activities.ts';
import { registerMineActivity } from './alpha-mine-activity.ts';
import { beginMineAction, mineActor, mineVisualSockets, resetMineSession, useAlphaMineStore } from './alpha-mine-state.ts';

const idle=()=>({busy:false,carrying:false});
const activity=(id,patch={})=>({id,read:idle,sync(){},input(){},advance(){},command(){return false;},interrupt(){},dispose(){},...patch});

test('an empty core has no venue policy; live registrations supply restrictions and input handling',()=>{
  const registry=createActorActivities();
  assert.equal(registry.busy(),false);assert.equal(registry.carrying(),false);
  assert.equal(registry.allowsInteraction('any-item'),true);assert.equal(registry.command('put-down'),false);
  let carrying=false,commands=0;
  const release=registry.register(activity('sample',{
    read:()=>({busy:!carrying,carrying,facing:[1,2,3],allowsInteraction:id=>!carrying||id==='owned-item'}),
    command:()=>{commands++;carrying=false;return true;},
  }));
  assert.equal(registry.busy(),true);assert.deepEqual(registry.facing(),[1,2,3]);
  carrying=true;assert.equal(registry.carrying(),true);assert.equal(registry.busy(),false);
  assert.equal(registry.facing(),null);assert.equal(registry.allowsInteraction('foreign-item'),false);
  assert.equal(registry.allowsInteraction('owned-item'),true);assert.equal(registry.command('put-down'),true);assert.equal(commands,1);
  release();assert.equal(registry.allowsInteraction('foreign-item'),true);
});

test('an old cleanup cannot unregister a newer lease even when the same adapter object is reused',()=>{
  const registry=createActorActivities();let disposed=0,ticks=0;
  const entry=activity('owner',{dispose:()=>disposed++,advance:()=>ticks++});
  const old=registry.register(entry),current=registry.register(entry);
  assert.equal(disposed,1);old();registry.advance(1/60);
  assert.equal(ticks,1);assert.equal(disposed,1);
  current();current();registry.advance(1/60);assert.equal(ticks,1);assert.equal(disposed,2);
});

test('unregistered actions cannot receive a later tick from the same frame snapshot',()=>{
  const registry=createActorActivities();let second=0,removeSecond;
  registry.register(activity('first',{advance:()=>removeSecond()}));
  removeSecond=registry.register(activity('second',{advance:()=>second++}));
  registry.advance(1/60);assert.equal(second,0);
});

test('pose updates are isolated between regions and invalid time/coordinates are inert',()=>{
  const registry=createActorActivities();const received=[];let ticks=0;
  registry.register(activity('first',{sync:p=>{if(p.position)p.position[0]=999;},advance:()=>ticks++}));
  registry.register(activity('second',{sync:p=>received.push(p)}));
  const position=[1,2,3];registry.sync({position,yaw:1,grounded:true,available:true});
  assert.deepEqual(position,[1,2,3]);assert.deepEqual(received[0].position,[1,2,3]);
  registry.sync({position:[NaN,2,3]});registry.sync({yaw:Infinity});assert.equal(received.length,1);
  for(const dt of [NaN,Infinity,-1,0])registry.advance(dt);assert.equal(ticks,0);
});

test('occupation excludes the current owner and is stable across cancellation during a sync',()=>{
  const registry=createActorActivities(),seen=[];let busy=true;
  registry.register(activity('owner',{read:()=>({busy,carrying:false}),sync:(pose,context)=>{seen.push(['owner',context.occupiedElsewhere]);busy=false;}}));
  registry.register(activity('other',{sync:(pose,context)=>seen.push(['other',context.occupiedElsewhere])}));
  registry.sync({available:true});assert.deepEqual(seen,[['owner',false],['other',true]]);
  seen.length=0;registry.sync({available:true});assert.deepEqual(seen,[['owner',false],['other',false]]);
});

test('stance motion walks toward the anchor then settles to its authored heading without division by zero',()=>{
  const stance={stand:[0,0,0],yaw:Math.PI/2,moving:true,stopDistance:.04};
  const far=activityApproachMotion([1,1,0],stance);
  assert.equal(far.vx,-1.5);assert.equal(Math.abs(far.vz),0);assert.equal(far.moving,true);
  const near=activityApproachMotion([.1,1,0],stance);assert.equal(near.yaw,Math.PI/2);assert.equal(near.vx,-.4);
  const stopped=activityApproachMotion([.02,1,0],stance);assert.equal(stopped.vx,0);assert.equal(stopped.moving,false);
  assert.equal(activityApproachMotion([0,1,0],{...stance,stopDistance:0}).vx,0);
  assert.equal(activityApproachMotion([1,1,0],{...stance,moving:false}).vx,0);
  assert.equal(activityApproachMotion([NaN,1,0],stance),null);
  assert.equal(activityApproachMotion([1,1,0],{...stance,yaw:Infinity}),null);
});

function mineScene(){
  resetMineSession();Object.assign(mineActor,{moving:false,available:false,grounded:false,restTarget:null});
  const registry=createActorActivities(),release=registerMineActivity(registry);
  registry.sync({position:[0,0,0],yaw:0,grounded:true,available:true});
  const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)registry.advance(1/60);};
  return {registry,release,advance};
}

test('registered mine adapter completes actions, supplies facing and cancels movement without core venue state access',()=>{
  const {registry,release,advance}=mineScene();
  try{
    assert.ok(beginMineAction('equip',[1,0,0]));assert.equal(registry.busy(),true);assert.deepEqual(registry.facing(),[1,0,0]);
    advance(1);assert.equal(useAlphaMineStore.getState().equipped,true);assert.equal(registry.busy(),false);
    assert.ok(beginMineAction('scan',[1,0,0],'REVERSAL_5'));advance(1.2);
    assert.ok(beginMineAction('strike',[1,0,0],'REVERSAL_5'));registry.input(true);advance(2);
    assert.equal(useAlphaMineStore.getState().action,null);assert.equal(useAlphaMineStore.getState().veins.REVERSAL_5.hits,0);
  }finally{release();}
});

test('mine-owned carry restrictions and put-down preserve ore through a registry interruption or unmount',()=>{
  const {registry,release,advance}=mineScene();
  useAlphaMineStore.setState({equipped:true,carried:'REVERSAL_5'});mineActor.restTarget=[.55,.7,0];
  assert.equal(registry.carrying(),true);assert.equal(registry.allowsInteraction('camp-tool'),false);
  assert.equal(registry.allowsInteraction('alpha-mine-pool-0'),true);
  assert.match(registry.notice('vehicle').zh,/F/);
  assert.equal(registry.command('put-down'),true);advance(.6);
  assert.equal(useAlphaMineStore.getState().carried,null);
  registry.interrupt();assert.equal(useAlphaMineStore.getState().carried,'REVERSAL_5');
  mineActor.restTarget=[.55,.7,0];
  assert.equal(registry.command('put-down'),true);advance(.6);mineVisualSockets.valid=true;
  release();advance(2);
  assert.equal(useAlphaMineStore.getState().carried,'REVERSAL_5');assert.equal(useAlphaMineStore.getState().dropped,null);
  assert.equal(mineActor.available,false);assert.equal(mineVisualSockets.valid,false);
  assert.equal(registry.carrying(),false);assert.equal(registry.busy(),false);
});
