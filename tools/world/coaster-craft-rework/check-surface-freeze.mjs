import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCoasterStructure } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';
import { INTENT_CRAFT_ATTRIBUTE } from '../../../src/components/world/attractions/intent-craft-surface.ts';

// Load the actual preceding generators from Git without editing or checking
// out production files. Compare all existing channels and physics buffers.
const dir = new URL('../../../src/components/world/attractions/', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const temp = [];
const baseline = name => {
  const url = new URL(`.craft-freeze-${randomUUID()}.ts`, dir);
  const source = execFileSync('git', ['show', `395cbbf:src/components/world/attractions/${name}`]);
  writeFileSync(fileURLToPath(url), source, { flag: 'wx' });
  temp.push(url);
  return import(url.href);
};
const geometryDigest = g => Object.fromEntries(Object.entries(g.attributes)
  .filter(([key]) => key !== INTENT_CRAFT_ATTRIBUTE).map(([key, a]) => [key, hash(bytes(a.array))]));
const geometryCost = (before, after, expectTags = true) => {
  assert.deepEqual(geometryDigest(after), geometryDigest(before));
  assert.deepEqual(after.index?.array, before.index?.array);
  assert.deepEqual(after.groups, before.groups);
  const tag = after.getAttribute(INTENT_CRAFT_ATTRIBUTE);
  if (!expectTags) {
    assert.equal(tag, undefined, 'Held workshop surfaces must retain the baseline material path');
    return { vertices: after.getAttribute('position').count, extraAttributeBytes: 0, roleVertices: {} };
  }
  assert.ok(tag?.array instanceof Uint8Array);
  assert.equal(tag.count, after.getAttribute('position').count);
  const counts = {};
  for (const role of tag.array) counts[role] = (counts[role] ?? 0) + 1;
  return { vertices: tag.count, extraAttributeBytes: tag.array.byteLength, roleVertices: counts };
};
try {
  const baseCoaster = await baseline('coaster-geometry.ts');
  const baseWorkshop = await baseline('intent-workshop-geometry.ts');
  const result = {};
  for (const detailed of [false, true]) {
    const before = baseCoaster.createCoasterStructure(detailed), after = createCoasterStructure(detailed);
    try {
      result[detailed ? 'coasterNear' : 'coasterFar'] = geometryCost(before.steel, after.steel);
      assert.deepEqual(geometryDigest(after.glow), geometryDigest(before.glow));
      assert.deepEqual(after.colliders, before.colliders);
      assert.deepEqual(after.track, before.track);
      assert.deepEqual(after.relief, before.relief);
    } finally { for (const s of [before, after]) { s.steel.dispose(); s.glow.dispose(); } }
  }
  const before = baseWorkshop.createWorkshopGeometry(), after = createWorkshopGeometry();
  try {
    result.workshop = geometryCost(before.body, after.body, false);
    assert.deepEqual(after.contactSurface, before.contactSurface);
    assert.deepEqual(geometryDigest(after.glow), geometryDigest(before.glow));
  } finally { for (const s of [before, after]) { s.body.dispose(); s.glow.dispose(); } }
  console.log(JSON.stringify({ baseline: '395cbbf', geometryAndContactsUnchanged: true, ...result }));
} finally { for (const url of temp) unlinkSync(fileURLToPath(url)); }
