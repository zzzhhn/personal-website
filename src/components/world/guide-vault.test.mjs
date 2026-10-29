import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, Vector3 } from 'three';
import { loadGuide } from '../../../tools/world/guide/boot-analysis.mjs';
import { GuideVaultLayer } from './WorldGuideVault.ts';

test('actual G24 plants both hands on a reachable rail, bends knees in flight and restores all bones', async t => {
  const { gltf } = await loadGuide(process.env.G24_SOURCE ?? 'tools/world/guide/out/G24_uncompressed.glb');
  const scene = gltf.scene, mixer = new AnimationMixer(scene);
  mixer.clipAction(gltf.animations.find(c => c.name === 'Idle')).play(); mixer.update(.1); scene.updateMatrixWorld(true);
  const layer = new GuideVaultLayer(scene), bones = [];
  scene.traverse(b => { if (b.isBone) bones.push({ b, q: b.quaternion.clone(), p: b.position.clone() }); });
  const plan = { hand: [.44, 1.038, 0], direction: { x: 1, y: 0, z: 0 }, elapsed: .2, prepare: .24, duration: 1.44 };
  layer.apply(plan); t.diagnostic(JSON.stringify({ handErrors: layer.handErrors }));
  assert.equal(layer.handErrors.length, 2);
  assert.ok(layer.handErrors.every(e => e < .035), 'hands reach real rail without stretching bones');
  layer.restore();
  for (const { b, q, p } of bones) { assert.ok(b.quaternion.angleTo(q) < 1e-6); assert.ok(b.position.distanceTo(p) < 1e-9); }
  const feet = bones.filter(({ b }) => /^foot[._]?[LR]$/.test(b.name));
  const before = feet.map(({ b }) => b.getWorldPosition(new Vector3()));
  layer.apply({ ...plan, elapsed: .84 });
  assert.ok(feet.every(({ b }, i) => b.getWorldPosition(new Vector3()).y > before[i].y + .07), 'flight visibly tucks both feet');
  for (const { b, p } of bones) assert.ok(b.position.distanceTo(p) < 1e-9, 'bone lengths unchanged');
  layer.restore();
  for (const { b, q } of bones) assert.ok(b.quaternion.angleTo(q) < 1e-6);
});
