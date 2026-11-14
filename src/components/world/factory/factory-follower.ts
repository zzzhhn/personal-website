import type { FactoryPoint } from './factory-layout.ts';

/** Factory-local metres. Bounds include the whole robot's conservative footprint. */
export const FACTORY_FOLLOWER = {
  dock: [37, .675, 24] as readonly number[],
  rampTop: [37, .675, 25.3] as readonly number[],
  rampBottom: [37, .12, 27.5] as readonly number[],
  park: [37, .12, 28.5] as readonly number[],
  lane: { minX: 32, maxX: 46, minZ: 27.6, maxZ: 30.2 },
  radius: .55,
  floorY: .12,
  playerHeightTolerance: .35,
  followDistance: 1.5,
  resumeDistance: 1.75,
  minimumSeparation: 1.2,
  maxSpeed: 1.35,
  acceleration: 1.1,
  deceleration: 1.8,
  maxYawSpeed: 2.1,
  maxPitchSpeed: 1.2,
} as const;

export type FactoryFollowerPhase = 'docked' | 'egress' | 'parking' | 'parked' | 'following';
/** The callback may inspect these arrays only during the call; proposed is reused.
 * Return false to stop before a swept obstacle/player hit. No Rapier dependency. */
export type FactoryFollowerClearance = (
  from: readonly number[], proposed: readonly number[], radius: number,
) => boolean;
export interface FactoryFollowerInput {
  released: boolean;
  /** Foot contact position, NOT capsule centre; convert world coordinates first. */
  playerFootpoint: readonly number[] | null;
  operating?: boolean;
  paused?: boolean;
  hidden?: boolean;
  movementClear?: FactoryFollowerClearance;
}
export interface FactoryFollower {
  phase: FactoryFollowerPhase;
  position: FactoryPoint;
  /** +Z is zero; use rotation.y = yaw, rotation.x = pitch. */
  yaw: number;
  pitch: number;
  speed: number;
  /** Actual 3D travel, never elapsed time; wheel.rotation.x = distance / radius. */
  wheelDistance: number;
  egressDistance: number;
  /** Scratch arrays belong to this instance and are mutated without allocations. */
  target: FactoryPoint;
  proposed: FactoryPoint;
}

const C = FACTORY_FOLLOWER;
const dockRun = C.rampTop[2] - C.dock[2];
const rampRun = C.rampBottom[2] - C.rampTop[2];
const rampDrop = C.rampTop[1] - C.rampBottom[1];
const rampLength = Math.hypot(rampRun, rampDrop);
const exitRun = C.park[2] - C.rampBottom[2];
const egressLength = dockRun + rampLength + exitRun;
const arrival = .002;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const approach = (value: number, target: number, amount: number) =>
  value + clamp(target - value, -amount, amount);
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function createFactoryFollower(alreadyReleased = false): FactoryFollower {
  const position:FactoryPoint=alreadyReleased?[37,.12,28.5]:[37,.675,24];
  return { phase: alreadyReleased?'parked':'docked', position, yaw: 0, pitch: 0,
    speed: 0, wheelDistance: 0, egressDistance: alreadyReleased?egressLength:0,
    target: [37, .12, 28.5], proposed: [...position] };
}

export function factoryFollowerPlayerEligible(player: readonly number[] | null): boolean {
  return !!player && player.length >= 3 && Number.isFinite(player[0]) &&
    Number.isFinite(player[1]) && Number.isFinite(player[2]) &&
    Math.abs(player[1] - C.floorY) <= C.playerHeightTolerance &&
    player[0] >= C.lane.minX && player[0] <= C.lane.maxX &&
    player[2] >= C.lane.minZ && player[2] <= C.lane.maxZ;
}

function sampleEgress(distance: number, out: FactoryPoint) {
  out[0] = C.dock[0];
  if (distance <= dockRun) {
    out[1] = C.dock[1]; out[2] = C.dock[2] + distance;
  } else if (distance <= dockRun + rampLength) {
    const t = (distance - dockRun) / rampLength;
    out[1] = C.rampTop[1] - rampDrop * t;
    out[2] = C.rampTop[2] + rampRun * t;
  } else {
    out[1] = C.floorY; out[2] = C.rampBottom[2] + distance - dockRun - rampLength;
  }
}

function acceptMovement(state: FactoryFollower, input: FactoryFollowerInput): boolean {
  if (input.movementClear && !input.movementClear(state.position, state.proposed, C.radius)) {
    state.speed = 0; return false; // A blocked swept path is a safety stop, never a teleport.
  }
  const p = state.position, next = state.proposed;
  state.wheelDistance += Math.hypot(next[0] - p[0], next[1] - p[1], next[2] - p[2]);
  p[0] = next[0]; p[1] = next[1]; p[2] = next[2];
  return true;
}

function advanceSpeed(state: FactoryFollower, distance: number, dt: number) {
  // Proportional arrival is softer than a fixed-speed snap at the parking spot.
  const desired = Math.min(C.maxSpeed, distance * 2);
  state.speed = approach(state.speed, desired,
    (desired > state.speed ? C.acceleration : C.deceleration) * dt);
}

/** Mutates only this instance. Call once per visible frame; no catch-up after pause.
 * Egress is a continuous dock/ramp/landing route. Only after reaching its parking
 * spot can the companion enter the convex display lane's follow/return loop.
 * Static lane safety is built in; supply movementClear for dynamic collision.
 * Reset a new production batch by creating a new instance, not changing position.
 */
export function stepFactoryFollower(state: FactoryFollower, input: FactoryFollowerInput, delta: number): void {
  if (input.paused || input.hidden || !input.released || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(delta, .05);
  if (state.phase === 'docked') state.phase = 'egress';
  if (state.phase === 'egress') {
    const remaining = egressLength - state.egressDistance;
    if (remaining <= arrival) { state.phase = 'parked'; state.speed = 0; return; }
    advanceSpeed(state, remaining, dt);
    const nextDistance = Math.min(egressLength, state.egressDistance + state.speed * dt);
    sampleEgress(nextDistance, state.proposed);
    if (acceptMovement(state, input)) {
      state.egressDistance = nextDistance;
      const onRamp = nextDistance > dockRun && nextDistance < dockRun + rampLength;
      state.pitch = approach(state.pitch, onRamp ? Math.atan2(rampDrop, rampRun) : 0, C.maxPitchSpeed * dt);
    }
    return;
  }

  const p = state.position, player = input.playerFootpoint;
  const eligible = !input.operating && factoryFollowerPlayerEligible(player);
  let distanceToPlayer = Infinity;
  if (eligible && player) distanceToPlayer = Math.hypot(p[0] - player[0], p[2] - player[2]);
  // A completed return must settle at park before responding to a nearby visitor.
  if (!eligible) state.phase = 'parking';
  else if (state.phase === 'parked' && distanceToPlayer > C.resumeDistance) state.phase = 'following';

  const target = state.target;
  target[1] = C.floorY;
  if (state.phase === 'following' && player && eligible) {
    if (distanceToPlayer <= C.followDistance) {
      state.speed = 0; // The visitor can approach us: hold instead of driving into them.
      state.pitch = approach(state.pitch, 0, C.maxPitchSpeed * dt);
      return;
    }
    const t = C.followDistance / distanceToPlayer;
    target[0] = clamp(player[0] + (p[0] - player[0]) * t, C.lane.minX + C.radius, C.lane.maxX - C.radius);
    target[2] = clamp(player[2] + (p[2] - player[2]) * t, C.lane.minZ + C.radius, C.lane.maxZ - C.radius);
  } else {
    target[0] = C.park[0]; target[2] = C.park[2];
  }
  const dx = target[0] - p[0], dz = target[2] - p[2], distance = Math.hypot(dx, dz);
  state.pitch = approach(state.pitch, 0, C.maxPitchSpeed * dt);
  if (distance <= arrival) {
    state.speed = 0;
    if (state.phase === 'parking') state.phase = 'parked';
    return;
  }
  state.yaw += clamp(angleDifference(state.yaw, Math.atan2(dx, dz)), -C.maxYawSpeed * dt, C.maxYawSpeed * dt);
  state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
  advanceSpeed(state, distance, dt);
  const travel = Math.min(distance, state.speed * dt), t = travel / distance;
  state.proposed[0] = p[0] + dx * t;
  state.proposed[1] = C.floorY;
  state.proposed[2] = p[2] + dz * t;
  // Parking may cross a visitor's position. Check the entire short segment,
  // including when following is disabled by station operation.
  if (factoryFollowerPlayerEligible(player) && player && travel > 0) {
    const sx = state.proposed[0] - p[0], sz = state.proposed[2] - p[2];
    const u = clamp(((player[0] - p[0]) * sx + (player[2] - p[2]) * sz) / (sx * sx + sz * sz), 0, 1);
    const closest = Math.hypot(p[0] + sx * u - player[0], p[2] + sz * u - player[2]);
    const before = Math.hypot(p[0] - player[0], p[2] - player[2]);
    if (closest < Math.min(C.minimumSeparation, before) - 1e-8) { state.speed = 0; return; }
  }
  acceptMovement(state, input);
}
