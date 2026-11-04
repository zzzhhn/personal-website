import assert from 'node:assert/strict';
import { createCoasterStructure } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { packCoasterStructure, unpackCoasterStructure } from '../../../src/components/world/attractions/coaster-structure-transfer.ts';

const attribute = 'intentCraftSurface';
function measure({ steel, glow }) {
  const roles = {};
  for (const role of steel.getAttribute(attribute).array) roles[role] = (roles[role] ?? 0) + 1;
  return {
    triangles: (steel.getAttribute('position').count + glow.getAttribute('position').count) / 3,
    attributeBytes: Object.values(steel.attributes).reduce((sum, a) => sum + a.array.byteLength, 0),
    roles,
  };
}
for (const detailed of [false, true]) {
  const old = createCoasterStructure(detailed, 'legacy');
  const short = createCoasterStructure(detailed, 'short');
  const full = createCoasterStructure(detailed);
  const oldStats = measure(old), shortStats = measure(short), fullStats = measure(full);
  for (const [name, newAttribute] of Object.entries(full.glow.attributes)) {
    assert.deepEqual(newAttribute.array, old.glow.getAttribute(name).array);
  }
  for (const key of ['track','relief','colliders']) assert.deepEqual(full[key], old[key]);
  assert.equal(full.steel.groups.length, old.steel.groups.length);
  assert.equal(full.glow.groups.length, old.glow.groups.length);
  for (const role of [12, 13, 14, 15]) assert.ok(fullStats.roles[role] > (oldStats.roles[role] ?? 0));
  const expected = full.steel.getAttribute(attribute).array.slice();
  const {packet,transfer} = packCoasterStructure(full);
  const hydrated = unpackCoasterStructure(structuredClone(packet, {transfer}));
  const result = hydrated.steel.getAttribute(attribute);
  assert.ok(result.array instanceof Uint8Array);
  assert.equal(result.normalized, false);
  assert.deepEqual(result.array, expected);
  console.log(JSON.stringify({lod: detailed?'near':'far', old:oldStats, short:shortStats, full:fullStats,
    deltaTriangles: fullStats.triangles-oldStats.triangles, colliderCount:hydrated.colliders.length}));
  for (const s of [old,short,full,hydrated]) { s.steel.dispose(); s.glow.dispose(); }
}
