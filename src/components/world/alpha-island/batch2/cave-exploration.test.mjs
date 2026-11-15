import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END } from '../alpha-batch2-layout.ts';
import { PLAYER_CENTER_HEIGHT } from '../../actor-physics.ts';
import { createCaveExploration, startCaveExploration, cancelCaveExploration, caveRoutePoints, caveAtWaypoint,
  advanceCaveExploration, readCaveMural, caveReturnEchoSequence, caveGuideRingOpacity } from './cave-exploration.ts';
const body=(p,dx=0,dz=0)=>[p[0]+dx,p[1]+.12+PLAYER_CENTER_HEIGHT,p[2]+dz];

test('a clear echo requires heard, ordered, height-correct walking rather than region entry or a timer',()=>{
  const state=createCaveExploration(),points=caveRoutePoints('through');
  assert.equal(advanceCaveExploration(state,body(points.at(-1)),20),null);
  startCaveExploration(state,0);
  assert.equal(advanceCaveExploration(state,body(points.at(-1)),20),null,'skipping the fork and passage does not complete');
  assert.equal(advanceCaveExploration(state,body(points[0]),.47),null,'cue has not arrived yet');
  const upstairs=body(points[0]);upstairs[1]+=8;
  assert.equal(advanceCaveExploration(state,upstairs,5),null,'mountain surface above the tunnel is not a visit');
  assert.equal(advanceCaveExploration(state,body(points[0]),NaN),null);
  assert.equal(state.next,0);
  for(let i=0;i<points.length;i++){
    const event=advanceCaveExploration(state,body(points[i],1.4,.4),5);
    if(i<points.length-1)assert.equal(event,null);else assert.deepEqual(event,{kind:'exit',firstComplete:true});
  }
  assert.equal(state.completed,true);assert.equal(state.route,null);
  assert.equal(advanceCaveExploration(state,body(points.at(-1)),20),null,'completion is a single boundary');
});

test('the low echo offers the existing mural and traces the same side passage back in reverse',()=>{
  const state=createCaveExploration();startCaveExploration(state,2);
  assert.equal(readCaveMural(state),false,'mural action cannot be invoked from a region entry');
  for(const p of caveRoutePoints('mural'))advanceCaveExploration(state,body(p,-1.3,.3),5);
  assert.equal(state.muralReady,true);assert.equal(state.completed,false,'arriving at the mural is not a finished round trip');
  assert.equal(readCaveMural(state),true);assert.equal(state.route,'return');
  const returns=caveRoutePoints('return');assert.deepEqual(returns,[...ALPHA_CAVE_DEAD_END.slice(0,-1)].reverse());
  const echoes=caveReturnEchoSequence();assert.equal(echoes.length,3);
  assert.deepEqual(echoes.map(e=>[e.position[0],e.position[2]]),[ALPHA_CAVE_DEAD_END.at(-1),...returns].map(p=>[p[0],p[2]]));
  assert.deepEqual(echoes.map(e=>e.delay),[0,.48,1.18]);
  assert.equal(advanceCaveExploration(state,body(ALPHA_CAVE_PATH.at(-1)),5),null,'jumping to daylight does not replace walking back');
  assert.equal(advanceCaveExploration(state,body(returns[0],1.4,.2),5),null);
  assert.deepEqual(advanceCaveExploration(state,body(returns[1],.2,-1.4),5),{kind:'return',firstComplete:true});
});

test('the next existing warm ring remains readable after its sound expires, then advances',()=>{
  const state=createCaveExploration();startCaveExploration(state,1);
  assert.equal(caveGuideRingOpacity(state,1,.47,.48),0);
  assert.equal(caveGuideRingOpacity(state,1,4.8,.48),.22);
  assert.equal(caveGuideRingOpacity(state,2,4.8,1.18),0);
  advanceCaveExploration(state,body(caveRoutePoints('through')[0]),4.8);
  assert.equal(caveGuideRingOpacity(state,1,4.8,.48),0);
  assert.equal(caveGuideRingOpacity(state,2,4.8,1.18),.22);
  startCaveExploration(state,2);
  for(const p of caveRoutePoints('mural'))advanceCaveExploration(state,body(p),4.8);
  assert.equal(caveGuideRingOpacity(state,3,4.8,1.88),.22,'mural retains a subtle cue until its interaction');
});

test('walking tolerance accepts tunnel flanks but rejects wrong height and distant coordinates',()=>{
  const p=ALPHA_CAVE_DEAD_END[1];
  assert.equal(caveAtWaypoint(body(p,1.7,1.1),p),true);
  assert.equal(caveAtWaypoint(body(p,2.5,0),p),false);
  const high=body(p);high[1]+=2;assert.equal(caveAtWaypoint(high,p),false);
  assert.equal(caveAtWaypoint([NaN,28,-48],p),false);
});

test('cancel clears active cues without inventing completion or repeating a prior completion callback',()=>{
  const state=createCaveExploration();startCaveExploration(state,0);cancelCaveExploration(state);
  assert.equal(state.completed,false);assert.equal(state.visited,true);assert.equal(state.route,null);
  assert.equal(caveGuideRingOpacity(state,1,4.8,.48),0);
  assert.equal(advanceCaveExploration(state,body(ALPHA_CAVE_PATH.at(-1)),20),null);
  startCaveExploration(state,0);for(const p of caveRoutePoints('through'))advanceCaveExploration(state,body(p),5);
  cancelCaveExploration(state);startCaveExploration(state,1);
  let event;for(const p of caveRoutePoints('through'))event=advanceCaveExploration(state,body(p),5);
  assert.deepEqual(event,{kind:'exit',firstComplete:false});
});


test('per-frame progression and ring reads reuse stable precomputed route arrays',()=>{
  for(const route of ['through','mural','return']){
    const points=caveRoutePoints(route);
    for(let frame=0;frame<100;frame++)assert.equal(caveRoutePoints(route),points);
  }
  assert.deepEqual(ALPHA_CAVE_DEAD_END,[[-10,26,-42],[-14,27,-48],[-19,27.5,-49]],'precomputation never reverses the shared source in place');
});
