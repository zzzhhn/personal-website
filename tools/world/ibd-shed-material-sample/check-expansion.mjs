import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';
import { IBD_SHEDS } from '../../../src/components/world/attractions/ibd-yard-layout.ts';
import { IBD_GEOMETRY_BUDGET } from '../../../src/components/world/attractions/ibd-geometry-budget.ts';

const read = options => buildIbdStatic({ separateCraftShells: true, ...options });
const baseline = read();
const geometryHash = g => {
  const hash = createHash('sha256');
  for (const a of [g.index, ...Object.values(g.attributes)]) hash.update(Buffer.from(a.array.buffer));
  return hash.digest('hex');
};
const d = read({ shedExpansion: true }), g = d.geometry, roles = g.attributes.aIbdCladding;
const fingerprint = (...values) => {
  const hash = createHash('sha256');
  for (const value of values) hash.update(ArrayBuffer.isView(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : JSON.stringify(value));
  return hash.digest('hex');
};
assert(g.index.count / 3 < IBD_GEOMETRY_BUDGET.static);
const p = g.attributes.position, normal = g.attributes.normal, mat = g.attributes.aMat;
assert.deepEqual(d.solids, baseline.solids);
assert.deepEqual(d.walkSurface, baseline.walkSurface);
assert.deepEqual(d.groundSurface, baseline.groundSurface);
assert.equal(geometryHash(d.craftShellGeometry), geometryHash(baseline.craftShellGeometry));
const counts = {};
const sides = IBD_SHEDS.map(() => new Set());
for (let i = 0; i < g.index.count; i += 3) {
  const ids = [g.index.getX(i), g.index.getX(i+1), g.index.getX(i+2)];
  const v = ids[0], code = roles.getX(v), role = code % 16, building = code >> 4;
  assert(ids.every(j => roles.getX(j) === code));
  if (!role) continue;
  assert(ids.every(j => mat.getW(j) === 0 && mat.getZ(j) === 0));
  counts[code] = (counts[code] ?? 0) + 1;
  if (role === 1 || role === 6) {
    const shed = IBD_SHEDS[building];
    const plane = role === 6 ? shed.z - shed.depth/2 : shed.x + (building === 0 ? -1 : 1)*shed.width/2;
    const offset = (role === 6 ? p.getZ(v) : p.getX(v)) - plane;
    const component = role === 6 ? normal.getZ(v) : normal.getX(v);
    assert(Math.abs(offset) >= .1089 && Math.abs(offset) <= .1651);
    assert(component * offset > 0);
    sides[building].add(role + ':' + Math.sign(offset));
  }
}
assert.deepEqual(sides.map(x => x.size), [4,4,2]);
const bytes = Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index.array.byteLength);
console.log(JSON.stringify({ triangles: g.index.count/3, bytes, roles: counts, fixed: {
  solids: fingerprint(d.solids),
  walkSurface: fingerprint(d.walkSurface.vertices, d.walkSurface.indices),
  groundSurface: fingerprint(d.groundSurface.vertices, d.groundSurface.indices),
  fallbackEquipment: geometryHash(d.craftShellGeometry),
} }));
