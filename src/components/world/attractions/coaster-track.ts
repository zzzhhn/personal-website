import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { INTENT_COASTER } from './attraction-layout.ts';
import type { AttractionRidePose } from './attraction-ride.ts';
import type { Vec3 } from '../types';

export const COASTER_DURATION = 70;
export type CoasterView = 'chase' | 'first-person' | 'comfort';
export const coasterWorld = ([x, y, z]: Vec3): Vec3 => [x + INTENT_COASTER.center[0], y + INTENT_COASTER.center[1], z + INTENT_COASTER.center[2]];
export const COASTER_GATE_Z = 56;
export const COASTER_EXIT = coasterWorld([-4.2, .08, 43]);
export const COASTER_BOARD = coasterWorld([-2.8, .65, 43]);
export const COASTER_CANOPY_BOUNDS = { min: coasterWorld([-11, 6.2, 30]), max: coasterWorld([7, 7.4, 53]) };
// New topology: lift, plunge, airtime, complete vertical inversion, high turn,
// low S bends, descending equipment helix, enclosed return and station.
export const COASTER_POINTS: Vec3[] = [
  [0,0.8,43], [0,1.2,30], [-17,8,24], [-33,22,-8],
  [-33,43,-55], [-33,54,-80], [-24,54,-85], [-13,42,-78],
  [-6,13,-58], [1,3,-39], [18,3,-24], [39,26,-12],
  [59,14,-28], [62,11,-54], [64,10,-79], [64,15,-93],
  [65,28,-101], [67,41,-94], [69,43,-80], [71,39,-65],
  [73,26,-59], [76,13,-67], [78,11,-80], [81,17,-101],
  [60,26,-113], [30,27,-110], [9,20,-91], [4,14,-69],
  [25,16,-51], [38,8,-29], [16,6,-7], [-10,8,7],
  [-25,11,-3], [-43,12,-1], [-49,9,15], [-38,6,28],
  [-23,4,22], [-21,3,6], [-34,2.8,1], [-47,2.4,13],
  [-40,2.2,34], [-22,1.8,38], [-16,1,43], [-9,0.8,51],
  [-2,0.8,49],
];
export const coasterCurve = new CatmullRomCurve3(COASTER_POINTS.map(p => new Vector3(...coasterWorld(p))), true, 'centripetal');
coasterCurve.arcLengthDivisions = 4096;
const lengths = coasterCurve.getLengths();
export const COASTER_LENGTH = lengths[lengths.length - 1];
export const coasterControlU = (index: number) => {
  const at = index / COASTER_POINTS.length * (lengths.length - 1), low = Math.floor(at);
  return (lengths[low] + (lengths[Math.min(low + 1, lengths.length - 1)] - lengths[low]) * (at - low)) / COASTER_LENGTH;
};
// Sample kinetic energy along distance, not arbitrary segment durations. Momentum carries
// through the low run; the final braking distance brings the train to rest at the station.
const releaseU = coasterControlU(6), releaseY = coasterCurve.getPointAt(releaseU).y;
const run = Array.from({ length: 641 }, (_, i) => {
  const u = Math.min(1, releaseU + (1 - releaseU) * i / 640), s = (u - releaseU) * COASTER_LENGTH;
  const remaining = (1 - u) * COASTER_LENGTH;
  const energy = Math.max(0, 2 * 9.81 * (releaseY - coasterCurve.getPointAt(u).y) + 3 * Math.min(s, 12));
  const free = Math.min(34, Math.sqrt(energy)), brake = Math.sqrt(2 * 3.8 * remaining);
  // Smooth minimum avoids a sudden acceleration change where braking takes over.
  const speed = free > 0 && brake > 0 ? (free ** -8 + brake ** -8) ** (-1 / 8) : 0;
  return { u, speed, time: 0 };
});
for (let i = 1; i < run.length; i++) run[i].time = run[i - 1].time
  + 2 * (run[i].u - run[i - 1].u) * COASTER_LENGTH / Math.max(.001, run[i].speed + run[i - 1].speed);
const runSeconds = run[run.length - 1].time;
export const COASTER_TIMELINE = [
  { time: 0, u: 0 }, { time: 6, u: coasterControlU(1) }, { time: 31, u: coasterControlU(5) },
  { time: 34, u: coasterControlU(6) }, { time: 36, u: coasterControlU(6) },
  ...run.slice(1).map(p => ({ time: 36 + p.time / runSeconds * (COASTER_DURATION - 36), u: p.u })),
];
const secants = COASTER_TIMELINE.slice(1).map((b, i) => (b.u - COASTER_TIMELINE[i].u) / (b.time - COASTER_TIMELINE[i].time));
const slopes = COASTER_TIMELINE.map((_, i) => i >= 4
  ? run[i - 4].speed * runSeconds / ((COASTER_DURATION - 36) * COASTER_LENGTH)
  : i === 0 || !secants[i - 1] || !secants[i] ? 0 : 2 / (1 / secants[i - 1] + 1 / secants[i]));
export function coasterDistanceAt(seconds: number) {
  const t = Math.max(0, Math.min(COASTER_DURATION, Number.isFinite(seconds) ? seconds : 0));
  let low = 0, high = COASTER_TIMELINE.length - 1;
  while (high - low > 1) { const mid = (low + high) >>> 1; if (COASTER_TIMELINE[mid].time < t) low = mid; else high = mid; }
  const i = low;
  const a = COASTER_TIMELINE[i], b = COASTER_TIMELINE[i + 1], span = b.time - a.time;
  const f = (t - a.time) / span, f2 = f * f, f3 = f2 * f;
  return (2 * f3 - 3 * f2 + 1) * a.u + (f3 - 2 * f2 + f) * span * slopes[i]
    + (-2 * f3 + 3 * f2) * b.u + (f3 - f2) * span * slopes[i + 1];
}
export function coasterPhase(seconds: number) {
  if (seconds < 6) return 'station'; if (seconds < 31) return 'lift'; if (seconds < 36) return 'crest';
  const u = coasterDistanceAt(seconds);
  return u < coasterControlU(9) ? 'drop' : u < coasterControlU(10) ? 'low' : u < coasterControlU(14) ? 'airtime'
    : u < coasterControlU(22) ? 'inversion' : u < coasterControlU(31) ? 'bank' : u < coasterControlU(37) ? 'helix' : u < coasterControlU(41) ? 'tunnel' : 'return';
}
const wrap = (u: number) => ((u % 1) + 1) % 1;
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const COASTER_TUNNEL = { start: coasterControlU(37), end: coasterControlU(41), height: 4.5, halfWidth: 3 };
export const COASTER_INVERSION = { start: coasterControlU(14), end: coasterControlU(22), top: coasterControlU(18) };
const UP = new Vector3(0, 1, 0), FRAME_COUNT = 2400;
const signedAngle = (a: Vector3, b: Vector3, axis: Vector3) => Math.atan2(new Vector3().crossVectors(a, b).dot(axis), a.dot(b));
/** Parallel transport never crosses a world-up singularity at vertical tangents. */
const transported: { forward: Vector3; up: Vector3 }[] = [];
for (let i = 0; i <= FRAME_COUNT; i++) {
  const forward = coasterCurve.getTangentAt(i / FRAME_COUNT).normalize();
  const up = i ? transported[i - 1].up.clone().applyQuaternion(new Quaternion().setFromUnitVectors(transported[i - 1].forward, forward))
    : UP.clone().addScaledVector(forward, -UP.dot(forward)).normalize();
  up.addScaledVector(forward, -up.dot(forward)).normalize(); transported.push({ forward, up });
}
const gravityAngle = (index: number) => {
  const f = transported[index], up = UP.clone().addScaledVector(f.forward, -f.forward.y).normalize();
  return signedAngle(f.up, up, f.forward);
};
const inversionStartIndex = Math.round(COASTER_INVERSION.start * FRAME_COUNT), inversionEndIndex = Math.round(COASTER_INVERSION.end * FRAME_COUNT);
const entryRoll = gravityAngle(inversionStartIndex), rawExit = gravityAngle(inversionEndIndex);
const exitRoll = entryRoll + Math.atan2(Math.sin(rawExit - entryRoll), Math.cos(rawExit - entryRoll));
const rotations = transported.map((f, i) => {
  const u = i / FRAME_COUNT;
  const roll = i >= inversionStartIndex && i <= inversionEndIndex
    ? entryRoll + (exitRoll - entryRoll) * smooth((u - COASTER_INVERSION.start) / (COASTER_INVERSION.end - COASTER_INVERSION.start)) : gravityAngle(i);
  const up = f.up.clone().applyAxisAngle(f.forward, roll), side = new Vector3().crossVectors(f.forward, up).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(f.forward, up, side));
});
// Numerical endpoint tangents differ slightly; the closed station shares one exact frame.
rotations[FRAME_COUNT].copy(rotations[0]);
export function coasterFrame(u: number, banking = true) {
  const distance = wrap(u), at = distance * FRAME_COUNT, low = Math.floor(at);
  const point = coasterCurve.getPointAt(distance), rotation = rotations[low].clone().slerp(rotations[low + 1], at - low);
  const forward = new Vector3(1, 0, 0).applyQuaternion(rotation), up = UP.clone().applyQuaternion(rotation);
  const before = coasterCurve.getTangentAt(wrap(distance - 1.47 / COASTER_LENGTH)), after = coasterCurve.getTangentAt(wrap(distance + 1.47 / COASTER_LENGTH));
  const turn = Math.atan2(before.x * after.z - before.z * after.x, before.x * after.x + before.z * after.z);
  const outsideLoop = 1 - smooth((distance - COASTER_INVERSION.start + .015) / .015) * (1 - smooth((distance - COASTER_INVERSION.end) / .015));
  const stationWeight = smooth(distance * COASTER_LENGTH / 20) * smooth((1 - distance) * COASTER_LENGTH / 30);
  const bank = banking ? Math.max(-.48, Math.min(.48, -turn * 1.7)) * outsideLoop * stationWeight : 0;
  up.applyAxisAngle(forward, bank);
  const side = new Vector3().crossVectors(forward, up).normalize();
  rotation.setFromRotationMatrix(new Matrix4().makeBasis(forward, up, side));
  const horizontal = Math.hypot(forward.x, forward.z) > .015 ? forward : transported[Math.max(0, low - 2)].forward;
  return { point, forward, side, up, rotation, bank, yaw: Math.atan2(-horizontal.z, horizontal.x) };
}

export function coasterRidePose(u: number, view: CoasterView): AttractionRidePose & { orientation: [number, number, number, number]; cameraUp: Vec3 } {
  const f = coasterFrame(u), seat = f.point.clone().addScaledVector(f.up, .72), eye = seat.clone().addScaledVector(f.up, 1.02);
  if (view === 'first-person') return { seat: seat.toArray() as Vec3, yaw: f.yaw, orientation: f.rotation.toArray(),
    cameraPosition: eye.toArray() as Vec3, cameraTarget: eye.clone().addScaledVector(f.forward, 8).toArray() as Vec3,
    cameraUp: f.up.toArray() as Vec3, firstPerson: true, fov: 66 };
  const distance = wrap(u) * COASTER_LENGTH, behind = coasterFrame(u - (view === 'comfort' ? 7.5 : 5.8) / COASTER_LENGTH);
  const camera = behind.point.clone().addScaledVector(UP, 3.3);
  const target = seat.clone().addScaledVector(UP, 1).addScaledVector(f.forward, view === 'comfort' ? 0 : 1.6);
  const inversion = smooth((distance - COASTER_INVERSION.start * COASTER_LENGTH + 24) / 16)
    * (1 - smooth((distance - COASTER_INVERSION.end * COASTER_LENGTH - 10) / 16));
  // The third-person spectator watches the actual train invert; the camera never rolls with it.
  camera.lerp(f.point.clone().addScaledVector(f.side, view === 'comfort' ? 8 : 6.5).addScaledVector(f.up, 4.8), inversion);
  target.lerp(seat.clone().addScaledVector(f.up, .7), inversion);
  const tunnel = smooth((distance - COASTER_TUNNEL.start * COASTER_LENGTH + 24) / 14)
    * (1 - smooth((distance - COASTER_TUNNEL.end * COASTER_LENGTH - 10) / 12));
  if (tunnel > 0) {
    const near = coasterFrame(u - 3.2 / COASTER_LENGTH), ahead = coasterFrame(u + 1.6 / COASTER_LENGTH);
    camera.lerp(near.point.addScaledVector(near.up, 2.9), tunnel);
    target.lerp(ahead.point.addScaledVector(ahead.up, 1.9), tunnel);
  }
  return { seat: seat.toArray() as Vec3, yaw: f.yaw, orientation: f.rotation.toArray(), cameraPosition: camera.toArray() as Vec3,
    cameraTarget: target.toArray() as Vec3, cameraUp: [0, 1, 0], firstPerson: false, fov: view === 'comfort' ? 52 : 58 };
}
export interface CoasterClock { elapsed: number; riding: boolean; revision: number }
export function advanceCoaster(clock: CoasterClock, dt: number, enabled: boolean, paused: boolean, hidden: boolean, bridgeActive: boolean, bridgeRevision: number): CoasterClock {
  if (!clock.riding) return clock;
  if (!enabled || !bridgeActive || clock.revision !== bridgeRevision) return { ...clock, riding: false, elapsed: 0 };
  if (paused || hidden || !Number.isFinite(dt) || dt <= 0 || dt > .25) return clock;
  const elapsed = Math.min(COASTER_DURATION, clock.elapsed + dt);
  return { ...clock, elapsed, riding: elapsed < COASTER_DURATION };
}
export function coasterSupports(detailed: boolean) {
  const count = Math.ceil(COASTER_LENGTH / (detailed ? 14 : 24));
  const samples = Array.from({ length: 500 }, (_, i) => ({ u: i / 500, point: coasterFrame(i / 500).point }));
  return Array.from({ length: count }, (_, i) => {
    const u = i / count, f = coasterFrame(u), top = f.point.clone().addScaledVector(f.up, -.6);
    if (top.y < 3.8) return null;
    const side = new Vector3(f.side.x, 0, f.side.z).normalize();
    const inLoop=u>=COASTER_INVERSION.start&&u<=COASTER_INVERSION.end;
    const a=top.clone().addScaledVector(side,inLoop?-6.5:-2.35),b=top.clone().addScaledVector(side,inLoop?-3.5:2.35);
    const blocked = samples.some(s => {
      const arc = Math.min(Math.abs(s.u - u), 1 - Math.abs(s.u - u)) * COASTER_LENGTH;
      return arc > 12 && s.point.y < top.y + 2.5 && (Math.hypot(s.point.x - top.x, s.point.z - top.z) < 5.2 || [a,b].some(p=>Math.hypot(s.point.x-p.x,s.point.z-p.z)<2.8));
    });
    if (blocked) return null;
    return { a, b, top };
  }).filter((s): s is { a: Vector3; b: Vector3; top: Vector3 } => s !== null);
}
