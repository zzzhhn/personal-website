import type { Vec3 } from '../../types';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END, batch2Segment } from '../alpha-batch2-layout.ts';
import { createCaveExploration, startCaveExploration, cancelCaveExploration } from './cave-exploration';
import { acceptAction, advanceAcceptedAction, cancelAcceptedAction, type AcceptedAction } from '../../accepted-action';

export const CAVE_ECHO_SECONDS = 4.8;
// Inside the existing cave floor, left of the through-route. The full .82 x .75 m
// base footprint samples y=24.149722..24.391727 on its actual triangles; bury its
// .09 m lower round-over rather than leaving the old rack outside the portal floor.
export const CAVE_LAMP_HOME: Vec3 = [-16.05, 24.049, -36.5];
export const CAVE_CHIME_ANCHOR: Vec3 = [-7.1, 26.1, -39.3];
export const CAVE_CHIME_YAW = -.46;
/** WORLD pose consumed by the existing two light slots; no renderer dependency. */
export const alphaCaveLight = { active: false, position: [0,0,0] as Vec3, intensity: 0, distance: 11, color: '#ffc67d' };
let cancellation: (()=>void) | null = null;
export function registerCaveCancellation(fn:()=>void) {
  cancellation=fn;return()=>{if(cancellation===fn)cancellation=null;};
}
export function cancelAlphaCave() { cancellation?.();alphaCaveLight.active=false;alphaCaveLight.intensity=0; }
export type CaveChime = 0 | 1 | 2;
export type CaveEcho = { delay: number; position: Vec3; strength: number; pitch: number };
/** Local-clock delays also drive the rings, so mute never erases the route clue. */
export function caveEchoSequence(chime: CaveChime): CaveEcho[] {
  const path = chime === 2 ? ALPHA_CAVE_DEAD_END : ALPHA_CAVE_PATH.slice(1);
  return [{ delay: 0, position: [CAVE_CHIME_ANCHOR[0],CAVE_CHIME_ANCHOR[1]+1.7,CAVE_CHIME_ANCHOR[2]], strength: 1, pitch: chime === 2 ? 196 : chime === 1 ? 440 : 330 },
    ...path.map((p, i) => ({ delay: .48 + i * .7, position: [p[0], p[1] + 1.7, p[2]] as Vec3,
      strength: (chime === 2 ? .38 : .78) * Math.pow(.74, i), pitch: chime === 2 ? 196 : chime === 1 ? 440 : 330 }))];
}
export function caveNear(position: readonly number[], margin = 0) {
  return Math.min(batch2Segment(position[0], position[2], ALPHA_CAVE_PATH).distance,
    batch2Segment(position[0], position[2], ALPHA_CAVE_DEAD_END).distance,
    Math.hypot(position[0] - CAVE_LAMP_HOME[0], position[2] - CAVE_LAMP_HOME[2]),
    Math.hypot(position[0] - CAVE_CHIME_ANCHOR[0], position[2] - CAVE_CHIME_ANCHOR[2])) < 6.5 + margin
    && position[1] > 19 && position[1] < 43;
}
export const createCaveState = () => ({ lamp: 'rack' as 'rack' | 'reaching' | 'carried', pickup: null as AcceptedAction | null,
  echoAge: CAVE_ECHO_SECONDS, chime: 0 as CaveChime, revision: 0, exploration: createCaveExploration() });
export type CaveState = ReturnType<typeof createCaveState>;
export function startCaveLamp(s: CaveState) {
  if (s.lamp !== 'rack') return false;
  s.pickup = acceptAction(); s.lamp = 'reaching';
  return true;
}
export function cancelCaveState(s: CaveState) {
  cancelAcceptedAction(s.pickup); s.pickup = null;
  s.lamp = 'rack'; s.echoAge = CAVE_ECHO_SECONDS; s.revision++;
  cancelCaveExploration(s.exploration);
}
export function startCaveEcho(s: CaveState, chime: CaveChime) {
  if (s.echoAge < .65) return false;
  s.chime = chime; s.echoAge = 0; s.revision++; startCaveExploration(s.exploration, chime); return true;
}
export function tickCaveState(s: CaveState, dt: number, pickupEligible = true) {
  dt = Math.max(0, Math.min(.08, Number.isFinite(dt) ? dt : 0));
  s.echoAge = Math.min(CAVE_ECHO_SECONDS, s.echoAge + dt);
  if (s.lamp === 'reaching') {
    if (!s.pickup || !pickupEligible) { cancelAcceptedAction(s.pickup); s.lamp = 'rack'; s.revision++; }
    else if (advanceAcceptedAction(s.pickup, dt, true)) { s.lamp = 'carried'; s.revision++; }
  }
}
export function caveRingPulse(age: number, delay: number) {
  const t = age - delay;
  return t >= 0 && t < 1.1 ? { scale: .32 + t * 2.5, opacity: (1 - t / 1.1) * .78 } : null;
}
