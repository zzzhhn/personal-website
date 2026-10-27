import { Vector3 } from 'three';
import type { AttractionRidePose } from './attraction-ride.ts';
import type { Vec3 } from '../types';

/** User offsets live outside React; track motion never clears a manual look. */
export const attractionLook = { yaw: 0, pitch: 0, zoom: 1 };
export function resetAttractionLook() { Object.assign(attractionLook, { yaw: 0, pitch: 0, zoom: 1 }); }
export function turnAttractionLook(yaw: number, pitch: number) {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
  attractionLook.yaw = Math.atan2(Math.sin(attractionLook.yaw + yaw), Math.cos(attractionLook.yaw + yaw));
  attractionLook.pitch = Math.max(-1.15, Math.min(1.15, attractionLook.pitch + pitch));
}
export function zoomAttractionLook(delta: number) {
  if (Number.isFinite(delta)) attractionLook.zoom = Math.max(.45, Math.min(1.8, attractionLook.zoom * Math.exp(delta)));
}
/** A view transform only: it cannot change the train, seat or character orientation. */
export function attractionCameraPose(pose: AttractionRidePose, look = attractionLook): AttractionRidePose {
  if (!look.yaw && !look.pitch && (pose.firstPerson || look.zoom === 1)) return pose;
  const up = new Vector3(...(pose.cameraUp ?? [0, 1, 0])).normalize();
  const camera = new Vector3(...pose.cameraPosition), target = new Vector3(...pose.cameraTarget);
  const direction = pose.firstPerson ? target.clone().sub(camera) : camera.clone().sub(target);
  direction.applyAxisAngle(up, look.yaw);
  const side = new Vector3().crossVectors(up, direction).normalize();
  direction.applyAxisAngle(side, pose.firstPerson ? -look.pitch : look.pitch);
  if (pose.firstPerson) target.copy(camera).add(direction);
  else {
    // Orbit above the seat, not through the wheels. Clamp the resulting elevation,
    // rather than the offset: the authored view already tilts along the lift/drop.
    const length = Math.max(4.2, direction.length() * look.zoom);
    const elevation = Math.max(.12, Math.min(1.2, Math.asin(Math.max(-1, Math.min(1, direction.clone().normalize().dot(up))))));
    const horizontal = direction.clone().addScaledVector(up, -direction.dot(up)).normalize();
    direction.copy(horizontal).multiplyScalar(Math.cos(elevation)).addScaledVector(up, Math.sin(elevation));
    camera.copy(target).addScaledVector(direction, length);
  }
  return { ...pose, cameraPosition: camera.toArray() as Vec3, cameraTarget: target.toArray() as Vec3 };
}
