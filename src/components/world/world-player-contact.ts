import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';

export const playerContactId = 'player-capsule';
export const playerContactRoot = 'world-player-contact';
export const playerContactSource = {worldCollision:'solid',surfaceId:playerContactId,worldCollisionSharedSurface:true};
export const PLAYER_CONTACT_MEMBERSHIP = 1<<15;
export const PLAYER_CONTACT_GROUPS = ((PLAYER_CONTACT_MEMBERSHIP<<16)|0xffff)>>>0;

const controlledHolds = new WeakMap<RapierCollider,()=>boolean>();

export function registerPlayerContact(collider:RapierCollider, isHeld:()=>boolean) {
  controlledHolds.set(collider,isHeld);
}

export function isPlayerContact(collider:RapierCollider|undefined) {
  return !!collider&&controlledHolds.has(collider);
}

/** Rapier propagates the body's enabled flag to the collider on its next step. */
export function isHeldPlayerContact(collider:RapierCollider,body:RapierRigidBody|null) {
  return !!body && !body.isEnabled() && collider.parent()===body && body.numColliders()===1 && body.collider(0)===collider
    && !collider.isSensor() && collider.collisionGroups()===PLAYER_CONTACT_GROUPS && controlledHolds.get(collider)?.()===true;
}
