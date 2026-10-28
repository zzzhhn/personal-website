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
