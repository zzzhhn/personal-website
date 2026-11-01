import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import { CoasterStructureCache } from './coaster-structure-cache.ts';
test('repeated park boundary crossings build each variant once, release GPU resources and bound CPU retention',()=>{
  const built=[],disposed=[];
  const cache=new CoasterStructureCache(near=>{
    built.push(near);const steel=new BoxGeometry(near?2:1,1,1),glow=new BoxGeometry(.1,.1,.1);
    steel.addEventListener('dispose',()=>disposed.push(`steel:${near}`));glow.addEventListener('dispose',()=>disposed.push(`glow:${near}`));
    return {steel,glow};
  });
  const firstNear=cache.get(true),nearArray=firstNear.steel.attributes.position.array;
  cache.releaseGpu(true);assert.deepEqual(disposed,['steel:true','glow:true']);
  const firstFar=cache.get(false),budget=cache.snapshot();assert.equal(budget.variants,2);
  for(let i=0;i<100;i++){
    const near=i%2===0;assert.equal(cache.get(near),near?firstNear:firstFar);cache.releaseGpu(near);
  }
  assert.deepEqual(built,[true,false]);assert.deepEqual(cache.snapshot(),budget);
  assert.equal(firstNear.steel.attributes.position.array,nearArray);
  cache.dispose();assert.deepEqual(cache.snapshot(),{variants:0,attributeBytes:0});
});

test('cold detail changes retain the original contacts, deduplicate generation and never call the synchronous builder',async()=>{
  const initial={steel:new BoxGeometry(),glow:new BoxGeometry(),colliders:[{surface:true}]};
  const next={steel:new BoxGeometry(2),glow:new BoxGeometry(),colliders:[{surface:false}]};
  let complete,asyncCalls=0,syncCalls=0;
  const cache=new CoasterStructureCache(()=>{syncCalls++;return initial;},()=>{asyncCalls++;return new Promise(resolve=>{complete=resolve;});});
  assert.equal(cache.get(true),initial);
  const pending=cache.load(false);assert.equal(cache.load(false),pending);
  assert.equal(cache.peek(false),undefined);assert.equal(cache.peek(true),initial);
  assert.equal(cache.snapshot().variants,1);assert.equal(syncCalls,1);assert.equal(asyncCalls,1);
  complete(next);assert.equal(await pending,next);
  assert.equal(await cache.load(false),next);assert.equal(await cache.load(true),initial);
  assert.equal(cache.snapshot().variants,2);assert.equal(syncCalls,1);assert.equal(asyncCalls,1);
  cache.dispose();
});

test('unmount aborts pending work and a late reply cannot repopulate the cache',async()=>{
  let signal,complete,disposed=0;
  const cache=new CoasterStructureCache(()=>({steel:new BoxGeometry(),glow:new BoxGeometry()}),(_,s)=>{signal=s;return new Promise(resolve=>{complete=resolve;});});
  cache.get(false);const pending=cache.load(true);cache.dispose();assert.equal(signal.aborted,true);
  const late={steel:new BoxGeometry(),glow:new BoxGeometry()};
  late.steel.addEventListener('dispose',()=>disposed++);late.glow.addEventListener('dispose',()=>disposed++);
  complete(late);await assert.rejects(pending,/disposed/);assert.equal(disposed,2);
  assert.deepEqual(cache.snapshot(),{variants:0,attributeBytes:0});await assert.rejects(cache.load(false),/disposed/);
});

test('worker failure preserves the usable variant without synchronous fallback or automatic retry',async()=>{
  let calls=0;
  const cache=new CoasterStructureCache(()=>({steel:new BoxGeometry(),glow:new BoxGeometry()}),async()=>{calls++;throw new Error('unavailable');});
  const existing=cache.get(true);await assert.rejects(cache.load(false),/unavailable/);
  assert.equal(cache.peek(true),existing);assert.equal(cache.peek(false),undefined);assert.equal(calls,1);
  cache.dispose();
});
