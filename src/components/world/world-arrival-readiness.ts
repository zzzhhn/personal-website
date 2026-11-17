import { type RigidBody, type World } from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';
import { findSafePlayerLanding } from './safe-landing';
import { resetPlayerBody } from './player-ground';
import type { Vec3 } from './types';
import type { ActorArrival } from './actor-sites';

const blockers = new Map<object, () => boolean>();
/** Loading waits for collider registration, not for Physics to run. This permits
 * a paused entry to become ready before its first spatial-query update. */
export function holdWorldArrival(blocked: () => boolean) {
  const token = {};
  blockers.set(token, blocked);
  let held = true;
  return () => { if (held) { held = false; blockers.delete(token); } };
}
export const worldArrivalBlocked = () => [...blockers.values()].some(blocked => blocked());

/** Called only during the initial held arrival, independently of the ready flag.
 * The existing real support-ring, capsule and escape queries own acceptance.
 * Once accepted, normal dynamic grounding/rescue resumes without a ground lock. */
export function activatePlayerArrival(world: World, rapier: Parameters<typeof findSafePlayerLanding>[1], body: RigidBody,
  ground: Vec3, waterY: number): Vec3 | null {
  const landing = findSafePlayerLanding(world, rapier, body, [ground], waterY);
  if (!landing) return null;
  resetPlayerBody(body, landing);
  body.setNextKinematicTranslation({ x: landing[0], y: landing[1], z: landing[2] });
  body.setEnabled(true);
  return landing;
}

/** Initial activation only. Ordinary entries retain their authored body pose;
 * entries with a ground anchor additionally require the existing physical landing query. */
export function activateReadyArrival(entry: ActorArrival, world: World,
  states: ReadonlyMap<number,{object:Object3D}>, rapier: Parameters<typeof findSafePlayerLanding>[1],
  body: RigidBody, waterY: number): Vec3 | null {
  if(!entry.collidersReady(world,states))return null;
  if(entry.ground)return activatePlayerArrival(world,rapier,body,entry.ground,waterY);
  const p=body.translation();
  body.setEnabled(true);
  return [p.x,p.y,p.z];
}
