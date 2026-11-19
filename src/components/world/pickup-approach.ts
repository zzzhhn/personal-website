import type { World, RigidBody } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { playerSupport } from './player-ground.ts';
import { playerRouteClear } from './player-motion.ts';
import type { Vec3 } from './types';

/** Discovery is generous; the authored grip gate and measured palm contact stay physical. */
export const PICKUP_DISCOVERY_RADIUS = 1.8;
export const PICKUP_APPROACH_TIMEOUT = 3.5;
export interface PickupApproach {
  target: () => Vec3;
  ready: (position: Vec3) => boolean;
  candidates: (position: Vec3) => Vec3[];
}

/** Near side first, then nearby alternatives. Fixed-side objects supply their own standing strip. */
export function pickupStandingRing(target: Vec3, from: Vec3, distance = .5): Vec3[] {
  const a = Math.atan2(from[2] - target[2], from[0] - target[0]);
  return [0, 1, -1, 2, -2, 3, -3, 4].map(step => {
    const angle = a + step * Math.PI / 4;
    return [target[0] + Math.cos(angle) * distance, from[1], target[2] + Math.sin(angle) * distance];
  });
}

type Physics = Pick<typeof Rapier, 'Ball' | 'Capsule'>;
const vector = (p: Vec3) => ({ x: p[0], y: p[1], z: p[2] });
/** Sample the same connected floor in short segments. A high shelf, other storey, steep slope,
 * missing floor, wall or low ceiling rejects the route. Queries never move the actual body. */
export function pickupGroundRoute(world: World, rapier: Physics, body: RigidBody, from: Vec3, candidate: Vec3, maxDistance=2): Vec3 | null {
  const distance = Math.hypot(candidate[0] - from[0], candidate[2] - from[2]);
  if (!from.every(Number.isFinite) || !candidate.every(Number.isFinite) || !Number.isFinite(maxDistance)
    || maxDistance<=0 || maxDistance>3 || distance > maxDistance) return null;
  // A support cast can miss a continuous triangle near a numerical edge case. Recast at the
  // same XZ from slightly higher, preserving the floor range below the original point.
  const findSupport = (point: ReturnType<typeof vector>, search?: number) =>
    playerSupport(world, rapier, body, point, true, search) ?? playerSupport(world, rapier, body, point, true, search, .01);
  const support = findSupport(vector(from));
  if (!support?.grounded) return null;
  const count = Math.max(1, Math.ceil(distance / .14));
  let previous: Vec3 = [...from];
  for (let i = 1; i <= count; i++) {
    const x = from[0] + (candidate[0] - from[0]) * i / count;
    const z = from[2] + (candidate[2] - from[2]) * i / count;
    const floor = findSupport({ x, y: previous[1] + .1, z }, .22);
    if (!floor) return null;
    const next: Vec3 = [x, floor.centerY + .001, z];
    const step = Math.hypot(x - previous[0], z - previous[2]);
    if (Math.abs(next[1] - previous[1]) > step * Math.tan(25 * Math.PI / 180) + .008
      || !playerRouteClear(world, rapier, body, vector(previous), vector(next))) return null;
    previous = next;
  }
  return previous;
}

export function findPickupStand(world: World, rapier: Physics, body: RigidBody, from: Vec3, approach: PickupApproach): Vec3 | null {
  if (approach.ready(from) && pickupGroundRoute(world, rapier, body, from, from)) return [...from];
  const candidates = approach.candidates(from).slice(0, 12).sort((a, b) =>
    Math.hypot(a[0] - from[0], a[2] - from[2]) - Math.hypot(b[0] - from[0], b[2] - from[2]));
  for (const candidate of candidates) {
    const stand = pickupGroundRoute(world, rapier, body, from, candidate);
    if (stand && approach.ready(stand)) return stand;
  }
  return null;
}

export function pickupApproachMotion(position: Vec3, stand: Vec3, target: Vec3, ready: boolean) {
  const dx = stand[0] - position[0], dz = stand[2] - position[2], distance = Math.hypot(dx, dz);
  const pace = ready ? 0 : Math.min(1.35, distance * 4);
  return { vx: distance > .001 ? dx / distance * pace : 0, vz: distance > .001 ? dz / distance * pace : 0,
    yaw: Math.atan2(-(target[2] - position[2]), target[0] - position[0]) };
}
