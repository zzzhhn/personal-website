import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { COASTER_CAR_PANELS, COASTER_GATE_LEAVES, coasterGateAngle } from './coaster-access.ts';
import { coasterFrame, COASTER_LENGTH } from './coaster-track.ts';
import { cameraOverlapsGuide, cameraShoulderPivot, sweepCamera } from '../camera-collision.ts';
import { orbitDirection } from '../actor-physics.ts';

await R.init();
const identity = { x: 0, y: 0, z: 0, w: 1 }, radius = .22;
const report = { x: 44.64528, y: 2.46917, z: -140.40560 };
const orbit = orbitDirection(Math.PI / 2, Math.PI / 4), solid = c => !c.isSensor();
function gates(world, progress, old = false) {
  for (const leaf of COASTER_GATE_LEAVES) {
    const angle = coasterGateAngle(leaf.side, progress) * (old ? -1 : 1);
    const rotation = new Quaternion(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...leaf.hinge).setRotation(rotation));
    world.createCollider(R.ColliderDesc.cuboid(...leaf.half).setTranslation(...leaf.centre), body);
  }
}
function parked(world) {
  for (let i = 0; i < 3; i++) {
    const frame = coasterFrame(-i * 3.55 / COASTER_LENGTH);
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...frame.point.toArray()).setRotation(frame.rotation));
    for (const p of COASTER_CAR_PANELS) world.createCollider(R.ColliderDesc.cuboid(...p.size.map(v => v / 2)).setTranslation(...p.at), body);
  }
}
function structureFixture(old = false) {
  const world = new R.World({ x: 0, y: 0, z: 0 }), data = createCoasterStructure(true), floors = new Set();
  for (const c of data.colliders) {
    const collider = world.createCollider(coasterColliderDescriptor(R, c));
    if (c.surface) floors.add(collider.handle);
  }
  gates(world, 1, old); parked(world); world.step();
  return { world, walls: c => !floors.has(c.handle), dispose() { world.free(); data.steel.dispose(); data.glow.dispose(); } };
}
function settleCamera(world, point = report) {
  let offset = 0, previous = null, actual = 12;
  for (let frame = 0; frame < 150; frame++) {
    const q = cameraShoulderPivot(world, R, point, orbit, 12, radius, undefined, solid, offset, 1 / 60);
    actual = q.orbit.distance < actual ? q.orbit.distance : actual + (q.orbit.distance - actual) * (1 - Math.exp(-4 / 60));
    let position = new Vector3(q.position.x, q.position.y, q.position.z).addScaledVector(new Vector3(...orbit), actual);
    if (previous && (Math.abs(offset) > .001 || Math.abs(q.offset) > .001))
      position = sweepCamera(world, R, previous, position, radius, undefined, solid).position;
    world.intersectionsWithShape(position, identity, new R.Ball(radius), () => assert.fail(`camera overlap at frame ${frame}`));
    offset = q.offset; previous = position;
  }
  return { offset, position: previous, actual };
}
function walkSweep(fixture, from, to) {
  const delta = new Vector3(...to).sub(new Vector3(...from)), length = delta.length();
  return fixture.world.castShape(new Vector3(...from), identity, delta.normalize(), new R.Capsule(.48, .34), 0, length, true,
    undefined, undefined, undefined, undefined, fixture.walls);
}

test('reported gate corner restores a visible, collision-free third-person view', t => {
  const before = structureFixture(true), after = structureFixture();
  try {
    const old = settleCamera(before.world), fixed = settleCamera(after.world), foot = { ...report, y: 1.007 };
    assert.ok(old.actual < .4, 'reproduce the 35 cm camera collapse with the inward leaf');
    assert.equal(cameraOverlapsGuide(old.position, foot, radius), true);
    assert.ok(fixed.actual > 1.9);
    assert.equal(cameraOverlapsGuide(fixed.position, foot, radius, true), false);
    assert.equal(sweepCamera(after.world, R, report, fixed.position, radius, undefined, solid).hit, null);
    t.diagnostic(JSON.stringify({ before: old.actual, after: fixed.actual, offset: fixed.offset }));
  } finally { before.dispose(); after.dispose(); }
});

test('station return aisle allows stepping right of the pier and exiting to the forecourt', () => {
  const before = structureFixture(true), after = structureFixture();
  const start = [report.x, 1.9, report.z], corner = [47.2, 1.9, report.z], exit = [47.2, 1.9, -132];
  try {
    assert.ok(walkSweep(before, start, corner), 'old inward leaf must reproduce the blocked escape');
    assert.equal(walkSweep(after, start, corner), null);
    assert.equal(walkSweep(after, corner, exit), null);
  } finally { before.dispose(); after.dispose(); }
});

test('closed gate still locks the park and the fully open centre is walkable', () => {
  for (const progress of [0, 1]) {
    const world = new R.World({ x: 0, y: 0, z: 0 });
    try {
      gates(world, progress); world.step();
      const hit = walkSweep({ world, walls: solid }, [50, 1.9, -134], [50, 1.9, -142]);
      assert.equal(!!hit, progress === 0);
    } finally { world.free(); }
  }
});

test('all three parked cars stop a standing capsule approaching either body side', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    parked(world); world.step();
    for (let i = 0; i < 3; i++) for (const sign of [-1, 1]) {
      const frame = coasterFrame(-i * 3.55 / COASTER_LENGTH);
      const start = frame.point.clone().addScaledVector(frame.side, 4 * sign).setY(1.9);
      const end = frame.point.clone().setY(1.9);
      const hit = walkSweep({ world, walls: solid }, start.toArray(), end.toArray());
      assert.ok(hit && hit.time_of_impact < 3, `car ${i}, side ${sign}: no physical shell`);
    }
    assert.equal(world.colliders.len(), 18, 'six shared panels per parked car');
  } finally { world.free(); }
});
