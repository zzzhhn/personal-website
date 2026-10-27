import test from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3 } from 'three';
import { IBD_YARD, INTENT_COASTER, ATTRACTIONS_CAPE, ATTRACTION_ROADS } from '../../src/components/world/attractions/attraction-layout.ts';
import { buildTerrain, meshHeight, terrainHeight, GRID, CELL } from '../../src/components/world/WorldLandform.ts';
import { WORLD_PORTALS } from '../../src/components/world/world-portals.ts';

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
  for (const site of [IBD_YARD, INTENT_COASTER]) {
    for (let x = -site.size[0] / 2; x <= site.size[0] / 2; x += 2)
      for (let z = -site.size[1] / 2; z <= site.size[1] / 2; z += 2) supported(site.center[0] + x, site.center[2] + z);
    supported(site.entrance[0], site.entrance[2]);
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
