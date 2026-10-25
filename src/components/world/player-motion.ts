import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';

type Vector = { x: number; y: number; z: number };
/** Baseline 3cb1f25 response, including its verified 8 m/s² low-speed start. */
export function playerVelocityChange(velocity: Vector, target: Vector, dt: number, grounded: boolean) {
  const factor = 1 - Math.exp(-(grounded ? 12 : 3) * dt);
  let x = (target.x - velocity.x) * factor, z = (target.z - velocity.z) * factor;
  if (grounded && Math.hypot(velocity.x, velocity.z) < 2.8 && Math.hypot(target.x, target.z) > Math.hypot(velocity.x, velocity.z)) {
    const scale = Math.min(1, 8 * dt / Math.max(1e-6, Math.hypot(x, z)));
    x *= scale; z *= scale;
  }
  return { x, z };
}

/** Contextual hurdle hop. Every sample uses the full standing capsule, never a teleport or a
 * collision-disabled path. Accept only a thin, low, stationary obstacle with dry, walkable landing. */
export function findLowVault(world: World, rapier: Pick<typeof Rapier, 'Ray' | 'Capsule'>,
  body: RigidBody, direction: Vector, waterY: number) {
  const p = body.translation(), sole = p.y - PLAYER_HALF_HEIGHT - PLAYER_RADIUS;
  const length = Math.hypot(direction.x, direction.z);
  if (length < .1) return null;
  const dx = direction.x / length, dz = direction.z / length;
  const solid = (c: Collider) => {
    const owner = c.parent();
    return !c.isSensor() && (!owner || owner.isFixed() || (owner.isSleeping() && !(owner.userData as { vehicle?: string } | undefined)?.vehicle));
  };
  const ray = (origin: Vector, dir: Vector, distance: number) => world.castRayAndGetNormal(
    new rapier.Ray(origin, dir), distance, true, undefined, undefined, undefined, body, solid);
  const obstacle = [.28, .5, .68].map(y => ray({ x: p.x, y: sole + y, z: p.z }, { x: dx, y: 0, z: dz }, 1.1))
    .filter(hit => hit !== null).sort((a, b) => a.timeOfImpact - b.timeOfImpact)[0];
  if (!obstacle || Math.abs(obstacle.normal.y) > .35) return null;
  const near = obstacle.timeOfImpact;
  const top = ray({ x: p.x + dx * (near + .08), y: sole + 1.2, z: p.z + dz * (near + .08) },
    { x: 0, y: -1, z: 0 }, 1.2);
  if (!top || top.collider.handle !== obstacle.collider.handle || top.normal.y < .85) return null;
  const height = 1.2 - top.timeOfImpact;
  if (height < .25 || height > .72) return null;
  const distance = near + 1.0;
  const landing = ray({ x: p.x + dx * distance, y: sole + 1.2, z: p.z + dz * distance },
    { x: 0, y: -1, z: 0 }, 1.55);
  if (!landing || landing.normal.y < .91) return null;
  const landingY = sole + 1.2 - landing.timeOfImpact;
  if (landingY < waterY + .15 || Math.abs(landingY - sole) > .18) return null;
  const vy = Math.sqrt(2 * 12.5 * (height + .22)), duration = 2 * vy / 12.5;
  const vx = dx * distance / duration, vz = dz * distance / duration;
  const shape = new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
  // Sweep the actual ballistic envelope in short chords, including overhead and landing clearance.
  for (let i = 0; i < 12; i++) {
    const t = duration * i / 12, next = duration * (i + 1) / 12;
    const a = { x: p.x + vx * t, y: p.y + vy * t - 6.25 * t * t + .025, z: p.z + vz * t };
    const b = { x: p.x + vx * next, y: p.y + vy * next - 6.25 * next * next + .025, z: p.z + vz * next };
    const hit = world.castShape(a, body.rotation(), { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      shape, 0, 1, true, undefined, undefined, undefined, body, solid);
    if (hit) return null;
  }
  return { vx, vz, vy, duration, height, obstacle: obstacle.collider.handle };
}
