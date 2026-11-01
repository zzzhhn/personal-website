import test from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3 } from 'three';
import { IBD_YARD, INTENT_COASTER, IBD_FOOTPRINT, INTENT_COASTER_FOOTPRINT, ATTRACTIONS_CAPE, ATTRACTION_ROADS, attractionCapeDistance } from '../../src/components/world/attractions/attraction-layout.ts';
import { buildTerrain, meshHeight, terrainHeight, GRID, CELL } from '../../src/components/world/WorldLandform.ts';
import { WORLD_PORTALS } from '../../src/components/world/world-portals.ts';
import { WATER_Y } from '../../src/components/world/layout.ts';

test('expanded facilities, road edges and portal arrivals have dry continuous physical ground', () => {
  const terrain = buildTerrain();
  let samples = 0;
  function supported(x, z, flat = true) {
    const y = meshHeight(x, z);
    assert.ok(y !== null && y >= .96 && (!flat || y < 1.12), `unsupported or uneven ground at ${x},${z}: ${y}`);
    if (flat) assert.ok(Math.abs(y - terrainHeight(x,z)) < .15, `facility floor mismatch at ${x},${z}`);
    samples++;
    return y;
  }
  const inside=(x,z,polygon)=>{
    let hit=false;
    polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;});
    return hit;
  };
  for (const [site,outline] of [[IBD_YARD,IBD_FOOTPRINT],[INTENT_COASTER,INTENT_COASTER_FOOTPRINT]]) {
    // The ride intentionally crosses the inlet. Survey bounds include water;
    // require dry support only on the actual occupied land, not an obsolete rectangle.
    for(let x=Math.min(...outline.map(p=>p[0]));x<=Math.max(...outline.map(p=>p[0]));x+=3)
      for(let z=Math.min(...outline.map(p=>p[1]));z<=Math.max(...outline.map(p=>p[1]));z+=3)
        if(inside(x,z,outline)&&attractionCapeDistance(x,z)<-6)supported(x,z);
    supported(site.entrance[0],site.entrance[2]);
  }
  // Use the actual curved approach, including the road shoulders, not just its control polygon.
  for (const road of ATTRACTION_ROADS) {
    const curve = new CatmullRomCurve3(road.map(([x,z]) => new Vector3(x,0,z)), false, 'centripetal');
    const count = Math.ceil(curve.getLength());
    let previous = null;
    for (let i = 0; i <= count; i++) {
      const p = curve.getPointAt(i / count), d = curve.getTangentAt(i / count);
      for (const side of [-4.25, 0, 4.25]) supported(p.x - d.z * side, p.z + d.x * side, false);
      const y = meshHeight(p.x,p.z);
      if (previous) assert.ok(Math.abs(y - previous.y) / Math.hypot(p.x - previous.x,p.z - previous.z) < .5, 'approach remains walkable across the existing ridge shoulder');
      previous = {x:p.x,y,z:p.z};
    }
  }
  for (const portal of WORLD_PORTALS.filter(p => p.id === 'yard' || p.id === 'coaster'))
    for (const [x,,z] of [...portal.arrivalCandidates, ...portal.entryApproachCandidates]) supported(x,z);
  console.log(JSON.stringify({ terrain: terrain.stats, supportedSamples: samples }));
});

test('new cape retains underwater shelf within mesh bounds rather than a clipped coastline', () => {
  for (const [x,z] of ATTRACTIONS_CAPE) {
    assert.ok(x - GRID.minX >= 27 && GRID.minX + GRID.nx * CELL - x >= 27);
    assert.ok(z - GRID.minZ >= 27 && GRID.minZ + GRID.nz * CELL - z >= 27);
  }
  assert.ok(buildTerrain().stats.triangles < 450000, 'expanded terrain keeps coarse interiors within the triangle budget');
});

test('new shallow shelf simplification stays submerged and within 4.5 cm of the height field',()=>{
  const terrain=buildTerrain(),{blocks,positions}=terrain; let sampled=0,maximumError=0;
  for(let b=0;b<blocks.kind.length;b++)if(blocks.kind[b]===1){
    const corners=Array.from(blocks.corners.subarray(b*4,b*4+4));
    if(Math.max(...corners.map(i=>positions[i*3+1]))<=-1.3)continue;
    const x=positions[corners[0]*3],z=positions[corners[0]*3+2];
    for(let dz=0;dz<=2;dz+=.5)for(let dx=0;dx<=2;dx+=.5){
      const expected=terrainHeight(x+dx,z+dz),actual=meshHeight(x+dx,z+dz);
      assert.ok(actual!==null && expected<WATER_Y-.35,'never simplify the dry shore');
      maximumError=Math.max(maximumError,Math.abs(actual-expected));
    }
    sampled++;
  }
  assert.ok(sampled>400,'the expanded shelf should remove meaningful repeated geometry');
  assert.ok(maximumError<.0451,`shelf interpolation error ${maximumError}`);
  console.log(JSON.stringify({simplifiedShallowBlocks:sampled,maximumHeightError:maximumError}));
});
