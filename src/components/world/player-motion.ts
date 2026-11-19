import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { Ray } from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';

type Vector = { x: number; y: number; z: number };
const WALKABLE_NORMAL_Y = Math.cos(25 * Math.PI / 180);
const clearanceQueries = new WeakMap<object, { world: World; candidates: Collider[]; blocked: Set<number> }>();
/** A query-only swept guard. The dynamic body still owns gravity, support, impulses and CCD.
 * Rapier's slide solver handles corners without widening the player's existing capsule. */
export function createPlayerClearance(world: World) {
  // Stay below the dynamic solver's normal contact skin; a larger query offset starts inside
  // the floor and can incorrectly cancel tangential sliding along a nearby wall.
  const controller = world.createCharacterController(.001);
  controller.setSlideEnabled(true);
  controller.disableAutostep(); controller.disableSnapToGround();
  controller.setApplyImpulsesToDynamicBodies(false);
  controller.setMaxSlopeClimbAngle(25 * Math.PI / 180);
  controller.setMinSlopeSlideAngle(26 * Math.PI / 180);
  clearanceQueries.set(controller, { world, candidates: [], blocked: new Set() });
  return controller;
}

export function sweptPlayerVelocity(controller: ReturnType<typeof createPlayerClearance>, body: RigidBody,
  velocity: Vector, dt: number, excludeSensors: number) {
  if (dt <= 0 || Math.hypot(velocity.x, velocity.z) < .001) return velocity;
  const query = clearanceQueries.get(controller);
  if (!query) throw new Error('Player clearance must be created with createPlayerClearance');
  const { world, candidates, blocked } = query;
  candidates.length = 0; blocked.clear();
  const p = body.translation(), reach = Math.hypot(velocity.x, velocity.y, velocity.z) * dt + .02;
  // Collect only the local swept envelope. A slide cannot travel farther than the requested motion.
  // WASM query callbacks must not call back into its borrowed body set (e.g. owner.isDynamic()).
  world.collidersWithAabbIntersectingAabb(p,
    { x: PLAYER_RADIUS + reach, y: PLAYER_HALF_HEIGHT + PLAYER_RADIUS + reach, z: PLAYER_RADIUS + reach },
    c => { candidates.push(c); return true; });
  for (const c of candidates) {
    const owner = c.parent();
    if (owner?.isDynamic() && !(owner.userData as { vehicle?: string } | undefined)?.vehicle) blocked.add(c.handle);
  }
  controller.computeColliderMovement(body.collider(0), { x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt },
    excludeSensors, undefined, c => !blocked.has(c.handle));
  let wall = false, separating = true;
  const allowed = controller.computedMovement();
  let x = allowed.x / dt, z = allowed.z / dt;
  for (let i = 0; i < controller.numComputedCollisions(); i++) {
    const hit = controller.computedCollision(i);
    if (!hit || Math.abs(hit.normal1.y) >= WALKABLE_NORMAL_Y) continue;
    const raw = hit.normal1, at = hit.witness1;
    // Capsule/triangle edge contacts can tilt the query normal. Recover the face
    // normal before deciding whether the current support is a walkable slope.
    const surface = hit.collider?.castRayAndGetNormal(new Ray(
      { x: at.x + raw.x * .02, y: at.y + raw.y * .02, z: at.z + raw.z * .02 },
      { x: -raw.x, y: -raw.y, z: -raw.z }), .04, false);
    const n = surface?.normal ?? raw;
    if (Math.abs(n.y) >= WALKABLE_NORMAL_Y) continue;
    // A capsule meeting a low platform lip can report its vertical side even
    // though the adjacent top continues the walking surface. Confirm that top
    // geometrically, within 10 cm of the sole; this never exempts a steep ramp
    // or a wall whose walkable top is above the ordinary seam/curb range.
    const sole = p.y - PLAYER_HALF_HEIGHT - PLAYER_RADIUS;
    if (raw.y > .65 && at.y <= sole + .1) {
      const top = hit.collider?.castRayAndGetNormal(new Ray(
        { x: at.x - raw.x * .02, y: at.y + .025, z: at.z - raw.z * .02 },
        { x: 0, y: -1, z: 0 }), .05, false);
      if (top && top.normal.y >= WALKABLE_NORMAL_Y) continue;
    }
    wall = true;
    if (velocity.x * raw.x + velocity.z * raw.z <= 0 || velocity.x * n.x + velocity.z * n.z <= 0) separating = false;
    const horizontal = n.x * n.x + n.z * n.z;
    const into = x * n.x + z * n.z;
    // A dynamic capsule can turn inward input into upward solver impulses even
    // when the character query rejects that slope. Remove only inward horizontal
    // motion; retain along-face movement and the body's unmodified fall/jump.
    if (into < 0 && horizontal > 1e-6) { x -= into * n.x / horizontal; z -= into * n.z / horizontal; }
  }
  // Ground-only results are deliberately ignored: preserve the existing slope/support servo and
  // physical launch/landing behavior rather than turning the player into a kinematic controller.
  if (!wall) return velocity;
  // The slide solver can return zero repeatedly at the edge of a resting trimesh,
  // even for motion directed out of that contact. Sweep the complete capsule over
  // this step to check for a second obstruction, including another face of the same mesh.
  if (separating && Math.hypot(x,z) < .001 && Math.hypot(velocity.x,velocity.z)*dt <= .012) {
    const capsule = body.collider(0), start = capsule.translation();
    // Match the standing-route query's 12 mm floor skin allowance. The dynamic
    // capsule still solves its normal contacts at its true height on this step.
    const hit = world.castShape({x:start.x,y:start.y+.012,z:start.z}, capsule.rotation(),
      {x:velocity.x*dt,y:0,z:velocity.z*dt},capsule.shape,0,1,false,
      excludeSensors,undefined,undefined,body,c=>!blocked.has(c.handle));
    if (!hit) return velocity;
  }
  return { x, y: velocity.y, z };
}

/** Validate the entire standing-capsule route, including head clearance, for door step-outs. */
export function playerRouteClear(world: World, rapier: Pick<typeof Rapier, 'Capsule'>, body: RigidBody,
  from: Vector, to: Vector, excludedBody?: RigidBody) {
  // The resting dynamic body can sit 1–2 mm inside the floor's contact skin. Lift only the
  // query by 12 mm so horizontal door transfer does not hit that floor at t=0. Full capsule
  // height/width and every wall/ceiling remain checked, including mixed terrain trimeshes.
  // A resting capsule may also touch the car: ignore initial penetration only when separating,
  // so it can step away before rounding a corner, while approaches into the body still block.
  return !world.castShape({ ...from, y: from.y + .012 }, { x: 0, y: 0, z: 0, w: 1 },
    { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z },
    new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), .004, 1, false,
    undefined, undefined, undefined, body,
    c => !c.isSensor() && (!excludedBody || c.parent()?.handle !== excludedBody.handle));
}
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
    // Only stationary objects may trigger a vault, but every solid can obstruct its envelope.
    const hit = world.castShape(a, body.rotation(), { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      shape, 0, 1, true, undefined, undefined, undefined, body, c => !c.isSensor());
    if (hit) return null;
  }
  return { vx, vz, vy, duration, height, obstacle: obstacle.collider.handle };
}
