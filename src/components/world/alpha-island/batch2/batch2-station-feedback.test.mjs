import test from 'node:test';
import assert from 'node:assert/strict';
import { createShallowsArrivalReceipts,takeShallowsArrival,CAVE_LAMP_LABELS,caveLampInteraction,caveLampPickupNotice } from './batch2-station-feedback.ts';
import { createShallowsState,pushShallowsStone,stepShallowsStone,resetShallows,shallowsStonePosition,SHALLOWS_DECK_Y } from './shallows-state.ts';
import { createCaveState,tickCaveState,cancelCaveState } from './cave-state.ts';

const safe=[-43.6,12.82,-58.45];
const finishStone=(state,index)=>{
  assert.equal(pushShallowsStone(state,index,safe),true);
  for(let i=0;i<40;i++)stepShallowsStone(state,.05,safe);
  assert.equal(state.progress[index],1);
};

test('blocked, frozen and unconfirmed stone motions never produce an arrival receipt',()=>{
  const state=createShallowsState(),receipts=createShallowsArrivalReceipts(),start=shallowsStonePosition(0);
  const occupied=[start[0],SHALLOWS_DECK_Y+.82,start[2]];
  assert.equal(pushShallowsStone(state,0,occupied),false);
  assert.equal(takeShallowsArrival(receipts,state,0,0),null);
  assert.equal(pushShallowsStone(state,0,safe),true);
  assert.equal(stepShallowsStone(state,.05,occupied),false);
  assert.equal(stepShallowsStone(state,20,safe,true),false);
  assert.equal(takeShallowsArrival(receipts,state,0,0),null);
  for(let i=0;i<40;i++)stepShallowsStone(state,.05,safe);
  for(const error of [Infinity,NaN,-1,.011])assert.equal(takeShallowsArrival(receipts,state,0,error),null);
  assert.deepEqual(takeShallowsArrival(receipts,state,0,.004),{index:0,bridge:false});
  assert.equal(takeShallowsArrival(receipts,state,0,0),null);
});

test('each physical slot and the last bridge confirmation fire once, and reset permits another completion',()=>{
  const state=createShallowsState(),receipts=createShallowsArrivalReceipts();
  for(let round=0;round<2;round++){
    const arrivals=[];
    for(let i=0;i<8;i++){
      finishStone(state,i);
      assert.equal(takeShallowsArrival(receipts,state,i,.04),null,'logical completion cannot precede actual final pose');
      arrivals.push(takeShallowsArrival(receipts,state,i,0));
      assert.equal(takeShallowsArrival(receipts,state,i,0),null);
    }
    assert.equal(arrivals.filter(a=>a.bridge).length,1);
    assert.equal(arrivals.at(-1).bridge,true);
    assert.equal(arrivals.slice(0,-1).every(a=>!a.bridge),true);
    assert.equal(resetShallows(state,safe),true);
    assert.equal(takeShallowsArrival(receipts,state,0,0),null,'reset is not a completed slot');
  }
});

test('bridge confirmation waits for every actual body pose even if all logical stones are complete',()=>{
  const state=createShallowsState(),receipts=createShallowsArrivalReceipts();
  for(let i=0;i<8;i++)finishStone(state,i);
  assert.equal(takeShallowsArrival(receipts,state,7,0).bridge,false);
  for(let i=0;i<6;i++)assert.equal(takeShallowsArrival(receipts,state,i,0).bridge,false);
  assert.equal(takeShallowsArrival(receipts,state,6,0).bridge,true);
});

test('lamp operation hint requires real palm contact and never fires on timeout, cancellation or later carry frames',()=>{
  const state=createCaveState();
  const tick=error=>{const was=state.lamp;tickCaveState(state,.08,error);return caveLampPickupNotice(was,state.lamp);};
  state.lamp='reaching';
  for(let i=0;i<40;i++)assert.equal(tick(Infinity),null);
  assert.equal(state.lamp,'rack');
  state.lamp='reaching';state.reachTime=0;
  assert.equal(tick(.13),null);
  assert.ok(tick(.04));assert.equal(state.lamp,'carried');
  assert.equal(tick(.04),null);
  const was=state.lamp;cancelCaveState(state);
  assert.equal(caveLampPickupNotice(was,state.lamp),null);
  state.lamp='reaching';cancelCaveState(state);
  assert.equal(caveLampPickupNotice('reaching',state.lamp),null);
  state.lamp='reaching';assert.ok(tick(.04),'pickup can be completed again after cancellation');
});

test('live lamp labels use distinct immutable snapshots and return requires ownership of the carried lamp',()=>{
  const state=createCaveState(),item={get label(){return CAVE_LAMP_LABELS[state.lamp==='carried'?'return':'take'];}};
  const previous=item.label;
  assert.equal(caveLampInteraction(state.lamp,false),'take');
  state.lamp='reaching';assert.equal(caveLampInteraction(state.lamp,true),null);
  state.lamp='carried';
  assert.equal(caveLampInteraction(state.lamp,true),'return');
  assert.equal(caveLampInteraction(state.lamp,false),null,'cannot release another hand owner');
  assert.notEqual(item.label,previous);
  assert.equal(previous.zh,'从挂钩取矿灯');
  assert.equal(item.label.zh,'把矿灯挂回原挂钩');
  assert.ok(Object.isFrozen(previous)&&Object.isFrozen(item.label));
  cancelCaveState(state);assert.equal(item.label,previous);
});
