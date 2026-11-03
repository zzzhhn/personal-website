import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Ray, Vector3 } from 'three';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';
import { IBD_GEOMETRY_BUDGET } from '../../../src/components/world/attractions/ibd-geometry-budget.ts';

const options = { separateCraftShells: true, shedExpansion: true };
const base = buildIbdStatic(options);
const sample = buildIbdStatic({ ...options, rackSample: true });
for (const key of ['solids', 'walkSurface', 'groundSurface']) assert.deepEqual(base[key], sample[key]);

function surroundingHash(geometry) {
  const hash = createHash('sha256');
  const p = geometry.attributes.position;
  const values = Object.values(geometry.attributes);
  for (let i = 0; i < geometry.index.count; i += 3) {
    const ids = [0, 1, 2].map(j => geometry.index.getX(i + j));
    const inRack = ids.every(v => Math.abs(p.getX(v) - 13) <= 3.201
      && p.getY(v) <= 5.001 && p.getZ(v) >= -24.701 && p.getZ(v) <= -21.289);
    if (inRack) continue;
    for (const id of ids) for (const a of values) {
      const start = a.array.byteOffset + id * a.itemSize * a.array.BYTES_PER_ELEMENT;
      hash.update(Buffer.from(a.array.buffer, start, a.itemSize * a.array.BYTES_PER_ELEMENT));
    }
  }
  return hash.digest('hex');
}
assert.equal(surroundingHash(sample.geometry), surroundingHash(base.geometry));

const g = sample.geometry;
const { position, aMat } = g.attributes;
function firstHit(origin, direction, metal) {
  const ray = new Ray(new Vector3(...origin), new Vector3(...direction));
  let closest = Infinity;
  for (let i = 0; i < g.index.count; i += 3) {
    const ids = [0, 1, 2].map(j => g.index.getX(i + j));
    if (!ids.every(v => Math.abs(aMat.getY(v) - metal) < 1e-5 && aMat.getZ(v) === 0)) continue;
    const points = ids.map(v => new Vector3().fromBufferAttribute(position, v));
    const hit = ray.intersectTriangle(...points, false, new Vector3());
    if (hit) closest = Math.min(closest, hit.distanceTo(ray.origin));
  }
  return closest;
}
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-5, `${actual} vs ${expected}`);
const tier = 2.5;
near(firstHit([12.7, tier, -21], [0, 0, -1], .29), .3);
near(firstHit([12.7, tier - .155, -21], [0, 0, -1], .13), .415);
// Both actual faces meet at tier - .052 with 115 mm of plan overlap.
near(firstHit([12.7, tier - .047, -21.42], [0, -1, 0], .13), .005);
near(firstHit([12.7, tier - .060, -21.42], [0, 1, 0], .29), .008);
assert(g.index.count / 3 < IBD_GEOMETRY_BUDGET.static);

const size = geometry => Object.values(geometry.attributes)
  .reduce((n, a) => n + a.array.byteLength, geometry.index.array.byteLength);
console.log(JSON.stringify({
  base: { triangles: base.geometry.index.count / 3, bytes: size(base.geometry) },
  sample: { triangles: g.index.count / 3, bytes: size(g) },
  surroundingHash: surroundingHash(g),
  contactY: tier - .052,
}));
