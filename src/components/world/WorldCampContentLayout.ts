import { CAMP_CENTER } from './layout';
import type { Vec3 } from './types';

/**
 * Camp-content placement. Mirrors WorldEnvironment.createLayout() (camp ring pads, benches, exit
 * lamps) and WorldCamp's placement rules without changing either file: pad i sits at angle i*45 deg
 * (+Z south) on the r = 15 ring, its top is PAD_TOP, and an asset whose front is GLB +X faces the
 * fire with yaw = PI - angle. QA (__worldCampContent.check) compares these numbers with the live C06
 * / C07 / C09 / C10 colliders so a layout change cannot drift silently.
 */
export const CAMP_TOP = CAMP_CENTER[1];
export const PAD_TOP = 4.9;
const RING = 15, BENCH_RING = 6;
export const padAngle = (i: number) => i * Math.PI / 4;
export const padCentre = (i: number): Vec3 => [CAMP_CENTER[0] + Math.cos(padAngle(i)) * RING, PAD_TOP, CAMP_CENTER[2] + Math.sin(padAngle(i)) * RING];
export const yawToFire = (i: number) => Math.PI - padAngle(i);
/** World offset of a local (x, z) point under yaw (same convention as WorldCamp.rotateY / three.js). */
export const rotateY = (x: number, z: number, yaw: number): [number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
/** Point `d` metres from pad i's centre toward the fire. */
export const towardFire = (i: number, d: number, y = PAD_TOP): Vec3 => { const c = padCentre(i), a = padAngle(i); return [c[0] - Math.cos(a) * d, y, c[2] - Math.sin(a) * d]; };

/** WorldCamp PAD_ORDER (unchanged): ring index 3 desk C07 + books C08, 5 trophy shelf C09, 4 flags C10. */
export const PAD = { desk: 3, trophy: 5, flags: 4 } as const;
/**
 * C11-C15 pad reassignment (DESIGN.md). The north pad (6) is in front of C03's real door, so it gets
 * the lowest object (dumbbells, east half of the pad); the tall tool wall goes to the north-east pad
 * (7), off the default camera's sight line to the big tent and where both Art Lock camp references
 * draw it.
 */
export const CONTENT_PAD = { C13: 6, C11: 7, C15: 0, C14: 1, C12: 2 } as const;

export interface Place { position: Vec3; yaw: number }
export const onPad = (i: number): Place => ({ position: padCentre(i), yaw: yawToFire(i) });
/** Pad-local (radial x toward the rim, tangential z) offset -> world. */
export const padOffset = (i: number, x: number, z: number, y = PAD_TOP): Vec3 => {
  const c = padCentre(i), a = padAngle(i);
  return [c[0] + Math.cos(a) * x - Math.sin(a) * z, y, c[2] + Math.sin(a) * x + Math.cos(a) * z];
};

/** C06 benches: same formula as createLayout (centre at r 6, long axis tangential). The GLB is
 * placed by WorldCamp with yaw = rotation - PI/2, so its long axis (GLB +Z) is the tangent. */
export const benches = () => Array.from({ length: 4 }, (_, i) => {
  const angle = Math.PI / 4 + i * Math.PI / 2;
  const centre: Vec3 = [CAMP_CENTER[0] + Math.cos(angle) * BENCH_RING, CAMP_TOP, CAMP_CENTER[2] + Math.sin(angle) * BENCH_RING];
  return { centre, yaw: -angle - Math.PI, tangent: [Math.sin(angle), -Math.cos(angle)] as [number, number] };
});

/** Exit lamp posts (createLayout 'camp-lamps': post blocks at x -30, z 31 / 37, bottom at 4.8). */
export const EXIT_POSTS: Vec3[] = [[-30, 4.8, 31], [-30, 4.8, 37]];

/** C08 book stack on the desk, exactly as WorldCamp computes it. */
export const bookStack = () => {
  const desk = onPad(PAD.desk), o = rotateY(-.34, .5, desk.yaw);
  return { position: [desk.position[0] + o[0], PAD_TOP + .85, desk.position[2] + o[1]] as Vec3, yaw: desk.yaw + .16 };
};

/** WorldActors seat/heading convention: yaw = atan2(-dz, dx) faces direction (dx, dz). */
export const yawFacing = (from: Vec3, to: Vec3) => Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
