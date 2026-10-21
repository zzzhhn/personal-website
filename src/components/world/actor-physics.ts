import type { Vec3 } from './types';

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
