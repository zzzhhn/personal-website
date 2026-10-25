import type { Vec3 } from './types';
import type { RigidBody } from '@dimforge/rapier3d-compat';

export const PHYSICS_STEP = 1 / 60;
export const RECOVERY_SECONDS = 2;
export const PLAYER_RADIUS = 0.34;
export const PLAYER_HALF_HEIGHT = 0.48;
export const PLAYER_CENTER_HEIGHT = PLAYER_RADIUS + PLAYER_HALF_HEIGHT + 0.06;

export interface Rotation { x: number; y: number; z: number; w: number }
export function rotateVector(v: Vec3, q: Rotation): Vec3 {
  const tx = 2 * (q.y * v[2] - q.z * v[1]);
  const ty = 2 * (q.z * v[0] - q.x * v[2]);
  const tz = 2 * (q.x * v[1] - q.y * v[0]);
  return [v[0] + q.w * tx + q.y * tz - q.z * ty,
    v[1] + q.w * ty + q.z * tx - q.x * tz,
    v[2] + q.w * tz + q.x * ty - q.y * tx];
}
export function yawRotation(yaw: number): Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
/** A teleport is a physics cut, including forces that would otherwise resume after pause. */
export function resetActorBody(body: RigidBody, position: Vec3, yaw = 0) {
  body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
  body.setRotation(yawRotation(yaw), true);
  stopActorBody(body);
}
export function stopActorBody(body: RigidBody) {
  body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  body.resetForces(true); body.resetTorques(true);
}
export function heading(q: Rotation): number {
  const front = rotateVector([1, 0, 0], q);
  return Math.atan2(-front[2], front[0]);
}
export function isUpsideDown(q: Rotation): boolean { return rotateVector([0, 1, 0], q)[1] < -0.25; }
export function advanceTimer(previous: number, condition: boolean, delta: number): number {
  return condition ? previous + delta : 0;
}
export function cameraDistance(driving: boolean, zoom: number, speed: number): number {
  return (driving ? [18, 20, 22] : [12, 13.5, 15])[zoom] + (driving ? Math.min(Math.abs(speed) * 0.18, 5) : 0);
}
export function wheelGeometry(size: Vec3) {
  const radius = Math.min(0.5, Math.max(0.34, size[1] * 0.28));
  const rest = 0.42;
  const points: Vec3[] = [[size[0] * 0.34, -size[1] * 0.28, size[2] * 0.48],
    [size[0] * 0.34, -size[1] * 0.28, -size[2] * 0.48],
    [-size[0] * 0.34, -size[1] * 0.28, size[2] * 0.48],
    [-size[0] * 0.34, -size[1] * 0.28, -size[2] * 0.48]];
  return { radius, rest, points, height: size[1] * 0.28 + rest + radius };
}
/** shared by the runtime and headless Rapier regression; +X front, +Y up, +Z axle. */
export function configureRaycastVehicle(controller: {
  indexUpAxis: number; setIndexForwardAxis: number;
  addWheel: (point: {x:number;y:number;z:number}, direction: {x:number;y:number;z:number}, axle: {x:number;y:number;z:number}, rest: number, radius: number) => void;
  setWheelSuspensionStiffness: (i:number,v:number)=>void;
  setWheelSuspensionCompression: (i:number,v:number)=>void;
  setWheelSuspensionRelaxation: (i:number,v:number)=>void;
  setWheelMaxSuspensionTravel: (i:number,v:number)=>void;
  setWheelMaxSuspensionForce: (i:number,v:number)=>void;
  setWheelFrictionSlip: (i:number,v:number)=>void;
  setWheelSideFrictionStiffness: (i:number,v:number)=>void;
}, size: Vec3, mass: number, grip: number, suspension: number) {
  const geometry = wheelGeometry(size);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 0;
  geometry.points.forEach(([x,y,z], i) => {
    controller.addWheel({ x,y,z }, { x:0,y:-1,z:0 }, { x:0,y:0,z:1 }, geometry.rest, geometry.radius);
    controller.setWheelSuspensionStiffness(i, suspension);
    controller.setWheelSuspensionCompression(i, 3.8);
    controller.setWheelSuspensionRelaxation(i, 5.2);
    controller.setWheelMaxSuspensionTravel(i, 0.32);
    controller.setWheelMaxSuspensionForce(i, mass * 14);
    controller.setWheelFrictionSlip(i, grip);
    controller.setWheelSideFrictionStiffness(i, 1);
  });
  return geometry;
}

/* ---- Free camera and analogue controls (v3 controls round) ---- */
/** Third-person orbit distances for the V presets near / mid / far (index 3 is first person). */
export const CAMERA_PRESETS = [5, 12, 20] as const;
export const CAMERA_MIN_DISTANCE = 2.5;
export const CAMERA_MAX_DISTANCE = 30;
/** Default orbit = the previous fixed camera: ground azimuth (+X .6, +Z .8), 45 deg elevation. */
export const CAMERA_DEFAULT_YAW = Math.atan2(0.8, 0.6);
export const CAMERA_DEFAULT_PITCH = Math.PI / 4;
export const CAMERA_PITCH_LIMITS = { third: [-0.2, 1.3], first: [-1.25, 1.25] } as const;
/** Unit vector from the orbit pivot to the camera (camera looks along its negative). */
export function orbitDirection(yaw: number, pitch: number): Vec3 {
  return [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
}
/** Camera-relative ground movement: input x = right, z = forward, mapped to world x/z.
 * At CAMERA_DEFAULT_YAW this equals the old fixed mapping vx=.8x-.6z, vz=-.6x-.8z. */
export function cameraRelative(x: number, z: number, yaw: number): [number, number] {
  const fx = -Math.cos(yaw), fz = -Math.sin(yaw), rx = Math.sin(yaw), rz = -Math.cos(yaw);
  return [x * rx + z * fx, x * rz + z * fz];
}
/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
/** Radial dead zone for a 2-axis stick, rescaled so the output starts at 0 just outside the zone. */
export function radialDeadzone(x: number, y: number, zone = 0.18): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= zone) return [0, 0];
  const k = Math.min(1, (m - zone) / (1 - zone)) / m;
  return [x * k, y * k];
}
/** Keyboard axis ramp: grows toward a held target at `rise`/s, returns or reverses at `fall`/s. */
export function rampAxis(current: number, target: number, dt: number, rise: number, fall: number): number {
  const growing = target !== 0 && (current === 0 || Math.sign(target) === Math.sign(current)) && Math.abs(target) > Math.abs(current);
  const step = (growing ? rise : fall) * dt;
  return current + Math.min(step, Math.max(-step, target - current));
}
