import { Vector3 } from 'three';
import type { Vec3 } from '../types';
import type { AttractionRidePose } from './attraction-ride.ts';
import { coasterFrame, coasterWorld } from './coaster-track.ts';

export type CoasterBoardingPhase = 'approach' | 'step-in' | 'turn-in' | 'sit' | 'settle' | 'riding' | 'stand' | 'turn-out' | 'step-out' | 'walk-out' | 'complete';
export interface CoasterActorFrame {
  stairs?: boolean; root: Vec3; yaw: number; speed: number;
  clip: 'Idle' | 'Walk' | 'Run' | 'TurnL' | 'TurnR' | 'SitDown' | 'SitIdle' | 'StandUp';
  clipPhase?: number;
  seatWeight: number;
  seat: Vec3;
  orientation?: [number, number, number, number];
}
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const heading = (a: Vec3, b: Vec3) => Math.atan2(a[2] - b[2], b[0] - a[0]);
const station = coasterFrame(0);
const forward = new Vector3(Math.cos(station.yaw), 0, -Math.sin(station.yaw));
const side = new Vector3(Math.sin(station.yaw), 0, Math.cos(station.yaw));
const floorPoint = station.point.clone().addScaledVector(station.forward, .82).addScaledVector(station.up, .445);
const platformY = coasterWorld([0, .08, 0])[1];
const stationPoint = (lateral: number, y: number): Vec3 => floorPoint.clone().addScaledVector(side, lateral).setY(y).toArray() as Vec3;
/** The model, collider, foot route and surface probe all share these actual tread bounds. */
export const COASTER_BOARDING = {
  yaw: station.yaw, platformY, floorY: floorPoint.y,
  approach: stationPoint(-4.15, platformY),
  inside: stationPoint(0, floorPoint.y),
  exit: stationPoint(-5.3, platformY),
  threshold: { position: stationPoint(-.975, floorPoint.y - .05), size: [1.08, .1, .18] as Vec3, yaw: station.yaw },
  stairs: Array.from({ length: 6 }, (_, i) => {
    const top = platformY + (floorPoint.y - platformY) * (i + 1) / 6;
    return { position: stationPoint(-3.65 + i * .48, (platformY + top) / 2),
      size: [1.08, top - platformY, .48] as Vec3, top, yaw: station.yaw };
  }),
};
const stairPath: Vec3[] = [COASTER_BOARDING.approach,
  ...COASTER_BOARDING.stairs.map(s => [s.position[0], s.top, s.position[2]] as Vec3),
  stationPoint(-.95, floorPoint.y), COASTER_BOARDING.inside];
// Reuse the existing Run take on the measured tread route, easing into/out of
// the short jog before the standing turn and seat contact phases take over.
export const COASTER_STAIR_SPEED = 2.6;
const STAIR_RAMP = .15;
const pathLength = (p: Vec3[]) => p.slice(1).reduce((n, v, i) => n + distance(p[i], v), 0);
function stairJog(q: number) {
  const t = Math.max(0, Math.min(1, q)), r = STAIR_RAMP, total = 1 - r;
  if (t < r) return { distance: t * t / (2 * r * total), speed: COASTER_STAIR_SPEED * t / r };
  if (t > 1 - r) return { distance: 1 - (1 - t) ** 2 / (2 * r * total), speed: COASTER_STAIR_SPEED * (1 - t) / r };
  return { distance: (t - r / 2) / total, speed: COASTER_STAIR_SPEED };
}
function along(path: Vec3[], t: number): Vec3 {
  let left = pathLength(path) * Math.max(0, Math.min(1, t));
  for (let i = 1; i < path.length; i++) {
    const n = distance(path[i - 1], path[i]);
    if (left <= n) return mix(path[i - 1], path[i], n ? left / n : 1);
    left -= n;
  }
  return [...path[path.length - 1]];
}
/** Exact horizontal tread support; the car floor probe is used only while stopped. */
export function coasterBoardingGround(x: number, z: number): number | null {
  const dx = x - floorPoint.x, dz = z - floorPoint.z;
  const longitudinal = dx * forward.x + dz * forward.z, lateral = dx * side.x + dz * side.z;
  if (Math.abs(longitudinal) > .54) return null;
  if (lateral >= -1.065 && lateral <= .6) return COASTER_BOARDING.floorY;
  for (let i = COASTER_BOARDING.stairs.length - 1; i >= 0; i--) {
    const s = COASTER_BOARDING.stairs[i];
    if (Math.abs((x - s.position[0]) * side.x + (z - s.position[2]) * side.z) <= .2401) return s.top;
  }
  return lateral < -3.89 ? platformY : null;
}
/** Start from the clear apron, never route through the side of the staircase. */
export function coasterAtBoardingEntrance(foot: Vec3): boolean {
  const delta = new Vector3(...foot).sub(floorPoint);
  return delta.dot(side) <= -3.95 && Math.abs(foot[1] - platformY) < .16
    && Math.hypot(foot[0] - COASTER_BOARDING.approach[0], foot[2] - COASTER_BOARDING.approach[2]) < 2.2;
}
export interface CoasterTransition {
  phase: CoasterBoardingPhase; elapsed: number; exitRequested: boolean;
  captured: boolean; from: Vec3; fromYaw: number; frame: CoasterActorFrame;
}
export function createCoasterTransition(from: Vec3, yaw: number, pose: AttractionRidePose): CoasterTransition {
  return { phase: 'approach', elapsed: 0, exitRequested: false, captured: false, from: [...from], fromYaw: yaw,
    frame: { root: [...from], yaw, speed: 0, clip: 'Idle', seatWeight: 0, seat: pose.seat } };
}
export function captureCoasterStart(t: CoasterTransition, root: Vec3, yaw: number) {
  if (t.captured) return;
  t.captured = true; t.from = [...root]; t.fromYaw = yaw; t.elapsed = 0;
  t.frame = { ...t.frame, root: [...root], yaw };
}
export function coasterTransitionDuration(t: CoasterTransition): number {
  switch (t.phase) {
    case 'approach': return Math.max(.25, distance(t.from, COASTER_BOARDING.approach) / 1.15);
    case 'step-in': case 'step-out': return pathLength(stairPath) / (COASTER_STAIR_SPEED * (1 - STAIR_RAMP));
    case 'turn-in': case 'turn-out': return .8;
    case 'sit': case 'stand': return 1.35;
    case 'settle': return .7;
    case 'walk-out': return Math.max(.5, distance(COASTER_BOARDING.approach, COASTER_BOARDING.exit) / 1.1);
    default: return Infinity;
  }
}
const order: CoasterBoardingPhase[] = ['approach', 'step-in', 'turn-in', 'sit', 'settle', 'riding', 'stand', 'turn-out', 'step-out', 'walk-out', 'complete'];
export function returnCoasterToStation(t: CoasterTransition) { if (t.phase === 'riding') { t.phase = 'stand'; t.elapsed = 0; } }
export function advanceCoasterTransition(t: CoasterTransition, dt: number, frozen: boolean, pose: AttractionRidePose) {
  if (!t.captured || frozen || !Number.isFinite(dt) || dt <= 0 || dt > .25) return t.frame;
  if (t.phase !== 'riding' && t.phase !== 'complete') {
    t.elapsed += dt;
    while (t.elapsed >= coasterTransitionDuration(t)) {
      t.elapsed -= coasterTransitionDuration(t);
      t.phase = t.phase === 'settle' && t.exitRequested ? 'stand' : order[order.indexOf(t.phase) + 1];
      if (t.phase === 'riding' || t.phase === 'complete') { t.elapsed = 0; break; }
    }
  }
  const q = Math.min(1, t.elapsed / coasterTransitionDuration(t)), k = smooth(q);
  const entryYaw = heading(COASTER_BOARDING.approach, COASTER_BOARDING.inside), outYaw = entryYaw + Math.PI;
  let root: Vec3 = [...COASTER_BOARDING.inside], yaw = station.yaw, speed = 0, clip: CoasterActorFrame['clip'] = 'Idle';
  let clipPhase: number | undefined, seatWeight = 0, orientation: CoasterActorFrame['orientation'];
  switch (t.phase) {
    case 'approach': {
      root = mix(t.from, COASTER_BOARDING.approach, k);
      yaw = angle(t.fromYaw, heading(t.from, COASTER_BOARDING.approach), smooth(q * 4));
      // Finish facing the stair run without an orientation cut on the next frame.
      yaw = angle(yaw, entryYaw, smooth((q - .7) / .3));
      speed = distance(t.from, COASTER_BOARDING.approach) * 6 * q * (1 - q) / coasterTransitionDuration(t); clip = 'Walk'; break;
    }
    case 'step-in': { const jog = stairJog(q); root = along(stairPath, jog.distance); yaw = entryYaw; speed = jog.speed; clip = 'Run'; break; }
    case 'turn-in': yaw = angle(entryYaw, station.yaw, k); clip = 'TurnL'; clipPhase = q; break;
    case 'sit': clip = 'SitDown'; clipPhase = q; seatWeight = smooth((q - .25) / .7); break;
    case 'settle': clip = 'SitIdle'; clipPhase = q; seatWeight = 1; break;
    case 'riding': root = [...pose.seat]; yaw = pose.yaw; orientation = pose.orientation; clip = 'SitIdle'; clipPhase = 1; seatWeight = 1; break;
    case 'stand': clip = 'StandUp'; clipPhase = q; seatWeight = 1 - smooth(q / .75); break;
    case 'turn-out': yaw = angle(station.yaw, outYaw, k); clip = 'TurnL'; clipPhase = q; break;
    case 'step-out': { const jog = stairJog(q); root = along(stairPath, 1 - jog.distance); yaw = outYaw; speed = jog.speed; clip = 'Run'; break; }
    case 'walk-out': {
      root = mix(COASTER_BOARDING.approach, COASTER_BOARDING.exit, k);
      yaw = angle(outYaw, heading(COASTER_BOARDING.approach, COASTER_BOARDING.exit), smooth(q * 4));
      speed = distance(COASTER_BOARDING.approach, COASTER_BOARDING.exit) * 6 * q * (1 - q) / coasterTransitionDuration(t); clip = 'Walk'; break;
    }
    case 'complete': root = [...COASTER_BOARDING.exit]; yaw = heading(COASTER_BOARDING.approach, COASTER_BOARDING.exit); break;
  }
  // Use the full station orientation throughout seat contact, including the tiny track pitch.
  if (seatWeight > 0 && !orientation) orientation = pose.orientation;
  t.frame = { stairs: t.phase === 'step-in' || t.phase === 'step-out', root, yaw, speed, clip, clipPhase, seatWeight, seat: [...pose.seat], orientation };
  return t.frame;
}
