import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attractionRoadDistance, attractionCapeDistance, ibdFootprintDistance } from './attractions/attraction-layout.ts';

// Read the actual authored placement list without importing React, loading GLBs,
// constructing the scene or generating the island terrain.
const source=readFileSync(new URL('./WorldStreetTrees.tsx',import.meta.url),'utf8');
const match=source.match(/const northTrees\s*=\s*(\[\[[\s\S]*?\]\]);/);
assert.ok(match,'street-owned northern survey must remain inspectable');
const points=JSON.parse(match[1]);

test('all authored northern tree trunks clear the actual approach asphalt and shoulders',()=>{
  assert.equal(points.length,18,'relocate individual conflicts, retaining the planted tree count');
  for(const [x,,z]of points)assert.ok(attractionRoadDistance(x,z)>=5.3,`tree overlaps approach at ${x},${z}`);
});

test('three former in-lane trunks move to nearby dry ground while retaining their instance indices',()=>{
  const changes=[{index:2,old:[-24,1,-132],next:[-29,1,-125]},
    {index:4,old:[-52,1,-139],next:[-52,1,-132]},
    {index:5,old:[-70,1,-139],next:[-70,1,-132]}];
  const evidence=[];
  for(const {index,old,next}of changes){
    assert.deepEqual(points[index],next);
    const before=attractionRoadDistance(old[0],old[2]),after=attractionRoadDistance(next[0],next[2]);
    assert.ok(before<3.2,'must reproduce an old asphalt obstruction');
    assert.ok(after>5.3);
    assert.ok(attractionCapeDistance(next[0],next[2])<-5,'keep moved roots well inside the headland');
    assert.ok(ibdFootprintDistance(next[0],next[2])>2,'do not transfer an obstruction into the yard');
    assert.ok(Math.hypot(next[0]-old[0],next[2]-old[2])<9,'bounded local relocation');
    evidence.push({index,old,next,before:+before.toFixed(6),after:+after.toFixed(6)});
  }
  console.log(JSON.stringify({northernTrees:points.length,moved:evidence}));
});
