import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import { grassTuftGeometry } from '../../../src/components/world/WorldGrass.tsx';

const legacy = grassTuftGeometry(false), craft = grassTuftGeometry(true);
test.after(() => { legacy.dispose(); craft.dispose(); });
test('the legacy island tuft retains its shipped vertex positions', () => {
  const pos = legacy.getAttribute('position').array;
  const bytes = new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength);
  // Recorded from the 45 rendered vertices of the approved 362e68d geometry.
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '818247ca15bbd261e96897bc93058104f88f3d756590001ea395963eb3f3f2fd');
});
test('cupped blades preserve flora ABI, root anchoring, triangle budget and valid geometry', () => {
  assert.equal(craft.getAttribute('position').count, 45);
  for (const key of ['aBlade', 'aLeafPosition', 'aBloomPosition', 'aBloomColor', 'aFloraKind', 'normal']) {
    assert.deepEqual(craft.getAttribute(key).array, legacy.getAttribute(key).array, key);
  }
  const pos = craft.getAttribute('position'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let changed = 0;
  for (let i = 0; i < pos.count; i++) {
    assert.ok(pos.getY(i) >= 0 && pos.getY(i) <= .420001);
    if (legacy.getAttribute('position').getY(i) === 0) assert.equal(pos.getY(i), 0);
    changed += Number(pos.getX(i) !== legacy.getAttribute('position').getX(i));
  }
  assert.ok(changed > 20);
  for (let i = 0; i < 45; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    assert.ok(b.sub(a).cross(c.sub(a)).length() > 1e-6);
  }
  // The actual Three shader hook is exercised by alpha-mine-flora.test.mjs.
  assert.equal(craft.getAttribute('aBlade').count, pos.count);
  assert.equal(craft.getAttribute('aLeafPosition').itemSize, 4);
});
