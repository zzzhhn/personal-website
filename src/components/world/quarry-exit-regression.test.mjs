import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainHeight} from './WorldLandform.ts';
import {ALPHA_MINE_ORIGIN as origin} from './alpha-mine-layout.ts';
import {PLAYER_HALF_HEIGHT,PLAYER_RADIUS} from './actor-physics.ts';
import {mineEntranceApron,mineFoundationSurface} from './alpha-mine-foundation.ts';
import {RAPIER,layout,walkQuarry} from '../../../tools/world/alpha-mine-tests/quarry-walk.mjs';
import {addQuarryTerrain} from '../../../tools/world/alpha-mine-tests/quarry-terrain.mjs';

const actualWorld=[-81.23,1.82,-90.28],height=PLAYER_HALF_HEIGHT+PLAYER_RADIUS;
const actualLocal=[actualWorld[0]-origin[0],actualWorld[1]-origin[1]-height,actualWorld[2]-origin[2]];
const tail=layout.lowExits['ravine-to-forecourt'].slice(4);
const paths={
  'visible mouth':[actualLocal,[2.77,0,-32],...tail],
  'join formal line':[actualLocal,[4.8,0,-35.28],...layout.lowExits['ravine-to-forecourt'].slice(3)],
  'diagonal mouth':[actualLocal,[4.8,0,-33],...tail],
};
function configure(world,legacy=false){
  addQuarryTerrain(world,terrainHeight,{minX:-22,maxX:10,minZ:-47,maxZ:6,step:1});
  const a=legacy?mineEntranceApron():mineFoundationSurface(terrainHeight);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());body.userData={kind:legacy?'legacy-entrance':'continuous-foundation'};
  world.createCollider(RAPIER.ColliderDesc.trimesh(a.vertices.map((v,i)=>v-origin[i%3]),a.indices),body);
}
function walk(points,legacy=false){
  return walkQuarry(points,{spawnCenterHeight:height,configureWorld:w=>configure(w,legacy)});
}
function worldPosition(result){return result.position.map((v,i)=>+(v+origin[i]+(i===1?height:0)).toFixed(4));}

test('reported point starts on the real lower island, not the nominal raised mine floor',()=>{
  assert.equal(terrainHeight(actualWorld[0],actualWorld[2]),1);
  assert.ok(Math.abs(actualLocal[1]+.14)<1e-9);
  const result=walk(paths['visible mouth'],true);
  result.settledCenter.forEach((v,i)=>assert.ok(Math.abs(v+origin[i]-actualWorld[i])<.02));
});
test('legacy entrance-only foundation reproduces the reported internal floor-edge failure',t=>{
  const result=walk(paths['visible mouth'],true);
  t.diagnostic(JSON.stringify({worldPosition:worldPosition(result),...result}));
  assert.equal(result.passed,false);assert.equal(result.reason,'blocked-or-stalled');
  assert.ok(result.walked<.2);
  assert.ok(result.contacts.some(c=>c.kind==='surface'&&c.normal[1]>.55&&c.normal[1]<.65));
});
test('reported low-island point can continuously leave through the visible mouth to the forecourt',t=>{
  const results=Object.fromEntries(Object.entries(paths).map(([name,p])=>[name,walk(p)]));
  for(const [name,result] of Object.entries(results))t.diagnostic(JSON.stringify({name,worldPosition:worldPosition(result),...result}));
  assert.ok(Object.values(results).every(r=>r.passed),'A raised-centerline-only test misses this lower-island floor edge');
});
test('raised formal-line control remains walkable with the island collision also present',t=>{
  const result=walk([[4.8,0,-35.28],...layout.lowExits['ravine-to-forecourt'].slice(3)]);
  t.diagnostic(JSON.stringify(result));assert.equal(result.passed,true);
});
for(const [name,points] of Object.entries(layout.lowExits))for(const reverse of [false,true])
  test(`actual island and continuous floor preserve ${name}${reverse?' reverse':''}`,t=>{
    const result=walk(reverse?[...points].reverse():points);
    t.diagnostic(JSON.stringify(result));assert.equal(result.passed,true,JSON.stringify(result));
  });
