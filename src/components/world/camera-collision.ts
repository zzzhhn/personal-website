import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';

type Point = { x: number; y: number; z: number };
/** Collision may legitimately compress an orbit to its pivot. A zero lookAt vector
 * loses the requested yaw/pitch; keep looking inward along the orbit in that case.
 * This changes only orientation, never the collision-constrained camera position. */
export function cameraLookTarget(position: Point, target: Point, orbit: readonly [number, number, number]): Point {
  if (Math.hypot(target.x-position.x,target.y-position.y,target.z-position.z) >= .001) return target;
  return { x: position.x-orbit[0], y: position.y-orbit[1], z: position.z-orbit[2] };
}
/** A sphere enclosing every near-plane corner, including wide windows and first-person FOV. */
export function cameraCollisionRadius(near: number, fov: number, aspect: number, minimum = .22) {
  const h = near * Math.tan(fov * Math.PI / 360);
  return Math.max(minimum, Math.hypot(near, h, h * aspect) + .025);
}
/** Draw-only comfort envelope: a legal wall sweep can still leave the large G24
 * helmet filling the view. Hide before reaching that distance, not just inside it. */
export function cameraOverlapsGuide(camera: Point, foot: Point, nearRadius: number, alreadyHidden = false) {
  const y = Math.max(foot.y + .2, Math.min(foot.y + 1.425, camera.y));
  return Math.hypot(camera.x-foot.x,camera.y-y,camera.z-foot.z) < .85+nearRadius+(alreadyHidden?.18:0);
}

/** One safety path for orbit, eye, pivot smoothing and camera shake. Never lift over a hit. */
export function sweepCamera(world: World, rapier: Pick<typeof Rapier, 'Ball'>,
  from: Point, to: Point, radius: number, exclude: RigidBody | undefined, solid: (collider: Collider) => boolean) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = Math.hypot(dx, dy, dz);
  if (length < 1e-5) return { position: { ...from }, distance: 0, hit: null as number | null };
  const hit = world.castShape(from, { x: 0, y: 0, z: 0, w: 1 },
    { x: dx / length, y: dy / length, z: dz / length }, new rapier.Ball(radius), 0, length, true,
    undefined, undefined, undefined, exclude, solid);
  const distance = hit ? Math.max(0, hit.time_of_impact - .05) : length, k = distance / length;
  return { position: { x: from.x + dx * k, y: from.y + dy * k, z: from.z + dz * k }, distance,
    hit: hit ? hit.time_of_impact : null };
}

/** A thin post can compress an otherwise open orbit into the guide's helmet.
 * Try a small shoulder translation, never an automatic change to input yaw/pitch.
 * Both the lateral pivot and its orbit must be reachable; broad walls/low roofs
 * therefore retain the ordinary compressed camera instead of being bypassed. */
export function cameraShoulderPivot(world: World, rapier: Pick<typeof Rapier, 'Ball'>,
  pivot: Point, orbit: readonly [number, number, number], distance: number, radius: number,
  exclude: RigidBody | undefined, solid: (collider: Collider) => boolean, previous: number, delta: number) {
  const cast = (from: Point, to: Point) => sweepCamera(world, rapier, from, to, radius, exclude, solid);
  const end = (from: Point, length=distance) => ({x:from.x+orbit[0]*length,y:from.y+orbit[1]*length,z:from.z+orbit[2]*length});
  const shoulderOrbit = (from: Point) => {
    const result=cast(from,end(from));
    // A safe camera endpoint alone can still put the post across the character.
    // Keep a closer third-person view until the original centred view is clear.
    if(result.distance>2&&cast(pivot,result.position).hit!==null)
      return {...result,distance:2,position:end(from,2)};
    return result;
  };
  const centre = cast(pivot, end(pivot)), horizontal = Math.hypot(orbit[0],orbit[2]);
  const side = horizontal > .01 ? {x:orbit[2]/horizontal,z:-orbit[0]/horizontal} : {x:1,z:0};
  let desired = 0;
  if (centre.distance < (Math.abs(previous) > .01 ? 3 : 1.5)) {
    // Check the current shoulder first so small differences do not alternate sides.
    const signs = previous < 0 ? [-1,1] : [1,-1];
    // Wider entrance piers need more than the narrow shed post's 1.35 m.
    // Still require continuous lateral access and an unobstructed body sightline.
    for (const reach of [1.35, 2.1]) for (const sign of signs) {
      if (desired !== 0) break;
      const offset = sign * reach;
      const lateral = cast(pivot, {x:pivot.x+side.x*offset,y:pivot.y,z:pivot.z+side.z*offset});
      if (lateral.distance < reach-.01) continue;
      const candidate = shoulderOrbit(lateral.position);
      if (candidate.distance >= 2 && candidate.distance > centre.distance+1
        &&cast(pivot,candidate.position).hit===null) { desired=offset; break; }
    }
  }
  const maxStep = Math.max(0,Math.min(delta,.05))*3;
  const offset = previous+Math.max(-maxStep,Math.min(maxStep,desired-previous));
  if (Math.abs(offset) < 1e-6) return {position:pivot,offset:0,orbit:centre};
  const lateral = cast(pivot,{x:pivot.x+side.x*offset,y:pivot.y,z:pivot.z+side.z*offset});
  const safeOffset = Math.sign(offset)*Math.min(Math.abs(offset),lateral.distance);
  return {position:lateral.position,offset:safeOffset,orbit:shoulderOrbit(lateral.position)};
}
