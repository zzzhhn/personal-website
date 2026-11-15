import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END } from '../alpha-batch2-layout';
import { PLAYER_CENTER_HEIGHT } from '../../actor-physics';
import type { Vec3 } from '../../types';
import type { CaveChime, CaveEcho } from './cave-state';

export type CaveRoute = 'through' | 'mural' | 'return';
export interface CaveExploration {
  route: CaveRoute | null;
  next: number;
  muralReady: boolean;
  visited: boolean;
  completed: boolean;
}
export const createCaveExploration = (): CaveExploration => ({ route: null, next: 0, muralReady: false, visited: false, completed: false });
// Stable route arrays are read every animation frame by progression and rings.
// Copy/reverse only once, without mutating the shared authored survey.
const CAVE_ROUTES: Readonly<Record<CaveRoute, readonly Vec3[]>> = {
  through: ALPHA_CAVE_PATH.slice(1),
  mural: ALPHA_CAVE_DEAD_END,
  return: ALPHA_CAVE_DEAD_END.slice(0, -1).reverse(),
};
export const caveRoutePoints = (route: CaveRoute): readonly Vec3[] => CAVE_ROUTES[route];
export function startCaveExploration(state: CaveExploration, chime: CaveChime) {
  state.route = chime === 2 ? 'mural' : 'through';
  state.next = 0; state.muralReady = false; state.visited = true;
}
export function cancelCaveExploration(state: CaveExploration) {
  state.route = null; state.next = 0; state.muralReady = false;
}
/** Body-centre survey, not a required centre-line step. 2.4 m accepts walking
 * either side of this broad tunnel; local height excludes the mountain above. */
export function caveAtWaypoint(position: readonly number[], target: readonly number[]) {
  return position.every(Number.isFinite) && Math.hypot(position[0] - target[0], position[2] - target[2]) <= 2.4
    && Math.abs(position[1] - (target[1] + .12 + PLAYER_CENTER_HEIGHT)) <= 1.25;
}
export function advanceCaveExploration(state: CaveExploration, position: readonly number[], echoAge: number) {
  if (!state.route || state.muralReady || !Number.isFinite(echoAge)) return null;
  const points = caveRoutePoints(state.route), target = points[state.next];
  // A cue must actually have reached this point. No region entry, timer alone,
  // distant floor or skipped intermediate waypoint can finish the experience.
  if (!target || echoAge < .48 + state.next * .7 || !caveAtWaypoint(position, target)) return null;
  state.next++;
  if (state.next < points.length) return null;
  if (state.route === 'mural') { state.muralReady = true; return { kind: 'mural' as const, firstComplete: false }; }
  const kind = state.route === 'return' ? 'return' as const : 'exit' as const;
  const firstComplete = !state.completed;
  state.completed = true; state.route = null;
  return { kind, firstComplete };
}
/** Reading the existing relief starts the original side path in reverse. */
export function readCaveMural(state: CaveExploration) {
  if (state.route !== 'mural' || !state.muralReady) return false;
  state.route = 'return'; state.next = 0; state.muralReady = false;
  return true;
}
export function caveReturnEchoSequence(): CaveEcho[] {
  const origin = ALPHA_CAVE_DEAD_END.at(-1)!;
  return [origin, ...caveRoutePoints('return')].map((p, i) => ({
    delay: i === 0 ? 0 : .48 + (i - 1) * .7,
    position: [p[0], p[1] + 1.7, p[2]] as Vec3, strength: .72 * .74 ** i, pitch: 330,
  }));
}
/** Reuse a current mineral ring as a quiet next-point cue after its timed echo.
 * No additional geometry, material, light or render pass is needed. */
export function caveGuideRingOpacity(state: CaveExploration, index: number, age: number, delay: number) {
  if (!state.route || age < delay) return 0;
  const nextRing = state.muralReady ? caveRoutePoints(state.route).length : state.next + 1;
  return index === nextRing ? .22 : 0;
}
