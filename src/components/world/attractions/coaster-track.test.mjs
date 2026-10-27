import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { advanceCoaster, coasterCurve, coasterDistanceAt, coasterFrame, coasterRidePose, coasterSupports, COASTER_CANOPY_BOUNDS, COASTER_INVERSION, COASTER_TUNNEL, COASTER_GATE_Z, coasterControlU, coasterWorld, COASTER_DURATION, COASTER_EXIT, COASTER_LENGTH } from './coaster-track.ts';
import { attractionRide, beginAttractionRide, endAttractionRide, updateAttractionRide } from './attraction-ride.ts';
import { createCoasterCar, createCoasterStructure } from './coaster-geometry.ts';
import { INTENT_COASTER } from './attraction-layout.ts';
import { INTENT_STATIONS, INTENT_TARGETS, intentInReach } from './intent-stations.ts';

test('the continuous closed track fits its surveyed site and stays above ground', () => {
  assert.ok(COASTER_LENGTH > 700 && COASTER_LENGTH < 800);
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
  assert.ok(high > 43 && high < 46);
});

test('70 seconds preserves the climb and hold, triples the thrill run and brakes smoothly', () => {
  assert.equal(COASTER_DURATION,70);
  assert.equal(coasterDistanceAt(0), 0); assert.equal(coasterDistanceAt(COASTER_DURATION), 1);
  let previous = 0;
  for (let t = 0; t <= COASTER_DURATION; t += .025) {
    const u = coasterDistanceAt(t); assert.ok(u >= previous - 1e-10 && u <= 1); previous = u;
  }
  assert.equal(coasterDistanceAt(34), coasterDistanceAt(35.9));
  const top = coasterFrame(coasterDistanceAt(36)).point.y;
  const bottom = coasterFrame(coasterDistanceAt(38)).point.y;
  assert.ok(top - bottom > 23);
  const speed = t => (coasterDistanceAt(t + .01) - coasterDistanceAt(t)) / .01 * COASTER_LENGTH;
  assert.ok(speed(37) > speed(20) * 6);
  assert.ok(speed(COASTER_DURATION - .02) < .1);
});

test('thrill-run checkpoints retain the route with three times the previous measured speed', () => {
  // Measurements from the prior 122-second run, before the requested speed change.
  const baseline = [[39,137.0148402971,12.3171150566],[44,174.4035908199,2.6247046958],
    [50,201.0674809976,7.1160013882],[63,309.9044079170,7.9541885009],
    [85,478.2619818852,7.2917574675],[98,580.6070085419,8.3991002355]];
  for (const [oldTime, metres, oldSpeed] of baseline) {
    const t=36+(oldTime-36)/3;
    assert.ok(Math.abs(coasterDistanceAt(t)*COASTER_LENGTH-metres)<1e-6);
    const speed=(coasterDistanceAt(t+.0001)-coasterDistanceAt(t-.0001))/.0002*COASTER_LENGTH;
    assert.ok(Math.abs(speed/oldSpeed-3)<1e-5, `speed ratio at ${t}`);
  }
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
  const complete = advanceCoaster({ ...clock, elapsed: COASTER_DURATION - .01 }, .02, true, false, false, true, 7);
  assert.equal(complete.riding, false); assert.equal(complete.elapsed, COASTER_DURATION);
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
    assert.ok(INTENT_TARGETS[id][2] > INTENT_COASTER.center[2] + COASTER_GATE_Z);
    assert.ok(intentInReach(INTENT_TARGETS[id], id));
    assert.equal(intentInReach([0, 80, 0], id), false);
  }
  assert.equal(COASTER_EXIT[1], 1.08);
  assert.ok(COASTER_EXIT[0] >= 41.5 && COASTER_EXIT[0] <= 52.5);
  assert.ok(COASTER_EXIT[2] >= -165 && COASTER_EXIT[2] <= -142);
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


test('inversion uses a continuous full frame, with a genuinely upside-down seat', () => {
  assert.ok(coasterFrame(COASTER_INVERSION.top).up.y < -.95);
  let previous = coasterFrame(0).rotation;
  for (let i = 1; i <= 2400; i++) {
    const f = coasterFrame(i / 2400);
    assert.ok(Math.abs(previous.dot(f.rotation)) > .995, `frame discontinuity at ${i}`);
    assert.ok(Math.abs(f.forward.dot(f.up)) < 1e-8);
    previous = f.rotation;
  }
  for (const index of [16, 20]) assert.ok(Math.abs(coasterFrame(coasterControlU(index)).forward.y) > .98);
});

test('first person follows track up while both spectator views keep the horizon', () => {
  for (let i = 0; i < 600; i++) {
    const u = i / 600, f = coasterFrame(u), eye = f.point.clone().addScaledVector(f.up, 1.74);
    const first = coasterRidePose(u, 'first-person');
    assert.ok(eye.distanceTo(new Vector3(...first.cameraPosition)) < 1e-9);
    assert.ok(new Vector3(...first.cameraUp).distanceTo(f.up) < 1e-9);
    for (const mode of ['chase', 'comfort']) {
      const pose = coasterRidePose(u, mode);
      assert.deepEqual(pose.cameraUp, [0, 1, 0]); assert.deepEqual(pose.orientation, first.orientation);
      assert.deepEqual(pose.seat, first.seat);
    }
  }
});

test('static night fill exists on every merged surface with finite nonnegative radiance', () => {
  const g = createCoasterStructure(true);
  for (const geometry of [g.steel, g.glow]) {
    const fill = geometry.getAttribute('nightRadiance');
    assert.equal(fill.count, geometry.getAttribute('position').count);
    assert.ok(fill.array.every(n => Number.isFinite(n) && n >= 0));
    assert.ok(fill.array.some(n => n > .3)); geometry.dispose();
  }
});

test('third-person cameras keep rider and forward sight clear through the entire actual structure', () => {
  const geometry = createCoasterStructure(true), material = new MeshBasicMaterial({ side: DoubleSide });
  const objects = [new Mesh(geometry.steel, material), new Mesh(geometry.glow, material)], ray = new Raycaster();
  objects.forEach(mesh => mesh.updateMatrixWorld());
  try {
    for (const mode of ['chase', 'comfort']) for (let t = 0; t < COASTER_DURATION; t += .125) {
      const u = coasterDistanceAt(t), pose = coasterRidePose(u, mode), frame = coasterFrame(u);
      const camera = new Vector3(...pose.cameraPosition), head = frame.point.clone().addScaledVector(frame.up, 2.2);
      assert.ok(camera.distanceTo(head) > 2.5, `${mode} remains third person at ${t}`);
      for (const target of [head, new Vector3(...pose.cameraTarget)]) {
        const direction = target.clone().sub(camera);
        ray.set(camera, direction.clone().normalize()); ray.near = .05; ray.far = direction.length();
        assert.equal(ray.intersectObjects(objects, false).length, 0, `${mode} obstructed at ${t}`);
      }
    }
    // Looking at a distant rail around a bend is expected; the eye and its near field must be clear.
    for (let t = 0; t < COASTER_DURATION; t += .125) {
      const pose = coasterRidePose(coasterDistanceAt(t), 'first-person'), camera = new Vector3(...pose.cameraPosition);
      ray.set(camera, new Vector3(...pose.cameraTarget).sub(camera).normalize()); ray.near = .05; ray.far = 2;
      assert.equal(ray.intersectObjects(objects, false).length, 0, `first-person near field obstructed at ${t}`);
    }
  } finally { geometry.steel.dispose(); geometry.glow.dispose(); material.dispose(); }
});

test('architecture collision volumes clear a one-metre rider envelope throughout the loop', () => {
  const g = createCoasterStructure(true);
  try {
    for (let i = 0; i < 1200; i++) {
      const f = coasterFrame(i / 1200), head = f.point.clone().addScaledVector(f.up, 1.4);
      for (const c of g.colliders) {
        if (c.surface) continue;
        const delta = head.clone().sub(new Vector3(...c.position));
        assert.ok(Math.abs(delta.x) >= c.half[0] + 1 || Math.abs(delta.y) >= c.half[1] + 1 || Math.abs(delta.z) >= c.half[2] + 1, `collider ${c.position} at ${i / 1200}`);
      }
    }
  } finally { g.steel.dispose(); g.glow.dispose(); }
});

test('camera movement remains continuous across inversion and tunnel transitions', () => {
  const boundaries = [COASTER_INVERSION.start - 24 / COASTER_LENGTH, COASTER_INVERSION.start - 8 / COASTER_LENGTH,
    COASTER_INVERSION.end + 10 / COASTER_LENGTH, COASTER_INVERSION.end + 26 / COASTER_LENGTH,
    COASTER_TUNNEL.start - 24 / COASTER_LENGTH, COASTER_TUNNEL.start - 10 / COASTER_LENGTH,
    COASTER_TUNNEL.end + 10 / COASTER_LENGTH, COASTER_TUNNEL.end + 22 / COASTER_LENGTH];
  for (const mode of ['chase', 'comfort']) for (const u of boundaries) for (const key of ['cameraPosition', 'cameraTarget']) {
    const epsilon = 1e-6, before = new Vector3(...coasterRidePose(u - epsilon, mode)[key]);
    const at = new Vector3(...coasterRidePose(u, mode)[key]), after = new Vector3(...coasterRidePose(u + epsilon, mode)[key]);
    assert.ok(before.distanceTo(after) < .004, `${mode} ${key} discontinuity at ${u}`);
    const inbound = at.clone().sub(before).divideScalar(epsilon * COASTER_LENGTH), outbound = after.clone().sub(at).divideScalar(epsilon * COASTER_LENGTH);
    assert.ok(inbound.distanceTo(outbound) < .04, `${mode} ${key} velocity discontinuity at ${u}`);
  }
});


test('departure and return ease to rest at the same closed station pose', () => {
  for (const mode of ['chase', 'comfort', 'first-person']) for (const key of ['cameraPosition', 'cameraTarget']) {
    const stopped = new Vector3(...coasterRidePose(0, mode)[key]);
    for (const t of [.001, COASTER_DURATION - .001]) {
      const nearby = new Vector3(...coasterRidePose(coasterDistanceAt(t), mode)[key]);
      assert.ok(stopped.distanceTo(nearby) / .001 < .03, `${mode} ${key} does not ease to rest`);
    }
  }
});
