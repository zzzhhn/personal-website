import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { INTENT_COASTER } from './attraction-layout.ts';
import type { AttractionRidePose } from './attraction-ride.ts';
import type { Vec3 } from '../types';

export const COASTER_DURATION = 94;
export type CoasterView = 'chase' | 'first-person' | 'comfort';
export const coasterWorld = ([x, y, z]: Vec3): Vec3 => [x + INTENT_COASTER.center[0], y + INTENT_COASTER.center[1], z + INTENT_COASTER.center[2]];
// The station apron is a flat collider at y=1.08. This egress stays outside the rail envelope.
export const COASTER_EXIT = coasterWorld([-4.2, .08, 25]);
export const COASTER_BOARD = coasterWorld([-2.8, .65, 25]);
export const COASTER_CANOPY_BOUNDS = { min: coasterWorld([-10.6, 5.375, 14.5]), max: coasterWorld([3.4, 5.625, 30.5]) };
export const COASTER_POINTS: Vec3[] = [
  [0, .8, 27], [0, 1.6, 15], [-13, 9, 2], [-25, 23, -14],
  [-18, 28.6, -30], [-5, 28.6, -32], [2, 15, -25], [10, 3, -15],
  [26, 5, -20], [28, 10, -34], [16, 10, -38], [9, 13, -31],
  [19, 9, -8], [27, 2.6, 3], [24, 2.4, 14], [14, 2.1, 21],
  [7, 1.3, 10], [-3, 1, 3], [-12, .8, 12], [-12, .8, 25],
  [-7, .8, 29], [0, .8, 31],
];
export const coasterCurve = new CatmullRomCurve3(COASTER_POINTS.map(p => new Vector3(...coasterWorld(p))), true, 'centripetal');
coasterCurve.arcLengthDivisions = 2048;
const lengths = coasterCurve.getLengths();
export const COASTER_LENGTH = lengths[lengths.length - 1];
const atControl = (index: number) => {
  const at = index / COASTER_POINTS.length * (lengths.length - 1), low = Math.floor(at);
  return (lengths[low] + (lengths[Math.min(low + 1, lengths.length - 1)] - lengths[low]) * (at - low)) / COASTER_LENGTH;
};
export const COASTER_TIMELINE = [
  { time: 0, u: 0 }, { time: 5, u: atControl(1) }, { time: 31, u: atControl(4) },
  { time: 35, u: atControl(5) }, { time: 38, u: atControl(5) },
  { time: 45, u: atControl(7) }, { time: 58, u: atControl(10) },
  { time: 68, u: atControl(13) }, { time: 79, u: atControl(16) }, { time: COASTER_DURATION, u: 1 },
];
const secants = COASTER_TIMELINE.slice(1).map((b, i) => (b.u - COASTER_TIMELINE[i].u) / (b.time - COASTER_TIMELINE[i].time));
const slopes = COASTER_TIMELINE.map((_, i) => i === 0 || i === COASTER_TIMELINE.length - 1 || !secants[i - 1] || !secants[i]
  ? 0 : 2 / (1 / secants[i - 1] + 1 / secants[i]));
/** Monotone cubic interpolation keeps speed continuous and the crest hold truly stationary. */
export function coasterDistanceAt(seconds: number) {
  const t = Math.max(0, Math.min(COASTER_DURATION, Number.isFinite(seconds) ? seconds : 0));
  const i = Math.max(0, COASTER_TIMELINE.findIndex((p, index) => index > 0 && t <= p.time) - 1);
  const a = COASTER_TIMELINE[i], b = COASTER_TIMELINE[i + 1], span = b.time - a.time;
  const f = (t - a.time) / span, f2 = f * f, f3 = f2 * f;
  return (2 * f3 - 3 * f2 + 1) * a.u + (f3 - 2 * f2 + f) * span * slopes[i]
    + (-2 * f3 + 3 * f2) * b.u + (f3 - f2) * span * slopes[i + 1];
}
export function coasterPhase(seconds: number): 'station' | 'lift' | 'crest' | 'drop' | 'bank' | 'tunnel' | 'return' {
  return seconds < 5 ? 'station' : seconds < 31 ? 'lift' : seconds < 38 ? 'crest'
    : seconds < 45 ? 'drop' : seconds < 68 ? 'bank' : seconds < 79 ? 'tunnel' : 'return';
}
const wrap = (u: number) => ((u % 1) + 1) % 1;
export function coasterFrame(u: number, banking = true) {
  const point = coasterCurve.getPointAt(wrap(u)), forward = coasterCurve.getTangentAt(wrap(u)).normalize();
  const side = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, forward).normalize();
  const before = coasterCurve.getTangentAt(wrap(u - .003)), after = coasterCurve.getTangentAt(wrap(u + .003));
  const turn = Math.atan2(before.x * after.z - before.z * after.x, before.x * after.x + before.z * after.z);
  const bank = banking ? Math.max(-.38, Math.min(.38, -turn * 1.5)) : 0;
  up.applyAxisAngle(forward, bank); side.applyAxisAngle(forward, bank);
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(forward, up, side));
  return { point, forward, side, up, rotation, bank, yaw: Math.atan2(-forward.z, forward.x) };
}
export function coasterRidePose(u: number, view: CoasterView): AttractionRidePose & { orientation: [number, number, number, number] } {
  const f = coasterFrame(u), seat = f.point.clone().addScaledVector(f.up, .72);
  const horizontal = new Vector3(f.forward.x, 0, f.forward.z).normalize();
  const eye = seat.clone().addScaledVector(f.up, 1.02);
  const camera = view === 'first-person' ? eye : view === 'comfort'
    ? seat.clone().addScaledVector(f.forward, -8).add(new Vector3(0, 3.4, 0))
    : seat.clone().addScaledVector(f.forward, -7.5).add(new Vector3(0, 3.4, 0));
  const target = view === 'comfort' ? seat.clone().addScaledVector(horizontal, 5).add(new Vector3(0, 1, 0))
    : eye.clone().addScaledVector(f.forward, view === 'first-person' ? 8 : 4);
  return { seat: seat.toArray() as Vec3, yaw: f.yaw, orientation: f.rotation.toArray(), cameraPosition: camera.toArray() as Vec3,
    cameraTarget: target.toArray() as Vec3, firstPerson: view === 'first-person', fov: view === 'comfort' ? 52 : view === 'first-person' ? 66 : 58 };
}
export interface CoasterClock { elapsed: number; riding: boolean; revision: number }
/** No wall clock: hidden/paused frames and stale bridge ownership can never be replayed. */
export function advanceCoaster(clock: CoasterClock, dt: number, enabled: boolean, paused: boolean, hidden: boolean, bridgeActive: boolean, bridgeRevision: number): CoasterClock {
  if (!clock.riding) return clock;
  if (!enabled || !bridgeActive || clock.revision !== bridgeRevision) return { ...clock, riding: false, elapsed: 0 };
  if (paused || hidden || !Number.isFinite(dt) || dt <= 0 || dt > .25) return clock;
  const elapsed = Math.min(COASTER_DURATION, clock.elapsed + dt);
  return { ...clock, elapsed, riding: elapsed < COASTER_DURATION };
}

/** Skip a tower where its cross braces would occupy a different, lower rail's envelope. */
export function coasterSupports(detailed: boolean) {
  const count = Math.ceil(COASTER_LENGTH / (detailed ? 10 : 18));
  const samples = Array.from({ length: 240 }, (_, i) => ({ u: i / 240, point: coasterFrame(i / 240).point }));
  return Array.from({ length: count }, (_, i) => {
    const u = i / count, f = coasterFrame(u), top = f.point.clone().addScaledVector(f.up, -.25);
    if (top.y < 2.5) return null;
    const blocked = samples.some(s => {
      const arc = Math.min(Math.abs(s.u - u), 1 - Math.abs(s.u - u)) * COASTER_LENGTH;
      return arc > 12 && s.point.y < top.y + 2 && Math.hypot(s.point.x - top.x, s.point.z - top.z) < 4.2;
    });
    if (blocked) return null;
    return { a: top.clone().addScaledVector(f.side, -1.7), b: top.clone().addScaledVector(f.side, 1.7), top };
  }).filter((s): s is { a: Vector3; b: Vector3; top: Vector3 } => s !== null);
}
