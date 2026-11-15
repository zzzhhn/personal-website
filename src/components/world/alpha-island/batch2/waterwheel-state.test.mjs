import test from 'node:test';
import assert from 'node:assert/strict';
import { waterwheelFlow, cycleWaterwheelGate, getWaterwheelSnapshot, subscribeWaterwheel, WATERWHEEL_PASSAGE,
  createWaterwheelIrrigation, stepWaterwheelIrrigation, completeWaterwheelIrrigation } from './waterwheel-state.ts';
const balanced = waterwheelFlow([1,1,1]), spill = waterwheelFlow([2,2,2]), still = waterwheelFlow([0,0,0]);
const tick = (state, flow = balanced, active = true) => stepWaterwheelIrrigation(state, flow, .88, .62, .05, active);

test('all 27 gate combinations retain moderate lifting and fast spill without instant irrigation completion', () => {
  let useful = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const flow = waterwheelFlow([a,b,c]), total = a+b+c;
    assert.equal(flow.irrigating, total >= 2 && total <= 4, 'balanced flow can lift irrigation water');
    assert.equal(flow.passageRevealed, total === 0, 'only naturally absent water reveals a fresh, unwatered path');
    if (flow.irrigating) { useful++; assert.ok(flow.bucketFill > .8); }
    if (total >= 5) { assert.equal(flow.mode,'spill'); assert.ok(flow.bucketFill < .3); assert.ok(flow.radiansPerSecond > 3*balanced.radiansPerSecond); }
    if (!total) assert.equal(flow.radiansPerSecond,0);
  }
  assert.ok(useful > 1, 'several combinations work without an exact-number puzzle');
});

test('gate commits only move their own sluice and never declare success', () => {
  assert.deepEqual(getWaterwheelSnapshot().gates,[2,2,2]);
  let notices=0;const off=subscribeWaterwheel(()=>notices++);
  const moderate=cycleWaterwheelGate(0);
  assert.deepEqual(moderate.gates,[0,2,2]);assert.equal(moderate.everBalanced,false);
  cycleWaterwheelGate(0);const fast=cycleWaterwheelGate(0);
  assert.deepEqual(fast.gates,[2,2,2]);assert.equal(fast.everBalanced,false);
  assert.equal(notices,3);assert.equal(moderate.gates[0],0,'old snapshots remain immutable');off();
});

test('brief moderate settings, dry flow and unsettled or empty buckets cannot water flowers', () => {
  const state=createWaterwheelIrrigation();
  for(let attempt=0;attempt<20;attempt++) {
    for(let frame=0;frame<5;frame++)assert.equal(tick(state),false);
    tick(state,attempt%2?spill:still);
  }
  assert.deepEqual(state,createWaterwheelIrrigation());
  for(const [fill,speed] of [[.18,2.25],[.88,1.4],[.4,.62],[.88,.1]]) {
    for(let frame=0;frame<100;frame++)stepWaterwheelIrrigation(state,balanced,fill,speed,.05);
    assert.equal(state.liftedSeconds,0);assert.equal(state.water,0);assert.equal(state.complete,false);
  }
  for(let frame=0;frame<100;frame++)tick(state,still);
  assert.equal(still.passageRevealed,true);assert.equal(state.complete,false,'turning all gates off is not irrigation');
});

test('actual settled lifting precedes irrigation, blooming, reveal and a single short completion', () => {
  const state=createWaterwheelIrrigation();let firstWater=-1,firstBloom=-1,firstReveal=-1,completion=-1,events=0;
  for(let frame=0;frame<100;frame++) {
    const event=tick(state);if(event){events++;completion=frame*.05;}
    if(state.water>0&&firstWater<0)firstWater=frame*.05;
    if(state.bloom>0&&firstBloom<0)firstBloom=frame*.05;
    if(state.reveal>0&&firstReveal<0)firstReveal=frame*.05;
    if(state.bloom>0)assert.equal(state.water,1);
    if(state.reveal>0)assert.equal(state.bloom,1);
  }
  assert.ok(firstWater>=.9&&firstWater<1.1);
  assert.ok(firstWater<firstBloom&&firstBloom<firstReveal&&firstReveal<completion);
  assert.ok(completion<3.3,'the visible settled-flow experience stays short');assert.equal(events,1);
  assert.equal(state.complete,true);
  assert.equal(tick(state,spill),false);assert.equal(state.bloom,1);assert.equal(state.reveal,1,'later overwatering cannot undo the finished route');
});

test('inactive, paused, hidden or distant progress does not accumulate or replay elapsed time', () => {
  const state=createWaterwheelIrrigation();for(let frame=0;frame<10;frame++)tick(state);
  const before={...state};
  for(let frame=0;frame<100;frame++)stepWaterwheelIrrigation(state,balanced,.88,.62,30,false);
  assert.deepEqual(state,before);
  for(const delta of [NaN,Infinity,0,-1])stepWaterwheelIrrigation(state,balanced,.88,.62,delta);
  assert.deepEqual(state,before);
  stepWaterwheelIrrigation(state,balanced,.88,.62,30);
  assert.ok(state.liftedSeconds-before.liftedSeconds<=.06000001,'resume takes at most one bounded frame');
  assert.equal(state.water,0);assert.equal(state.complete,false);
});

test('only the final boundary notifies completion once, surviving subsequent gate changes', () => {
  let notices=0;const off=subscribeWaterwheel(()=>notices++);
  const state=createWaterwheelIrrigation();
  for(let frame=0;frame<90;frame++)if(tick(state))completeWaterwheelIrrigation();
  assert.equal(getWaterwheelSnapshot().everBalanced,true);assert.equal(notices,1);
  assert.equal(completeWaterwheelIrrigation(),false);assert.equal(notices,1);
  assert.equal(getWaterwheelSnapshot().flow.passageRevealed,true);
  const next=cycleWaterwheelGate(1);assert.equal(next.everBalanced,true);assert.equal(next.flow.passageRevealed,true);assert.equal(notices,2);
  off();assert.deepEqual(createWaterwheelIrrigation(true),state);
});

test('hidden passage keeps its existing player and camera clearance', () => {
  const b=WATERWHEEL_PASSAGE.bounds;
  assert.ok(b.ceilingY-b.floorY>=4.5);assert.ok(b.maxZ-b.minZ>=2.5);
  assert.equal(WATERWHEEL_PASSAGE.west[1],WATERWHEEL_PASSAGE.east[1]);
});
