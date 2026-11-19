import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import type { RegionPassage } from './region-passage';
import type { Vec3 } from './types';

const heldBodies = new WeakMap<RigidBody, { owner: symbol; contacts: Set<Collider> }>();
export const isRegionBodyHeld = (body: RigidBody) => heldBodies.has(body);
export const isRegionColliderHeld = (collider: Collider, body: RigidBody | null) =>
  body !== null && heldBodies.get(body)?.contacts.has(collider) === true;

function activeContacts(body: RigidBody) {
  const contacts = new Set<Collider>();
  for (let i = 0; i < body.numColliders(); i++) {
    const collider = body.collider(i);
    const groups = collider.collisionGroups();
    if (collider.isEnabled() && !collider.isSensor() && (groups >>> 16) !== 0 && (groups & 0xffff) !== 0) contacts.add(collider);
  }
  return contacts;
}

const stopped = { x: 0, y: 0, z: 0 };
const position = (body: RigidBody): Vec3 => {
  const { x, y, z } = body.translation();
  return [x, y, z];
};

/** Region admission applies to contact impulses as well as commanded motion. Keep
 * bodies already in an unloaded region out of the solver until it mounts again. */
export function createRegionBodyGuard(passage: RegionPassage) {
  const owner = Symbol();
  const snapshots = new WeakMap<RigidBody, { position: Vec3; rotation: ReturnType<RigidBody['rotation']> }>();
  return {
    admit(body: RigidBody, radius: number) {
      const waiting = heldBodies.get(body)?.owner === owner;
      // Seats, vehicles, rides and initial arrival own their own disabled bodies.
      if (!waiting && !body.isEnabled()) return true;
      if (!passage.at(position(body), radius)) {
        if (!waiting) {
          body.setLinvel(stopped, false);
          body.setAngvel(stopped, false);
          const contacts = activeContacts(body);
          body.setEnabled(false);
          heldBodies.set(body, { owner, contacts });
        }
        return false;
      }
      if (waiting) {
        heldBodies.delete(body);
        body.setEnabled(true);
        body.wakeUp();
      }
      return true;
    },
    capture(body: RigidBody) {
      if (body.isEnabled()) snapshots.set(body, { position: position(body), rotation: body.rotation() });
    },
    finish(body: RigidBody, radius: number) {
      const previous = snapshots.get(body);
      snapshots.delete(body);
      if (!previous || !body.isEnabled()) return null;
      const next = position(body);
      if (next[0] === previous.position[0] && next[2] === previous.position[2]) return null;
      if (passage.allows(previous.position, next, radius)) return null;
      const [x, y, z] = previous.position;
      body.setTranslation({ x, y, z }, true);
      body.setRotation(previous.rotation, true);
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      body.setAngvel(stopped, true);
      return next;
    },
    forget(body: RigidBody) {
      if (heldBodies.get(body)?.owner === owner) heldBodies.delete(body);
      snapshots.delete(body);
    },
  };
}
