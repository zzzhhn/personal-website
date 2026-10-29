import { buildTerrain, grassCandidates, scatterCandidates, shoreField, meshHeight, terrainHeight, nearestDryPoint, islandShoreline } from '../../../../../src/components/world/WorldLandform';
import { TRAIL_V4, TERRAIN_ROADS_V4, ROAD_Y, SHORE_SAMPLES_V4, xz, pointAt, polylineLength, rightOf } from '../../../../../src/components/world/layout-v4';
const t0 = performance.now(); const t = buildTerrain(); const t1 = performance.now();
const g = grassCandidates([]); const t2 = performance.now(); scatterCandidates([]); const t3 = performance.now(); const f = shoreField(); const t4 = performance.now();
// Terrain must stay below every paved slab top: sample each paved road across its full width.
let worst = { over: -Infinity, at: null as unknown }; const bad: unknown[] = [];
for (const r of TERRAIN_ROADS_V4.filter(r => r.id !== 'camp-ramp')) {
  const total = polylineLength(r.pts);
  for (let s = 0; s <= total; s += .4) {
    const q = pointAt(r.pts, s), rr = rightOf(q.dir);
    for (let w = -(r.half - .2); w <= r.half - .2 + 1e-6; w += .45) {
      const x = q.p[0] + rr[0] * w, z = q.p[1] + rr[1] * w, h = meshHeight(x, z);
      if (h === null) continue;
      const over = h - q.y;
      if (over > worst.over) worst = { over, at: [r.id, +x.toFixed(2), +z.toFixed(2), +q.y.toFixed(2), +h.toFixed(3)] };
      if (over > -.03) bad.push([r.id, +x.toFixed(1), +z.toFixed(1), +over.toFixed(3)]);
    }
  }
}
const dry = SHORE_SAMPLES_V4.map(s => ({ id: s.id, dry: nearestDryPoint(s.p[0], s.p[1])?.map(v => +v.toFixed(2)) ?? null }));
const shore = islandShoreline(); let minZ = Infinity, minX = Infinity; for (const [x, z] of shore) { minZ = Math.min(minZ, z); minX = Math.min(minX, x); }
console.log(JSON.stringify({ terrainMs: Math.round(t1 - t0), triangles: t.stats.triangles, fine: t.stats.fineBlocks, coarse: t.stats.coarseBlocks, maxWalkableDeg: +t.stats.maxWalkableDeg.toFixed(2), grassMs: Math.round(t2 - t1), grass: g.length / 6, scatterMs: Math.round(t3 - t2), shoreMs: Math.round(t4 - t3), shoreBytes: f.data.length, terrainOverRoadTop: worst, overCount: bad.length, overByRoad: Object.entries(bad.reduce((m: Record<string, number>, b) => { const k = (b as string[])[0]; m[k] = (m[k] || 0) + 1; return m; }, {})), overSample: bad.slice(0, 6), dry, shoreExtent: { minX: +minX.toFixed(1), minZ: +minZ.toFixed(1) }, ridgeTop: terrainHeight(-30, -84) }));
