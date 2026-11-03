import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { CoasterBatch } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { addIntakeRollerSupports, createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';
import { coasterWorld } from '../../../src/components/world/attractions/coaster-track.ts';
import { WORKSHOP_INTAKE } from '../../../src/components/world/attractions/intent-workshop-layout.ts';

const base = 'fba5d04';
const source = 'src/components/world/attractions/intent-workshop-geometry.ts';
const snapshot = new URL(`../../../src/components/world/attractions/.intake-freeze-${randomUUID()}.ts`, import.meta.url);
const digest = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const close = (a, b) => Math.abs(a - b) < 1e-5;
const vertices = g => g.getAttribute('position').count;
const bytes = g => Object.values(g.attributes).reduce((size, attribute) => size + attribute.array.byteLength, 0);
const bounds = g => {
  g.computeBoundingBox();
  return g.boundingBox;
};
const [x, y, z] = coasterWorld(WORKSHOP_INTAKE);
const railBounds = [-.96, .52].map(center => new Box3(
  new Vector3(x + center - .06, y + 1.34, z - .825),
  new Vector3(x + center + .06, y + 1.62, z + .825),
));

writeFileSync(snapshot, execFileSync('git', ['show', `${base}:${source}`]), { flag: 'wx' });
try {
  const old = (await import(snapshot.href)).createWorkshopGeometry();
  const sample = createWorkshopGeometry();
  assert.deepEqual(sample.contactSurface, old.contactSurface);
  for (const [name, attr] of Object.entries(old.glow.attributes)) {
    assert.deepEqual(sample.glow.getAttribute(name).array, attr.array);
  }
  for (const g of [old.body, sample.body]) bounds(g);
  assert.deepEqual(sample.body.boundingBox, old.body.boundingBox);

  const batch = new CoasterBatch();
  addIntakeRollerSupports(batch);
  assert.equal(batch.parts.length, 38);
  const oldPos = old.body.getAttribute('position');
  const oldKeep = [];
  const position = new Vector3();
  for (let i = 0; i < oldPos.count; i += 3) {
    const isSolidRail = railBounds.some(box => [i, i + 1, i + 2].every(j => {
      position.fromBufferAttribute(oldPos, j);
      return box.distanceToPoint(position) < 1e-5;
    }));
    if (!isSolidRail) oldKeep.push(i, i + 1, i + 2);
  }
  assert.equal(oldPos.count - oldKeep.length, 72);
  const supportStart = vertices(sample.body) - oldKeep.length;
  assert.equal(supportStart, batch.parts.reduce((sum, part) => sum + vertices(part), 0));
  for (let offset = 0, side = 0; side < 2; side++, offset += 19) {
    const rail = batch.parts[offset];
    const railBox = bounds(rail);
    for (const end of ['min', 'max']) {
      assert.ok(railBox[end].distanceTo(railBounds[side][end]) < 1e-5);
    }
    for (let index = 0; index < 9; index++) {
      const shaft = bounds(batch.parts[offset + 1 + index * 2]);
      const bearing = bounds(batch.parts[offset + 2 + index * 2]);
      const left = side === 0;
      assert.ok(close(shaft[left ? 'min' : 'max'].x, bearing[left ? 'max' : 'min'].x));
      assert.ok(close(shaft[left ? 'max' : 'min'].x, x + (left ? -.85 : .4)));
      assert.ok(bearing[left ? 'min' : 'max'].x * (left ? -1 : 1) >
        (x + (left ? -.90 - .09 : .46 + .09)) * (left ? -1 : 1));
      assert.ok(close((shaft.min.z + shaft.max.z) / 2, z - .6 + index * .15));
      assert.ok(close((shaft.min.y + shaft.max.y) / 2, y + 1.42));
    }
  }
  // Existing geometry stays byte-identical after removing exactly the two old
  // rails and the single contiguous insertion made by the replacement assembly.
  const samplePos = sample.body.getAttribute('position');
  const firstSupport = batch.parts[0].getAttribute('position');
  let insertedAt = -1;
  for (let i = 0; i < samplePos.count; i += 3) {
    if ([0, 1, 2].every(j => ['getX', 'getY', 'getZ'].every(k => samplePos[k](i + j) === firstSupport[k](j)))) {
      insertedAt = i;
      break;
    }
  }
  assert.ok(insertedAt >= 0);
  for (const name of Object.keys(old.body.attributes)) {
    const before = old.body.getAttribute(name);
    const after = sample.body.getAttribute(name);
    const skipStart = insertedAt * after.itemSize;
    const skipEnd = (insertedAt + supportStart) * after.itemSize;
    const retained = new after.array.constructor([...after.array.subarray(0, skipStart), ...after.array.subarray(skipEnd)]);
    assert.deepEqual(retained, new before.array.constructor(oldKeep.flatMap(i =>
      Array.from(before.array.subarray(i * before.itemSize, (i + 1) * before.itemSize)))), name);
  }
  console.log(JSON.stringify({
    baseline: base,
    contacts: { vertices: digest(sample.contactSurface.vertices), indices: digest(sample.contactSurface.indices) },
    bodyTriangles: { before: vertices(old.body) / 3, after: vertices(sample.body) / 3 },
    bodyAttributeBytes: { before: bytes(old.body), after: bytes(sample.body) },
    bodyGroups: { before: old.body.groups.length, after: sample.body.groups.length },
  }));
} finally {
  unlinkSync(snapshot);
}
