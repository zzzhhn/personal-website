import { Vector3 } from 'three';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import type { AttractionRidePose } from './attraction-ride.ts';
import { attractionCameraSweepOrigin, attractionLookRevision } from './attraction-camera.ts';
import { sweepCamera } from '../camera-collision.ts';

/** Metres/second regained after an obstacle releases the third-person orbit. */
export const ATTRACTION_CAMERA_RECOVERY_SPEED = 6;

/** Radial state belongs to the current train-relative orbit, never a world-space
 * point lagging behind the moving train. Yaw/pitch and authored framing stay live.
 * New hard contacts shorten immediately; release restores distance at a bounded
 * rate. Every returned smoothed point gets its own near-plane sphere sweep. */
export class AttractionCameraObstruction {
  private previous: { fraction: number; key: string; seat: Vector3 } | null = null;

  clear() { this.previous = null; }

  step(world: World, rapier: Pick<typeof Rapier, 'Ball'>, pose: AttractionRidePose,
    radius: number, delta: number, lifecycle: string, exclude?: RigidBody) {
    const desired = new Vector3(...pose.cameraPosition), origin = attractionCameraSweepOrigin(pose);
    const offset = desired.clone().sub(origin), length = offset.length();
    if (pose.firstPerson || !pose.orientation) {
      this.clear(); return { position: desired, distance: length, limit: length, hit: null,
        recovering: false, forcedCompression: false };
    }
    const solid = (collider: Rapier.Collider) => !collider.isSensor();
    const raw = sweepCamera(world, rapier, origin, desired, radius, exclude, solid);
    const key = `${lifecycle}:${pose.fov}:${attractionLookRevision}`, seat = new Vector3(...pose.seat);
    const previous = this.previous;
    // A seek/teleport, new ride/phase/view or stale frame must not inherit an old
    // obstacle. Normal pause holds this state because the caller does not step it.
    const continuous = previous && previous.key === key && Number.isFinite(delta) && delta > 0 && delta <= .25
      && previous.seat.distanceTo(seat) <= Math.max(4, delta * 100);
    const limit = length > 1e-5 ? raw.distance / length : 1;
    const fraction = continuous ? Math.min(limit,
      previous.fraction + ATTRACTION_CAMERA_RECOVERY_SPEED * delta / Math.max(length, 1e-5)) : limit;
    const target = origin.clone().addScaledVector(offset, fraction);
    const final = sweepCamera(world, rapier, origin, target, radius, exclude, solid);
    this.previous = { fraction: length > 1e-5 ? final.distance / length : 1, key, seat };
    return { ...final, limit: raw.distance, hit: raw.hit,
      recovering: fraction < limit - 1e-6,
      forcedCompression: !!continuous && limit < previous.fraction - 1e-6 };
  }
}
