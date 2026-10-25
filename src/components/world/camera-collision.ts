import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';

type Point = { x: number; y: number; z: number };
/** A sphere enclosing every near-plane corner, including wide windows and first-person FOV. */
export function cameraCollisionRadius(near: number, fov: number, aspect: number, minimum = .22) {
  const h = near * Math.tan(fov * Math.PI / 360);
  return Math.max(minimum, Math.hypot(near, h, h * aspect) + .025);
}
/** Conservative G24 body/helmet envelope, expanded by the camera's near plane. Draw-only guard. */
export function cameraOverlapsGuide(camera: Point, foot: Point, nearRadius: number, alreadyHidden = false) {
  const y = Math.max(foot.y + .2, Math.min(foot.y + 1.425, camera.y));
  return Math.hypot(camera.x-foot.x,camera.y-y,camera.z-foot.z) < .35+nearRadius+(alreadyHidden?.12:0);
}

/** One safety path for orbit, eye, pivot smoothing and camera shake. Never lift over a hit. */
export function sweepCamera(world: World, rapier: Pick<typeof Rapier, 'Ball'>,
  from: Point, to: Point, radius: number, exclude: RigidBody | undefined, solid: (collider: Collider) => boolean) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = Math.hypot(dx, dy, dz);
  if (length < 1e-5) return { position: { ...from }, distance: 0, hit: null as number | null };
  const hit = world.castShape(from, { x: 0, y: 0, z: 0, w: 1 },
    { x: dx / length, y: dy / length, z: dz / length }, new rapier.Ball(radius), 0, length, true,
    undefined, undefined, undefined, exclude, solid);
  const distance = hit ? Math.max(0, hit.time_of_impact - .05) : length, k = distance / length;
  return { position: { x: from.x + dx * k, y: from.y + dy * k, z: from.z + dz * k }, distance,
    hit: hit ? hit.time_of_impact : null };
}
