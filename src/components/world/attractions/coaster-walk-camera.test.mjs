import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Euler, Quaternion, Vector3 } from 'three';
import { createCoasterStructure } from './coaster-geometry.ts';
import { cameraCollisionRadius, sweepCamera } from '../camera-collision.ts';
import { orbitDirection } from '../actor-physics.ts';

await R.init();
const radius = cameraCollisionRadius(.1, 50, 1710 / 875);
const reported = { x: 65.82469177246091, y: 2.468825006484986, z: -139.4957122802735 };

function withStructure(check) {
  const structure = createCoasterStructure(true), world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    for (const c of structure.colliders) world.createCollider(R.ColliderDesc.cuboid(...c.half)
      .setTranslation(...c.position).setRotation(new Quaternion().setFromEuler(new Euler(...(c.rotation ?? [0, 0, 0])))));
    world.step(); check(world, structure.colliders.length);
  } finally { world.free(); structure.steel.dispose(); structure.glow.dispose(); }
}

test('the reproduced station-side orbit passes through the real fence opening without hiding the guide', t => withStructure((world, count) => {
  const direction = orbitDirection(Math.PI / 2, Math.PI / 4);
  const target = new Vector3(reported.x, reported.y, reported.z).addScaledVector(new Vector3(...direction), 12);
  const result = sweepCamera(world, R, reported, target, radius, undefined, c => !c.isSensor());
  assert.ok(result.distance > 11.9, `legal orbit shortened to ${result.distance}`);
  assert.ok(count < 650, `fixed collider count unexpectedly grew to ${count}`);
  t.diagnostic(`station-side camera distance ${result.distance.toFixed(3)} m; fixed cuboids ${count}`);
}));

test('actual lower rails still stop a standing capsule and posts remain solid', () => withStructure(world => {
  const shape = new R.Capsule(.48, .34), identity = { x: 0, y: 0, z: 0, w: 1 };
  for (const x of [62, 65.8247, 68]) {
    const hit = world.castShape({ x, y: 1.82, z: -141 }, identity, { x: 0, y: 0, z: 1 }, shape, 0, 4, true);
    assert.ok(hit && hit.time_of_impact < 2, `player passed through rail at ${x}`);
  }
  // A low eye crossing a post is blocked even though gaps between posts are open.
  const post = sweepCamera(world, R, { x: 65, y: 2.5, z: -141 }, { x: 65, y: 2.5, z: -137 }, radius, undefined, c => !c.isSensor());
  assert.ok(post.hit !== null && post.distance < 2);
}));
