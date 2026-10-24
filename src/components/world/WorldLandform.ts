import { BufferGeometry, ClampToEdgeWrapping, DataTexture, Float32BufferAttribute, LinearFilter, RGBAFormat, Uint32BufferAttribute, UnsignedByteType } from 'three';
import { BUILDINGS, CAMP_CENTER, FOUNDATIONS, GROUND_Y, ISLAND_OUTLINE, ROAD_POINTS, WATER_Y } from './layout';
import { LAYOUT_V4, keepOutV4, nearRidgeV4, ridgeHeightV4, TERRAIN_GRID_V4, townFactorV4 } from './layout-v4';
import { groundRoadDistance, pavingGround, trailDistance } from './WorldTerrainPaving';
import { TRAIL_HALF } from './layout-v4';

/** quality-v3 landform (spec 2026-10-22 §3, §10.1/10.2). One deterministic height function
 * h(x, z) describes the whole island: flat town top (y=1), irregular sand beaches, the camp
 * plateau (y=4.8) with <=25 deg walkable slopes or steep rock terraces, an embankment under the
 * camp ramp and a stone seawall along the town. The renderer and Rapier receive the very same
 * triangles; triangles steeper than 25 deg go to a `solid` trimesh, the rest to `surface`.
 * The old island polygon and old camp cylinder stay fully supported, so every existing
 * object keeps its coordinates. */

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const deg = (d: number) => d * Math.PI / 180;
/** Integer hash -> [0, 1]. */
function hash2(ix: number, iz: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, z: number, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return mix(mix(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), ux), mix(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), ux), uz);
}
/** C1 ease of a crease starting at u=0: slope 0 -> 1 over F metres (u -> u^2/2F, then u - F/2). */
const ease = (u: number, F: number) => u <= 0 ? 0 : u < F ? u * u / (2 * F) : u - F / 2;
/** Polynomial smooth max (rounds the junction of two surfaces over a k-metre height band). */
const smax = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * .25; };
const periodic = (s: number, L: number, terms: [number, number, number][]) => terms.reduce((v, [amp, k, phase]) => v + amp * Math.sin(TAU * k * s / L + phase), 0);
const angleIn = (a: number, from: number, to: number) => { const x = ((a - deg(from)) % TAU + TAU) % TAU; return x <= ((deg(to) - deg(from)) % TAU + TAU) % TAU; };
/** 1 inside [from, to] (degrees, wrapping), easing to 0 over `soft` degrees outside. */
function sector(a: number, from: number, to: number, soft = 4) {
  if (angleIn(a, from, to)) return 1;
  const d = Math.min(Math.abs(Math.atan2(Math.sin(a - deg(from)), Math.cos(a - deg(from)))), Math.abs(Math.atan2(Math.sin(a - deg(to)), Math.cos(a - deg(to)))));
  return 1 - smoothstep(0, deg(soft), d);
}

export const WALKABLE_DEG = 25;
export const WALKABLE_NORMAL_Y = Math.cos(deg(WALKABLE_DEG));
export const CAMP_TOP = CAMP_CENTER[1];
export const CAMP_BASE_RADIUS = 24;

/* ------------------------------------------------------------------ coast frame */

const P = ISLAND_OUTLINE, NP = P.length;
const CENTROID = [P.reduce((a, p) => a + p[0], 0) / NP, P.reduce((a, p) => a + p[1], 0) / NP];
const EDGES = P.map((a, i) => {
  const b = P[(i + 1) % NP], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  let nx = dz, nz = -dx;
  if (nx * ((a[0] + b[0]) / 2 - CENTROID[0]) + nz * ((a[1] + b[1]) / 2 - CENTROID[1]) < 0) { nx = -nx; nz = -nz; }
  return { a, b, len, dx, dz, nx, nz, s0: 0 };
});
EDGES.reduce((s, e) => { e.s0 = s; return s + e.len; }, 0);
export const OUTLINE_PERIMETER = EDGES.reduce((s, e) => s + e.len, 0);

/** Signed distance to the original (convex) island polygon (+ outside) and arclength s of
 * the nearest boundary point, used to drive along-shore variation. */
export function coastFrame(x: number, z: number) {
  let best = Infinity, s = 0, inside = true, maxPlane = -Infinity;
  for (const e of EDGES) {
    const t = clamp((x - e.a[0]) * e.dx + (z - e.a[1]) * e.dz, 0, e.len);
    const qx = e.a[0] + e.dx * t, qz = e.a[1] + e.dz * t, dist = Math.hypot(x - qx, z - qz);
    const plane = (x - e.a[0]) * e.nx + (z - e.a[1]) * e.nz;
    if (plane > 0) inside = false;
    maxPlane = Math.max(maxPlane, plane);
    if (dist < best) { best = dist; s = e.s0 + t; }
  }
  return { d: inside ? maxPlane : best, s };
}
const L = OUTLINE_PERIMETER;
/** Top-edge push beyond the old outline (0.3-3.4 m), beach width 5-12 m, shelf 12-18 m. */
const window1 = (s: number, a: number, b: number, soft: number) => smoothstep(a - soft, a, s) * (1 - smoothstep(b, b + soft, s));
export const topPush = (s: number) => clamp(1.6 + periodic(s, L, [[1.1, 7, .4], [.5, 17, 2.2], [.18, 37, 4.1]]), .3, 3.4)
  // The existing coastal parking bay (x 16.5-23.5, z 8.5-15.5) overhangs the old outline by 2.9 m.
  + 2.6 * window1(s, 206, 224, 5);
export const beachWidth = (s: number) => clamp(8.5 + periodic(s, L, [[3.4, 8, 1.3], [1.1, 19, .2]]), 5, 12);
const shelfLength = (s: number) => clamp(15 + periodic(s, L, [[3, 5, 2.7]]), 12, 18);
/** East town coast: road promenade and bridge stand on a stone seawall, not on sand. */
export const townFactor = LAYOUT_V4 ? townFactorV4 : (x: number, z: number) => smoothstep(9, 15, x) * smoothstep(-58, -50, z) * (1 - smoothstep(14, 22, z));

/** Shore profile below the top (y=1) as a function of distance u from the top edge. */
function shoreProfile(u: number, w: number, shelf: number) {
  if (u <= w) { const t = ease(u, 1.4) / w; return GROUND_Y - (GROUND_Y - WATER_Y) * (.75 * t + .25 * t * t); }
  const tw = ease(w, 1.4) / w, yw = GROUND_Y - (GROUND_Y - WATER_Y) * (.75 * tw + .25 * tw * tw);
  if (u <= w + shelf) return mix(yw, -2.5, (u - w) / shelf);
  return Math.max(-9, -2.5 - (u - w - shelf) * .7);
}
export const SEAWALL_FOOT = -3.6;
/** Battered stone seawall (about 62 deg) with block-sized facets, part of the height field. */
const SEAWALL_RUN = (GROUND_Y - SEAWALL_FOOT) / Math.tan(deg(62));
function seawallHeight(x: number, u: number, z: number) {
  if (u <= 0) return GROUND_Y;
  if (u >= SEAWALL_RUN) return SEAWALL_FOOT - Math.min(1.5, (u - SEAWALL_RUN) * .05);
  const block = (valueNoise(x / .9, z / .9, 21) - .5) * .22 * Math.sin(Math.PI * u / SEAWALL_RUN);
  return GROUND_Y - (GROUND_Y - SEAWALL_FOOT) * u / SEAWALL_RUN + block;
}
function coastHeight(x: number, z: number) {
  const { d, s } = coastFrame(x, z), u = d - topPush(s);
  if (u <= 0) return GROUND_Y;
  const town = townFactor(x, z);
  // Ends of the seawall blend into sand; rock groups mask the joint.
  return mix(shoreProfile(u, beachWidth(s), shelfLength(s)), seawallHeight(x, u, z), smoothstep(.3, .7, town));
}

/* ------------------------------------------------------------------ camp plateau */

/** Plateau radius by angle atan2(z - cz, x - cx). Never below the old 24 m cylinder. Held at
 * 24 m over the exit road and next to the greybox tree at (-30, 52); bumps are limited where
 * town objects stand close to the hill foot. */
export function campRadius(theta: number) {
  const a = ((theta % TAU) + TAU) % TAU;
  const bump = Math.max(0, .95 + .85 * Math.sin(3 * a + .7) + .55 * Math.sin(5 * a + 2.1) + .3 * Math.sin(11 * a + 4));
  const big = sector(a, 74, 226, 6), small = Math.max(sector(a, 14, 40, 3), sector(a, 230, 332, 3));
  return CAMP_BASE_RADIUS + Math.min(2.4, bump) * big + Math.min(1, bump) * small * (1 - big);
}
export const CAMP_RADIUS_TABLE = Array.from({ length: 72 }, (_, i) => campRadius(i / 72 * TAU));
/** tan of the plateau flank: 19 deg grass slopes, 22 deg near town objects, two-step 58 deg rock
 * terraces (never walkable) where the old layout leaves no room for a slope, and an 84 deg
 * face beside the greybox tree at (-30, 52). */
function campFlankTan(theta: number) {
  const a = ((theta % TAU) + TAU) % TAU;
  const terraces = [[14, 40, 58], [57, 66, 84], [289, 332, 58]] as const;
  let tan = Math.tan(deg(19));
  tan = mix(tan, Math.tan(deg(22)), sector(a, 336, 348, 3));
  for (const [from, to, angle] of terraces) tan = mix(tan, Math.tan(deg(angle)), sector(a, from, to, 4));
  return tan;
}
/** Two-step rock terrace: 58 deg face, 1.1-1.6 m ledge (~10 deg), 58 deg face, then dune. */
const ROCK_TAN = Math.tan(deg(58));
function terraceProfile(u: number, a: number) {
  const ledgeY = 2.75 + .25 * Math.sin(5 * a + 1.3), ledge = 1.35 + .25 * Math.sin(7 * a), r1 = (CAMP_TOP - ledgeY) / ROCK_TAN;
  if (u <= r1) return CAMP_TOP - u * ROCK_TAN;
  const y1 = ledgeY - .2;
  if (u <= r1 + ledge) return ledgeY - .2 * (u - r1) / ledge;
  const r2 = (y1 - GROUND_Y) / ROCK_TAN, v = u - r1 - ledge;
  return v <= r2 ? y1 - v * ROCK_TAN : shoreProfile(v - r2, flankBeach(a), flankShelf(a));
}
/** Crease offsets u (from the plateau rim) of the rock profiles at angle a, or [] on grass
 * slopes. The mesh snaps lattice nodes onto these so cliff edges are continuous vertex rows. */
export function campCreases(a: number): number[] {
  const rock = sector(a, 14, 40, 4) + sector(a, 289, 332, 4), tree = sector(a, 57, 66, 4);
  if (rock > .5) {
    const ledgeY = 2.75 + .25 * Math.sin(5 * a + 1.3), ledge = 1.35 + .25 * Math.sin(7 * a), r1 = (CAMP_TOP - ledgeY) / ROCK_TAN;
    const r2 = (ledgeY - .2 - GROUND_Y) / ROCK_TAN;
    return [.15, r1 + .15, r1 + ledge + .15, r1 + ledge + r2 + .15];
  }
  if (tree > .5) { const tan = campFlankTan(a); return [.15, (CAMP_TOP - GROUND_Y) / tan + .15]; }
  return [];
}
const flankBeach = (a: number) => 8 + 1.8 * Math.sin(3 * a + 1) + .7 * Math.sin(7 * a + 2.3);
const flankShelf = (a: number) => 14 + 2.5 * Math.sin(2 * a + .4);
export function campHillHeight(x: number, z: number) {
  const dx = x - CAMP_CENTER[0], dz = z - CAMP_CENTER[2], r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const R = campRadius(a);
  if (r <= R) return CAMP_TOP;
  // Rounded rim (F = 1.6 m on grass slopes, 0.3 m on rock terraces) keeps the plateau exactly
  // flat for r <= R; below the slope the dune continues into the beach profile.
  const u = r - R, tan = campFlankTan(a), F = tan > 1 ? .3 : 1.6, ue = ease(u, F), run = (CAMP_TOP - GROUND_Y) / tan;
  const slope = ue <= run ? CAMP_TOP - ue * tan : shoreProfile(ue - run, flankBeach(a), flankShelf(a));
  const rock = sector(a, 14, 40, 4) + sector(a, 289, 332, 4);
  return rock > 0 ? mix(slope, terraceProfile(ue, a), Math.min(1, rock)) : slope;
}

/** Road corridor: the camp exit (seg 0) and ramp (seg 1) stand on an embankment 10 cm under
 * the road top with 84 deg retaining sides, so no road slab overhangs the void; on every road
 * segment the terrain is also capped 10 cm under the road top, so nothing pokes through. */
/** Embankment top sits 10 cm under the road top (hidden by the 18 cm slab); the cap near roads
 * only needs 3.5 cm, so the flat plateau (4.80 under a 4.84 road) is left untouched. */
const ROAD_HALF = 5.4, ROAD_CLEAR = .1, CAP_CLEAR = .035, RETAIN = Math.tan(deg(64));
function roadFrame(x: number, z: number, i: number) {
  const a = ROAD_POINTS[i], b = ROAD_POINTS[i + 1], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const dx = (b[0] - a[0]) / len, dz = (b[2] - a[2]) / len, along = (x - a[0]) * dx + (z - a[2]) * dz;
  const t = clamp(along / len, 0, 1);
  return { lateral: Math.abs((x - a[0]) * dz - (z - a[2]) * dx), beyond: Math.max(0, -along, along - len), y: mix(a[1], b[1], t),
    distance: Math.hypot(x - a[0] - (b[0] - a[0]) * t, z - a[2] - (b[2] - a[2]) * t) };
}
/** Embankment under the camp exit + ramp polyline (segments 0-1): retaining sides by the
 * clamped distance to each segment, so ends round off instead of extending along the line. */
const CONTACT = { minX: -16.6, maxX: -3.4, minZ: 37.9, maxZ: 48.1 };
function rampHeight(x: number, z: number) {
  // The contact foundation (top 1.15) already sits beside the ramp: the embankment drops to
  // 1.0 inside its footprint with the same retaining slope, never a vertical cut.
  const ox = Math.max(CONTACT.minX - x, 0, x - CONTACT.maxX), oz = Math.max(CONTACT.minZ - z, 0, z - CONTACT.maxZ);
  // Near-vertical (84 deg) retaining wall on the foundation side: the pre-existing layout already
  // puts the foundation's north-west corner under the ramp slab in plan.
  const foundationCap = GROUND_Y + Math.hypot(ox, oz) * Math.tan(deg(84));
  let best = -Infinity;
  for (const i of [0, 1]) {
    const f = roadFrame(x, z, i);
    best = Math.max(best, f.y - ROAD_CLEAR - Math.max(0, f.distance - ROAD_HALF) * RETAIN);
  }
  // Directly under the road strip the embankment always carries the slab (its side slope may
  // cover the foundation's north-west corner by up to ~1.7 m).
  // "Under" = inside a slab box in plan (length + 0.28 m, 10.7 m wide), not the rounded ends.
  const under = [0, 1].some(i => { const f = roadFrame(x, z, i); return f.beyond <= .14 && f.lateral <= 5.35; });
  return under ? best : Math.min(best, foundationCap);
}
/** Snap target for a lattice node near a ramp shoulder or embankment foot (straight creases). */
function rampCrease(x: number, z: number): [number, number] | null {
  for (const i of [0, 1]) {
    const a = ROAD_POINTS[i], b = ROAD_POINTS[i + 1], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const dx = (b[0] - a[0]) / len, dz = (b[2] - a[2]) / len, along = (x - a[0]) * dx + (z - a[2]) * dz;
    if (along < .5 || along > len - .5) continue;
    const side = (x - a[0]) * dz - (z - a[2]) * dx, lateral = Math.abs(side), sign = Math.sign(side) || 1;
    const y = mix(a[1], b[1], along / len) - ROAD_CLEAR;
    const flat = campHillHeight(x, z) < GROUND_Y + .05 && coastHeight(x, z) >= GROUND_Y - .01;
    const creases = flat && y > GROUND_Y + .3 ? [ROAD_HALF, ROAD_HALF + (y - GROUND_Y) / RETAIN] : [];
    for (const c of creases) if (Math.abs(lateral - c) < .26) {
      const m = (c - lateral) * sign;
      return [x + dz * m, z - dx * m];
    }
  }
  return null;
}
/** Highest terrain allowed at (x, z) by the road corridors (Infinity away from roads). */
function roadCap(x: number, z: number) {
  let cap = Infinity;
  // Flat for 0.9 m beyond the slab edge (one jittered lattice cell, so no rendered triangle
  // that contains a road point can reach above the road), then a 64 deg cut face.
  // Only the nearest segment caps (the high ramp must not be cut by the low road beside it).
  // Each segment caps its own slab band; at a joint the two adjacent bands overlap and the
  // lower one wins. The nearest segment also limits the cut face beyond its band.
  let near = { distance: Infinity, y: 0 }, ni = 0;
  const last = LAYOUT_V4 ? 1 : 6;
  for (let i = 0; i <= last; i++) { const f = roadFrame(x, z, i); if (f.distance < near.distance) { near = f; ni = i; } }
  for (let i = Math.max(0, ni - 1); i <= Math.min(last, ni + 1); i++) {
    const f = roadFrame(x, z, i);
    // Neighbours only where the slab heights meet (the joint), not along the angled ramp.
    if (f.distance <= ROAD_HALF + .9 && Math.abs(f.y - near.y) < .3) cap = Math.min(cap, f.y - CAP_CLEAR);
  }
  const over = Math.max(0, near.distance - ROAD_HALF - .9);
  if (cap === Infinity && over < 6) cap = near.y - CAP_CLEAR + over * RETAIN;
  return cap;
}

/** Existing ground-level objects (old layout, y=1 bases) keep their coordinates: inside their
 * footprint (+0.2 m) the terrain never rises above y=1; outside it may rise with an 84 deg
 * retaining face. Mirrors createLayout() in WorldEnvironment (foundations, inland blocks,
 * ground greybox trees, buildings with forecourts). */
const KEEP_OUT: [number, number, number, number][] = LAYOUT_V4 ? [
  ...FOUNDATIONS.map(({ position: [x, , z], size: [w, , d] }) => [x - w / 2, z - d / 2, x + w / 2, z + d / 2] as [number, number, number, number]),
  ...keepOutV4(),
  ...BUILDINGS.map(({ position: [x, , z], size: [w, , d] }) => [x - w / 2, z - d / 2, x + w / 2 + 5.4, z + d / 2 + .5] as [number, number, number, number]),
] : [
  ...FOUNDATIONS.map(({ position: [x, , z], size: [w, , d] }) => [x - w / 2, z - d / 2, x + w / 2, z + d / 2] as [number, number, number, number]),
  ...[[-18, 8], [-13, -8], [-12, -24], [-4, -45]].map(([x, z]) => [x - 4, z - 3.5, x + 4, z + 3.5] as [number, number, number, number]),
  ...[[-61, -4], [-51, -26], [-36, -32], [-28, -8], [-26, 7], [-30, 52], [2, 40], [-44, -43]].map(([x, z]) => [x - .6, z - .6, x + .6, z + .6] as [number, number, number, number]),
  ...BUILDINGS.map(({ position: [x, , z], size: [w, , d] }) => [x - w / 2, z - d / 2, x + w / 2 + 5.4, z + d / 2 + .5] as [number, number, number, number]),
];
const KEEP_TAN = Math.tan(deg(84));
function keepOutCap(x: number, z: number) {
  let cap = Infinity;
  for (const [x0, z0, x1, z1] of KEEP_OUT) {
    const ox = Math.max(x0 - .2 - x, 0, x - x1 - .2), oz = Math.max(z0 - .2 - z, 0, z - z1 - .2);
    if (ox < 1 && oz < 1) cap = Math.min(cap, GROUND_Y + Math.hypot(ox, oz) * KEEP_TAN);
  }
  return cap;
}
/** Inside a road slab box in plan (segments 0-6). */
function underSlab(x: number, z: number) {
  for (let i = 0; i < (LAYOUT_V4 ? 2 : 7); i++) { const f = roadFrame(x, z, i); if (f.beyond <= .14 && f.lateral <= 5.35) return true; }
  return false;
}

/* ------------------------------------------------------------------ height */

const TENTS = [-51, -42, -33].map(x => [x - 3.6, 12.5 - 3, x + 3.6, 12.5 + 3]);
function roadDistance(x: number, z: number) {
  if (LAYOUT_V4) return groundRoadDistance(x, z);
  let best = Infinity;
  for (let i = 0; i < ROAD_POINTS.length - 1; i++) {
    const a = ROAD_POINTS[i], b = ROAD_POINTS[i + 1], dx = b[0] - a[0], dz = b[2] - a[2];
    const t = clamp(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t));
  }
  return best;
}
/** Non-negative 2-6 cm relief: objects placed at the old ground heights can only be slightly
 * embedded, never float. Zero under roads, tents, the town and wherever this mesh meets
 * coarse flat blocks, so the flat interior joins without cracks. */
function reliefAmplitude(x: number, z: number, base: number, coast: number, camp: number) {
  if (townFactor(x, z) > .3 || roadDistance(x, z) < 5.6) return 0;
  if (TENTS.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) return 0;
  const r = Math.hypot(x - CAMP_CENTER[0], z - CAMP_CENTER[2]);
  if (camp >= CAMP_TOP && r < 30) return r < 8 ? .02 : r < 17 ? .03 : .05;
  const { d, s } = coastFrame(x, z), inward = topPush(s) - d;
  const coastAmp = coast < GROUND_Y ? .03 : .03 * smoothstep(1.5, .5, inward);
  const hillAmp = camp > coast ? .045 * smoothstep(GROUND_Y, GROUND_Y + .5, camp) : 0;
  return base === coast && camp <= GROUND_Y ? coastAmp : Math.max(hillAmp, coast >= camp ? coastAmp : 0);
}
export function terrainBaseHeight(x: number, z: number) {
  const coast = coastHeight(x, z), camp = campHillHeight(x, z);
  const ground = campFlankTan(Math.atan2(z - CAMP_CENTER[2], x - CAMP_CENTER[0])) > 1 ? Math.max(coast, camp) : smax(coast, camp, .4);
  let h = Math.min(roadCap(x, z), Math.max(ground, rampHeight(x, z), LAYOUT_V4 ? ridgeHeightV4(x, z) ?? -Infinity : -Infinity));
  if (!underSlab(x, z)) h = Math.min(h, keepOutCap(x, z));
  return LAYOUT_V4 ? pave(h, x, z) : h;
}
export function terrainHeight(x: number, z: number) {
  const coast = coastHeight(x, z), camp = campHillHeight(x, z), cap = roadCap(x, z);
  // Round the hill foot onto flat ground (<= 10 cm rise within ~1 m of the foot, grass slopes
  // only; rock terraces and the road embankment keep a crisp foot).
  const ground = campFlankTan(Math.atan2(z - CAMP_CENTER[2], x - CAMP_CENTER[0])) > 1 ? Math.max(coast, camp) : smax(coast, camp, .4);
  let base = Math.min(cap, Math.max(ground, rampHeight(x, z), LAYOUT_V4 ? ridgeHeightV4(x, z) ?? -Infinity : -Infinity));
  if (!underSlab(x, z)) base = Math.min(base, keepOutCap(x, z));
  if (cap < Infinity) return LAYOUT_V4 ? pave(base, x, z) : base;
  const amp = reliefAmplitude(x, z, base, coast, camp);
  const h = amp ? base + amp * (.6 * valueNoise(x / 2.4, z / 2.4, 3) + .4 * valueNoise(x / 1.05 + 7.3, z / 1.05 - 3.1, 9)) : base;
  return LAYOUT_V4 ? pave(h, x, z) : h;
}
/** v4: ground under / beside the field paving (cap under it, fill under its outer chamfer). */
function pave(h: number, x: number, z: number) {
  const [cap, floor] = pavingGround(x, z);
  return cap === Infinity ? h : Math.max(Math.min(h, cap), Math.min(floor, cap));
}

/* ------------------------------------------------------------------ mesh */

export const CELL = .5;
const BLOCK = 4; // cells per 2 m block
export const GRID = LAYOUT_V4 ? TERRAIN_GRID_V4 : { minX: -120, minZ: -104, nx: 400, nz: 416 }; // lattice cells
const NODES_X = GRID.nx + 1, NODES_Z = GRID.nz + 1;
const nodeX = (i: number) => GRID.minX + i * CELL, nodeZ = (j: number) => GRID.minZ + j * CELL;

export interface Terrain {
  positions: Float32Array; indices: Uint32Array; surface: Uint32Array; solid: Uint32Array;
  /** Per-lattice-node land height (NaN = open water beyond the mesh). */
  nodeHeight: Float32Array;
  /** Per 0.5 m cell: 0 none, 1 diagonal a-d, 2 diagonal b-c; coarse 2 m blocks use 3. */
  cellDiag: Uint8Array;
  /** Vertex index per lattice node (-1 = unused). */
  vertexOf: Int32Array;
  seawall: { start: [number, number]; end: [number, number] };
  stats: { triangles: number; fineBlocks: number; coarseBlocks: number; surfaceTriangles: number; solidTriangles: number; maxWalkableDeg: number; buildMs: number };
}

let terrainCache: Terrain | null = null;
export function buildTerrain(): Terrain {
  if (terrainCache) return terrainCache;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const pos: number[] = [], idx: number[] = [];
  const nodeHeight = new Float32Array(NODES_X * NODES_Z).fill(NaN);
  const vertexOf = new Int32Array(NODES_X * NODES_Z).fill(-1);
  // Pass 1: classify 2 m blocks on the regular lattice; coarse block borders stay unmoved so
  // neighbouring fine cells meet them without cracks.
  const NB = GRID.nx / BLOCK, MB = GRID.nz / BLOCK, kind = new Uint8Array(NB * MB); // 0 skip, 1 coarse, 2 fine, 3 coarse flat top
  const fixed = new Uint8Array(NODES_X * NODES_Z);
  for (let bj = 0; bj < MB; bj++) for (let bi = 0; bi < NB; bi++) {
    const i0 = bi * BLOCK, j0 = bj * BLOCK, cx = nodeX(i0 + 2), cz = nodeZ(j0 + 2);
    const { d, s } = coastFrame(cx, cz);
    const camp = Math.hypot(cx - CAMP_CENTER[0], cz - CAMP_CENTER[2]);
    let k = 2;
    if (d < topPush(s) - 4.5 && camp > 40 && rampHeight(cx, cz) < -30 && !(LAYOUT_V4 && nearRidgeV4(cx, cz))) k = 3;
    else {
      let maxH = -Infinity;
      for (let j = j0; j <= j0 + BLOCK; j++) for (let i = i0; i <= i0 + BLOCK; i++) maxH = Math.max(maxH, terrainHeight(nodeX(i), nodeZ(j)));
      k = maxH <= -8.99 ? 0 : maxH <= -1.3 ? 1 : 2;
    }
    kind[bj * NB + bi] = k;
    if (k === 1 || k === 3) for (let t = 0; t <= BLOCK; t++) for (const [i, j] of [[i0 + t, j0], [i0 + t, j0 + BLOCK], [i0, j0 + t], [i0 + BLOCK, j0 + t]]) fixed[j * NODES_X + i] = 1;
  }
  // Pass 2 (lazy): node position = lattice point, jittered +-0.1 m to break the grid read,
  // then snapped onto a camp rock crease or ramp crease within 0.26 m.
  const nodeXZ = (i: number, j: number): [number, number] => {
    const x = nodeX(i), z = nodeZ(j);
    if (fixed[j * NODES_X + i]) return [x, z];
    const dx = x - CAMP_CENTER[0], dz = z - CAMP_CENTER[2], r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (r > 20 && r < 40) {
      const R = campRadius(a);
      for (const c of campCreases(a)) if (Math.abs(r - R - c) < .26) { const k = (R + c) / r; return [CAMP_CENTER[0] + dx * k, CAMP_CENTER[2] + dz * k]; }
    }
    const ramp = rampCrease(x, z);
    if (ramp) return ramp;
    return [x + (hash2(i, j, 61) - .5) * .2, z + (hash2(i, j, 62) - .5) * .2];
  };
  // Node height is always evaluated at the node's final (jittered/snapped) position.
  const heightAt = (i: number, j: number) => {
    const k = j * NODES_X + i;
    if (Number.isNaN(nodeHeight[k])) { const [x, z] = nodeXZ(i, j); nodeHeight[k] = terrainHeight(x, z); }
    return nodeHeight[k];
  };
  const vertex = (i: number, j: number) => {
    const k = j * NODES_X + i;
    if (vertexOf[k] < 0) { const [x, z] = nodeXZ(i, j); vertexOf[k] = pos.length / 3; pos.push(x, heightAt(i, j), z); }
    return vertexOf[k];
  };
  // Upward winding for a grid quad (x right, z down => counter-clockwise seen from +y).
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  };
  const cellDiag = new Uint8Array(GRID.nx * GRID.nz);
  const coarse = (i0: number, j0: number) => {
    quad(vertex(i0, j0), vertex(i0 + BLOCK, j0), vertex(i0, j0 + BLOCK), vertex(i0 + BLOCK, j0 + BLOCK), false);
    for (let j = j0; j < j0 + BLOCK; j++) cellDiag.fill(3, j * GRID.nx + i0, j * GRID.nx + i0 + BLOCK);
  };
  let fineBlocks = 0, coarseBlocks = 0;
  for (let bj = 0; bj < MB; bj++) for (let bi = 0; bi < NB; bi++) {
    const i0 = bi * BLOCK, j0 = bj * BLOCK, k = kind[bj * NB + bi];
    if (k === 0) continue;
    if (k === 3) for (const [i, j] of [[i0, j0], [i0 + BLOCK, j0], [i0, j0 + BLOCK], [i0 + BLOCK, j0 + BLOCK]]) nodeHeight[j * NODES_X + i] = GROUND_Y;
    if (k !== 2) { coarse(i0, j0); coarseBlocks++; continue; }
    fineBlocks++;
    for (let j = j0; j < j0 + BLOCK; j++) for (let i = i0; i < i0 + BLOCK; i++) {
      // Split along the flatter diagonal so creases follow contours (no sawtooth on steep faces).
      const ad = Math.abs(heightAt(i, j) - heightAt(i + 1, j + 1)), bc = Math.abs(heightAt(i + 1, j) - heightAt(i, j + 1));
      const flip = Math.abs(ad - bc) < .02 ? (i + j) % 2 === 1 : bc < ad;
      cellDiag[j * GRID.nx + i] = flip ? 2 : 1;
      quad(vertex(i, j), vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1), flip);
    }
  }
  // Unfold pass: where crease snapping pulled neighbouring nodes past each other (triangle
  // reversed in plan), return those nodes to their lattice point and re-evaluate height.
  const nodeOfVertex = new Int32Array(pos.length / 3);
  vertexOf.forEach((v, k) => { if (v >= 0) nodeOfVertex[v] = k; });
  for (let pass = 0; pass < 6; pass++) {
    const reset = new Set<number>();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ny = (pos[b + 2] - pos[a + 2]) * (pos[c] - pos[a]) - (pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]);
      if (ny <= 1e-6) for (const v of [idx[t], idx[t + 1], idx[t + 2]]) if (!fixed[nodeOfVertex[v]]) reset.add(v);
    }
    if (!reset.size) break;
    for (const v of reset) {
      const k = nodeOfVertex[v], i = k % NODES_X, j = Math.floor(k / NODES_X), x = nodeX(i), z = nodeZ(j);
      pos[v * 3] = x; pos[v * 3 + 2] = z; pos[v * 3 + 1] = nodeHeight[k] = terrainHeight(x, z);
      fixed[k] = 1;
    }
  }
  const seawall = seawallEnds();
  // Split by facet slope: walk/drive tops are `surface`, steeper faces are `solid`.
  const surface: number[] = [], solid: number[] = [];
  let maxWalkableDeg = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz) || 1;
    const up = ny / len;
    if (up >= WALKABLE_NORMAL_Y) { surface.push(idx[t], idx[t + 1], idx[t + 2]); maxWalkableDeg = Math.max(maxWalkableDeg, Math.acos(Math.min(1, up)) * 180 / Math.PI); }
    else solid.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  terrainCache = {
    positions: new Float32Array(pos), indices: new Uint32Array(idx), surface: new Uint32Array(surface), solid: new Uint32Array(solid), nodeHeight, cellDiag, vertexOf,
    seawall,
    stats: { triangles: idx.length / 3, fineBlocks, coarseBlocks, surfaceTriangles: surface.length / 3, solidTriangles: solid.length / 3, maxWalkableDeg, buildMs: Math.round(t1 - t0) },
  };
  return terrainCache;
}

/** Town top edge (old outline pushed by topPush), sampled every 0.5 m including corner fans. */
function topEdgeCurve() {
  const out: { x: number; z: number; nx: number; nz: number; s: number }[] = [];
  EDGES.forEach((e, i) => {
    const steps = Math.max(1, Math.round(e.len / .5));
    for (let k = 0; k < steps; k++) {
      const s = e.s0 + e.len * k / steps, push = topPush(s);
      out.push({ x: e.a[0] + e.dx * e.len * k / steps + e.nx * push, z: e.a[1] + e.dz * e.len * k / steps + e.nz * push, nx: e.nx, nz: e.nz, s });
    }
    const next = EDGES[(i + 1) % NP], a0 = Math.atan2(e.nz, e.nx), a1 = Math.atan2(next.nz, next.nx);
    const turn = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), n = Math.ceil(Math.abs(turn) / deg(5));
    const s = next.s0, push = topPush(s);
    for (let k = 0; k < n; k++) {
      const a = a0 + turn * k / n, nx = Math.cos(a), nz = Math.sin(a);
      out.push({ x: next.a[0] + nx * push, z: next.a[1] + nz * push, nx, nz, s });
    }
  });
  return out;
}

/** Ends of the seawall run along the top edge (town factor crossing 0.5). */
function seawallEnds() {
  const curve = topEdgeCurve(), keep = curve.map(p => townFactor(p.x, p.z) >= .5);
  const firstOff = keep.findIndex(k => !k);
  const order = [...curve.keys()].map(i => (i + firstOff) % curve.length).filter(i => keep[i]);
  const first = curve[order[0]], last = curve[order[order.length - 1]];
  return { start: [first.x, first.z] as [number, number], end: [last.x, last.z] as [number, number] };
}

/** Height of the rendered/collided triangles at (x, z); null where there is no terrain mesh.
 * Nodes are jittered/snapped by <= 0.26 m, so the containing triangle is searched among the
 * neighbouring cells using the real vertex positions. */
export function meshHeight(x: number, z: number): number | null {
  const t = buildTerrain(), P = t.positions, ci = Math.floor((x - GRID.minX) / CELL), cj = Math.floor((z - GRID.minZ) / CELL);
  const node = (i: number, j: number) => t.vertexOf[j * NODES_X + i] * 3;
  const inTri = (a: number, b: number, c: number) => {
    const d = (P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2]);
    if (Math.abs(d) < 1e-12) return null;
    const u = ((x - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (z - P[a + 2])) / d;
    const v = ((P[b] - P[a]) * (z - P[a + 2]) - (x - P[a]) * (P[b + 2] - P[a + 2])) / d;
    return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6 ? P[a + 1] + (P[b + 1] - P[a + 1]) * u + (P[c + 1] - P[a + 1]) * v : null;
  };
  for (const [oi, oj] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    let i = ci + oi, j = cj + oj;
    if (i < 0 || j < 0 || i >= GRID.nx || j >= GRID.nz) continue;
    const diag = t.cellDiag[j * GRID.nx + i];
    if (!diag) continue;
    let size = 1;
    if (diag === 3) { i -= i % BLOCK; j -= j % BLOCK; size = BLOCK; }
    const a = node(i, j), b = node(i + size, j), c = node(i, j + size), d = node(i + size, j + size);
    const h = diag === 2 ? inTri(a, b, c) ?? inTri(b, d, c) : inTri(a, b, d) ?? inTri(a, d, c);
    if (h !== null) return h;
  }
  return null;
}

export function createTerrainGeometry() {
  const t = buildTerrain(), geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(t.positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(t.indices, 1));
  geometry.computeVertexNormals(); // shading uses facet normals (flatShading); kept for shadows
  geometry.computeBoundingSphere();
  return geometry;
}

/* ------------------------------------------------------------------ shore field */

/** RGBA8 on the terrain lattice (0.5 m): R signed waterline distance (+ over water, - over
 * land, +-16 m), G inward distance from the top edge (0-16 m), B town factor. */
export const SHORE_RANGE = 16;
function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, zz: Float64Array) {
  let k = 0; v[0] = 0; zz[0] = -Infinity; zz[1] = Infinity;
  for (let q = 1; q < n; q++) {
    if (f[q] >= 1e20 && f[v[k]] >= 1e20) { continue; }
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= zz[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; zz[k] = s; zz[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
/** Exact 2D Euclidean distance (in metres) to the nearest `target` node. */
function distanceTo(target: Uint8Array) {
  const W = NODES_X, H = NODES_Z, f = new Float64Array(W * H), n = Math.max(W, H);
  const col = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  for (let k = 0; k < W * H; k++) f[k] = target[k] ? 0 : 1e20;
  for (let x = 0; x < W; x++) { for (let z = 0; z < H; z++) col[z] = f[z * W + x]; edt1d(col, H, out, v, zz); for (let z = 0; z < H; z++) f[z * W + x] = out[z]; }
  for (let z = 0; z < H; z++) { for (let x = 0; x < W; x++) col[x] = f[z * W + x]; edt1d(col, W, out, v, zz); for (let x = 0; x < W; x++) f[z * W + x] = out[x]; }
  const d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = Math.sqrt(f[k]) * CELL;
  return d;
}
let fieldCache: { data: Uint8Array; signed: Float32Array; land: Uint8Array } | null = null;
export function shoreField() {
  if (fieldCache) return fieldCache;
  const { nodeHeight } = buildTerrain(), W = NODES_X, H = NODES_Z;
  const land = new Uint8Array(W * H), water = new Uint8Array(W * H), data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = nodeX(i), z = nodeZ(j);
    let h = nodeHeight[k];
    if (Number.isNaN(h)) h = coastFrame(x, z).d < 0 ? GROUND_Y : -20;
    if (x > 36 && x < 54 && z > -54 && z < -36) h = Math.max(h, GROUND_Y); // park plaza block
    land[k] = h > WATER_Y ? 1 : 0; water[k] = 1 - land[k];
  }
  const toLand = distanceTo(land), toWater = distanceTo(water), signed = new Float32Array(W * H);
  const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = nodeX(i), z = nodeZ(j), { d, s } = coastFrame(x, z);
    signed[k] = land[k] ? -toWater[k] : toLand[k];
    data[k * 4] = byte((signed[k] + SHORE_RANGE) / (2 * SHORE_RANGE));
    data[k * 4 + 1] = byte((topPush(s) - d) / SHORE_RANGE);
    data[k * 4 + 2] = byte(townFactor(x, z));
    data[k * 4 + 3] = 255;
  }
  fieldCache = { data, signed, land };
  return fieldCache;
}
let shoreTexture: DataTexture | null = null;
/** Shared module-lifetime texture (401 x 417 RGBA8, ~0.7 MB). */
export function getShoreTexture() {
  if (shoreTexture) return shoreTexture;
  shoreTexture = new DataTexture(shoreField().data, NODES_X, NODES_Z, RGBAFormat, UnsignedByteType);
  shoreTexture.magFilter = shoreTexture.minFilter = LinearFilter;
  shoreTexture.wrapS = shoreTexture.wrapT = ClampToEdgeWrapping;
  shoreTexture.flipY = false;
  shoreTexture.needsUpdate = true;
  return shoreTexture;
}
/** uv = (xz - min) * scale + offset, texel centres on lattice nodes. */
export const SHORE_UV = { min: [GRID.minX, GRID.minZ] as [number, number], scale: [1 / (CELL * NODES_X), 1 / (CELL * NODES_Z)] as [number, number], offset: [.5 / NODES_X, .5 / NODES_Z] as [number, number] };

/** GLSL shared by water foam and terrain wet sand. */
export const SHORE_GLSL = /* glsl */`
uniform sampler2D uShore; uniform vec2 uShoreMin; uniform vec2 uShoreScale; uniform vec2 uShoreOffset;
vec4 shoreSample(vec2 p) { return texture2D(uShore, (p - uShoreMin) * uShoreScale + uShoreOffset); }
float shoreSigned(vec4 s) { return (s.r * 2.0 - 1.0) * ${SHORE_RANGE.toFixed(1)}; }
// Swash cycle 0..1 (period ~5.5 s, phase varying along the shore), shared by foam and wet sand.
float shoreSwash(vec2 p, float t) { return 0.5 + 0.5 * sin(t * 1.1424 + dot(p, vec2(0.071, 0.053)) + 1.7 * sin(dot(p, vec2(-0.031, 0.044)))); }
`;
export const shoreUniforms = () => ({
  uShore: { value: getShoreTexture() }, uShoreMin: { value: SHORE_UV.min }, uShoreScale: { value: SHORE_UV.scale }, uShoreOffset: { value: SHORE_UV.offset },
});

/* ------------------------------------------------------------------ helpers for QA / runtime */

const slopeDegAt = (x: number, z: number) => {
  const e = .25, gx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e), gz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
};
/** Nearest walkable dry point (>= 0.6 m above the water, <= 20 deg) for water recovery. */
export function nearestDryPoint(x: number, z: number): [number, number, number] | null {
  for (let r = 0; r <= 60; r += .5) {
    const n = Math.max(1, Math.round(TAU * r / .5));
    let best: [number, number, number] | null = null, bestScore = Infinity;
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = terrainHeight(px, pz);
      if (h < WATER_Y + .6 || townFactor(px, pz) >= .5 && coastFrame(px, pz).d > topPush(coastFrame(px, pz).s) - .5) continue;
      if (slopeDegAt(px, pz) > 20) continue;
      if (r < bestScore) { bestScore = r; best = [px, h, pz]; }
    }
    if (best) return best;
  }
  return null;
}
/** Waterline polygon (radial march from the island centroid, 0.25 m steps) for maps/QA. */
export function shorelinePolygon(samples = 360): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < samples; k++) {
    const a = k / samples * TAU, dx = Math.cos(a), dz = Math.sin(a);
    let last = 0;
    for (let r = 0; r < 160; r += .25) if ((meshHeight(CENTROID[0] + dx * r, CENTROID[1] + dz * r) ?? -20) > WATER_Y) last = r;
    out.push([CENTROID[0] + dx * last, CENTROID[1] + dz * last]);
  }
  return out;
}
export const ISLAND_CENTROID = CENTROID as [number, number];
let shorelineCache: [number, number][] | null = null;
/** Waterline polygon of the island (x, z; 360 points, counter-clockwise in x/z), cached.
 * Excludes the separate park plaza block (x 36..54, z -54..-36), which the map draws itself. */
export function islandShoreline() { return shorelineCache ??= shorelinePolygon(360); }

/** Rock groups (G21-G23 scaled) that dress the terraces and the seawall ends. Seated at the
 * lowest terrain point under their footprint so no edge floats. */
export function rockPlacements() {
  const t = buildTerrain();
  const camp = (thetaDeg: number, dr: number) => {
    const a = deg(thetaDeg), r = campRadius(a) + dr;
    return [CAMP_CENTER[0] + Math.cos(a) * r, CAMP_CENTER[2] + Math.sin(a) * r] as [number, number];
  };
  const towardSea = (p: [number, number], m: number): [number, number] => {
    const dx = p[0] - CENTROID[0], dz = p[1] - CENTROID[1], l = Math.hypot(dx, dz);
    return [p[0] + dx / l * m, p[1] + dz / l * m];
  };
  const groups: { id: string; at: [number, number]; yaw: number; scale: number; tilt?: number }[] = [
    // South-east terrace (between the greybox tree at (-26, 7) and the inland block).
    { id: 'G21', at: camp(292, 1.2), yaw: deg(292) + 1.4, scale: 2.1 },
    { id: 'G22', at: camp(300, 1.9), yaw: .8, scale: 1.7, tilt: 1.2 },
    { id: 'G23', at: camp(296, 3.2), yaw: 2.2, scale: 1.6 },
    { id: 'G21', at: camp(322, .9), yaw: deg(322) + 1.6, scale: 1.7 },
    // North-east terrace beside the ramp head (clear of the contact foundation).
    { id: 'G21', at: camp(36, 1.0), yaw: deg(36) + 1.5, scale: 1.6 },
    { id: 'G23', at: camp(40, 2.0), yaw: .4, scale: 1.5 },
    // West flank: one low outcrop on the grass slope (spec: rock terraces as accents).
    { id: 'G21', at: camp(176, 5.5), yaw: 2.6, scale: 1.9 },
    { id: 'G22', at: camp(183, 7.4), yaw: 1.1, scale: 1.5, tilt: 1.3 },
    // Seawall ends: mask the sand/wall joint.
    { id: 'G21', at: towardSea(t.seawall.start, 1.6), yaw: .3, scale: 2.0 },
    { id: 'G22', at: towardSea(t.seawall.start, 3.6), yaw: 2.0, scale: 1.6, tilt: 1.2 },
    { id: 'G21', at: towardSea(t.seawall.end, 1.6), yaw: 1.9, scale: 2.0 },
    { id: 'G23', at: towardSea(t.seawall.end, 3.4), yaw: .7, scale: 1.7 },
  ];
  const footprint: Record<string, number> = { G21: 1.4, G22: .8, G23: .4 };
  return groups.map(g => {
    const R = footprint[g.id] * g.scale; let low = Infinity, high = -Infinity;
    for (let k = 0; k < 16; k++) for (const f of [.4, 1]) {
      const h = meshHeight(g.at[0] + Math.cos(k / 16 * TAU) * R * f, g.at[1] + Math.sin(k / 16 * TAU) * R * f) ?? -9;
      low = Math.min(low, h); high = Math.max(high, h);
    }
    const centre = meshHeight(g.at[0], g.at[1]) ?? -9;
    low = Math.min(low, centre);
    // On land: rest on the lowest footprint point (never floats). Where that point is under
    // water, the base sits at or below the waterline and the opaque sea hides the underside.
    const seat = low >= WATER_Y ? low : Math.max(low, Math.min(centre, WATER_Y) - .3 * g.scale);
    return { id: g.id, position: [g.at[0], seat, g.at[1]] as [number, number, number], yaw: g.yaw, scale: g.scale, tilt: g.tilt, sink: .12 * g.scale, relief: high - low };
  });
}

/* ------------------------------------------------------------------ ground colour + scatter */

const srgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }) as [number, number, number];
const C = {
  grassA: srgb('#7E8C3E'), grassB: srgb('#8A963F'), grassDry: srgb('#A09A55'), beach: srgb('#E3D3B4'), sand: srgb('#C9A978'),
  sandWet: srgb('#B39A72'), seabed: srgb('#A08A66'), stone: srgb('#8C8276'), stoneLight: srgb('#B4A896'), stoneMid: srgb('#9A8F82'),
  pit: srgb('#A58D6A'), trodden: srgb('#B89A6A'), plaza: srgb('#C9A978'), lip: srgb('#B39265'), band: srgb('#D2B98A'), rim: srgb('#B99A6C'),
  earth: srgb('#A7835A'), wear: srgb('#A89070'),
};
type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export type GroundKind = 'grass' | 'sand' | 'plaza' | 'stone' | 'water' | 'paved' | 'path';

function grassColour(x: number, z: number): RGB {
  const patches = smoothstep(.38, .66, .7 * valueNoise(x / 7.5, z / 7.5, 31) + .3 * valueNoise(x / 3.1 + 11, z / 3.1, 32));
  const dry = smoothstep(.62, .8, valueNoise(x / 11, z / 11, 33)) * .45;
  return lerp3(lerp3(C.grassA, C.grassB, patches), C.grassDry, dry);
}
const warp = (x: number, z: number, amp: number) => (valueNoise(x / 4, z / 4, 41) - .5) * amp + (valueNoise(x / 1.7 + 7, z / 1.7, 42) - .5) * amp * .35;

/** Worn foot paths (visual only, no collider change): camp north rim down to the beach, the
 * west flank trail, and a short beach access from the coastal road. Grass never grows on them. */
export const WORN_PATHS: [number, number][][] = [
  [[-42, 45], [-42.6, 50], [-43.4, 54.5], [-45.5, 59], [-47, 62.5]],
  [[-59, 33], [-64, 33.5], [-69, 34.5], [-74, 35.5], [-79, 35]],
  [[-4.5, 36], [-6, 41.5], [-9.5, 47], [-12, 52]],
];
export function pathDistance(x: number, z: number) {
  let best = Infinity;
  for (const path of WORN_PATHS) for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  // Wobble the edges 0.25 m so the path reads trodden, not drawn.
  return best + (valueNoise(x / 1.4, z / 1.4, 71) - .5) * .5;
}
const PATH_HALF = .75;

/** CPU ground classification shared by vertex colours and scatter (so tufts sit on grass). */
export function groundSample(x: number, z: number, h = terrainHeight(x, z), slopeY = 1) {
  const g = groundSampleBase(x, z, h, slopeY);
  if ((g.kind === 'grass' || g.kind === 'plaza' || g.kind === 'sand') && h > WATER_Y + .3) {
    const p = pathDistance(x, z);
    if (p < PATH_HALF + .45) {
      const wear = 1 - smoothstep(PATH_HALF - .2, PATH_HALF + .45, p);
      return { kind: wear > .5 ? 'path' as GroundKind : g.kind, colour: lerp3(g.colour, C.wear, .75 * wear), grass: g.grass * (1 - wear) };
    }
  }
  return g;
}
function groundSampleBase(x: number, z: number, h = terrainHeight(x, z), slopeY = 1): { kind: GroundKind; colour: RGB; grass: number } {
  if (LAYOUT_V4 && z < -54 && x < -4 && x > -56) {
    // North hill dirt road (part of the height field): packed earth, two wheel ruts, grassy crown,
    // ragged grass edges.
    const t = trailDistance(x, z), edge = TRAIL_HALF + .25 + (valueNoise(x / 1.3, z / 1.3, 72) - .5) * .7;
    if (t < edge + .6) {
      const rut = Math.max(0, 1 - Math.abs(t - .95) / .35), crown = smoothstep(.4, 0, t) * .6;
      const dirt = lerp3(C.earth, C.trodden, .35 + .3 * valueNoise(x / 2.1, z / 2.1, 73));
      const c = lerp3(lerp3(dirt, C.pit, .45 * rut), grassColour(x, z), Math.max(crown * .5, smoothstep(edge - .3, edge + .6, t)));
      const g = Math.max(crown * .4, smoothstep(edge, edge + .6, t));
      return { kind: g > .5 ? 'grass' : 'path', colour: c, grass: g };
    }
  }
  const steep = slopeY < .8; // > ~37 deg: exposed rock
  if (h < WATER_Y - .25) return { kind: 'water', colour: lerp3(C.sandWet, C.seabed, smoothstep(WATER_Y - .25, WATER_Y - 2, h)), grass: 0 };
  const dxc = x - CAMP_CENTER[0], dzc = z - CAMP_CENTER[2], r = Math.hypot(dxc, dzc), R = campRadius(Math.atan2(dzc, dxc));
  if (steep) {
    const band = h > 3.9 ? C.stoneLight : h > 2.9 ? C.stoneMid : h > 1.6 ? C.stone : C.stoneMid;
    const top = h > CAMP_TOP - .35 ? C.earth : band;
    return { kind: 'stone', colour: lerp3(top, C.stone, (valueNoise(x / .8, z / .8 + h, 43) - .5) * .5 + .25), grass: 0 };
  }
  if (townFactor(x, z) > .5 && h < GROUND_Y - .05) return { kind: 'stone', colour: lerp3(C.stone, C.stoneMid, valueNoise(x / .9, z / .9, 21)), grass: 0 };
  if (h >= CAMP_TOP - .01 && r <= R + .05) {
    // Camp plateau: pit -> trodden -> plaza -> light band (pads) -> patchy grass -> sandy rim.
    const rw = r + warp(x, z, 2.4);
    let c = lerp3(lerp3(C.pit, C.trodden, smoothstep(1.4, 3, r + warp(x, z, .8))), C.plaza, smoothstep(2.8, 4.6, rw));
    c = lerp3(c, C.band, smoothstep(10, 11, rw));
    c = lerp3(c, C.lip, .35 * smoothstep(9.6, 10.3, rw) * (1 - smoothstep(10.5, 11.3, rw)));
    // Grass edge warped 1-3 m, with sand islands inside the grass and grass flecks on the sand.
    const fleck = valueNoise(x / 1.3, z / 1.3, 44);
    const g = smoothstep(16.2, 18.6, rw + (fleck - .5) * 2.2) * (1 - smoothstep(.72, .86, valueNoise(x / 3.2, z / 3.2, 45)));
    c = lerp3(c, grassColour(x, z), g);
    const rim = smoothstep(R - 1.6, R + .2, r + warp(x, z, .9));
    c = lerp3(c, C.rim, rim * .6);
    return { kind: g > .5 && rim < .5 ? 'grass' : 'plaza', colour: c, grass: g * (1 - rim) };
  }
  if (h > GROUND_Y + .08) {
    // Camp flank (and ramp embankment top): grass slope with dune sand towards its foot.
    const g = smoothstep(GROUND_Y + .2, GROUND_Y + 1.6, h + warp(x, z, 1.6) * .6);
    const c = lerp3(lerp3(C.beach, C.sand, .35), grassColour(x, z), g);
    return { kind: g > .5 ? 'grass' : 'sand', colour: c, grass: g };
  }
  const { d, s } = coastFrame(x, z), inward = topPush(s) - d;
  if (h < GROUND_Y - .02 || inward < 0) {
    // Beach between the top edge and the waterline; darker damp band near the water.
    const damp = smoothstep(WATER_Y + .45, WATER_Y - .1, h);
    return { kind: 'sand', colour: lerp3(C.beach, C.sandWet, damp * .6), grass: 0 };
  }
  if (townFactor(x, z) > .5) {
    const cap = 1 - smoothstep(.8, 1.6, inward);
    return { kind: cap > .5 ? 'paved' : 'grass', colour: lerp3(grassColour(x, z), C.stoneLight, cap), grass: 1 - cap };
  }
  // Island top: beach dunes 1-5 m inward from the edge, grass beyond, boundary warped 1-3 m.
  const edge = 2.2 + 1.6 * valueNoise(s / 9, 3.7, 46) + warp(x, z, 2.6);
  const g = smoothstep(edge - 1.5, edge + 1.5, inward);
  let c = lerp3(C.beach, grassColour(x, z), g);
  const worn = roadDistance(x, z);
  c = lerp3(c, C.wear, .5 * smoothstep(6.6, 5.6, worn) * (1 - smoothstep(5.6, 5.3, worn)));
  return { kind: g > .5 ? 'grass' : 'sand', colour: c, grass: g };
}

/** Per-vertex linear colours for the terrain mesh, using each vertex's averaged normal. */
export function terrainColours(normals: ArrayLike<number>) {
  const t = buildTerrain(), out = new Float32Array(t.positions.length), mix4 = new Float32Array(t.positions.length / 3 * 4);
  for (let v = 0, k = 0; v < t.positions.length; v += 3, k += 4) {
    const x = t.positions[v], z = t.positions[v + 2], g = groundSample(x, z, t.positions[v + 1], normals[v + 1]), c = g.colour;
    // Low-poly mottling: +-5 % value and a slight warm/cool hue shift per vertex, so neighbouring
    // facets never share one flat tone (breaks the plastic read without textures).
    const n = (hash2(Math.round(x * 2), Math.round(z * 2), 81) - .5), hue = (valueNoise(x / 3.3, z / 3.3, 82) - .5) * .06;
    const v1 = 1 + n * .1;
    out[v] = c[0] * v1 * (1 + hue); out[v + 1] = c[1] * v1; out[v + 2] = c[2] * v1 * (1 - hue);
    // Material weights for the switchable PBR candidate: grass, sand, dirt, stone.
    const stone = g.kind === 'stone' ? 1 : 0, dirt = g.kind === 'plaza' || g.kind === 'path' || g.kind === 'paved' ? 1 - g.grass : 0;
    const grass = stone ? 0 : g.grass, sand = Math.max(0, 1 - stone - dirt - grass);
    mix4[k] = grass; mix4[k + 1] = sand; mix4[k + 2] = dirt; mix4[k + 3] = stone;
  }
  return { colours: out, groundMix: mix4 };
}

const PADS = Array.from({ length: 8 }, (_, i) => [CAMP_CENTER[0] + Math.cos(i * Math.PI / 4) * 15, CAMP_CENTER[2] + Math.sin(i * Math.PI / 4) * 15]);
export interface ScatterBlocker { minX: number; maxX: number; minZ: number; maxZ: number }
/** Deterministic ground-detail candidates (0.7 m lattice). Grass tufts at 0.6-1.6 per m2 on
 * grass, pebbles at ~0.12 per m2 on dry sand; none on roads, pads, plaza, tents or blockers. */
/** Dense grass-blade tuft candidates on a 0.5 m jittered lattice (max 4 per m2). Stride 6:
 * x, y (rendered mesh height), z, yaw, size 0..1, keep score. A candidate is drawn when its keep
 * score is below the quality/distance factor (1 = full density), so thinning is stable. None on
 * roads, paths, the trodden camp plaza, pads, tents, blockers, water or slopes > 25 deg. */
export const GRASS_MAX_DENSITY = 4;
export function grassCandidates(blockers: ScatterBlocker[]) {
  const job = grassCandidateJob(blockers);
  while (!job.step(Infinity)) { /* run to completion (tools / tests) */ }
  return job.result();
}
/** Incremental form: step(budgetMs) processes whole lattice rows until the budget is spent and
 * returns true when finished, so the runtime can spread the ~1 s build over idle frames. */
export function grassCandidateJob(blockers: ScatterBlocker[]) {
  const cell = .5, out: number[] = [], t = buildTerrain();
  // Lattice heights (the rendered mesh nodes) give the slope cheaply; coarse flat blocks are NaN inside.
  const node = (i: number, j: number) => { const v = t.nodeHeight[j * NODES_X + i]; return Number.isNaN(v) ? GROUND_Y : v; };
  const zEnd = GRID.minZ + GRID.nz * CELL, xEnd = GRID.minX + GRID.nx * CELL;
  let z = GRID.minZ;
  const row = (z: number) => {
    for (let x = GRID.minX; x < xEnd; x += cell) {
      const ix = Math.round(x / cell), iz = Math.round(z / cell);
      const px = x + (hash2(ix, iz, 91) - .5) * cell * .95, pz = z + (hash2(ix, iz, 92) - .5) * cell * .95;
      const ni = clamp(Math.round((px - GRID.minX) / CELL), 1, GRID.nx - 1), nj = clamp(Math.round((pz - GRID.minZ) / CELL), 1, GRID.nz - 1);
      const h0 = node(ni, nj);
      if (h0 < WATER_Y + .6) continue;
      // Clumped density 0.8-4 per m2 (cheap reject first; the score is stable for thinning).
      const clump = smoothstep(.38, .72, .65 * valueNoise(px / 6.5, pz / 6.5, 56) + .35 * valueNoise(px / 2.2, pz / 2.2, 57));
      const roll = hash2(ix, iz, 93);
      if (roll > mix(.2, 1, clump)) continue;
      if (roadDistance(px, pz) < 5.6) continue;
      if (blockers.some(b => px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ)) continue;
      if (PADS.some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 2.3)) continue;
      if (TENTS.some(([x0, z0, x1, z1]) => px > x0 - .4 && px < x1 + .4 && pz > z0 - .4 && pz < z1 + .4)) continue;
      const gx = (node(ni + 1, nj) - node(ni - 1, nj)) / (2 * CELL), gz = (node(ni, nj + 1) - node(ni, nj - 1)) / (2 * CELL);
      const slopeY = 1 / Math.hypot(gx, 1, gz);
      if (slopeY < WALKABLE_NORMAL_Y) continue;
      const h = meshHeight(px, pz) ?? h0;
      const g = groundSample(px, pz, h, slopeY);
      if (g.kind !== 'grass' || g.grass < .45) continue;
      const w = mix(.2, 1, clump) * smoothstep(.45, .85, g.grass), keep = roll / Math.max(w, 1e-3);
      if (keep > 1) continue;
      out.push(px, h, pz, hash2(ix, iz, 94) * TAU, clamp(.2 + .6 * clump + .4 * (hash2(ix, iz, 95) - .5), 0, 1), keep);
    }
  };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    step(budgetMs: number) {
      const t0 = now();
      while (z < zEnd) { row(z); z += cell; if (now() - t0 >= budgetMs) break; }
      return z >= zEnd;
    },
    result: () => new Float32Array(out),
    progress: () => (z - GRID.minZ) / (zEnd - GRID.minZ),
  };
}

export function scatterCandidates(blockers: ScatterBlocker[]) {
  const cell = .7, grass: number[] = [], pebbles: number[] = [];
  for (let z = GRID.minZ; z < GRID.minZ + GRID.nz * CELL; z += cell) for (let x = GRID.minX; x < GRID.minX + GRID.nx * CELL; x += cell) {
    const ix = Math.round(x / cell), iz = Math.round(z / cell);
    const px = x + (hash2(ix, iz, 51) - .5) * cell * .9, pz = z + (hash2(ix, iz, 52) - .5) * cell * .9;
    if (coastFrame(px, pz).d > 14) continue;
    if (roadDistance(px, pz) < 5.5) continue;
    if (blockers.some(b => px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ)) continue;
    if (PADS.some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 2.4)) continue;
    if (TENTS.some(([x0, z0, x1, z1]) => px > x0 - .5 && px < x1 + .5 && pz > z0 - .5 && pz < z1 + .5)) continue;
    const h = terrainHeight(px, pz), e = .3;
    const gx = (terrainHeight(px + e, pz) - terrainHeight(px - e, pz)) / (2 * e), gz = (terrainHeight(px, pz + e) - terrainHeight(px, pz - e)) / (2 * e);
    const slopeY = 1 / Math.hypot(gx, 1, gz);
    if (slopeY < WALKABLE_NORMAL_Y) continue;
    const g = groundSample(px, pz, h, slopeY), roll = hash2(ix, iz, 53), yaw = hash2(ix, iz, 54) * TAU, size = hash2(ix, iz, 55);
    const y = meshHeight(px, pz) ?? h;
    if (g.kind === 'grass' && g.grass > .5) {
      // Clumps: 0.5 per m2 between patches, up to 2.0 per m2 (and larger tufts) inside them.
      const clump = smoothstep(.42, .72, .65 * valueNoise(px / 6.5, pz / 6.5, 56) + .35 * valueNoise(px / 2.2, pz / 2.2, 57));
      const density = mix(.5, 2, clump) * smoothstep(.5, .9, g.grass);
      if (roll < density * cell * cell) grass.push(px, y, pz, yaw, clamp(.15 + .65 * clump + .35 * (size - .5), 0, 1));
    } else if (g.kind === 'sand' && h > WATER_Y + .25) {
      if (roll < .12 * cell * cell) pebbles.push(px, y, pz, yaw, size);
    }
  }
  return { grass: new Float32Array(grass), pebbles: new Float32Array(pebbles) };
}
