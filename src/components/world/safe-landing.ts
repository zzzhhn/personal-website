import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, wheelGeometry, yawRotation } from './actor-physics.ts';
import type { Vec3 } from './types';

type QueryApi = Pick<typeof Rapier, 'Ray' | 'Capsule' | 'Cuboid' | 'QueryFilterFlags'>;
type Point = { x: number; y: number; z: number };
export interface VehicleLanding { position: Vec3; yaw: number }
const DOWN = { x: 0, y: -1, z: 0 };
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const GROUND_SEARCH = .6;
const finite = (v: Vec3) => v.every(Number.isFinite);

/** Candidates are expected GROUND positions. A local static ray verifies them, without treating
 * vehicles as ground or finding roofs high above a supplied road. No Rapier query callback may
 * inspect colliders here: that re-enters the borrowed collider set in the runtime's Rapier. */
function ground(world: World, rapier: QueryApi, body: RigidBody, p: Vec3, waterY: number, dryMargin: number, maxSlope: number) {
  const flags = rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
  const origin = { x: p[0], y: p[1] + GROUND_SEARCH, z: p[2] };
  const hit = world.castRayAndGetNormal(new rapier.Ray(origin, DOWN), GROUND_SEARCH * 2, true, flags, undefined, undefined, body);
  if (!hit || hit.normal.y < Math.cos(maxSlope * Math.PI / 180)) return null;
  const y = origin.y - hit.timeOfImpact;
  return y >= waterY + dryMargin ? y : null;
}

function blocked(world: World, rapier: QueryApi, body: RigidBody, p: Point, shape: Rapier.Shape, yaw = 0) {
  return !!world.intersectionWithShape(p, yaw ? yawRotation(yaw) : IDENTITY, shape,
    rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body);
}

function playerSpot(world: World, rapier: QueryApi, body: RigidBody, p: Vec3, waterY: number) {
  const heights: number[] = [];
  for (let i = -1; i < 8; i++) {
    const angle = i * Math.PI / 4, r = i === -1 ? 0 : .75;
    const y = ground(world, rapier, body, [p[0] + Math.cos(angle) * r, p[1], p[2] + Math.sin(angle) * r], waterY, .18, 20);
    if (y === null) return null;
    heights.push(y);
  }
  const low = Math.min(...heights), high = Math.max(...heights);
  if (high - low > .3) return null;
  // PLAYER_CENTER_HEIGHT includes .06 m skin: the .04 m inflated query retains .02 m floor clearance.
  const result = { x: p[0], y: high + PLAYER_CENTER_HEIGHT, z: p[2] };
  return blocked(world, rapier, body, result, new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS + .04)) ? null : result;
}

/** Returns a standing capsule centre, or null. Order candidates by caller preference. A supported
 * ring rejects shore tips, while a supported and swept escape route rejects enclosed pockets. */
export function findSafePlayerLanding(world: World, rapier: QueryApi, body: RigidBody,
  candidateGroundVec3s: readonly Vec3[], waterY: number): Vec3 | null {
  if (!Number.isFinite(waterY)) return null;
  const shape = new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS + .04);
  for (const candidate of candidateGroundVec3s) {
    if (!finite(candidate)) continue;
    const start = playerSpot(world, rapier, body, candidate, waterY);
    if (!start) continue;
    for (let direction = 0; direction < 8; direction++) {
      const angle = direction * Math.PI / 4;
      let previous = start, clear = true;
      for (let step = 1; step <= 4; step++) {
        const next = playerSpot(world, rapier, body,
          [candidate[0] + Math.cos(angle) * step * .6, candidate[1], candidate[2] + Math.sin(angle) * step * .6], waterY);
        if (!next || Math.abs(next.y - previous.y) > .6 * Math.tan(20 * Math.PI / 180) + .015 ||
          world.castShape(previous, IDENTITY, { x: next.x - previous.x, y: next.y - previous.y, z: next.z - previous.z },
            shape, 0, 1, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body)) {
          clear = false; break;
        }
        previous = next;
      }
      if (clear) return [start.x, start.y, start.z];
    }
  }
  return null;
}

function vehicleSpot(world: World, rapier: QueryApi, body: RigidBody, size: Vec3, p: Vec3, yaw: number, waterY: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw), heights: number[] = [];
  const halfLength = size[0] / 2 + .65, halfWidth = size[2] / 2 + .65;
  for (const x of [-halfLength, 0, halfLength]) for (const z of [-halfWidth, 0, halfWidth]) {
    const y = ground(world, rapier, body, [p[0] + c * x + s * z, p[1], p[2] - s * x + c * z], waterY, .3, 12);
    if (y === null) return null;
    heights.push(y);
  }
  const high = Math.max(...heights);
  if (high - Math.min(...heights) > .3) return null;
  const center = { x: p[0], y: high + wheelGeometry(size).height + .12, z: p[2] };
  // Includes the complete wheel-to-cabin volume, including the spaces between hull pieces.
  const bottom = high + .08, top = center.y + size[1] * .64 + .1;
  const shape = new rapier.Cuboid(size[0] / 2 + .15, (top - bottom) / 2, size[2] / 2 + .15);
  const queryCenter = { x: p[0], y: (top + bottom) / 2, z: p[2] };
  return blocked(world, rapier, body, queryCenter, shape, yaw) ? null : { center, queryCenter, shape };
}

/** Road-centre ground candidates and their road yaw must come from the caller. Both driving
 * directions need a full-width dry runway; a nearest shoreline point is deliberately insufficient.
 * The caller must handle null without forcing an unchecked teleport. No world state is mutated. */
export function findSafeVehicleLanding(world: World, rapier: QueryApi, body: RigidBody, size: Vec3,
  candidates: readonly VehicleLanding[], waterY: number): VehicleLanding | null {
  if (!finite(size) || size.some(v => v <= 0) || !Number.isFinite(waterY)) return null;
  for (const candidate of candidates) {
    if (!finite(candidate.position) || !Number.isFinite(candidate.yaw)) continue;
    const { position: p, yaw } = candidate;
    const start = vehicleSpot(world, rapier, body, size, p, yaw, waterY);
    if (!start) continue;
    const distance = Math.max(2.5, size[0] * .65), c = Math.cos(yaw), s = Math.sin(yaw);
    let clear = true;
    for (const direction of [-1, 1]) {
      let previous = start;
      for (let step = 1; step <= 4; step++) {
        const d = direction * distance * step / 4;
        const next = vehicleSpot(world, rapier, body, size, [p[0] + c * d, p[1], p[2] - s * d], yaw, waterY);
        if (!next || Math.abs(next.center.y - previous.center.y) > .12 ||
          world.castShape(previous.queryCenter, yawRotation(yaw), {
            x: next.queryCenter.x - previous.queryCenter.x, y: next.queryCenter.y - previous.queryCenter.y, z: next.queryCenter.z - previous.queryCenter.z,
          }, previous.shape, 0, 1, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body)) {
          clear = false; break;
        }
        previous = next;
      }
      if (!clear) break;
    }
    if (clear) return { position: [start.center.x, start.center.y, start.center.z], yaw };
  }
  return null;
}

/** Mouth/nose offset above the capsule centre. Feet or torso in shallow water do not count. */
export const PLAYER_HEAD_OFFSET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS * .75;
export function updateHeadSubmersion(previousSeconds: number, dt: number, bodyCenterY: number,
  waterY: number, headOffset = PLAYER_HEAD_OFFSET, rescueAfterSeconds = 2) {
  const submerged = bodyCenterY + headOffset < waterY;
  const submergedSeconds = submerged ? Math.max(0, previousSeconds) + Math.max(0, dt) : 0;
  return { submergedSeconds, shouldRescue: submergedSeconds >= rescueAfterSeconds };
}
