import { Vector3 } from 'three';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import type { AttractionRidePose } from './attraction-ride.ts';
import { sweepCamera } from '../camera-collision.ts';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const solid = (collider: Collider) => !collider.isSensor();
type CabinPlacement = { safe: true; position: Vector3 } |
  { safe: false; reason: 'invalid' | 'overlap' | 'path'; hit: number | null };

/** A fixed cabin eye has no retractable orbit arm. Validate the requested eye
 * and its inter-frame path; never disguise an intrusion by moving the eye or
 * shrinking the near plane. A blocked result must not be rendered by the caller. */
export class AttractionCabinCamera {
  private previous: { position: Vector3; seat: Vector3; key: string } | null = null;

  clear() { this.previous = null; }

  step(world: World, rapier: Pick<typeof Rapier, 'Ball'>, pose: AttractionRidePose,
    radius: number, delta: number, lifecycle: string, exclude?: RigidBody): CabinPlacement {
    const position = new Vector3(...pose.cameraPosition), seat = new Vector3(...pose.seat);
    if (!pose.firstPerson || ![...position, ...seat, radius].every(Number.isFinite) || radius <= 0)
      return { safe: false, reason: 'invalid', hit: null };
    const overlap = world.intersectionWithShape(position, identity, new rapier.Ball(radius),
      undefined, undefined, undefined, exclude, solid);
    if (overlap) return { safe: false, reason: 'overlap', hit: overlap.handle };
    const previous = this.previous;
    const continuous = previous && previous.key === lifecycle && Number.isFinite(delta) && delta >= 0 && delta <= .25
      && previous.seat.distanceTo(seat) <= Math.max(4, delta * 100);
    if (continuous) {
      // Recheck the old endpoint at the current FOV: widening the near plane
      // must not turn an initially overlapping sweep into an untested shortcut.
      const oldOverlap = world.intersectionWithShape(previous.position, identity, new rapier.Ball(radius),
        undefined, undefined, undefined, exclude, solid);
      if (oldOverlap) return { safe: false, reason: 'path', hit: oldOverlap.handle };
      const swept = sweepCamera(world, rapier, previous.position, position, radius, exclude, solid);
      if (swept.hit !== null) return { safe: false, reason: 'path', hit: swept.hit };
    }
    this.previous = { position: position.clone(), seat, key: lifecycle };
    return { safe: true, position };
  }
}
