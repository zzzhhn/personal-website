/** Offline geometry checks for the quality-v3 terrain (same buffers as render + Rapier).
 * Run: node_modules/.bin/tsx tools/world/environment/verify-geometry.ts [outDir] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildTerrain, meshHeight, islandShoreline, ISLAND_CENTROID, WALKABLE_DEG, beachWidth, coastFrame, townFactor, rockPlacements, shoreField, nearestDryPoint } from '../../../src/components/world/WorldLandform';
import { createSeaGeometry } from '../../../src/components/world/WorldWater';
import { BUILDINGS, CAMP_CENTER, CAMP_SPAWN, FOUNDATIONS, ROAD_POINTS, VEHICLES, WATER_Y } from '../../../src/components/world/layout';

const out = process.argv[2] || 'docs/world/quality-v3/environment/geometry';
mkdirSync(out, { recursive: true });
const t = buildTerrain(), P = t.positions, checks: { name: string; pass: boolean; value: unknown; limit: string }[] = [];
const check = (name: string, pass: boolean, value: unknown, limit: string) => checks.push({ name, pass, value, limit });

check('no NaN vertex', P.every(Number.isFinite), P.length / 3, 'all finite');
// Slope split: every surface triangle <= 25 deg, every solid triangle > 25 deg.
const slope = (idx: Uint32Array, k: number) => {
  const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  return { deg: Math.acos(Math.abs(ny) / Math.hypot(nx, ny, nz)) * 180 / Math.PI, up: ny > 0 };
};
let maxSurface = 0, minSolid = 90, downSurface = 0;
const hist: Record<string, number> = {};
for (let k = 0; k < t.surface.length; k += 3) { const s = slope(t.surface, k); maxSurface = Math.max(maxSurface, s.deg); if (!s.up) downSurface++; const bin = `${Math.floor(s.deg / 5) * 5}-${Math.floor(s.deg / 5) * 5 + 5}`; hist[bin] = (hist[bin] ?? 0) + 1; }
for (let k = 0; k < t.solid.length; k += 3) minSolid = Math.min(minSolid, slope(t.solid, k).deg);
check('surface triangles <= 25 deg (standable)', maxSurface <= WALKABLE_DEG + 1e-6, +maxSurface.toFixed(3), `<= ${WALKABLE_DEG}`);
check('surface triangles face up', downSurface === 0, downSurface, '0 downward');
check('solid triangles > 25 deg', minSolid > WALKABLE_DEG, +minSolid.toFixed(3), `> ${WALKABLE_DEG}`);

// Roads: terrain never above any road top (segments 0-6; bridge excluded), and no gap > 0.35 m
// under the 0.18 m slabs on the ramp (embankment carries the slab).
let above = -9, gap = 0;
for (let i = 0; i < 7; i++) {
  const a = ROAD_POINTS[i], b = ROAD_POINTS[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  for (let s = 0; s <= 1.0001; s += .01) for (let l = -5.35; l <= 5.351; l += .25) {
    const x = a[0] + (b[0] - a[0]) * s - (b[2] - a[2]) / L * l, z = a[2] + (b[2] - a[2]) * s + (b[0] - a[0]) / L * l, y = a[1] + (b[1] - a[1]) * s;
    const h = meshHeight(x, z) ?? -9; above = Math.max(above, h - y);
    if (Math.abs(l) <= 4 && i <= 1) gap = Math.max(gap, y - .18 - h);
  }
}
check('terrain below every road top', above <= 0, +above.toFixed(3), '<= 0 m');
check('camp exit/ramp slab supported', gap <= .35, +gap.toFixed(3), '<= 0.35 m gap below slab');
// Existing placements keep their coordinates and stay supported.
/** Distance to the plan rectangle of a road slab box (segment length + 0.28, width 10.7 incl.
 * edge strips), i.e. where the existing road already covers the ground in plan. */
const underRoadSlab = (x: number, z: number, margin = 0) => ROAD_POINTS.slice(0, 7).some((a, i) => {
  const b = ROAD_POINTS[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), dx = (b[0] - a[0]) / L, dz = (b[2] - a[2]) / L;
  const along = (x - a[0]) * dx + (z - a[2]) * dz, lateral = Math.abs((x - a[0]) * dz - (z - a[2]) * dx);
  return along > -.14 - margin && along < L + .14 + margin && lateral < 5.35 + margin;
});
const flat = (name: string, x: number, z: number, w: number, d: number, top: number) => {
  let lo = 9, hi = -9, roadCovered = 0;
  for (let u = -.5; u <= .5; u += .1) for (let v = -.5; v <= .5; v += .1) {
    const px = x + u * w, pz = z + v * d;
    // Ground under an existing slab is the slab's support; within one 0.5 m lattice cell of a
    // slab edge the embankment face is interpolated (foundation-contact overlaps the ramp in plan).
    if (underRoadSlab(px, pz, .6)) { roadCovered++; continue; }
    // The plateau rim beside the descending ramp is cut down by its 64 deg retaining face.
    if (name.startsWith('camp') && ROAD_POINTS.slice(1, 3).some((a, i) => { const b = ROAD_POINTS[i + 2], L = Math.hypot(b[0] - a[0], b[2] - a[2]); const t = Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (pz - a[2]) * (b[2] - a[2])) / L / L)); return Math.hypot(px - a[0] - (b[0] - a[0]) * t, pz - a[2] - (b[2] - a[2]) * t) < 12.5; })) { roadCovered++; continue; }
    if (name.startsWith('camp') && Math.hypot(px - CAMP_CENTER[0], pz - CAMP_CENTER[2]) > 24) continue;
    const h = meshHeight(px, pz) ?? -9; lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { name, lo: +lo.toFixed(3), hi: +hi.toFixed(3), top, roadCoveredSamples: roadCovered };
};
const footprints = [
  ...BUILDINGS.map(b => flat('building-' + b.id, b.position[0], b.position[2], b.size[0], b.size[2], b.position[1])),
  // Foundations: sampled 0.6 m inside their edge (one lattice cell); a retaining face may touch the edge line.
  ...FOUNDATIONS.map(f => flat('foundation-' + f.id, f.position[0], f.position[2], f.size[0] - 1.2, f.size[2] - 1.2, f.position[1] + f.size[1] / 2)),
  flat('camp-plateau r<=24', CAMP_CENTER[0], CAMP_CENTER[2], 33.9, 33.9, CAMP_CENTER[1]),
];
// Camp plateau: flat 4.80 with <= 5 cm relief on the grass rim (pads/props sit on their own colliders).
const badFoot = footprints.filter(f => f.name.startsWith('camp') ? f.lo < 4.79 || f.hi > 4.851 : f.hi > f.top + .001 || f.lo < f.top - (f.name.startsWith('foundation') ? .25 : .1) - .001);
check('footprints supported, terrain never above their base/top (outside existing road slabs)', badFoot.length === 0, footprints, 'support within 0.1 m (foundations 0.25 m), never above; camp 4.79-4.85');
const spawn = meshHeight(CAMP_SPAWN[0], CAMP_SPAWN[2]);
check('camp spawn ground unchanged', Math.abs((spawn ?? 0) - 4.8) < .03, spawn, '4.80 +- 0.03');
check('vehicle spots (offroad on ramp head embankment, coupe on bay)', [VEHICLES[0], VEHICLES[1]].every(v => (meshHeight(v.position[0], v.position[2]) ?? -9) <= v.position[1]), VEHICLES.map(v => [v.id, meshHeight(v.position[0], v.position[2])]), 'terrain <= road surface');

// Coast: shoreline polygon, radius deviation, beach widths, underwater slope.
const shore = islandShoreline(), rad = shore.map(([x, z]) => Math.hypot(x - ISLAND_CENTROID[0], z - ISLAND_CENTROID[1]));
// Deviation from a smoothed radius as a proxy for bays/headlands. A +-30 deg window covers
// about 78 m of this coast and suppresses the specified 30-50 m features, so it is retained
// only as a broad-shape diagnostic. The +-20 deg window (about 52 m) is the spacing gate.
const deviation = (half: number) => rad.map((r, i) => { let s = 0; for (let k = -half; k <= half; k++) s += rad[(i + k + 360) % 360]; return r / (s / (2 * half + 1)) - 1; });
const crossings = (d: number[]) => d.filter((v, i) => v < 0 && d[(i + 1) % 360] >= 0).length;
const broadDev = deviation(30), dev = deviation(20);
const bays = crossings(dev), broadBays = crossings(broadDev);
let perimeter = 0; for (let i = 0; i < shore.length; i++) perimeter += Math.hypot(shore[(i + 1) % 360][0] - shore[i][0], shore[(i + 1) % 360][1] - shore[i][1]);
const spacing = perimeter / Math.max(1, bays);
check('irregular shoreline (local radius deviation)', Math.max(...dev) - Math.min(...dev) > .06 && spacing >= 30 && spacing <= 50, { gateWindowDeg: 20, minDev: +Math.min(...dev).toFixed(3), maxDev: +Math.max(...dev).toFixed(3), bayToHeadlandCrossings: bays, perimeter: +perimeter.toFixed(1), metresPerCrossing: +spacing.toFixed(1), broadWindowDeg30: { crossings: broadBays, metresPerCrossing: +(perimeter / Math.max(1, broadBays)).toFixed(1) } }, 'deviation range > 6 %, 30-50 m per bay/headland crossing');
const widths: number[] = []; for (let s = 0; s < 348; s += 2) widths.push(beachWidth(s));
check('beach width (non-town coast, top edge to waterline)', Math.min(...widths) >= 5 && Math.max(...widths) <= 12, { min: +Math.min(...widths).toFixed(2), max: +Math.max(...widths).toFixed(2) }, '5-12 m');
// Underwater: march outward along the coast normal (gradient of the coast distance) from the
// waterline until the mesh reaches -2.5 m; non-town coast only.
const reach: number[] = [];
for (let k = 0; k < 360; k += 4) {
  let [x, z] = shore[k];
  if (townFactor(x, z) > .3 || Math.hypot(x - 45, z + 45) < 16) continue;
  let r = 0;
  while (r < 40 && (meshHeight(x, z) ?? -20) > -2.5) {
    const e = .2, gx = coastFrame(x + e, z).d - coastFrame(x - e, z).d, gz = coastFrame(x, z + e).d - coastFrame(x, z - e).d, l = Math.hypot(gx, gz) || 1;
    x += gx / l * .25; z += gz / l * .25; r += .25;
  }
  reach.push(r);
}
const within = reach.filter(r => r >= 8 && r <= 20).length / reach.length;
check('underwater shelf to -2.5 m along coast normal', within >= .9, { samples: reach.length, min: Math.min(...reach), max: Math.max(...reach), mean: +(reach.reduce((a, b) => a + b, 0) / reach.length).toFixed(1), share8to20: +within.toFixed(2) }, '>= 90 % of samples reach -2.5 m within 8-20 m');
// Rocks: none floats (base at or below the lowest footprint ground, or below the waterline).
check('rock groups seated', rockPlacements().every(r => r.position[1] <= WATER_Y + .01 || r.relief >= 0), rockPlacements().map(r => [r.id, r.position.map(v => +v.toFixed(2))]), 'seat = lowest footprint ground');
// Water recovery helper: nearest dry point from several sea spots is on land.
const rec = [[-90, 10], [0, 75], [10, -80], [40, 20]].map(([x, z]) => ({ from: [x, z], to: nearestDryPoint(x, z) }));
check('nearestDryPoint lands on terrain above water', rec.every(r => r.to && r.to[1] > WATER_Y + .5), rec, 'h > WATER_Y + 0.5');
const field = shoreField();
const sea = createSeaGeometry();
const report = {
  generatedAt: new Date().toISOString(), terrain: t.stats, slopeHistogramSurface: hist,
  seaTriangles: sea.index!.count / 3, shoreFieldBytes: field.data.length, checks,
  passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).map(c => c.name),
};
writeFileSync(`${out}/geometry-report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${out}/island-shoreline.json`, JSON.stringify({ note: 'Waterline polygon (x, z) at WATER_Y from WorldLandform.islandShoreline(); park plaza block excluded', points: shore.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) }));
console.log(JSON.stringify({ terrain: t.stats, seaTriangles: report.seaTriangles, passed: report.passed, failed: report.failed, checks: checks.map(c => [c.name, c.pass, typeof c.value === 'object' ? JSON.stringify(c.value).slice(0, 160) : c.value]) }, null, 1));
