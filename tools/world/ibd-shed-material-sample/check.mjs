import { Ray, Triangle, Vector3 } from 'three';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';
import { IBD_SHEDS, IBD_STATIONS } from '../../../src/components/world/attractions/ibd-yard-layout.ts';

function digest(...values) {
  const hash = createHash('sha256');
  for (const value of values) hash.update(ArrayBuffer.isView(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : JSON.stringify(value));
  return hash.digest('hex');
}
function geometry(g) {
  return { vertices: g.attributes.position.count, triangles: g.index.count / 3, indexBytes: g.index.array.byteLength,
    attributes: Object.fromEntries(Object.entries(g.attributes).map(([key, value]) => [key, value.array.byteLength])),
    hash: digest(g.index.array, ...Object.values(g.attributes).map(a => a.array)) };
}
function read(options) {
  const d = buildIbdStatic({ separateCraftShells: true, ...options });
  return {
    fixed: { solids: digest(d.solids), walkSurface: digest(d.walkSurface.vertices, d.walkSurface.indices),
      groundSurface: digest(d.groundSurface.vertices, d.groundSurface.indices),
      stations: digest(IBD_STATIONS), buildings: digest(IBD_SHEDS), equipment: geometry(d.craftShellGeometry) },
    architecture: geometry(d.geometry),
  };
}
const baseline = read({ coilBaySample: false });
if (process.argv.includes('--freeze')) console.log(JSON.stringify(baseline, null, 2));
else {
  const frozen = JSON.parse(readFileSync(new URL('./baseline.json', import.meta.url)));
  assert.deepEqual(baseline, frozen);
  const candidate = read({ coilBaySample: true });
  assert.deepEqual(candidate.fixed, frozen.fixed);
  assert(candidate.architecture.attributes.aIbdCladding > 0);
  const { geometry: g } = buildIbdStatic({ separateCraftShells: true, coilBaySample: true });
  const roles = g.getAttribute('aIbdCladding'), p = g.getAttribute('position'), m = g.getAttribute('aMat');
  const counts = {};
  const markedTriangles = [];
  for (let i = 0; i < g.index.count; i += 3) {
    const vertices = [0, 1, 2].map(k => g.index.getX(i + k));
    const role = roles.getX(vertices[0]);
    if (!role) {
      assert(vertices.every(v => roles.getX(v) === 0));
      continue;
    }
    assert(vertices.every(v => roles.getX(v) === role && m.getW(v) === 0 && m.getZ(v) === 0));
    const points = vertices.map(v => new Vector3().fromBufferAttribute(p, v));
    assert(points.every(v => v.x >= -31.5 && v.x <= -2.5 && v.z >= -9.54 && v.z <= 5.51));
    const tri = new Triangle(...points);
    assert(tri.getArea() > 1e-8);
    markedTriangles.push({ role, points });
    counts[role] = (counts[role] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(counts), ['1','2','3','4','5']);
  const wall = (y, z) => {
    const ray = new Ray(new Vector3(-30, y, z), new Vector3(-1, 0, 0));
    const hits = markedTriangles.filter(t => t.role === 1)
      .map(t => ray.intersectTriangle(...t.points, false, new Vector3())).filter(Boolean);
    assert.equal(hits.length, 1);
    return hits[0].x;
  };
  const actualFold = wall(4.11,-9.42) - wall(4.11,-9.2);
  assert(Math.abs(actualFold - .056) < 1e-5, '56 mm pressed rib');
  // Bearing block centres sit inside the top of both existing front columns.
  for (const [x, side] of [[-31,-1],[-3,1]]) {
    const bearing = markedTriangles.filter(t => t.role === 3 && t.points.every(v =>
      Math.abs(v.x - (x - side * .09)) < .287 && Math.abs(v.y - 10.417) < .064 && Math.abs(v.z - 5) < .152));
    assert(bearing.length >= 12);
    assert(bearing.some(t => t.points.some(v => Math.abs(v.x-x) < .24 && v.y < 10.6)));
  }
  console.log(JSON.stringify({ baseline, candidate, samples: { roleTriangles: counts, actualFold, eaveBearingContacts: 2 } }, null, 2));
}
