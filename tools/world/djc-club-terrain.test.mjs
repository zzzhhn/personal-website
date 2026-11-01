import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB, CLUB_CAPE, CLUB_POOL, CLUB_APPROACH, CLUB_SOFT_PLANTS, CLUB_PALMS, clubScatterBlocked, clubCapeBoundary, clubCapeScale, clubCapeDistance, meshWaterlineLoops } from '../../src/components/world/djc-club-layout.ts';
import { effectiveCoastFrame, terrainBaseHeight, terrainHeight, groundSample } from '../../src/components/world/WorldLandform.ts';
import { WATER_Y } from '../../src/components/world/layout.ts';
import { TERRAIN_GRID_V4, insidePolygon } from '../../src/components/world/layout-v4.ts';

test('DJC contract, continuous earth, live shoulders and protected bridge water', () => {
  console.log('DJC analytic samples:', JSON.stringify([[24,40],[29,43],[32,55],[48,55],[61,56],[44,75],[35,-43],[39,-43],[50,10],[60,15]].map(([x,z]) => ({ x,z,height:+terrainHeight(x,z).toFixed(4),coast:+effectiveCoastFrame(x,z).height.toFixed(4),kind:groundSample(x,z).kind }))));
  assert.deepEqual(CLUB.center, [45, 1, 55]);
  assert.deepEqual(CLUB.terrace, [89, 1.4, 56]);
  assert.deepEqual(CLUB.entrance, [24, 1, 40]);
  const coast=Array.from({length:96},(_,i)=>clubCapeBoundary(i*Math.PI*2/96));
  for (const [x, z] of coast) assert.ok(Math.abs(clubCapeDistance(x, z)) < 1e-8);
  const scales=Array.from({length:96},(_,i)=>clubCapeScale(i*Math.PI*2/96));assert.ok(Math.max(...scales)-Math.min(...scales)>.2);
  for (const p of [CLUB.center, CLUB.dance, CLUB.stage, CLUB.console, CLUB.terrace, CLUB.spawn]) {
    const base = terrainBaseHeight(p[0], p[2]), h = terrainHeight(p[0], p[2]);
    assert.ok(base >= .99 && h < 1.2, `dry supported club earth at ${p}: ${base}/${h}`);
  }
  for (let i = 1; i < CLUB_APPROACH.length; i++) for (let t = 0; t <= 1; t += .1) {
    const a = CLUB_APPROACH[i - 1], b = CLUB_APPROACH[i], x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    assert.ok(terrainHeight(x, z) >= .99, `approach is dry at ${x},${z}`);
  }
  for (const [x, z] of [[35, -43], [39, -43]]) {
    const coast = effectiveCoastFrame(x,z);
    assert.equal(coast.height, coast.originalHeight, 'cape must not fill protected bridge channel');
    assert.ok(coast.height < WATER_Y);
  }
  for (const [x, z] of [[42, -30], [50, 10], [60, 15]]) {
    assert.ok(terrainHeight(x, z) < WATER_Y, `bridge/channel/bay stays water at ${x},${z}`);
  }
  const blocked = ([x, , z]) => clubScatterBlocked(x,z);
  for (const p of [CLUB.dance, CLUB.stage, CLUB.terrace, ...CLUB_APPROACH]) assert.ok(blocked(p));
  assert.equal(blocked([44, 1, 75]), false);
  assert.equal(groundSample(44, 75).kind, 'grass');
  assert.ok(effectiveCoastFrame(44, 75).topDistance < -5);
  assert.ok(TERRAIN_GRID_V4.minX+TERRAIN_GRID_V4.nx*.5>=Math.max(...coast.map(p=>p[0]))+CLUB_CAPE.beachWidth+15,'waterline retains at least 15 m of underwater mesh');
  for(let i=0;i<96;i++){const [x,z]=CLUB_POOL.boundary(i*Math.PI*2/96,5.2);assert.ok(terrainHeight(x,z)>.9,`pool promenade retains earth underneath at ${x},${z}`);}
});

test('shared shallow basin floor stays continuous, supported and free of vegetation',()=>{
  for(let i=0;i<48;i++)for(const r of [0,.3,.6,.9]) {
    const boundary=CLUB_POOL.boundary(i*Math.PI*2/48),x=CLUB.pool[0]+(boundary[0]-CLUB.pool[0])*r,z=CLUB.pool[2]+(boundary[1]-CLUB.pool[2])*r;
    assert.ok(CLUB_POOL.contains(x,z));assert.ok(clubScatterBlocked(x,z));assert.equal(groundSample(x,z).grass,0);
    const floor=CLUB_POOL.floorHeight(x,z),h=terrainHeight(x,z);assert.ok(Math.abs(h-floor+.035)<.001);assert.ok(floor>=.55&&floor<=1);
    const e=.02,slope=Math.hypot((CLUB_POOL.floorHeight(x+e,z)-CLUB_POOL.floorHeight(x-e,z))/(2*e),(CLUB_POOL.floorHeight(x,z+e)-CLUB_POOL.floorHeight(x,z-e))/(2*e));assert.ok(slope<.45);
  }
});
test('new vegetation roots sit outside hard circulation and pool paving',()=>{
  for(const [x,z] of [...CLUB_SOFT_PLANTS,...CLUB_PALMS])assert.equal(clubScatterBlocked(x,z),false,`plant is not embedded in paving at ${x},${z}`);
});

test('waterline comes from triangles and retains a concave bay and separate island', () => {
  const positions = [], indices = [], n = 19;
  for (let z = -2; z <= 16; z++) for (let x = -2; x <= 16; x++) {
    const land = x >= 0 && z >= 0 && ((x <= 4 && z <= 10) || (x <= 10 && z <= 4)) || x >= 12 && x <= 14 && z >= 12 && z <= 14;
    positions.push(x, land ? .5 : -.5, z);
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j*n+i, b = a+1, c = a+n, d = c+1; indices.push(a,c,d,a,d,b);
  }
  const loops = meshWaterlineLoops(positions, indices, 0);
  assert.equal(loops.length, 2);
  assert.ok(insidePolygon([2,8], loops[0]));
  assert.ok(insidePolygon([8,2], loops[0]));
  assert.equal(insidePolygon([7,7], loops[0]), false, 'concave water must not become map land');
  assert.ok(insidePolygon([13,13], loops[1]));
  for (const loop of loops) for (const p of loop) assert.ok(p.every(Number.isFinite));
});
