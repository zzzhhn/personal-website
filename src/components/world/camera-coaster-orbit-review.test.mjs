import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Vector3, Mesh, MeshBasicMaterial, DoubleSide, Raycaster } from 'three';
import { coasterDistanceAt, coasterFrame, coasterRidePose, COASTER_LENGTH, COASTER_DURATION } from './attractions/coaster-track.ts';
import { attractionCameraPose, attractionCameraSweepOrigin } from './attractions/attraction-camera.ts';
import { createCoasterStructure, createCoasterCar } from './attractions/coaster-geometry.ts';
import { coasterColliderDescriptor } from './attractions/coaster-collision.ts';
import { sweepCamera, cameraCollisionRadius } from './camera-collision.ts';

await R.init();
const identity = { x: 0, y: 0, z: 0, w: 1 };
const blocked = (camera, aim, meshes) => new Raycaster(camera, aim.clone().sub(camera).normalize(), 0,
  camera.distanceTo(aim) - .01).intersectObjects(meshes).length > 0;

test('full-loop third-person orbits keep the eye clear of the occupied car and stay outside static contacts', t => {
  const structure = createCoasterStructure(true), world = new R.World({ x: 0, y: 0, z: 0 });
  const material = new MeshBasicMaterial({ side: DoubleSide }), geometry = createCoasterCar();
  const cars = [0, 1, 2].map(() => new Mesh(geometry, material));
  const times = [...Array.from({ length: Math.ceil(COASTER_DURATION) }, (_, i) => i), COASTER_DURATION, 31.5, 32.5, 32.99];
  geometry.computeBoundingBox();
  let samples = 0, hits = 0, rearCarOcclusions = 0, minEyeDistance = Infinity;
  const rearCarExamples = [];
  try {
    for (const c of structure.colliders) world.createCollider(coasterColliderDescriptor(R, c));
    world.createCollider(R.ColliderDesc.trimesh(structure.track.vertices, structure.track.indices));
    world.createCollider(R.ColliderDesc.trimesh(structure.relief.vertices, structure.relief.indices));
    world.step();
    for (const seconds of times) {
      const u = coasterDistanceAt(seconds), frame = coasterFrame(u);
      const eye = new Vector3(...coasterRidePose(u, 'first-person').cameraPosition);
      cars.forEach((car, i) => {
        const f = coasterFrame(u - i * 3.55 / COASTER_LENGTH);
        car.position.copy(f.point); car.quaternion.copy(f.rotation); car.updateMatrixWorld();
      });
      for (const view of ['chase', 'comfort']) {
        const base = coasterRidePose(u, view), original = structuredClone(base);
        const radius = cameraCollisionRadius(.1, base.fov, 1710 / 931);
        for (const yaw of [-Math.PI, -1.43, -.6, 0, .6, 1.43, Math.PI])
        for (const pitch of [-1.15, 0, 1.15]) for (const zoom of [.45, 1, 1.8]) {
          const pose = attractionCameraPose(base, { yaw, pitch, zoom });
          const candidate = new Vector3(...pose.cameraPosition), origin = attractionCameraSweepOrigin(pose);
          const label = JSON.stringify({ seconds, view, yaw, pitch, zoom });
          assert.ok(candidate.clone().sub(eye).dot(frame.up) >= .3 - 1e-7, label);
          assert.ok(origin.clone().sub(eye).dot(frame.up) >= .3 - 1e-7, label);
          const swept = sweepCamera(world, R, origin, candidate, radius, undefined, c => !c.isSensor());
          const camera = new Vector3(swept.position.x, swept.position.y, swept.position.z);
          // Two independent assertions: static collision safety is not car visibility.
          assert.equal(world.intersectionWithShape(camera, identity, new R.Ball(radius)), null, label);
          assert.equal(blocked(camera, eye, [cars[0]]), false, 'occupied car-to-eye occlusion: ' + label);
          // The occupied shell is entirely below this plane, so the near-plane
          // sphere is outside it too. Other cars may rise across a long sightline
          // on a curved track; report that separately instead of hiding them.
          assert.ok(camera.clone().sub(frame.point).dot(frame.up) - radius > geometry.boundingBox.max.y, label);
          if (blocked(camera, eye, cars.slice(1))) {
            rearCarOcclusions++;
            if (rearCarExamples.length < 4) rearCarExamples.push(JSON.parse(label));
          }
          assert.ok(camera.clone().sub(eye).dot(frame.up) >= .3 - 1e-7, label);
          assert.deepEqual(pose.cameraUp, [0, 1, 0]);
          assert.deepEqual(pose.seat, base.seat); assert.deepEqual(pose.orientation, base.orientation);
          assert.deepEqual(pose.cameraTarget, base.cameraTarget); assert.equal(pose.fov, base.fov);
          minEyeDistance = Math.min(minEyeDistance, camera.distanceTo(eye));
          samples++; hits += +(swept.hit !== null);
        }
        assert.deepEqual(base, original);
      }
    }
    assert.ok(hits > 0, 'exercise real compression, not just unobstructed candidates');
    assert.ok(minEyeDistance > 2, 'this sampled loop keeps a useful view after static compression');
    t.diagnostic(JSON.stringify({ samples, staticSweepHits: hits, minEyeDistance, rearCarOcclusions, rearCarExamples,
      scope: 'occupied car visibility/near plane and static coaster contacts; rear-car sightlines reported separately; no whole-avatar pixel proof' }));
  } finally {
    world.free(); structure.steel.dispose(); structure.glow.dispose();
    geometry.dispose(); material.dispose();
  }
});

test('the reported 260 px drag clears the real first car at the same first-drop timestamps', () => {
  const geometry = createCoasterCar(), material = new MeshBasicMaterial({ side: DoubleSide });
  const car = new Mesh(geometry, material);
  try {
    for (const seconds of [32, 32.5, 32.99]) {
      const u = coasterDistanceAt(seconds), frame = coasterFrame(u), base = coasterRidePose(u, 'chase');
      car.position.copy(frame.point); car.quaternion.copy(frame.rotation); car.updateMatrixWorld();
      const eye = new Vector3(...coasterRidePose(u, 'first-person').cameraPosition);
      const corrected = attractionCameraPose(base, { yaw: 260 * .0055, pitch: 0, zoom: 1 });
      assert.equal(blocked(new Vector3(...corrected.cameraPosition), eye, [car]), false);
      // Recorded pre-fix points prove the fixture can detect the actual reported defect.
      const legacy = { 32: [36.472, 74.662, -342.081], 32.5: [36.016, 65.413, -342.108],
        32.99: null }[seconds];
      if (legacy) assert.equal(blocked(new Vector3(...legacy), eye, [car]), true);
    }
  } finally { geometry.dispose(); material.dispose(); }
});
