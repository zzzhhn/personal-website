import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,walkQuarry,quarryWalkCases,lowPocketAttempts} from '../../../tools/world/alpha-mine-tests/quarry-walk.mjs';

test('every authored low exit has a continuous-walk contract',()=>{
  assert.ok(Object.keys(layout.lowExits??{}).length>=2);
  for(const points of Object.values(layout.lowExits)){
    assert.ok(points.length>=3);assert.deepEqual(points.at(-1),[0,0,0]);
  }
});
for(const [name,points] of Object.entries(quarryWalkCases()))test(`actual quarry dynamic walk: ${name}`,t=>{
  const result=walkQuarry(points);
  t.diagnostic(JSON.stringify({name,...result}));
  assert.equal(result.passed,true,JSON.stringify(result));
});
test('the western toe low slot is physically sealed or has a continuous walking outlet',t=>{
  const results=Object.fromEntries(Object.entries(lowPocketAttempts).map(([name,p])=>[name,walkQuarry(p)]));
  t.diagnostic(JSON.stringify(results));
  const closed=Object.values(results).every(r=>r.reason==='spawn-overlaps-solid');
  const escapable=Object.values(results).some(r=>r.passed);
  assert.ok(closed||escapable,'Known 3870aef low slot still accepts the capsule but has no walking outlet: '+JSON.stringify(results));
});
