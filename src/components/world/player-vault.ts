import { QueryFilterFlags, type World, type RigidBody } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';

type V = { x: number; y: number; z: number };
export interface RailVault {
  from: V; to: V; direction: V; hand: [number, number, number];
  height: number; rise: number; duration: number; prepare: number;
}
const DOWN = { x: 0, y: -1, z: 0 };
const FIXED = QueryFilterFlags.EXCLUDE_DYNAMIC | QueryFilterFlags.EXCLUDE_KINEMATIC | QueryFilterFlags.EXCLUDE_SENSORS;
const smooth = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

/** A short hand plant, lift, transfer, then landing. The standing capsule remains solid throughout. */
export function railVaultPosition(plan: RailVault, elapsed: number): V {
  const u = Math.min(1, Math.max(0, (elapsed - plan.prepare) / (plan.duration - plan.prepare)));
  const across = smooth((u - .24) / .52);
  return { x: plan.from.x + (plan.to.x - plan.from.x) * across,
    y: plan.from.y + (plan.to.y - plan.from.y) * smooth(u) + Math.sin(Math.PI * u) * plan.rise,
    z: plan.from.z + (plan.to.z - plan.from.z) * across };
}

/** Split rails can be separate colliders or triangles of one quarry mesh. Check the surface and
 * the whole route, never infer clearance from collider identity or disable a fence to traverse it. */
export function findRailVault(world: World, rapier: Pick<typeof Rapier, 'Ray' | 'Capsule'>,
  body: RigidBody, direction: V, waterY: number): RailVault | null {
  const p = body.translation(), sole = p.y - PLAYER_HALF_HEIGHT - PLAYER_RADIUS;
  const length = Math.hypot(direction.x, direction.z); if (length < .1) return null;
  const dir = { x: direction.x / length, y: 0, z: direction.z / length };
  const ray = (origin: V, d: V, distance: number) => world.castRayAndGetNormal(new rapier.Ray(origin, d), distance, true, FIXED, undefined, undefined, body);
  let near = Infinity;
  for (const h of [.4, .65, .95, 1.1]) {
    const hit = ray({ x: p.x, y: sole + h, z: p.z }, dir, .85);
    if (hit && Math.abs(hit.normal.y) < .3 && -(hit.normal.x * dir.x + hit.normal.z * dir.z) > .8) near = Math.min(near, hit.timeOfImpact);
  }
  // The short G24 arms need the player close to the rail before planting, not reaching from 85 cm.
  if (!Number.isFinite(near) || near < PLAYER_RADIUS - .03 || near > .41) return null;
  const x = p.x + dir.x * (near + .045), z = p.z + dir.z * (near + .045);
  const top = ray({ x, y: sole + 1.35, z }, DOWN, 1.1);
  if (!top || top.normal.y < .9) return null;
  const topY = sole + 1.35 - top.timeOfImpact, height = topY - sole;
  if (height < .72 || height > 1.15) return null;
  // Both palm positions must have a real level top, avoiding lone posts and the end of a rail.
  for (const side of [-.18, .18]) {
    const h = ray({ x: x - dir.z * side, y: topY + .1, z: z + dir.x * side }, DOWN, .18);
    if (!h || h.normal.y < .9 || Math.abs(topY + .1 - h.timeOfImpact - topY) > .035) return null;
  }
  // A rail may be up to 24 cm thick. A wide ledge/wall is a different traversal, not a vault.
  const beyond = { x: p.x + dir.x * (near + .28), y: topY + .1, z: p.z + dir.z * (near + .28) };
  const thick = ray(beyond, DOWN, .25); if (thick) return null;
  const distance = near + .28 + PLAYER_RADIUS + .16;
  const to = { x: p.x + dir.x * distance, y: 0, z: p.z + dir.z * distance };
  const floor = ray({ ...to, y: sole + 1.35 }, DOWN, 1.7);
  if (!floor || floor.normal.y < .91) return null;
  const floorY = sole + 1.35 - floor.timeOfImpact;
  if (floorY < waterY + .15 || Math.abs(floorY - sole) > .22) return null;
  to.y = floorY + PLAYER_HALF_HEIGHT + PLAYER_RADIUS + .012;
  const plan: RailVault = { from: { ...p }, to, direction: dir, hand: [x, topY, z], height,
    rise: height + .37, prepare: .24, duration: 1.44 };
  const shape = new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
  for (let i = 0; i < 32; i++) {
    const a = railVaultPosition(plan, plan.prepare + (plan.duration - plan.prepare) * i / 32);
    const b = railVaultPosition(plan, plan.prepare + (plan.duration - plan.prepare) * (i + 1) / 32);
    // A 12 mm query lift clears the resting contact skin without narrowing the standing capsule.
    if (world.castShape({ ...a, y: a.y + .012 }, body.rotation(), { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      shape, .002, 1, true, QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body)) return null;
  }
  return plan;
}

/** Recheck the next movement against current bodies, so a newly arriving vehicle can cancel it. */
export function railVaultVelocity(world: World, rapier: Pick<typeof Rapier, 'Capsule'>,
  body: RigidBody, plan: RailVault, elapsed: number, dt: number): V | null {
  const p = body.translation(), target = railVaultPosition(plan, Math.min(plan.duration, elapsed + dt));
  const delta = { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z };
  if (Math.hypot(delta.x, delta.y, delta.z) > .6) return null;
  const hit = world.castShape({ ...p, y: p.y + .012 }, body.rotation(), delta,
    new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), .001, 1, true,
    QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body);
  if (hit) return null;
  // Compensate the next gravity integration, not a position teleport; collision/CCD stay active.
  return { x: delta.x / dt, y: delta.y / dt + 12.5 * dt, z: delta.z / dt };
}
