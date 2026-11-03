import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Ray, Vector3 } from 'three';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';
import { IBD_GEOMETRY_BUDGET } from '../../../src/components/world/attractions/ibd-geometry-budget.ts';

const options = { separateCraftShells: true, shedExpansion: true };
const base = buildIbdStatic(options);
const sample = buildIbdStatic({ ...options, rackMode: 'sample' });
const family = buildIbdStatic({ ...options, rackMode: 'family' });
const rackCentres = [5, 13, 23];
for (const key of ['solids', 'walkSurface', 'groundSurface']) {
  assert.deepEqual(base[key], sample[key]);
  assert.deepEqual(base[key], family[key]);
}

function surroundingHash(geometry, centres = [13]) {
  const hash = createHash('sha256');
  const p = geometry.attributes.position;
  const values = Object.values(geometry.attributes);
  for (let i = 0; i < geometry.index.count; i += 3) {
    const ids = [0, 1, 2].map(j => geometry.index.getX(i + j));
    const inRack = centres.some(x => ids.every(v => Math.abs(p.getX(v) - x) <= 3.201
      && p.getY(v) <= 5.001 && p.getZ(v) >= -24.701 && p.getZ(v) <= -21.289));
    if (inRack) continue;
    for (const id of ids) for (const a of values) {
      const start = a.array.byteOffset + id * a.itemSize * a.array.BYTES_PER_ELEMENT;
      hash.update(Buffer.from(a.array.buffer, start, a.itemSize * a.array.BYTES_PER_ELEMENT));
    }
  }
  return hash.digest('hex');
}
assert.equal(surroundingHash(sample.geometry), surroundingHash(base.geometry));

const familySurrounding = surroundingHash(family.geometry, rackCentres);
assert.equal(familySurrounding, surroundingHash(base.geometry, rackCentres));

const g = sample.geometry;
function firstHit(origin, direction, metal, geometry = g) {
  const { position, aMat } = geometry.attributes;
  const ray = new Ray(new Vector3(...origin), new Vector3(...direction));
  let closest = Infinity;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const ids = [0, 1, 2].map(j => geometry.index.getX(i + j));
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

// Ray hits come from the actual paving collision triangles, not a rectangular proxy.
const ground = family.groundSurface;
let pavingHits = 0;
for (const rackX of rackCentres) for (const postX of [-3, 3]) for (const postZ of [-24.5, -21.5]) {
  for (const dx of [-.17, 0, .17]) for (const dz of [-.17, 0, .17]) {
    const ray = new Ray(new Vector3(rackX + postX + dx, 1, postZ + dz), new Vector3(0, -1, 0));
    let closest = Infinity;
    for (let i = 0; i < ground.indices.length; i += 3) {
      const points = [0, 1, 2].map(j => new Vector3().fromArray(ground.vertices, ground.indices[i + j] * 3));
      const hit = ray.intersectTriangle(...points, true, new Vector3());
      if (hit) closest = Math.min(closest, hit.distanceTo(ray.origin));
    }
    near(closest, .915);
    pavingHits++;
  }
  for (const shelf of [.4, 2.5, 4.7]) {
    const z = postZ < -23 ? -24.58 : -21.42;
    const x = rackX + postX * .1;
    near(firstHit([x, shelf - .047, z], [0, -1, 0], .13, family.geometry), .005);
    near(firstHit([x, shelf - .060, z], [0, 1, 0], .29, family.geometry), .008);
  }
}
assert(family.geometry.index.count / 3 < IBD_GEOMETRY_BUDGET.static);

const size = geometry => Object.values(geometry.attributes)
  .reduce((n, a) => n + a.array.byteLength, geometry.index.array.byteLength);
console.log(JSON.stringify({
  base: { triangles: base.geometry.index.count / 3, bytes: size(base.geometry) },
  sample: { triangles: g.index.count / 3, bytes: size(g) },
  family: { triangles: family.geometry.index.count / 3, bytes: size(family.geometry), pavingHits, surroundingHash: familySurrounding },
  surroundingHash: surroundingHash(g),
  contactY: tier - .052,
}));
