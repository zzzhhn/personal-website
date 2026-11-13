import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY, FACTORY_APPROACH, FACTORY_CAPE, FACTORY_STATIONS, factoryWorld, factoryCapeDistance, factoryScatterBlocked } from './factory-layout.ts';
import { CELL, GRID, buildTerrain, coastFrame, effectiveCoastFrame, meshHeight, terrainHeight } from '../WorldLandform.ts';
import { DRIVABLE_V4, JUNCTIONS_V4, NETWORK_WALK_V4, ROAD_Y, ROADS_V4, TERRAIN_ROADS_V4, nearestRoadPointV4 } from '../layout-v4.ts';
import { groundRoadDistance, paveTopAt, pavingMesh, PAVE_STRIDE } from '../WorldTerrainPaving.ts';

const approach = ROADS_V4.find(r => r.id === 'factory-approach');
function routeSamples(fn) {
  for (let i = 1; i < approach.pts.length; i++) {
    const a = approach.pts[i - 1], b = approach.pts[i], length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (let j = 0; j <= Math.ceil(length); j++) {
      const t = j / Math.ceil(length), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      fn(x, z, -(b[2] - a[2]) / length, (b[0] - a[0]) / length);
    }
  }
}

test('factory footprint, courtyard and every station have dry level ground with an actual coastal buffer', () => {
  let samples = 0;
  for (const box of [FACTORY.building, FACTORY.courtyard]) {
    for (let x = box.minX; x <= box.maxX; x += 5) for (let z = box.minZ; z <= box.maxZ; z += 5) {
      // At the courtyard's eastern edge the old island and new cape overlap.
      assert.ok(effectiveCoastFrame(x, z).topDistance < -2.5, `insufficient shore buffer ${x},${z}`);
      assert.ok(Math.abs(terrainHeight(x, z) - 1) < .001, `uneven factory ground ${x},${z}`);
      assert.ok(effectiveCoastFrame(x, z).topDistance < 0);
      samples++;
    }
  }
  for (const station of FACTORY_STATIONS) {
    const [x, , z] = factoryWorld(station.at);
    assert.ok(Math.abs(terrainHeight(x, z) - 1) < .001, station.id);
    assert.ok(factoryScatterBlocked(x, z), `grass at station ${station.id}`);
  }
  // The new headland has a shore and submerged shelf, rather than a vertical rectangular pad.
  assert.ok(terrainHeight(-273, 10) < 1 && terrainHeight(-273, 10) > -.3);
  assert.ok(terrainHeight(-292, 10) < -1);
  console.log(JSON.stringify({ analyticalFactoryGroundSamples: samples }));
});

test('J7 approach participates in paving, recovery and the continuous real road network', () => {
  assert.ok(approach && approach.drivable);
  const j7 = JUNCTIONS_V4.find(j => j.id === 'J7').p;
  assert.deepEqual([approach.pts[0][0], approach.pts[0][2]], j7);
  assert.deepEqual(FACTORY_APPROACH[0], j7);
  assert.deepEqual([approach.pts.at(-1)[0], approach.pts.at(-1)[2]], FACTORY_APPROACH.at(-1));
  assert.ok(DRIVABLE_V4.some(r => r.id === approach.id));
  assert.ok(TERRAIN_ROADS_V4.some(r => r.id === approach.id));
  assert.ok(NETWORK_WALK_V4.some(p => p[0] === FACTORY.entrance[0] && p[2] === FACTORY.entrance[2]),
    'road traversal reaches the current factory entrance');
  for (let i = 1; i < NETWORK_WALK_V4.length; i++) {
    // Every walk segment must be on a real road; this also rejects accidental connector jumps.
    const a = NETWORK_WALK_V4[i - 1], b = NETWORK_WALK_V4[i];
    const mid = [(a[0] + b[0]) / 2, ROAD_Y, (a[2] + b[2]) / 2], q = nearestRoadPointV4(mid);
    assert.ok(Math.hypot(q[0] - mid[0], q[2] - mid[2]) < .001, `off-network leg ${i}`);
  }
  routeSamples((x, z, nx, nz) => {
    assert.ok(Math.abs(paveTopAt(x, z) - ROAD_Y) < .01, `missing pavement ${x},${z}`);
    assert.ok(groundRoadDistance(x, z) < 5.2);
    const q = nearestRoadPointV4([x, 10, z]);
    assert.ok(Math.hypot(q[0] - x, q[2] - z) < .001);
    for (const side of [-5.5, 0, 5.5]) assert.ok(terrainHeight(x + nx * side, z + nz * side) >= .96);
  });
  for (let i = 1; i < FACTORY_APPROACH.length; i++) for (let t = 0; t <= 1; t += .1) {
    const a = FACTORY_APPROACH[i - 1], b = FACTORY_APPROACH[i];
    assert.ok(factoryScatterBlocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
  }
});

test('west expansion preserves legacy key heights and the old convex coastal calculation', () => {
  // Captured before this patch using the same analytic height query, including existing paving.
  const previous = [[-42,30,4.807658173714251],[-30,34,4.8],[21,0,1],[-30,-80,4.6],
    [45,55,1],[35,-43,.9499999999999998],[50,10,-1.6325461868137752],
    [50,-180,1],[120,-180,1],[-85,40,1],[-80,-50,1]];
  for (const [x, z, y] of previous) assert.ok(Math.abs(terrainHeight(x, z) - y) < 1e-8, `${x},${z}`);
  assert.deepEqual(coastFrame(45, 55), { d: 19.968126572096075, s: 396.6945706488696 });
  assert.deepEqual(coastFrame(-42, 30), { d: -53.666468932103676, s: 491.13551517747317 });
});

test('terrain range covers the full west headland shelf and retains old grid alignment', () => {
  assert.equal(GRID.minX + GRID.nx * CELL, 280);
  assert.equal(GRID.nx % 4, 0); assert.equal(GRID.nz % 4, 0);
  assert.equal(Math.abs((GRID.minX + 176) % 2), 0);
  for (const [x, z] of FACTORY_CAPE) {
    assert.ok(x - GRID.minX >= 27 && GRID.minX + GRID.nx * CELL - x >= 27);
    assert.ok(z - GRID.minZ >= 27 && GRID.minZ + GRID.nz * CELL - z >= 27);
  }
});

// Explicit opt-in: the caller serializes this full-island job against browser/build work.
test('rendered and collided mesh supports the factory, its road and coarse inland blocks', { skip: process.env.FACTORY_TERRAIN_MESH !== '1' }, () => {
  const terrain = buildTerrain();
  for (const box of [FACTORY.building, FACTORY.courtyard]) {
    for (let x = box.minX; x <= box.maxX; x += 5) for (let z = box.minZ; z <= box.maxZ; z += 5) {
      assert.ok(Math.abs(meshHeight(x, z) - 1) < .001, `mesh gap ${x},${z}`);
    }
  }
  let coarse = 0;
  for (let x = -239; x < -155; x += 2) for (let z = -15; z < 40; z += 2) {
    const bi = Math.floor((x - GRID.minX) / 2), bj = Math.floor((z - GRID.minZ) / 2);
    if (terrain.blocks.kind[bj * terrain.blocks.NB + bi] === 3) coarse++;
  }
  assert.ok(coarse > 1000, `factory inland still needs fine triangles: ${coarse}`);
  routeSamples((x, z, nx, nz) => {
    for (const side of [-5.5, 0, 5.5]) assert.ok(meshHeight(x + nx * side, z + nz * side) >= .96);
  });
  const chunks = pavingMesh().chunks;
  routeSamples((x, z) => {
    let covered = false;
    for (const c of chunks) for (let k = 0; !covered && k < c.top.length; k += 3) {
      const a = c.top[k] * PAVE_STRIDE, b = c.top[k + 1] * PAVE_STRIDE, d = c.top[k + 2] * PAVE_STRIDE, v = c.v;
      const den = (v[b] - v[a]) * (v[d + 2] - v[a + 2]) - (v[d] - v[a]) * (v[b + 2] - v[a + 2]);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((x - v[a]) * (v[d + 2] - v[a + 2]) - (v[d] - v[a]) * (z - v[a + 2])) / den;
      const w = ((v[b] - v[a]) * (z - v[a + 2]) - (x - v[a]) * (v[b + 2] - v[a + 2])) / den;
      const y = v[a + 1] + u * (v[b + 1] - v[a + 1]) + w * (v[d + 1] - v[a + 1]);
      if (u >= -1e-6 && w >= -1e-6 && u + w <= 1 + 1e-6 && Math.abs(y - ROAD_Y) < .01) covered = true;
    }
    assert.ok(covered, `missing road collider triangle ${x},${z}`);
  });
  console.log(JSON.stringify({ coarseFactoryInlandBlocks: coarse, terrain: terrain.stats }));
});
