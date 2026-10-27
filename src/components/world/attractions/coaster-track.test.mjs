import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
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
