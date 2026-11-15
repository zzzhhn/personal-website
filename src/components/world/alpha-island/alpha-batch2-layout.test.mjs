import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHA_BATCH2_PATHS,ALPHA_CAVE_PATH,ALPHA_WATER_PASSAGE,batch2PlantClearance } from './alpha-batch2-layout.ts';
import { ALPHA_MAIN_PATH } from './alpha-layout.ts';
import { alphaHeight } from './alpha-terrain.ts';

test('new branches retain climbable grades and leave the original main walk supported',()=>{
 for(const path of ALPHA_BATCH2_PATHS)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];assert.ok(Math.abs(b[1]-a[1])/Math.hypot(b[0]-a[0],b[2]-a[2])<.36);
 }
 for(let i=1;i<ALPHA_MAIN_PATH.length;i++)for(let k=0;k<=10;k++){
  const a=ALPHA_MAIN_PATH[i-1],b=ALPHA_MAIN_PATH[i],t=k/10,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
  assert.ok(Math.abs(alphaHeight(x,z)-y)<.45,`main path displaced at ${i}/${k}`);
 }
});
test('waterfall passage is graded below its floor and cave route excludes trees and boulders',()=>{
 for(let i=0;i<=16;i++){
  const a=ALPHA_WATER_PASSAGE[0],b=ALPHA_WATER_PASSAGE[1],x=a[0]+(b[0]-a[0])*i/16;
  assert.ok(alphaHeight(x,4.8)<=24.04,`buried waterfall passage at ${x}`);
 }
 for(let i=1;i<ALPHA_CAVE_PATH.length;i++)for(let k=0;k<=10;k++){
  const a=ALPHA_CAVE_PATH[i-1],b=ALPHA_CAVE_PATH[i],t=k/10,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
  assert.ok(batch2PlantClearance(x,z));assert.ok(alphaHeight(x,z)<=y+.12,'terrain pierces cave floor');
 }
});
