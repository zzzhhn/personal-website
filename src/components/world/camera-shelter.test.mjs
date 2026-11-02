import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { cameraOverlapsGuide, seatedCameraOrigin, sweepCamera } from './camera-collision.ts';
import { loadWorldModule } from '../../../tools/world/facility-craft/street/runtime.mjs';

await R.init();
const solid = collider => !collider.isSensor(), rotation = { x: 0, y: 0, z: 0, w: 1 }, radius = .22;
const overlap = (world, point) => world.intersectionWithShape(point, rotation, new R.Ball(radius), undefined, undefined, undefined, undefined, solid);

test('actual old and crafted shelter hulls reproduce zero-distance seating and allow a safe open-side orbit at eight facings', () => {
  for (const baseline of [true, false]) {
    const A = loadWorldModule('WorldStreetAssets.ts', '', baseline);
    const hulls = A.shelterGeometry(0, [0, 0, .1, .1]).hulls();
    for (let facing = 0; facing < 8; facing++) {
      const world = new R.World({ x: 0, y: 0, z: 0 }), yaw = facing * Math.PI / 4;
      try {
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
        const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(3, 0, -6).setRotation(q));
        hulls.forEach(points => world.createCollider(R.ColliderDesc.convexHull(points), body)); world.step();
        const start = new Vector3(.4, .5 + .88, -.4).applyQuaternion(q).add(new Vector3(3, 0, -6));
        const open = new Vector3(-1, 0, 0).applyQuaternion(q);
        const far = start.clone().addScaledVector(open, 12); far.y += 2.2;
        assert.ok(overlap(world, start));
        assert.equal(sweepCamera(world, R, start, far, radius, undefined, solid).distance, 0, 'real old failure');
        const safe = seatedCameraOrigin(world, R, start, Math.PI + yaw, radius, undefined, solid);
        assert.ok(Math.abs(new Vector3(safe.x, safe.y, safe.z).distanceTo(start) - .15) < 1e-7);
        assert.equal(overlap(world, safe), null);
        const pivot = sweepCamera(world, R, safe, { ...safe, y: .5 + .92 }, radius, undefined, solid).position;
        const orbit = sweepCamera(world, R, pivot, { x: pivot.x + open.x * 12, y: pivot.y + 2.2, z: pivot.z + open.z * 12 }, radius, undefined, solid);
        assert.equal(orbit.hit, null); assert.ok(orbit.distance > 12);
        assert.equal(overlap(world, orbit.position), null);
        assert.equal(cameraOverlapsGuide(orbit.position, start, radius), false);
      } finally { world.free(); }
    }
  }
});

test('seated correction preserves clear pivots and cannot move deeper into a backrest or through a second thin wall', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), start = { x: .4, y: 1.38, z: 0 };
  try {
    world.createCollider(R.ColliderDesc.cuboid(.02, 2, 2).setTranslation(.63, 1, 0)); world.step();
    const clear = { x: 0, y: 1.38, z: 0 };
    assert.equal(seatedCameraOrigin(world, R, clear, Math.PI, radius, undefined, solid), clear);
    assert.equal(seatedCameraOrigin(world, R, start, 0, radius, undefined, solid), start, 'no exit toward the wall');
    world.createCollider(R.ColliderDesc.cuboid(.005, 2, 2).setTranslation(.1, 1, 0)); world.step();
    assert.equal(seatedCameraOrigin(world, R, start, Math.PI, radius, undefined, solid), start, 'second wall blocks the full sphere');
  } finally { world.free(); }
});

test('seated clearance respects sensor and excluded-body filters', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), start = { x: .4, y: 1.38, z: 0 };
  try {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    world.createCollider(R.ColliderDesc.cuboid(.02, 2, 2).setTranslation(.63, 1, 0), body); world.step();
    assert.equal(seatedCameraOrigin(world, R, start, Math.PI, radius, body, solid), start);
    world.createCollider(R.ColliderDesc.cuboid(.02, 2, 2).setTranslation(.63, 1, 0).setSensor(true)); world.step();
    assert.equal(seatedCameraOrigin(world, R, start, Math.PI, radius, body, solid), start);
  } finally { world.free(); }
});
