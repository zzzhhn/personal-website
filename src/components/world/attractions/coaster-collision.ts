import type * as Rapier from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import type { CoasterCollider } from './coaster-geometry';

/** Headless physics must use the same shapes, transforms and friction as CoasterCollisions. */
export function coasterColliderDescriptor(rapier: Pick<typeof Rapier, 'ColliderDesc'>, collider: CoasterCollider) {
  const shape = collider.hull ? rapier.ColliderDesc.convexHull(collider.hull) : rapier.ColliderDesc.cuboid(...collider.half);
  if (!shape) throw new Error('Invalid coaster rock hull');
  return shape.setTranslation(...collider.position)
    .setRotation(new Quaternion().setFromEuler(new Euler(...(collider.rotation ?? [0, 0, 0]))))
    .setFriction(.9);
}
