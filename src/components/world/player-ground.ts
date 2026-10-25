import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';

type Vector = { x: number; y: number; z: number };
type ShapeFactory = Pick<typeof Rapier, 'Capsule'>;
const UP = .06, CONTACT = .012, SEARCH = .03;
const WALKABLE = Math.cos(25 * Math.PI / 180);
const GRAVITY = 12.5;
const staticSolid = (c: Collider) => !c.isSensor() && (!c.parent() || c.parent()!.isFixed());

/** A lifted capsule sweep returns a usable normal even when the real capsule slightly penetrates. */
export function playerSupport(world: World, rapier: ShapeFactory, body: RigidBody,
  position: Vector = body.translation(), staticOnly = false, search = SEARCH) {
  const hit = world.castShape({ ...position, y: position.y + UP }, body.rotation(), { x: 0, y: -1, z: 0 },
    new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), 0, UP + search, true,
    undefined, undefined, undefined, body, staticOnly ? staticSolid : c => !c.isSensor());
  if (!hit || hit.normal1.y < WALKABLE) return null;
  const gap = hit.time_of_impact - UP;
  const n = hit.normal1;
  return { gap, centerY: position.y - gap, normal: n, handle: hit.collider.handle,
    grounded: gap <= CONTACT };
}

/** Follow only the next continuous static support. Rapier still moves and collides the dynamic body.
 * No cached floor, position snap, visual offset, or force across a step/cliff/jump is used. */
export function followPlayerGround(world: World, rapier: ShapeFactory, body: RigidBody,
  nextVelocity: Vector, dt: number, jumping: boolean) {
  if (jumping || dt <= 0) return null;
  const p = body.translation(), support = playerSupport(world, rapier, body, p, true);
  // A solver impulse at a collider seam can separate the capsule by one extra centimetre
  // in one step. Permit damping inside that skin without reporting it as gameplay contact.
  if (!support || support.gap > .02) return null;
  const ahead = { x: p.x + nextVelocity.x * dt, y: p.y, z: p.z + nextVelocity.z * dt };
  const distance = Math.hypot(ahead.x - p.x, ahead.z - p.z);
  const next = playerSupport(world, rapier, body, ahead, true, SEARCH + distance * Math.tan(25 * Math.PI / 180));
  if (!next) return null;
  // 6 mm allows collider seams; larger vertical steps must be handled by collisions, not this servo.
  if (Math.abs(next.centerY - support.centerY) > distance * Math.tan(25 * Math.PI / 180) + .006) return null;
  const targetY = next.centerY + .001;
  const targetVy = (targetY - p.y) / dt + GRAVITY * dt;
  // Uphill lift belongs to the contact solver. Adding positive servo force at a raised
  // collider seam doubles its upward impulse and launches the capsule over the crest.
  const dv = Math.max(-120 * dt, Math.min(0, targetVy - body.linvel().y));
  body.applyImpulse({ x: 0, y: dv * body.mass(), z: 0 }, true);
  return { gap: support.gap, nextGap: next.gap, targetY, deltaVelocityY: dv };
}
