import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { advanceCoaster, coasterCurve, coasterDistanceAt, coasterFrame, coasterRidePose, coasterSupports, COASTER_CANOPY_BOUNDS, COASTER_DURATION, COASTER_EXIT, COASTER_LENGTH } from './coaster-track.ts';
import { attractionRide, beginAttractionRide, endAttractionRide, updateAttractionRide } from './attraction-ride.ts';
import { createCoasterCar, createCoasterStructure } from './coaster-geometry.ts';
import { INTENT_COASTER } from './attraction-layout.ts';
import { INTENT_STATIONS, INTENT_TARGETS, intentInReach } from './intent-stations.ts';

test('the continuous closed track fits its surveyed site and stays above ground', () => {
  assert.ok(COASTER_LENGTH > 250 && COASTER_LENGTH < 600);
  assert.ok(coasterCurve.getPointAt(0).distanceTo(coasterCurve.getPointAt(1)) < 1e-8);
  assert.ok(coasterCurve.getTangentAt(0).dot(coasterCurve.getTangentAt(1)) > .999);
  let high = 0;
  for (let i = 0; i <= 1200; i++) {
    const f = coasterFrame(i / 1200), p = f.point;
    assert.ok([...p, ...f.rotation].every(Number.isFinite));
    assert.ok(Math.abs(p.x - INTENT_COASTER.center[0]) < INTENT_COASTER.size[0] / 2 - 2);
    assert.ok(Math.abs(p.z - INTENT_COASTER.center[2]) < INTENT_COASTER.size[1] / 2 - 2);
    assert.ok(p.y > 1.55); high = Math.max(high, p.y);
    assert.ok(Math.abs(f.rotation.length() - 1) < 1e-8);
    const orientationForward = new Vector3(1, 0, 0).applyQuaternion(f.rotation);
    assert.ok(orientationForward.dot(f.forward) > .99999);
  }
  assert.ok(high > 29 && high < 31);
});

test('94 seconds contains a genuine high hold, a fast drop and continuous forward travel', () => {
  assert.equal(coasterDistanceAt(0), 0); assert.equal(coasterDistanceAt(COASTER_DURATION), 1);
  let previous = 0;
  for (let t = 0; t <= COASTER_DURATION; t += .025) {
    const u = coasterDistanceAt(t); assert.ok(u >= previous - 1e-10 && u <= 1); previous = u;
  }
  assert.equal(coasterDistanceAt(35), coasterDistanceAt(37.9));
  const top = coasterFrame(coasterDistanceAt(38)).point.y;
  const bottom = coasterFrame(coasterDistanceAt(45)).point.y;
  assert.ok(top - bottom > 23);
  const speed = t => (coasterDistanceAt(t + .01) - coasterDistanceAt(t)) / .01 * COASTER_LENGTH;
  assert.ok(speed(42) > speed(20) * 2);
  assert.ok(speed(93.98) < .1);
});

test('every camera mode publishes a real seat and finite matching actor orientation', () => {
  for (let i = 0; i < 200; i++) for (const mode of ['chase', 'first-person', 'comfort']) {
    const f = coasterFrame(i / 200), pose = coasterRidePose(i / 200, mode);
    assert.ok([...pose.seat, ...pose.cameraPosition, ...pose.cameraTarget, ...pose.orientation, pose.yaw, pose.fov].every(Number.isFinite));
    const expectedSeat = f.point.clone().addScaledVector(f.up, .72);
    assert.ok(expectedSeat.distanceTo(new Vector3(...pose.seat)) < 1e-9);
    assert.equal(pose.firstPerson, mode === 'first-person');
    assert.ok(Math.abs(Math.cos(pose.yaw) - f.forward.x / Math.hypot(f.forward.x, f.forward.z)) < 1e-8);
  }
});

test('pause, tab hiding and resumption gaps never accumulate ride time', () => {
  const clock = { elapsed: 13, riding: true, revision: 4 };
  for (const [dt, paused, hidden] of [[.016, true, false], [.016, false, true], [4, false, false], [Infinity, false, false], [-1, false, false]]) {
    assert.deepEqual(advanceCoaster(clock, dt, true, paused, hidden, true, 4), clock);
  }
  assert.equal(advanceCoaster(clock, .016, true, false, false, true, 4).elapsed, 13.016);
});

test('external recovery, deactivation, ownership changes and completion stop the ride', () => {
  const clock = { elapsed: 19, riding: true, revision: 7 };
  assert.equal(advanceCoaster(clock, .02, true, true, true, false, 8).riding, false);
  assert.equal(advanceCoaster(clock, .02, false, false, false, true, 7).elapsed, 0);
  assert.equal(advanceCoaster(clock, .02, true, false, false, true, 9).riding, false);
  const complete = advanceCoaster({ ...clock, elapsed: 93.99 }, .02, true, false, false, true, 7);
  assert.equal(complete.riding, false); assert.equal(complete.elapsed, 94);
  assert.equal(clock.elapsed, 19);
});

test('bridge begin is exclusive and external end prevents further publication', () => {
  endAttractionRide(); const pose = coasterRidePose(0, 'chase');
  assert.equal(beginAttractionRide(pose, COASTER_EXIT), true);
  assert.equal(beginAttractionRide(pose, [0, 0, 0]), false);
  assert.deepEqual(attractionRide.exit, COASTER_EXIT);
  const moved = coasterRidePose(.2, 'first-person'); updateAttractionRide(moved);
  assert.equal(attractionRide.pose, moved);
  endAttractionRide(); updateAttractionRide(pose); assert.equal(attractionRide.pose, moved);
});

test('all seven tasks and chest stay outside the locked gate; station exit lies on its apron', () => {
  assert.deepEqual(INTENT_STATIONS.flatMap(s => s.tasks).sort(), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  for (const id of ['route', 'press', 'visitor', 'chest']) {
    assert.ok(INTENT_TARGETS[id][2] > INTENT_COASTER.center[2] + 32);
    assert.ok(intentInReach(INTENT_TARGETS[id], id));
    assert.equal(intentInReach([0, 80, 0], id), false);
  }
  assert.equal(COASTER_EXIT[1], 1.08);
  assert.ok(COASTER_EXIT[0] >= 41.5 && COASTER_EXIT[0] <= 52.5);
  assert.ok(COASTER_EXIT[2] >= -160.5 && COASTER_EXIT[2] <= -143.5);
});

test('merged static structure and three cars stay below the authored geometry budget', () => {
  for (const detailed of [false, true]) {
    const g = createCoasterStructure(detailed), car = createCoasterCar();
    const all = [g.steel, g.glow, car];
    assert.ok((g.steel.getAttribute('position').count + g.glow.getAttribute('position').count + car.getAttribute('position').count * 3) / 3 < 90000);
    for (const geometry of all) {
      assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
      assert.equal(geometry.groups.length, 0); geometry.dispose();
    }
  }
});

test('nonadjacent rails clear the train and seated head envelope at all crossings', () => {
  const frames = Array.from({ length: 600 }, (_, i) => coasterFrame(i / 600));
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    if (Math.min(j - i, frames.length - (j - i)) / frames.length * COASTER_LENGTH < 12) continue;
    const a = frames[i], b = frames[j];
    assert.ok(a.point.distanceTo(b.point) > 4, `Rail proximity at ${i}, ${j}`);
    const headA = a.point.clone().addScaledVector(a.up, 2.25), headB = b.point.clone().addScaledVector(b.up, 2.25);
    assert.ok(headA.distanceTo(b.point) > 1.5 && headB.distanceTo(a.point) > 1.5, `Head clearance at ${i}, ${j}`);
  }
});

function segmentHitsBox(a, b, min, max) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 3; k++) {
    const delta = b[k] - a[k];
    if (Math.abs(delta) < 1e-9) { if (a[k] < min[k] || a[k] > max[k]) return false; }
    else {
      let from = (min[k] - a[k]) / delta, to = (max[k] - a[k]) / delta;
      if (from > to) [from, to] = [to, from];
      lo = Math.max(lo, from); hi = Math.min(hi, to); if (lo > hi) return false;
    }
  }
  return true;
}
test('the station canopy never intersects any camera sight line during the complete ride', () => {
  for (let t = 0; t <= COASTER_DURATION; t += .1) for (const mode of ['chase', 'first-person', 'comfort']) {
    const pose = coasterRidePose(coasterDistanceAt(t), mode);
    assert.equal(segmentHitsBox(pose.cameraPosition, pose.cameraTarget, COASTER_CANOPY_BOUNDS.min, COASTER_CANOPY_BOUNDS.max), false, `${mode} at ${t}`);
  }
});

test('large tower columns and station posts do not cut through the train envelope', () => {
  const supports = coasterSupports(true).flatMap(s => [s.a, s.b]);
  const posts = [-9.6, 2.4].flatMap(x => [16, 29].map(z => new Vector3(x + 50, 6.5, z - 175)));
  posts.push(new Vector3(45, 32.4, -210), new Vector3(51, 32.4, -210));
  for (let i = 0; i < 600; i++) {
    const frame = coasterFrame(i / 600);
    for (const p of [...supports, ...posts]) {
      if (frame.point.y > p.y + .2) continue;
      assert.ok(Math.hypot(frame.point.x - p.x, frame.point.z - p.z) > 1.2, `Column at ${p.toArray()} cuts rail ${i / 600}`);
    }
  }
});

test('third-person tunnel entry, interior and exit keep both the rider and forward sight line clear of the actual structure', () => {
  const geometry = createCoasterStructure(true), material = new MeshBasicMaterial({ side: DoubleSide });
  const objects = [new Mesh(geometry.steel, material), new Mesh(geometry.glow, material)], ray = new Raycaster();
  objects.forEach(mesh => mesh.updateMatrixWorld());
  try {
    for (const mode of ['chase', 'comfort']) for (let t = 61; t <= 85; t += .1) {
      const u = coasterDistanceAt(t), pose = coasterRidePose(u, mode), frame = coasterFrame(u);
      const camera = new Vector3(...pose.cameraPosition), head = frame.point.clone().addScaledVector(frame.up, 2.2);
      assert.equal(pose.firstPerson, false);
      assert.ok(camera.distanceTo(head) > 2.5, `${mode} must remain third person at ${t}`);
      for (const target of [head, new Vector3(...pose.cameraTarget)]) {
        const direction = target.clone().sub(camera);
        ray.set(camera, direction.clone().normalize()); ray.near = .05; ray.far = direction.length();
        assert.equal(ray.intersectObjects(objects, false).length, 0, `${mode} blocked at ${t}`);
      }
    }
  } finally { geometry.steel.dispose(); geometry.glow.dispose(); material.dispose(); }
});

test('the camera and complete sight segment fit inside the banked tunnel clearance', () => {
  const start = coasterDistanceAt(68) * COASTER_LENGTH, end = coasterDistanceAt(79) * COASTER_LENGTH;
  const centreline = Array.from({ length: Math.ceil((end - start + 12) / .15) }, (_, i) => coasterFrame((start - 6 + i * .15) / COASTER_LENGTH));
  for (const mode of ['chase', 'comfort']) for (let t = 68; t <= 79; t += .1) {
    const pose = coasterRidePose(coasterDistanceAt(t), mode), from = new Vector3(...pose.cameraPosition), to = new Vector3(...pose.cameraTarget);
    for (let sample = 0; sample <= 16; sample++) {
      const point = from.clone().lerp(to, sample / 16);
      const nearest = centreline.reduce((best, frame) => frame.point.distanceToSquared(point) < best.point.distanceToSquared(point) ? frame : best);
      const relative = point.sub(nearest.point), lateral = relative.dot(nearest.side), height = relative.dot(nearest.up);
      // Extra clearance inside the 5.1 m roof / 5 m walls and the lower 3.5 m light arches.
      assert.ok(Math.abs(lateral) < 1.7, `Side clearance ${mode} at ${t}: ${lateral}`);
      assert.ok(height > 1.5 && height < 3.1, `Vertical clearance ${mode} at ${t}: ${height}`);
    }
  }
});

test('tunnel transitions are continuous and preserve the exterior and first-person camera contracts', () => {
  const start = coasterDistanceAt(68), end = coasterDistanceAt(79);
  for (const mode of ['chase', 'comfort']) {
    for (const u of [start - 24 / COASTER_LENGTH, start - 10 / COASTER_LENGTH, end + 12 / COASTER_LENGTH, end + 26 / COASTER_LENGTH]) {
      const epsilon = 1e-6;
      for (const key of ['cameraPosition', 'cameraTarget']) {
        const before = new Vector3(...coasterRidePose(u - epsilon, mode)[key]);
        const at = new Vector3(...coasterRidePose(u, mode)[key]);
        const after = new Vector3(...coasterRidePose(u + epsilon, mode)[key]);
        assert.ok(before.distanceTo(after) < .002, `${mode} position step at ${u}`);
        const inSlope = at.clone().sub(before).divideScalar(epsilon * COASTER_LENGTH);
        const outSlope = after.clone().sub(at).divideScalar(epsilon * COASTER_LENGTH);
        assert.ok(inSlope.distanceTo(outSlope) < .03, `${mode} velocity step at ${u}`);
      }
    }
    for (const t of [0, 5, 31, 35, 38, 45, 58, 60, 86, 90, 94]) {
      const u = coasterDistanceAt(t), pose = coasterRidePose(u, mode), frame = coasterFrame(u);
      const expected = new Vector3(...pose.seat).addScaledVector(frame.forward, mode === 'comfort' ? -8 : -7.5).add(new Vector3(0, 3.4, 0));
      assert.ok(expected.distanceTo(new Vector3(...pose.cameraPosition)) < 1e-10);
      assert.equal(pose.fov, mode === 'comfort' ? 52 : 58);
    }
  }
  for (let t = 0; t <= COASTER_DURATION; t += .5) {
    const u = coasterDistanceAt(t), pose = coasterRidePose(u, 'first-person'), frame = coasterFrame(u);
    const eye = frame.point.clone().addScaledVector(frame.up, 1.74);
    assert.ok(eye.distanceTo(new Vector3(...pose.cameraPosition)) < 1e-10);
    assert.ok(eye.addScaledVector(frame.forward, 8).distanceTo(new Vector3(...pose.cameraTarget)) < 1e-10);
    assert.equal(pose.firstPerson, true); assert.equal(pose.fov, 66);
  }
});
