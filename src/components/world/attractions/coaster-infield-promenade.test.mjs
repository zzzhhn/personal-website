import test from 'node:test';
import assert from 'node:assert/strict';
import { coasterInfieldHeight } from './coaster-terrain-relief.ts';

test('actual infield triangles stay below retained promenade, including the former green wedge',()=>{
  const failures=[{x:17.33,z:40,before:1.1121600146498856},
    {x:17.23809523809524,z:39.88888888888889,before:1.1238487855057147}];
  const evidence=failures.map(p=>{
    const height=coasterInfieldHeight(p.x,p.z);
    assert.notEqual(height,null);
    assert.ok(height<=.075+1e-8,`interpolated triangle still crosses paving at ${p.x},${p.z}: ${height}`);
    return {world:[50+p.x,p.z-195],before:p.before,after:1+height,paving:1.11};
  });
  let samples=0,highest=-Infinity;
  // Dense physical queries cover both the true rectangle and its crossing fans;
  // checking only height-function vertices would miss the original regression.
  for(let x=14.5;x<=17.5;x+=.25)for(let z=33;z<=53;z+=.25){
    const height=coasterInfieldHeight(x,z);if(height===null)continue;
    assert.ok(height<=.075+1e-8,`promenade overlap at ${x},${z}: ${height}`);
    highest=Math.max(highest,height);samples++;
  }
  assert.ok(samples>100,'must exercise actual covered pavement');
  for(const [x,z]of [[14,37],[20,44]])assert.ok(Math.abs(coasterInfieldHeight(x,z)-.04)<1e-9,'retained perimeter blend changed');
  assert.equal(coasterInfieldHeight(30,26),1.9830939226519337,'unrelated garden ridge changed');
  console.log(JSON.stringify({formerFailures:evidence,actualTriangleSamples:samples,maxReliefWorldY:1+highest}));
});
