import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_FOLLOWER as C, createFactoryFollower, factoryFollowerPlayerEligible, stepFactoryFollower } from './factory-follower.ts';

const dt = 1 / 60;
const input = (playerFootpoint = null, extra = {}) => ({ released: true, playerFootpoint, ...extra });
const separation = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const difference = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
test('re-entering a released saved batch starts parked instead of repeating delivery',()=>{
  const state=createFactoryFollower(true);
  assert.equal(state.phase,'parked');assert.deepEqual(state.position,[37,.12,28.5]);
  stepFactoryFollower(state,input(),1/60);assert.equal(state.phase,'parked');
});
function run(state, seconds, frame = input()) {
  for (let i = 0; i < seconds * 60; i++) stepFactoryFollower(state, frame, dt);
}
function released() {
  const state = createFactoryFollower(); run(state, 15);
  assert.equal(state.phase, 'parked');
  assert.ok(separation(state.position, C.park) <= .003);
  return state;
}
function inLane(p) {
  assert.ok(p[0] >= C.lane.minX + C.radius - 1e-8 && p[0] <= C.lane.maxX - C.radius + 1e-8);
  assert.ok(p[2] >= C.lane.minZ + C.radius - 1e-8 && p[2] <= C.lane.maxZ - C.radius + 1e-8);
  assert.equal(p[1], C.floorY);
}

test('release traverses the dock and actual ramp continuously before following is allowed', () => {
  const state = createFactoryFollower();
  assert.deepEqual(state.position, [37, .675, 24]);
  assert.equal(state.yaw, 0);
  let sawDock = false, sawRamp = false, sawLanding = false, measured = 0;
  const frame = input([45, .12, 29]);
  for (let i = 0; i < 900 && state.phase !== 'parked'; i++) {
    const before = [...state.position];
    stepFactoryFollower(state, frame, dt);
    const p = state.position;
    const moved = Math.hypot(...p.map((n, axis) => n - before[axis])); measured += moved;
    assert.ok(moved <= C.maxSpeed * dt + 1e-8, 'no clamped teleport across the dock');
    assert.equal(p[0], 37, 'visitor cannot steer egress off its ramp');
    assert.ok(p[2] >= before[2]);
    assert.ok(p[1] <= before[1] + 1e-8);
    if (p[2] <= 25.3) { sawDock = true; assert.equal(p[1], .675); }
    else if (p[2] < 27.5) {
      sawRamp = true;
      assert.ok(Math.abs(p[1] - (.675 - (p[2] - 25.3) / 2.2 * .555)) < 1e-8);
    } else { sawLanding = true; assert.equal(p[1], .12); }
  }
  assert.ok(sawDock && sawRamp && sawLanding);
  assert.equal(state.phase, 'parked');
  assert.ok(separation(state.position, C.park) < .003);
  assert.ok(Math.abs(state.wheelDistance - measured) < 1e-8);
});

test('a distant visitor is followed at safe separation, then the companion holds still', () => {
  const state = released(), visitor = [44, .12, 29];
  const frame = input(visitor);
  for (let i = 0; i < 900; i++) {
    stepFactoryFollower(state, frame, dt); inLane(state.position);
    assert.ok(separation(state.position, visitor) >= C.followDistance - 1e-8);
  }
  assert.equal(state.phase, 'following');
  assert.ok(Math.abs(separation(state.position, visitor) - C.followDistance) < .005);
  const before = [...state.position], wheels = state.wheelDistance;
  run(state, 2, frame);
  assert.deepEqual(state.position, before); assert.equal(state.wheelDistance, wheels);
  run(state, 2, input([...state.position]));
  assert.deepEqual(state.position, before, 'approaching visitor never causes forward chasing');
});

test('pause, hidden frames, unreleased product and bad deltas freeze every mutable field', () => {
  const state = createFactoryFollower();
  for (const frame of [input(null, { released: false }), input(null, { paused: true }), input(null, { hidden: true })]) {
    const before = structuredClone(state); run(state, 2, frame); assert.deepEqual(state, before);
  }
  run(state, 2);
  for (const delta of [NaN, Infinity, -Infinity, -1, 0]) {
    const before = structuredClone(state); stepFactoryFollower(state, input(), delta); assert.deepEqual(state, before);
  }
  const before = structuredClone(state); run(state, 2, input([45, .12, 29], { paused: true })); assert.deepEqual(state, before);
  const capped = structuredClone(state), oneFrame = structuredClone(state);
  stepFactoryFollower(capped, input(), 500); stepFactoryFollower(oneFrame, input(), .05);
  assert.deepEqual(capped, oneFrame, 'large dt never causes a catch-up jump');
});

test('leaving the lane, going upstairs and operating another station return to the defined park', () => {
  for (const frame of [input([60, .12, 29]), input([44, 4.32, 29]), input(null), input([44, .12, 29], { operating: true })]) {
    const state = released(); run(state, 7, input([44, .12, 29]));
    assert.ok(separation(state.position, C.park) > 3);
    for (let i = 0; i < 1200; i++) { stepFactoryFollower(state, frame, dt); inLane(state.position); }
    assert.equal(state.phase, 'parked'); assert.ok(separation(state.position, C.park) < .003);
  }
});

test('player eligibility checks finite foot contact and excludes every outside edge and upper gallery', () => {
  assert.equal(factoryFollowerPlayerEligible([37, .12, 28.5]), true);
  for (const p of [null, [], [NaN, .12, 29], [37, Infinity, 29], [37, .12, NaN], [31.9, .12, 29],
    [46.1, .12, 29], [37, .12, 27.59], [37, .12, 30.21], [37, 4.32, 29]]) {
    assert.equal(factoryFollowerPlayerEligible(p), false);
  }
});

test('normal launch accelerates gradually, yaw is rate bounded and wheels count only accepted motion', () => {
  const state = released(); let previousSpeed = 0, previousYaw = state.yaw;
  const frame = input([45, .12, 29]);
  for (let i = 0; i < 90; i++) {
    stepFactoryFollower(state, frame, dt);
    assert.ok(state.speed - previousSpeed <= C.acceleration * dt + 1e-8);
    assert.ok(previousSpeed - state.speed <= C.deceleration * dt + 1e-8);
    assert.ok(Math.abs(difference(previousYaw, state.yaw)) <= C.maxYawSpeed * dt + 1e-8);
    previousSpeed = state.speed; previousYaw = state.yaw;
  }
  const position = [...state.position], wheels = state.wheelDistance;
  run(state, 3, input([45, .12, 29], { movementClear: () => false }));
  assert.deepEqual(state.position, position); assert.equal(state.wheelDistance, wheels);
  assert.equal(state.speed, 0);
});

test('a blocked ramp cannot advance its route cursor or jump to the display lane', () => {
  const state = createFactoryFollower();
  const frame = input(null, { movementClear: (_from, next, radius) => {
    assert.equal(radius, .55); return next[2] < 26;
  } });
  run(state, 15, frame);
  assert.equal(state.phase, 'egress'); assert.ok(state.position[2] < 26);
  const before = structuredClone(state); run(state, 2, frame);
  assert.deepEqual(state, before);
  run(state, 15); assert.equal(state.phase, 'parked');
});

test('many visitor laps remain on the inset lane, even with large alternating frame times', () => {
  const state = released();
  for (let i = 0; i < 12000; i++) {
    const angle = i * .006;
    const visitor = [39 + 6.8 * Math.sin(angle), .12, 28.9 + 1.2 * Math.cos(angle)];
    stepFactoryFollower(state, input(visitor), i % 2 ? .016 : .5);
    inLane(state.position);
    for (const n of [...state.position, state.yaw, state.pitch, state.speed, state.wheelDistance]) assert.ok(Number.isFinite(n));
    assert.ok(state.speed <= C.maxSpeed + 1e-8);
  }
});
