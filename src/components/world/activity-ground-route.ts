import type { Vec3 } from './types';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics';

/** From the live capsule centre to an authored stance on the floor. Returns the supported capsule centre. */
export type GroundRouteQuery = (from: Vec3, destination: Vec3, limit: number, fresh?: boolean) => Vec3 | null;

export function canReachActivityStand(position: Vec3, stand: Vec3, limit: number, stopDistance: number,
  groundRoute: GroundRouteQuery | undefined, fresh=false) {
  const targetY = stand[1]+PLAYER_HALF_HEIGHT+PLAYER_RADIUS;
  if (Math.hypot(position[0]-stand[0],position[2]-stand[2]) <= stopDistance)
    return Math.abs(position[1]-targetY) <= .25;
  const end = groundRoute?.(position,stand,limit,fresh);
  return !!end && Math.abs(end[1]-targetY) <= .25;
}

/** Prompt discovery may reuse a nearby sample. A click or physical movement checks the live colliders. */
export function cacheGroundRoute(check: GroundRouteQuery, now = () => performance.now()): GroundRouteQuery {
  let last: { from: Vec3; destination: Vec3; limit: number; time: number; result: Vec3 | null } | undefined;
  return (from, destination, limit, fresh = false) => {
    const time = now();
    const previous = last;
    if (!fresh && previous && time - previous.time < 100 && previous.limit === limit
      && destination.every((v,i) => v === previous.destination[i])
      && Math.hypot(from[0]-previous.from[0],from[1]-previous.from[1],from[2]-previous.from[2]) < .05) return previous.result;
    const result = check(from,destination,limit);
    last = {from:[...from], destination:[...destination], limit, time, result};
    return result;
  };
}
