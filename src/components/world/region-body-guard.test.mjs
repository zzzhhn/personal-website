import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Object3D } from 'three';
import { createRegionBodyGuard, isRegionBodyHeld, isRegionColliderHeld } from './region-body-guard.ts';
import { createColliderReadinessProbe } from './collider-readiness.ts';
import { createRegionPassage, passageVelocity } from './region-passage.ts';

await R.init();

function fixture() {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const states = new Map();
  const floor = () => {
    const parent = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(4, -.25, 0));
    const collider = world.createCollider(R.ColliderDesc.cuboid(4, .25, 4), parent);
    const object = new Object3D();
    object.name = 'district-collider';
    states.set(collider.handle, { object });
    return () => { world.removeRigidBody(parent); states.delete(collider.handle); };
  };
  const passage = createRegionPassage([{ id: 'district', contains: ([x], r) => x >= -r,
    requirements: [{ name: 'district-collider' }] }], createColliderReadinessProbe(world, states));
  const guard = createRegionBodyGuard(passage);
  const actor = (x, radius, car) => {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, .75, 0));
    world.createCollider(car ? R.ColliderDesc.cuboid(1, .3, .7) : R.ColliderDesc.capsule(.3, radius), body);
    return body;
  };
  return { world, floor, passage, guard, actor };
}

for (const [label, radius, car] of [['guide', .25, false], ['vehicle', 1.25, true]]) {
  test(`the ${label} cannot fall or drift when its current region unmounts and resumes at the same point`, () => {
    const { world, floor, guard, actor } = fixture();
    try {
      const unmount = floor(), body = actor(2, radius, car);
      for (let i = 0; i < 60; i++) world.step();
      assert.equal(guard.admit(body, radius), true);
      const collider = body.collider(0);
      assert.equal(isRegionBodyHeld(body), false);
      assert.equal(isRegionColliderHeld(collider, body), false);
      const pose = { ...body.translation() };
      body.setLinvel({ x: 0, y: 0, z: 3 }, true);
      unmount();
      for (let i = 0; i < 120; i++) {
        assert.equal(guard.admit(body, radius), false);
        guard.capture(body);
        world.step();
        assert.equal(guard.finish(body, radius), null);
      }
      assert.deepEqual({ ...body.translation() }, pose);
      assert.equal(body.isEnabled(), false);
      assert.equal(isRegionBodyHeld(body), true);
      assert.equal(isRegionColliderHeld(collider, body), true);
      const observed = [];
      world.forEachRigidBody(candidate => { if (isRegionBodyHeld(candidate)) observed.push(candidate); });
      assert.deepEqual(observed, [body]);
      floor();
      assert.equal(guard.admit(body, radius), true);
      assert.equal(body.isEnabled(), true);
      assert.equal(isRegionBodyHeld(body), false);
      assert.equal(isRegionColliderHeld(collider, body), false);
      assert.deepEqual({ ...body.translation() }, pose);
      world.step();
      assert.ok(Math.abs(body.translation().y - pose.y) < .01);
    } finally { world.free(); }
  });

  test(`a Rapier contact cannot push the ${label} into a cold region after the velocity check`, () => {
    const { world, passage, guard, actor } = fixture();
    try {
      const body = actor(-radius - .2, radius, car);
      const start = { ...body.translation() };
      const pusher = world.createRigidBody(R.RigidBodyDesc.kinematicVelocityBased().setTranslation(start.x - (car ? 1.3 : .55), .75, 0));
      world.createCollider(R.ColliderDesc.ball(.35), pusher);
      pusher.setLinvel({ x: 80, y: 0, z: 0 }, true);
      assert.equal(guard.admit(body, radius), true);
      assert.equal(passageVelocity(passage, Object.values(start), body.linvel(), 1 / 60, radius).blocked, false);
      guard.capture(body);
      world.step();
      assert.ok(body.translation().x > -radius, 'the solver moved the body across the boundary after input checks');
      const attempted = guard.finish(body, radius);
      assert.ok(attempted && attempted[0] > -radius);
      assert.deepEqual({ ...body.translation() }, start);
      assert.equal(body.linvel().x, 0);
    } finally { world.free(); }
  });
}

test('a body disabled by its ride is not enabled by the region guard', () => {
  const { world, floor, guard, actor } = fixture();
  try {
    const body = actor(2, .25, false);
    body.setEnabled(false);
    assert.equal(isRegionBodyHeld(body), false);
    assert.equal(guard.admit(body, .25), true);
    floor();
    assert.equal(guard.admit(body, .25), true);
    assert.equal(body.isEnabled(), false);
  } finally { world.free(); }
});

test('holding a body only records its enabled, contact-capable colliders', () => {
  const { world, guard, actor } = fixture();
  try {
    const body = actor(2, .25, false), active = body.collider(0);
    const disabled = world.createCollider(R.ColliderDesc.ball(.2), body);
    disabled.setEnabled(false);
    const sensor = world.createCollider(R.ColliderDesc.ball(.2).setSensor(true), body);
    const withoutGroup = world.createCollider(R.ColliderDesc.ball(.2).setCollisionGroups(0), body);
    const withoutFilter = world.createCollider(R.ColliderDesc.ball(.2).setCollisionGroups(0x00010000), body);
    assert.equal(guard.admit(body, .25), false);
    assert.equal(isRegionBodyHeld(body), true);
    assert.equal(isRegionColliderHeld(active, body), true);
    assert.equal(isRegionColliderHeld(active, null), false);
    for (const collider of [disabled, sensor, withoutGroup, withoutFilter]) {
      assert.equal(isRegionColliderHeld(collider, body), false);
    }
    const observed = [];
    world.forEachCollider(collider => { if (isRegionColliderHeld(collider, collider.parent())) observed.push(collider); });
    assert.deepEqual(observed, [active]);
    guard.forget(body);
    assert.equal(isRegionBodyHeld(body), false);
    assert.equal(isRegionColliderHeld(active, body), false);
    assert.equal(body.isEnabled(), false);
  } finally { world.free(); }
});
