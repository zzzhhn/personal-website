/**
 * Island layout v4, step 1 (programmatic greybox). Spec: bobby-3d-world/规格-quality-v3-20261022.md §12,
 * Art Lock v2.1, PRD v1.10. Input snapshot: docs/world/quality-v3/map-v4/layout-v4.json (proposal), with
 * the §12.3 corrections applied here. This module is the single runtime source for v4 roads, junctions,
 * buildings, furniture, the north ridge and the zone map: render, physics, minimap, zone, bots and tests
 * all derive from it. Pure data + planar geometry: no three.js, so node tests and the UI bundle can import it.
 *
 * Convention as layout.ts: +X east, +Y up, -Z north, metres.
 * Switch: `?layout=v4` (default entry keeps the frozen v3 layout until the main thread flips LAYOUT_V4).
 */
import type { Vec3 } from './types';
import {
  BUILDINGS_V4, CAMP_FOOT_RADIUS, CAMP_XZ, FOUNDATIONS_V4, insidePolygon, LAYOUT_V4, OBSTACLES_V4, OUTLINE_V4, RIDGE_CENTER, RIDGE_FOOT_R,
  ROAD_Y, TREES_V4, VEHICLE_POSITIONS_V4, WORLD_SHOTS_V4, zoneAtV4, type P2, type ZoneV4,
} from './layout-v4-flag.ts';

export {
  BUILDINGS_V4, CAMP_FOOT_RADIUS, CAMP_XZ, FOUNDATIONS_V4, insidePolygon, LAYOUT_V4, OBSTACLES_V4, OUTLINE_V4, ROAD_Y, TREES_V4,
  VEHICLE_POSITIONS_V4, WORLD_SHOTS_V4, zoneAtV4, type P2, type ZoneV4,
};
const GROUND = 1;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Heavy geometry is built on first use only, so the default (v3) entry never pays for it. */
function lazy<T>(build: () => T): () => T { let v: T | undefined; return () => (v ??= build()); }

/* ------------------------------------------------------------------ planar helpers */

export const xz = (p: Vec3 | P2): P2 => (p.length === 3 ? [p[0], p[2]] : [p[0], p[1]]);
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
/** Right-hand side of travel direction d (heading east, right is south = +z). */
export const rightOf = (d: P2): P2 => [-d[1], d[0]];

export function segmentDistance(p: P2, a: P2, b: P2) {
  const d = sub(b, a), L2 = dot(d, d), t = L2 ? clamp(dot(sub(p, a), d) / L2, 0, 1) : 0;
  const q = add(a, mul(d, t));
  return { distance: len(sub(p, q)), t, q };
}
export function polygonDistance(p: P2, poly: P2[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, segmentDistance(p, poly[i], poly[(i + 1) % poly.length]).distance);
  return best;
}
/** + inside, - outside. */
export const signedInside = (p: P2, poly: P2[]) => (insidePolygon(p, poly) ? 1 : -1) * polygonDistance(p, poly);

function convexHull(points: P2[]): P2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [], upper: P2[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function polylineLength(pts: (Vec3 | P2)[]) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += len(sub(xz(pts[i]), xz(pts[i - 1])));
  return s;
}
/** Point, heading and height at arclength s along a polyline. */
export function pointAt(pts: Vec3[], s: number) {
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = len(sub(xz(b), xz(a)));
    if (run + L >= s || i === pts.length - 1) {
      const t = L ? clamp((s - run) / L, 0, 1) : 0;
      return { p: [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t] as P2, y: a[1] + (b[1] - a[1]) * t, dir: unit(sub(xz(b), xz(a))) };
    }
    run += L;
  }
  return { p: xz(pts[0]), y: pts[0][1], dir: [1, 0] as P2 };
}

/** Arc tangent to line A (through a, heading da) and line B (through b, heading db), radius R. */
export function filletCorner(a: P2, da: P2, b: P2, db: P2, R: number, y: number, stepDeg = 4): Vec3[] {
  const den = da[0] * db[1] - da[1] * db[0];
  const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
  const corner = add(a, mul(da, t));
  const theta = Math.acos(clamp(dot(da, db), -1, 1));
  const tl = R * Math.tan(theta / 2);
  const p0 = sub(corner, mul(da, tl));
  // Centre lies on the side the road turns toward: den > 0 turns to rightOf(da) (x east, z south).
  const n: P2 = den > 0 ? rightOf(da) : [-rightOf(da)[0], -rightOf(da)[1]];
  const centre = add(p0, mul(n, R));
  const a0 = Math.atan2(p0[1] - centre[1], p0[0] - centre[0]);
  const p1 = add(corner, mul(db, tl));
  let a1 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0]);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= TAU;
  while (sweep < -Math.PI) sweep += TAU;
  a1 = a0 + sweep;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (stepDeg * Math.PI / 180)));
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + sweep * i / steps;
    out.push([centre[0] + Math.cos(a) * R, y, centre[1] + Math.sin(a) * R]);
  }
  return out;
}

/** Round interior polyline vertices (constant-height roads) with radius R, capped so tangents fit. */
export function filletPolyline(pts: Vec3[], R: number, keep: P2[] = []): Vec3[] {
  if (pts.length < 3) return pts;
  const out: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = xz(pts[i - 1]), v = xz(pts[i]), b = xz(pts[i + 1]);
    if (keep.some(k => len(sub(k, v)) < .01)) { out.push(pts[i]); continue; }
    const da = unit(sub(v, a)), db = unit(sub(b, v)), theta = Math.acos(clamp(dot(da, db), -1, 1));
    if (theta < 2 * Math.PI / 180) { out.push(pts[i]); continue; }
    const maxT = .45 * Math.min(len(sub(v, a)), len(sub(b, v)));
    const r = Math.min(R, maxT / Math.tan(theta / 2));
    out.push(...filletCorner(a, da, b, db, r, pts[i][1]));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* ------------------------------------------------------------------ island, ridge */

/** North ridge (G29 windmill on top). The hill road is a lollipop: a short stem leaves the ring at J5,
 * a left turn climbs the west flank, the road passes the windmill platform on the north side and
 * descends the east flank back to the stem, where a second left turn returns to J5. No reversing or
 * U-turn is needed (§12.3-3); every curve is wider than the vans' low-speed minimum radius. Flank
 * 3.6 m over 14.85 m = 13.6 deg (walkable); road grade is constant by arclength. */
export const RIDGE_V4 = { center: RIDGE_CENTER, footR: RIDGE_FOOT_R, platformR: 9.8, footY: GROUND, topY: 4.6 };
export const WINDMILL_BASE = 2.4;
export const TRAIL_HALF = 2.75;
const TRAIL_RAISE = .14;
/** Flat summit inside the hill road's inner bench (the road's tightest radius is platformR). */
export const SUMMIT_R = RIDGE_V4.platformR - TRAIL_HALF - .7;
const coneHeight = (r: number) => RIDGE_V4.footY + (RIDGE_V4.topY - RIDGE_V4.footY) * clamp((RIDGE_V4.footR - r) / (RIDGE_V4.footR - SUMMIT_R), 0, 1);
const STEM_TURN = 9.5;
/** Loop centreline in plan: theta 90 deg (south, +z) -> 180 (west) -> 270 (north, r = platform) -> 450. */
const LOOP_RING: P2[] = (() => {
  const [cx, cz] = RIDGE_V4.center, out: P2[] = [], n = 120;
  for (let i = 0; i <= n; i++) {
    // Smooth radius (no cusp at the top): r = platform at theta 270 deg, foot at 90 deg.
    const th = Math.PI / 2 + TAU * i / n, k = (1 + Math.cos(TAU * i / n)) / 2;
    const r = RIDGE_V4.platformR + (RIDGE_V4.footR - RIDGE_V4.platformR) * k;
    out.push([cx + Math.cos(th) * r, cz + Math.sin(th) * r]);
  }
  return out;
})();
const tangentAt = (pts: P2[], i: number): P2 => unit(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
/** Stem joins: entry (north -> west, left) and exit (west -> south, left), both radius STEM_TURN. */
const LOOP_IN = 9, LOOP_OUT = 111;
const J5P: P2 = [-30, -54];
const stemIn = filletCorner(J5P, [0, -1], LOOP_RING[LOOP_IN], tangentAt(LOOP_RING, LOOP_IN), STEM_TURN, 0);
const stemOut = filletCorner(LOOP_RING[LOOP_OUT], tangentAt(LOOP_RING, LOOP_OUT), J5P, [0, 1], STEM_TURN, 0);
/** Plan polyline of the whole hill drive J5 -> loop -> J5 with a constant grade to the top. */
function hillDrive(): Vec3[] {
  const plan: P2[] = [J5P, ...stemIn.map(xz), ...LOOP_RING.slice(LOOP_IN + 1, LOOP_OUT), ...stemOut.map(xz), J5P];
  // Top = loop point nearest the platform (theta 270 deg).
  let top = 0, best = Infinity;
  plan.forEach((p, i) => { const r = len(sub(p, RIDGE_V4.center)); if (r < best) { best = r; top = i; } });
  const s: number[] = [0];
  for (let i = 1; i < plan.length; i++) s.push(s[i - 1] + len(sub(plan[i], plan[i - 1])));
  // Climb starts where the plan first meets the ridge foot; flat on the stem.
  const foot = (i: number) => len(sub(plan[i], RIDGE_V4.center)) <= RIDGE_V4.footR;
  const up0 = plan.findIndex((_, i) => foot(i)), dn1 = plan.length - 1 - [...plan.keys()].reverse().findIndex(i => foot(i));
  return plan.map((p, i) => {
    let t = 0;
    if (i > up0 && i <= top) t = (s[i] - s[up0]) / (s[top] - s[up0]);
    else if (i > top && i < dn1) t = (s[dn1] - s[i]) / (s[dn1] - s[top]);
    return [+p[0].toFixed(3), +(ROAD_Y + (RIDGE_V4.topY + TRAIL_RAISE - ROAD_Y) * t).toFixed(3), +p[1].toFixed(3)] as Vec3;
  });
}
/** Full hill drive (also the bot route for "climb and return"). */
export const HILL_DRIVE_V4: Vec3[] = hillDrive();
/** Paved hill road: the drive with both stem ends starting at the ring's paved edge (no dirt strip
 * over the ring carriageway). The shared stem is paved twice in the same colour (no visible fight). */
const RING_EDGE_Z = -54 - 5.5;
function cutAtRingEdge(pts: Vec3[]): Vec3[] {
  // Keep only the part north of the ring's paved edge, interpolating the two crossings.
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1];
    if (q && (q[2] - RING_EDGE_Z) * (p[2] - RING_EDGE_Z) < 0) {
      const t = (RING_EDGE_Z - q[2]) / (p[2] - q[2]);
      out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, RING_EDGE_Z]);
    }
    if (p[2] <= RING_EDGE_Z) out.push(p);
  }
  return out;
}
export const TRAIL_V4: Vec3[] = cutAtRingEdge(HILL_DRIVE_V4);

/** Ridge height field (shim mesh now; WorldLandform later): cone, flat platform, and a level bench
 * 0.1 m under the hill-road slab top (cut 40 deg uphill, fill 30 deg downhill). null outside the ridge. */
export function ridgeHeightV4(x: number, z: number): number | null {
  const r = Math.hypot(x - RIDGE_V4.center[0], z - RIDGE_V4.center[1]);
  if (r > RIDGE_V4.footR + .05) return null;
  const cone = coneHeight(r);
  let best = Infinity, slab = cone;
  for (let i = 1; i < TRAIL_V4.length; i++) {
    const a = TRAIL_V4[i - 1], b = TRAIL_V4[i], s = segmentDistance([x, z], xz(a), xz(b));
    if (s.distance < best) { best = s.distance; slab = a[1] + (b[1] - a[1]) * s.t; }
  }
  // Terrain session: the hill road is part of the terrain (no prism): the bench IS the road top across
  // the trail width, so the dirt road, the ring joint and the grass shoulders share one surface.
  const bench = Math.max(RIDGE_V4.footY, slab - TRAIL_RAISE);
  // 0.6 m flat bench beyond the slab edge: 0.5 m lattice triangles (jitter 0.1 m) never lift above it.
  if (best <= TRAIL_HALF + .6) return bench;
  const over = best - TRAIL_HALF - .6;
  return cone > bench ? Math.min(cone, bench + over * Math.tan(40 * Math.PI / 180)) : Math.max(cone, bench - over * Math.tan(30 * Math.PI / 180));
}

/* ------------------------------------------------------------------ road network */

export type RoadClass = 'coastal' | 'avenue' | 'collector' | 'local' | 'ramp' | 'bridge' | 'connector' | 'dirt' | 'foot';
export interface RoadClassSpec { width: number; side: number; raise: number; fillet: number; lamp: number; lampSides: 0 | 1 | 2; color: string; sideColor: string; label: string }
export const ROAD_CLASSES: Record<RoadClass, RoadClassSpec> = {
  coastal: { width: 9, side: 1, raise: .005, fillet: 18, lamp: 24, lampSides: 1, color: '#6B6A68', sideColor: '#8A877F', label: 'Coastal ring' },
  avenue: { width: 8, side: 2, raise: .01, fillet: 0, lamp: 14, lampSides: 2, color: '#6B6A68', sideColor: '#D9D2C2', label: 'Timeline avenue' },
  collector: { width: 8, side: 1.5, raise: .01, fillet: 12, lamp: 18, lampSides: 1, color: '#6B6A68', sideColor: '#D9D2C2', label: 'Connector' },
  local: { width: 6, side: 1.5, raise: .01, fillet: 8, lamp: 16, lampSides: 1, color: '#706E6A', sideColor: '#CFC6B4', label: 'Back street' },
  // Frozen v3 geometry: 8 m carriageway with flush 1.5 m edge strips centred at +-4.6 m.
  ramp: { width: 8, side: 1.35, raise: 0, fillet: 0, lamp: 0, lampSides: 0, color: '#6B6A68', sideColor: '#D9D2C2', label: 'Camp ramp' },
  bridge: { width: 8, side: 1.35, raise: 0, fillet: 0, lamp: 0, lampSides: 0, color: '#6B6A68', sideColor: '#D9D2C2', label: 'Bridge' },
  connector: { width: 8, side: 0, raise: 0, fillet: 0, lamp: 0, lampSides: 0, color: '#6B6A68', sideColor: '#6B6A68', label: 'Turn' },
  dirt: { width: 4.5, side: .5, raise: .006, fillet: 0, lamp: 0, lampSides: 0, color: '#B08A5E', sideColor: '#B08A5E', label: 'Hill road' },
  foot: { width: 3, side: 0, raise: 0, fillet: 6, lamp: 16, lampSides: 1, color: '#8E6E55', sideColor: '#8E6E55', label: 'Beach walk' },
};
export const paveHalf = (c: RoadClass) => ROAD_CLASSES[c].width / 2 + ROAD_CLASSES[c].side;

export interface JunctionV4 { id: string; p: P2; kind: 'signal' | 'stop' | 'allstop' | 'merge'; note: string }
export const JUNCTIONS_V4: JunctionV4[] = [
  { id: 'J1', p: [21, 30], kind: 'signal', note: 'camp road + avenue start + south ring; town gateway' },
  { id: 'J2', p: [21, -12], kind: 'signal', note: 'mid avenue: finance three south, AI-evaluation three north' },
  { id: 'J3', p: [21, -43], kind: 'signal', note: 'bridgehead; Hunyuan is the landmark on its west side' },
  { id: 'J8', p: [21, -54], kind: 'stop', note: 'avenue north end at the ring' },
  { id: 'J4', p: [-4, -54], kind: 'stop', note: 'back street north end' },
  { id: 'J5', p: [-30, -54], kind: 'merge', note: 'hill road leaves the ring westward' },
  { id: 'J6', p: [-4, -12], kind: 'allstop', note: 'back street + year street + west road' },
  { id: 'J7', p: [-88, -27], kind: 'stop', note: 'west road meets the west ring' },
];
const J = (id: string) => JUNCTIONS_V4.find(j => j.id === id)!.p;
const Y = ROAD_Y;

export interface RoadV4 { id: string; cls: RoadClass; pts: Vec3[]; frozen?: boolean; drivable: boolean }
/** Polylines as authored (interior vertices are filleted at build time by class radius). */
const AUTHORED: RoadV4[] = [
  { id: 'camp-ramp', cls: 'ramp', pts: [[-30, 4.84, 34], [-18, 4.84, 34], [-5, Y, 29]], frozen: true, drivable: true },
  { id: 'camp-road', cls: 'collector', pts: [[-5, Y, 29], [21, Y, 30]], drivable: true },
  { id: 'avenue', cls: 'avenue', pts: [[21, Y, 30], [21, Y, -54]], drivable: true },
  { id: 'bridge-link', cls: 'collector', pts: [[21, Y, -43], [26, Y, -42]], drivable: true },
  { id: 'bridge', cls: 'bridge', pts: [[26, Y, -42], [43, Y, -44]], frozen: true, drivable: true },
  { id: 'park-spur', cls: 'bridge', pts: [[43, Y, -44], [49, Y, -46]], frozen: true, drivable: true },
  { id: 'ring-north', cls: 'coastal', pts: [[21, Y, -54], [-4, Y, -54], [-30, Y, -54], [-56, Y, -54], [-75, Y, -42], [-88, Y, -27]], drivable: true },
  // Pulled west / inward from the proposal so the paved edge keeps >= 2.5 m from the camp flank foot (§12.3-3).
  { id: 'ring-west', cls: 'coastal', pts: [[-88, Y, -27], [-89, Y, 30], [-86, Y, 50]], drivable: true },
  { id: 'ring-south', cls: 'coastal', pts: [[-86, Y, 50], [-73, Y, 66], [-51, Y, 75.4], [-24, Y, 75], [-4, Y, 67.5], [12, Y, 51.5], [21, Y, 30]], drivable: true },
  { id: 'year-street', cls: 'local', pts: [[21, Y, -12], [-4, Y, -12]], drivable: true },
  { id: 'west-road', cls: 'collector', pts: [[-4, Y, -12], [-30, Y, -27], [-88, Y, -27]], drivable: true },
  { id: 'back-street', cls: 'local', pts: [[-4, Y, -54], [-4, Y, -12], [-4, Y, 4]], drivable: true },
  { id: 'hill-road', cls: 'dirt', pts: TRAIL_V4, drivable: true },
  // Beach boardwalk on stilts: both ends start on the flat top, the deck stays level over the sand.
  { id: 'beach-walk', cls: 'foot', pts: [[-56, 1.08, 79.5], [-44, 1.08, 86.2], [-26, 1.08, 87.2], [-12, 1.08, 84.6], [4, 1.08, 72.5]], drivable: false },
];
const JUNCTION_POINTS = JUNCTIONS_V4.map(j => j.p);
export const ROADS_V4: RoadV4[] = AUTHORED.map(r => ({ ...r, pts: r.frozen || !ROAD_CLASSES[r.cls].fillet ? r.pts : filletPolyline(r.pts, ROAD_CLASSES[r.cls].fillet, JUNCTION_POINTS) }));

/** Route turns at J1 (left) and J3 (right), radius 10 m: larger than every vehicle's low-speed minimum
 * radius (van ~8.8 m, offroad / coupe ~6 m) so the route is a real turn, not a precise bot path. */
export const TURN_RADIUS = 10;
const campRoad = AUTHORED[1].pts, bridge = AUTHORED[4].pts;
export const TURN_J1 = filletCorner(xz(campRoad[0]), unit(sub(xz(campRoad[1]), xz(campRoad[0]))), J('J1'), [0, -1], TURN_RADIUS, Y);
export const TURN_J3 = filletCorner(J('J3'), [0, -1], xz(bridge[0]), unit(sub(xz(bridge[1]), xz(bridge[0]))), TURN_RADIUS, Y);
export const TURN_J8 = filletCorner([-4, -54], [1, 0], J('J8'), [0, 1], TURN_RADIUS, Y);
export const CONNECTORS_V4: RoadV4[] = [
  { id: 'turn-j1', cls: 'connector', pts: TURN_J1, drivable: true },
  { id: 'turn-j3', cls: 'connector', pts: TURN_J3, drivable: true },
  { id: 'turn-j8', cls: 'connector', pts: TURN_J8, drivable: true },
];

/** The timeline drive (camp -> six buildings -> bridge -> park). drive-route.mjs reads this at runtime. */
export const TIMELINE_ROUTE_V4: Vec3[] = [
  ...AUTHORED[0].pts,
  ...TURN_J1,
  ...TURN_J3,
  [43, Y, -44], [49, Y, -46],
];

/** Every drivable centreline (for nearestRoadPoint, minimap, terrain caps, bots). */
export const DRIVABLE_V4: RoadV4[] = [...ROADS_V4.filter(r => r.drivable).map(r => r.id === 'hill-road' ? { ...r, pts: HILL_DRIVE_V4 } : r), ...CONNECTORS_V4];

/** Coastal ring + avenue as one closed drive (J1 -> south -> west -> north -> J8 -> avenue -> J1). */
const reversed = (id: string) => [...ROADS_V4.find(r => r.id === id)!.pts].reverse();
export const RING_LOOP_V4: Vec3[] = [
  ...reversed('ring-south'), ...reversed('ring-west').slice(1), ...reversed('ring-north').slice(1, -1), ...TURN_J8,
  [21, Y, -30], [21, Y, -12], [21, Y, 6], [21, Y, 30],
];

/* ------------------------------------------------------------------ buildings, plots, vehicles */

/** Coupe lay-by on the avenue's sea side (car x 25.25-27.15). The 2 m sidewalk steps onto the seawall
 * promenade (x 27.6-30.4 beside the lay-by), so the walking route stays continuous and >= 2 m wide. */
export const LAYBY = { x0: 25, x1: 27.6, z0: -4, z1: 8, taper: 2.6 };
/** Seawall promenade on the avenue's sea side (Art Lock v2.1: east seawall walk kept). */
export const PROMENADE = { x0: 27, x1: 30.4, z0: 20.2, z1: -30 };
/* ------------------------------------------------------------------ paved prisms */

export type PaveKind = 'road' | 'side' | 'apron' | 'joint' | 'layby' | 'walk' | 'boardwalk' | 'forecourt' | 'carpark' | 'platform';
export interface PavedPoly { kind: PaveKind; pts: P2[]; ys: number[]; color: string; thickness: number; road: string; openEdges?: number[] }
const TRIM_CURB = 3.5;

function junctionsOn(pts: Vec3[]) {
  // Arclength positions of junction points lying on the polyline.
  const out: { j: JunctionV4; s: number }[] = [];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = xz(pts[i - 1]), b = xz(pts[i]), L = len(sub(b, a));
    for (const j of JUNCTIONS_V4) {
      const d = segmentDistance(j.p, a, b);
      if (d.distance < .01 && !out.some(o => o.j.id === j.id)) out.push({ j, s: run + d.t * L });
    }
    run += L;
  }
  return out;
}
function junctionReach(j: JunctionV4) {
  let half = 0;
  for (const r of ROADS_V4) if (r.cls !== 'foot' && junctionsOn(r.pts).some(o => o.j.id === j.id)) half = Math.max(half, paveHalf(r.cls));
  return half + TRIM_CURB;
}
export const JUNCTION_REACH: Record<string, number> = Object.fromEntries(JUNCTIONS_V4.map(j => [j.id, junctionReach(j)]));

function quad(a: P2, b: P2, r: P2, o0: number, o1: number): P2[] {
  return [add(a, mul(r, o0)), add(b, mul(r, o0)), add(b, mul(r, o1)), add(a, mul(r, o1))];
}
const ccw = (pts: P2[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s > 0 ? pts : [...pts].reverse();
};

/** Interval list of arclengths on `road` excluded from sidewalks (junction aprons, lay-by). */
function sideGaps(road: RoadV4, total: number, side: 1 | -1): [number, number][] {
  const gaps = junctionsOn(road.pts).map(({ j, s }) => [s - JUNCTION_REACH[j.id], s + JUNCTION_REACH[j.id]] as [number, number]);
  if (road.id === 'avenue' && side === 1) {
    // Avenue runs north (-z): its right side (+x) is the sea side. Lay-by + bent walkway replace it.
    gaps.push([30 - (LAYBY.z1 + LAYBY.taper), 30 - (LAYBY.z0 - LAYBY.taper)]);
  }
  return gaps.map(([a, b]) => [clamp(a, 0, total), clamp(b, 0, total)] as [number, number]).filter(([a, b]) => b > a);
}

function strips(road: RoadV4, out: PavedPoly[]) {
  const c = ROAD_CLASSES[road.cls], pts = road.pts, total = polylineLength(pts), w = c.width / 2;
  if (road.id === 'camp-ramp') {
    // Share the exact cross-section at the crest. Overlapping rectangular slabs create
    // a raised lip on one side of a bend and a drop on the other, even on the centre lane.
    const section = (i: number, offset: number): P2 => {
      const p = xz(pts[i]);
      const before = unit(sub(p, xz(pts[Math.max(0, i - 1)])));
      const after = unit(sub(xz(pts[Math.min(pts.length - 1, i + 1)]), p));
      const d = i === 0 ? after : i === pts.length - 1 ? before : unit(add(before, after));
      const normal = rightOf(d), edge = rightOf(i === pts.length - 1 ? before : after);
      return add(p, mul(normal, offset / Math.max(.5, dot(normal, edge))));
    };
    for (let i = 1; i < pts.length; i++) {
      for (const [lo, hi, kind, shade] of [[-w, w, 'road', c.color], [-w - c.side, -w, 'side', c.sideColor], [w, w + c.side, 'side', c.sideColor]] as const) {
        out.push({ kind, pts: [section(i - 1, lo), section(i, lo), section(i, hi), section(i - 1, hi)],
          ys: [pts[i - 1][1], pts[i][1], pts[i][1], pts[i - 1][1]], color: shade, thickness: .18, road: road.id,
          openEdges: [...(i < pts.length - 1 ? [1] : []), ...(i > 1 ? [3] : [])] });
      }
    }
    return;
  }
  let run = 0;
  const gaps = { [1]: sideGaps(road, total, 1), [-1]: sideGaps(road, total, -1) } as Record<1 | -1, [number, number][]>;
  for (let i = 1; i < pts.length; i++) {
    const a3 = pts[i - 1], b3 = pts[i], a = xz(a3), b = xz(b3), L = len(sub(b, a));
    if (L < 1e-6) continue;
    const d = unit(sub(b, a)), r = rightOf(d), e = i === 1 ? 0 : .14, f = i === pts.length - 1 ? 0 : .14;
    const a2 = sub(a, mul(d, e)), b2 = add(b, mul(d, f));
    const ya = a3[1] - (b3[1] - a3[1]) * e / L, yb = b3[1] + (b3[1] - a3[1]) * f / L;
    const kind: PaveKind = road.cls === 'foot' ? 'boardwalk' : 'road';
    out.push({ kind, pts: quad(a2, b2, r, -w, w), ys: [ya, yb, yb, ya], color: c.color, thickness: road.cls === 'foot' ? .3 : .18, road: road.id });
    if (c.side > 0) for (const side of [1, -1] as const) {
      // Sub-intervals of this segment not covered by gaps.
      let from = run - e, to = run + L + f;
      const pieces: [number, number][] = [[from, to]];
      for (const [g0, g1] of gaps[side]) for (let k = pieces.length - 1; k >= 0; k--) {
        const [p0, p1] = pieces[k];
        if (g1 <= p0 || g0 >= p1) continue;
        pieces.splice(k, 1, ...([[p0, g0], [g1, p1]] as [number, number][]).filter(([x, y]) => y - x > .05));
      }
      for (const [p0, p1] of pieces) {
        const t0 = (p0 - run) / L, t1 = (p1 - run) / L;
        const q0 = add(a, mul(sub(b, a), t0)), q1 = add(a, mul(sub(b, a), t1));
        const y0 = a3[1] + (b3[1] - a3[1]) * t0 + c.raise, y1 = a3[1] + (b3[1] - a3[1]) * t1 + c.raise;
        const poly = side === 1 ? quad(q0, q1, r, w, w + c.side) : quad(q0, q1, r, -w - c.side, -w);
        out.push({ kind: 'side', pts: poly, ys: [y0, y1, y1, y0], color: c.sideColor, thickness: .18, road: road.id });
      }
    }
    run += L;
  }
}

function aprons(out: PavedPoly[]) {
  for (const j of JUNCTIONS_V4) {
    const reach = JUNCTION_REACH[j.id], pts: P2[] = [j.p];
    for (const r of ROADS_V4) {
      if (r.cls === 'foot') continue;
      const total = polylineLength(r.pts);
      for (const o of junctionsOn(r.pts)) {
        if (o.j.id !== j.id) continue;
        for (const s of [o.s - reach, o.s + reach]) {
          const sc = clamp(s, 0, total);
          if (Math.abs(sc - o.s) < .5) continue;
          const q = pointAt(r.pts, sc), rr = rightOf(q.dir), h = paveHalf(r.cls);
          pts.push(add(q.p, mul(rr, h)), add(q.p, mul(rr, -h)));
        }
      }
    }
    const hull = ccw(convexHull(pts));
    out.push({ kind: 'apron', pts: hull, ys: hull.map(() => ROAD_Y), color: '#6B6A68', thickness: .18, road: j.id });
  }
}

function joints(out: PavedPoly[]) {
  // Unfilleted kinks off junctions (ramp foot at (-5, 29)): a flat square on the bisector covers the wedge.
  for (const r of ROADS_V4) {
    if (r.cls === 'foot' || r.frozen) continue;
    for (let i = 1; i < r.pts.length - 1; i++) {
      const a = xz(r.pts[i - 1]), v = xz(r.pts[i]), b = xz(r.pts[i + 1]);
      const da = unit(sub(v, a)), db = unit(sub(b, v));
      if (Math.acos(clamp(dot(da, db), -1, 1)) < 6 * Math.PI / 180) continue;
      if (JUNCTION_POINTS.some(p => len(sub(p, v)) < .01)) continue;
      const bis = unit(add(da, db)), rr = rightOf(bis), h = paveHalf(r.cls) + .2, k = 1.6;
      const sq = ccw([add(add(v, mul(bis, -k)), mul(rr, -h)), add(add(v, mul(bis, k)), mul(rr, -h)), add(add(v, mul(bis, k)), mul(rr, h)), add(add(v, mul(bis, -k)), mul(rr, h))]);
      out.push({ kind: 'joint', pts: sq, ys: sq.map(() => r.pts[i][1]), color: '#6B6A68', thickness: .18, road: r.id });
    }
  }
  // The ramp foot meets the camp road at y = 1.14: joint at (-5, 29) on the flat side only.
  const v = xz(AUTHORED[0].pts[2]), da = unit(sub(v, xz(AUTHORED[0].pts[1]))), db = unit(sub(xz(campRoad[1]), v));
  const bis = unit(add(da, db)), rr = rightOf(bis), h = 5.6, k = 1.4;
  const sq = ccw([add(v, mul(rr, -h)), add(add(v, mul(bis, k)), mul(rr, -h)), add(add(v, mul(bis, k)), mul(rr, h)), add(v, mul(rr, h))]);
  out.push({ kind: 'joint', pts: sq, ys: sq.map(() => ROAD_Y), color: '#6B6A68', thickness: .18, road: 'ramp-foot' });
}

function layby(out: PavedPoly[]) {
  const { x0, x1, z0, z1, taper } = LAYBY, P = PROMENADE, r = (pts: P2[]) => ccw(pts), W = ROAD_Y + .01;
  const flat = (y: number) => [y, y, y, y];
  out.push({ kind: 'layby', pts: r([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ys: flat(ROAD_Y), color: '#6B6A68', thickness: .18, road: 'layby' });
  // Sidewalk returns at both lay-by ends (2.6 m) join the promenade.
  out.push({ kind: 'walk', pts: r([[x0, z0 - taper], [x1, z0 - taper], [x1, z0], [x0, z0]]), ys: flat(W), color: '#D9D2C2', thickness: .18, road: 'layby-walk' });
  out.push({ kind: 'walk', pts: r([[x0, z1], [x1, z1], [x1, z1 + taper], [x0, z1 + taper]]), ys: flat(W), color: '#D9D2C2', thickness: .18, road: 'layby-walk' });
  // Promenade: x 27-30.4, narrowed to start at 27.6 beside the lay-by.
  for (const [za, zb, xa] of [[P.z0, z1 + taper, P.x0], [z1 + taper, z0 - taper, x1], [z0 - taper, P.z1, P.x0]] as [number, number, number][])
    out.push({ kind: 'walk', pts: r([[xa, zb], [P.x1, zb], [P.x1, za], [xa, za]]), ys: flat(W), color: '#CFC6B4', thickness: .18, road: 'promenade' });
}

function extras(out: PavedPoly[]) {
  const flat = (y: number) => [y, y, y, y], W = ROAD_Y + .01;
  // Building forecourts: east face (x 11.5) to the avenue's west sidewalk (x 15), flush with it.
  for (const b of BUILDINGS_V4) {
    const z = b.position[2], d = b.size[2] / 2 + .5;
    out.push({ kind: 'forecourt', pts: ccw([[11.5, z - d], [15, z - d], [15, z + d], [11.5, z + d]]), ys: flat(W), color: '#D9D2C2', thickness: .18, road: b.id });
  }
  out.push({ kind: 'carpark', pts: ccw([[-8, 5], [0, 5], [0, 14], [-8, 14]]), ys: flat(ROAD_Y), color: '#6F6D69', thickness: .18, road: 'car-park' });
  // Windmill base pad on the flat summit (inside the hill road's inner bench).
  const top = RIDGE_V4.topY + .1, pr = SUMMIT_R - .4;
  const disc: P2[] = Array.from({ length: 24 }, (_, i) => [RIDGE_V4.center[0] + Math.cos(i / 24 * TAU) * pr, RIDGE_V4.center[1] + Math.sin(i / 24 * TAU) * pr]);
  out.push({ kind: 'platform', pts: ccw(disc), ys: disc.map(() => top), color: '#B08A5E', thickness: .18, road: 'ridge-platform' });
}

export const pavedV4 = /*#__PURE__*/ lazy((): PavedPoly[] => {
  const out: PavedPoly[] = [];
  // The hill road is part of the terrain height field (terrain session), not a prism.
  for (const r of ROADS_V4) if (r.id !== 'hill-road') strips(r, out);
  for (const r of CONNECTORS_V4) strips(r, out);
  aprons(out);
  joints(out);
  layby(out);
  extras(out);
  return out.map(p => ({ ...p, pts: p.pts.map(q => [+q[0].toFixed(4), +q[1].toFixed(4)] as P2) }));
});
/** Paved test (planar): any drivable paved polygon contains p. */
export const onPavement = (p: P2) => pavedV4().some(poly => poly.kind !== 'boardwalk' && insidePolygon(p, poly.pts));

/* ------------------------------------------------------------------ static greybox solids */

export type SolidKind = 'massing' | 'kiosk' | 'tower' | 'windmill' | 'rail' | 'post' | 'bollard' | 'bench' | 'shelter' | 'trunk' | 'wall';
export interface SolidBox { kind: SolidKind; position: Vec3; size: Vec3; yaw: number; color: string; detail: boolean; seat?: boolean }
const box = (kind: SolidKind, x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw = 0, detail = false, seat = false): SolidBox =>
  ({ kind, position: [x, y + h / 2, z], size: [w, h, d], yaw, color, detail, seat });

function railAlong(a: P2, b: P2, y: number, out: SolidBox[], color = '#E6DCCB', h = .9, posts = true) {
  const d = sub(b, a), L = len(d), yaw = -Math.atan2(d[1], d[0]), m = mul(add(a, b), .5);
  out.push({ kind: 'rail', position: [m[0], y + h - .14, m[1]], size: [L, .22, .22], yaw, color, detail: false });
  if (posts) for (const p of [a, b]) out.push(box('post', p[0], y, p[1], .3, h, .3, color, yaw));
}

/** Bridge rail ends adjusted for the new J3 approach (whitelist: 为新进桥方向调整的桥栏端部). West ends
 * start beyond the turning envelope; a short flare closes the gap to the shore outside the deck. */
export const BRIDGE_RAIL = { southStart: 3, northStart: 3, end: 2.8, offset: 5.2 };

export const solidsV4 = /*#__PURE__*/ lazy((): SolidBox[] => {
  const out: SolidBox[] = [];
  // Back-street massing replaces the four v3 inland blocks (whitelist), west-shore houses, beach kiosks.
  const massing: [number, number, number, number, number, SolidKind][] = [
    [-13.5, -42, 8, 8, 6, 'massing'], [-30.5, -42, 7, 8, 4, 'massing'], [-14, -33, 9, 7, 4.5, 'massing'], [-13, -2, 7, 7, 4, 'massing'],
    [-68, -15, 6, 6, 3, 'massing'], [-76, -14, 5, 5, 2.6, 'massing'], [-74, -5, 6, 5, 3.4, 'massing'],
  ];
  for (const [x, z, w, d, h, k] of massing) out.push(box(k, x, GROUND, z, w, h, d, '#A29A85'));
  // South-beach kiosks on the flat top between the ring shoulder and the boardwalk; lifeguard tower on
  // the sand, its base sunk 1 m so it never floats whatever the final beach profile.
  out.push(box('kiosk', -38, GROUND, 83.4, 2.6, 2.6, 2.6, '#E8803A'), box('kiosk', -18, GROUND, 80.4, 2.6, 2.6, 2.6, '#E6DCCB'));
  out.push(box('tower', -28, -1, 89.6, 2.2, 5.8, 2.2, '#E6DCCB', 0, false, true));
  // Windmill G29 greybox (tower; nacelle and blades are visual-only in WorldDistricts).
  out.push(box('windmill', RIDGE_V4.center[0], RIDGE_V4.topY, RIDGE_V4.center[1], WINDMILL_BASE, 12, WINDMILL_BASE, '#E6DCCB'));
  // Bus shelter on the sea-side strip near J2 (decor, no NPC).
  out.push(box('shelter', 29.6, ROAD_Y + .01, -20, 1.4, 2.5, 3.2, '#4E647D'));
  // Forecourt bollards: x 15.2, between plaza and the west sidewalk, outside every turning envelope.
  // Forecourt bollards at the forecourt edge (x 14.8), so the 2 m sidewalk stays clear; derived per building.
  for (const b of BUILDINGS_V4) for (const dz of [-3.6, -1.2]) out.push(box('bollard', 14.8, ROAD_Y + .01, b.position[2] + dz, .25, .9, .25, '#4E647D', 0, true));
  // Benches: forecourts, pocket park, sea-side promenade (against the rail, x 30.1).
  for (const b of BUILDINGS_V4) out.push(box('bench', 12.4, ROAD_Y + .01, b.position[2] + 2.4, .6, .45, 1.8, '#8E6E55', 0, true));
  for (const [x, z] of [[-23.5, -44.5], [-19.5, -44.5], [-23.5, -39.5], [-19.5, -39.5]]) out.push(box('bench', x, GROUND, z, 1.8, .45, .6, '#8E6E55', 0, true));
  for (const z of [-28, 16, 22]) out.push(box('bench', 30.1, ROAD_Y + .01, z, .6, .45, 1.8, '#8E6E55', 0, true));
  // Pocket park trees (trunk solid; canopy visual).
  for (const [x, z] of [[-21.5, -42]]) out.push(box('trunk', x, GROUND, z, .7, 2.8, .7, '#5A4634'));
  // Seawall rail along the avenue's sea side, ending clear of the bridge's south rail / J3 envelope.
  railAlong([31, 26], [31, -27], GROUND, out);
  // Ring guardrails on the outer side of the corners (sea side), offset beyond the shoulder.
  // (The south ring runs along the open beach and the boardwalk: no rail there.)
  for (const r of ROADS_V4.filter(r => r.id === 'ring-north' || r.id === 'ring-west')) {
    const pts = AUTHORED.find(a => a.id === r.id)!.pts;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = xz(pts[i - 1]), v = xz(pts[i]), b = xz(pts[i + 1]);
      const da = unit(sub(v, a)), db = unit(sub(b, v)), turn = da[0] * db[1] - da[1] * db[0];
      if (Math.abs(turn) < Math.sin(15 * Math.PI / 180)) continue;
      // Outer side: opposite to the turn direction; offset from the filleted centreline is approximated
      // by offsetting the chord rails outward beyond the arc.
      const outer = turn > 0 ? -1 : 1;
      for (const [p, d] of [[a, da], [b, db]] as [P2, P2][]) {
        const from = p === a ? sub(v, mul(d, 14)) : v, to = p === a ? v : add(v, mul(d, 14));
        const n = mul(rightOf(d), outer * (paveHalf('coastal') + 1.6));
        railAlong(add(from, n), add(to, n), GROUND, out);
      }
    }
  }
  // Hill road: guardrail on the downhill (outer) side.
  for (let i = 4; i < TRAIL_V4.length - 6; i += 4) {
    const a = TRAIL_V4[i], b = TRAIL_V4[i + 4];
    const ra = Math.hypot(a[0] - RIDGE_V4.center[0], a[2] - RIDGE_V4.center[1]), rb = Math.hypot(b[0] - RIDGE_V4.center[0], b[2] - RIDGE_V4.center[1]);
    const outA = unit(sub(xz(a), RIDGE_V4.center)), outB = unit(sub(xz(b), RIDGE_V4.center));
    const off = TRAIL_HALF + .35;
    // Loop flanks only (not the stem, its turns or the platform pass).
    if (Math.min(ra, rb) < RIDGE_V4.platformR + 2 || Math.max(ra, rb) > RIDGE_V4.footR - 3) continue;
    const pa = add(xz(a), mul(outA, off)), pb = add(xz(b), mul(outB, off));
    const d = sub(pb, pa), L = len(d), yaw = -Math.atan2(d[1], d[0]), m = mul(add(pa, pb), .5), y = Math.min(a[1], b[1]);
    out.push({ kind: 'rail', position: [m[0], y + .62, m[1]], size: [L + .1, .2, .2], yaw, color: '#8E6E55', detail: false });
    out.push(box('post', pa[0], y - .45, pa[1], .22, 1.25, .22, '#8E6E55', yaw, true));
  }
  // Bridge rails (v3 geometry, new west ends) with end posts and a shore flare.
  const ba = xz(bridge[0]), bb = xz(bridge[1]), bd = unit(sub(bb, ba)), bL = len(sub(bb, ba)), br = rightOf(bd);
  for (const side of [1, -1] as const) {
    const s0 = side === 1 ? BRIDGE_RAIL.southStart : BRIDGE_RAIL.northStart;
    const p0 = add(add(ba, mul(bd, s0)), mul(br, side * BRIDGE_RAIL.offset)), p1 = add(add(ba, mul(bd, bL - BRIDGE_RAIL.end)), mul(br, side * BRIDGE_RAIL.offset));
    const d = sub(p1, p0), yaw = -Math.atan2(d[1], d[0]), m = mul(add(p0, p1), .5);
    out.push({ kind: 'rail', position: [m[0], ROAD_Y + .68, m[1]], size: [len(d), 1.25, .22], yaw, color: '#E6DCCB', detail: false });
    // End posts cap both rail ends (quality-v3 §10: no rail cut off mid-span).
    for (const p of [p0, p1]) out.push(box('post', p[0], ROAD_Y - 1.28, p[1], .36, 1.5 + .66, .36, '#E6DCCB', yaw));
  }
  return out;
});

/* ------------------------------------------------------------------ knockable furniture */

export type KnockKind = 'lamp' | 'signal' | 'stop' | 'direction' | 'delineator' | 'chevron' | 'bin';
export interface Knockable { id: string; kind: KnockKind; position: Vec3; yaw: number; road: string }
/** Capacity approved as a candidate (§12.5): ~80 sleeping dynamic bodies, never all awake. */
export const KNOCKABLE_CAP = 80;

/** Planar distance from p to an oriented solid footprint (0 inside). */
export function solidDistance(p: P2, s: { position: Vec3; size: Vec3; yaw: number }) {
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw), dx = p[0] - s.position[0], dz = p[1] - s.position[2];
  // three.js yaw about +Y: local x = (dx cos - dz sin)? Rotation.y = yaw maps local (1,0,0) to (cos, 0, -sin).
  const lx = dx * c - dz * n, lz = dx * n + dz * c;
  return Math.hypot(Math.max(0, Math.abs(lx) - s.size[0] / 2), Math.max(0, Math.abs(lz) - s.size[2] / 2));
}
/** Fixed obstacles placed by WorldEnvironment from the switched layout data (year pillar + plaque per
 * building, ground greybox tree trunks), mirrored here so clearance checks see them too. */
export const derivedSolidsV4 = /*#__PURE__*/ lazy(() => [
  ...BUILDINGS_V4.flatMap(({ position: [x, y, z], size: [w, h, d] }) => [
    { kind: 'building', position: [x, y + h / 2, z] as Vec3, size: [w, h, d] as Vec3, yaw: 0 },
    { kind: 'pillar', position: [x + w / 2 + 5, 2.1, z] as Vec3, size: [.5, 2.2, .5] as Vec3, yaw: 0 },
    { kind: 'plaque', position: [x + w / 2 + 3, 2, z + 2.7] as Vec3, size: [.18, 1.6, 1.5] as Vec3, yaw: 0 },
  ]),
  ...TREES_V4.filter(t => t[1] < 2).map(([x, y, z]) => ({ kind: 'trunk', position: [x, y + 1.4, z] as Vec3, size: [.7, 2.8, .7] as Vec3, yaw: 0 })),
]);
const allFixed = () => [...solidsV4(), ...derivedSolidsV4()];
function clearOfSolids(p: P2, r: number) {
  return !allFixed().some(s => solidDistance(p, s) < r);
}
const nearJunction = (p: P2, extra = 1) => JUNCTIONS_V4.some(j => len(sub(p, j.p)) < JUNCTION_REACH[j.id] + extra);
const inLaybyZone = (p: P2) => p[0] > LAYBY.x0 - .5 && p[0] < LAYBY.x1 + .5 && p[1] > LAYBY.z0 - LAYBY.taper - 4 && p[1] < LAYBY.z1 + LAYBY.taper + 1;
const inLayby = (p: P2) => p[0] > LAYBY.x0 - .5 && p[0] < LAYBY.x1 + .5 && p[1] > LAYBY.z0 - LAYBY.taper - 1 && p[1] < LAYBY.z1 + LAYBY.taper + 1;
const nearPillar = (p: P2) => BUILDINGS_V4.some(b => { const x = b.position[0] + b.size[0] / 2 + 5; return Math.hypot(p[0] - x, p[1] - b.position[2]) < 2 || Math.hypot(p[0] - (x - 2), p[1] - b.position[2] - 2.7) < 1.6; });

export const knockablesV4 = /*#__PURE__*/ lazy((): Knockable[] => {
  const out: Knockable[] = [];
  const free = (p: P2, r = 1.2) => clearOfSolids(p, r) && !out.some(o => len(sub(xz(o.position), p)) < 2.2) && !nearPillar(p);
  const push = (kind: KnockKind, p: P2, y: number, yaw: number, road: string) => out.push({ id: `${kind}-${out.filter(o => o.kind === kind).length}`, kind, position: [+p[0].toFixed(3), y, +p[1].toFixed(3)], yaw, road });
  // Signals: one pole per approach on the right sidewalk / shoulder, just behind the apron.
  for (const j of JUNCTIONS_V4) {
    for (const r of ROADS_V4) {
      if (r.cls === 'foot') continue;
      for (const o of junctionsOn(r.pts)) {
        if (o.j.id !== j.id) continue;
        const total = polylineLength(r.pts), reach = JUNCTION_REACH[j.id] + .6;
        for (const dir of [-1, 1] as const) {
          const s = o.s + dir * reach;
          if (s < 0 || s > total) continue;
          // A pole beyond this junction must not stand in another junction's apron or turn.
          const probe = pointAt(r.pts, s).p;
          if (JUNCTIONS_V4.some(k => k.id !== j.id && len(sub(probe, k.p)) < JUNCTION_REACH[k.id] + TURN_RADIUS)) continue;
          const q = pointAt(r.pts, s), travel: P2 = dir < 0 ? q.dir : mul(q.dir, -1);
          // Approaching vehicles travel toward the junction; their right side.
          const side = rightOf(travel), off = paveHalf(r.cls) - .45;
          let p = add(q.p, mul(side, off));
          // Keep the coupe's lay-by exit clear: that pole stands on the promenade instead.
          if (inLaybyZone(p)) p = [PROMENADE.x1 - .6, p[1]];
          const kind: KnockKind | null = j.kind === 'signal' ? 'signal' : j.kind === 'allstop' || (j.kind === 'stop' && r.cls !== 'coastal' && r.id !== 'avenue') || (j.id === 'J8' && r.id === 'avenue') ? 'stop' : null;
          if (kind && free(p, .8)) push(kind, p, q.y + ROAD_CLASSES[r.cls].raise, Math.atan2(-travel[1], travel[0]), r.id);
        }
      }
    }
  }
  // Direction signs at decision points (right side, 4 m before the stop / signal pole).
  const dirSign = (road: string, s: number, fromEnd: boolean) => {
    const r = ROADS_V4.find(x => x.id === road)!, total = polylineLength(r.pts), q = pointAt(r.pts, fromEnd ? total - s : s);
    const travel = fromEnd ? q.dir : mul(q.dir, -1), p = add(q.p, mul(rightOf(travel), paveHalf(r.cls) - .45));
    if (free(p, .8)) push('direction', p, q.y + ROAD_CLASSES[r.cls].raise, Math.atan2(-travel[1], travel[0]), road);
  };
  dirSign('camp-road', JUNCTION_REACH.J1 + 5, true); dirSign('ring-south', JUNCTION_REACH.J1 + 5, true);
  dirSign('west-road', JUNCTION_REACH.J7 + 5, true); dirSign('back-street', JUNCTION_REACH.J4 + 5, false);
  dirSign('year-street', JUNCTION_REACH.J2 + 5, true); dirSign('ring-west', JUNCTION_REACH.J7 + 5, false);
  // Avenue: authored between forecourts (west, x 16.4) and staggered on the east sidewalk / promenade.
  for (const [x, z] of [[16.4, 13], [16.4, 2.5], [16.4, -27], [16.4, -37.8], [25.6, 15], [28.8, 1.5], [25.6, -26]] as P2[]) {
    const y = ROAD_Y + .01;
    // Yaw so the lamp arm (local -Z) reaches over the carriageway.
    if (free([x, z], .5)) push('lamp', [x, z], y, x < 21 ? -Math.PI / 2 : Math.PI / 2, 'avenue');
  }
  // Other roads by class spacing, staggered on two-sided roads, skipped at aprons / lay-by / pillars.
  for (const r of ROADS_V4) {
    const c = ROAD_CLASSES[r.cls];
    if (!c.lamp || r.cls === 'avenue') continue;
    const total = polylineLength(r.pts);
    for (let side = 0; side < c.lampSides; side++) {
      for (let s = 5 + side * c.lamp / 2; s < total - 3; s += c.lamp) {
        const q = pointAt(r.pts, s), sign = side === 0 ? 1 : -1, off = r.cls === 'foot' ? c.width / 2 - .3 : paveHalf(r.cls) - .4;
        const p = add(q.p, mul(rightOf(q.dir), sign * off));
        if (nearJunction(p) || inLayby(p) || !free(p)) continue;
        push('lamp', p, q.y + c.raise, Math.atan2(-q.dir[1], q.dir[0]) + (sign > 0 ? 0 : Math.PI), r.id);
      }
    }
  }
  // Chevrons on the outer side of the sharpest ring corners, delineators on outer shoulders, bins.
  for (const r of ROADS_V4.filter(r => r.cls === 'coastal')) {
    const pts = AUTHORED.find(a => a.id === r.id)!.pts;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = xz(pts[i - 1]), v = xz(pts[i]), b = xz(pts[i + 1]), da = unit(sub(v, a)), db = unit(sub(b, v));
      const turn = da[0] * db[1] - da[1] * db[0];
      if (Math.abs(turn) < Math.sin(28 * Math.PI / 180)) continue;
      const bis = unit(sub(da, db)), p = add(v, mul(bis, paveHalf('coastal') + .5 + ROAD_CLASSES.coastal.fillet * .25));
      if (free(p, .6)) push('chevron', p, GROUND, Math.atan2(-bis[1], bis[0]), r.id);
    }
  }
  for (const r of ROADS_V4.filter(r => r.cls === 'coastal')) {
    const total = polylineLength(r.pts);
    for (let s = 12; s < total - 6; s += 26) {
      const q = pointAt(r.pts, s), p = add(q.p, mul(rightOf(q.dir), -(paveHalf('coastal') - .25)));
      if (nearJunction(p, 3) || !free(p, .8)) continue;
      push('delineator', p, ROAD_Y, 0, r.id);
    }
  }
  for (const [x, z, y] of [[14.4, 13.4, ROAD_Y + .01], [15.4, -24.6, ROAD_Y + .01], [29.8, 18.6, ROAD_Y + .01], [-17.8, -45, GROUND], [-26.2, -38.6, GROUND]] as [number, number, number][]) {
    if (free([x, z], .6)) push('bin', [x, z], y, 0, 'street');
  }
  // Honour the capacity: drop delineators first, then the furthest lamps on the ring.
  const order: KnockKind[] = ['delineator', 'chevron', 'bin'];
  for (const k of order) while (out.length > KNOCKABLE_CAP && out.some(o => o.kind === k)) out.splice(out.map(o => o.kind).lastIndexOf(k), 1);
  while (out.length > KNOCKABLE_CAP) { const i = out.map(o => o.kind === 'lamp' && o.road.startsWith('ring')).lastIndexOf(true); if (i < 0) break; out.splice(i, 1); }
  return out;
});

/* ------------------------------------------------------------------ visual-only decor */

export interface DecorBox { position: Vec3; size: Vec3; yaw: number; color: string }
/** Lane dashes, crosswalks at the signal junctions, boardwalk stilts and the pocket-park canopy. */
export const decorV4 = /*#__PURE__*/ lazy((): DecorBox[] => {
  const out: DecorBox[] = [], white = '#E6DCCB';
  const inApron = (p: P2) => JUNCTIONS_V4.some(j => len(sub(p, j.p)) < JUNCTION_REACH[j.id] + .5);
  for (const r of [...ROADS_V4, ...CONNECTORS_V4]) {
    if (!['coastal', 'avenue', 'collector', 'local'].includes(r.cls)) continue;
    const total = polylineLength(r.pts);
    for (let s = 2; s < total - 2; s += 6) {
      const q = pointAt(r.pts, s + 1.5);
      if (inApron(q.p) || (r.id === 'camp-road' && q.p[0] < 1)) continue;
      out.push({ position: [q.p[0], q.y + .006, q.p[1]], size: [3, .012, .14], yaw: heading(q.dir), color: white });
    }
  }
  for (const j of JUNCTIONS_V4.filter(j => j.kind === 'signal')) {
    for (const r of ROADS_V4) {
      if (r.cls === 'foot') continue;
      for (const o of junctionsOn(r.pts)) {
        if (o.j.id !== j.id) continue;
        const total = polylineLength(r.pts);
        for (const dir of [-1, 1]) {
          const s = o.s + dir * (JUNCTION_REACH[j.id] - 1.6);
          if (s < 0 || s > total) continue;
          const q = pointAt(r.pts, s), rr = rightOf(q.dir), half = ROAD_CLASSES[r.cls].width / 2 - .4;
          for (let w = -half; w <= half + 1e-6; w += 1) {
            const p = add(q.p, mul(rr, w));
            out.push({ position: [p[0], q.y + .006, p[1]], size: [2.4, .012, .5], yaw: heading(q.dir), color: white });
          }
        }
      }
    }
  }
  const walk = ROADS_V4.find(r => r.id === 'beach-walk')!, wl = polylineLength(walk.pts);
  for (let s = 1; s < wl - 1; s += 4) {
    const q = pointAt(walk.pts, s), rr = rightOf(q.dir);
    for (const side of [-1, 1]) {
      const p = add(q.p, mul(rr, side * 1.3));
      out.push({ position: [p[0], q.y - .3 - 1.4, p[1]], size: [.22, 2.8, .22], yaw: 0, color: '#6E5642' });
    }
  }
  out.push({ position: [-21.5, 1 + 3.6, -42], size: [3.8, 3.6, 3.8], yaw: 0, color: '#8AA24A' });
  return out;
});

/* ------------------------------------------------------------------ queries */

/** Nearest point on any drivable centreline, keeping the surface height (water-recovery fallback). */
export function nearestRoadPointV4(position: Vec3): Vec3 {
  let best = Infinity, out: Vec3 = [...TIMELINE_ROUTE_V4[0]] as Vec3;
  for (const r of DRIVABLE_V4) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], s = segmentDistance([position[0], position[2]], xz(a), xz(b));
    if (s.distance < best) { best = s.distance; out = [s.q[0], a[1] + (b[1] - a[1]) * s.t, s.q[1]]; }
  }
  return out;
}

export const LANDMARKS_V4 = [
  { id: 'L1', p: RIDGE_V4.center, label: 'windmill' },
  { id: 'L2', p: [6.5, -43] as P2, label: 'hunyuan' },
  { id: 'L3', p: CAMP_XZ, label: 'campfire' },
  { id: 'L4', p: [-28, 88] as P2, label: 'lifeguard' },
  { id: 'L5', p: [46, -45] as P2, label: 'park' },
];

/* ------------------------------------------------------------------ terrain integration (environment session) */

/** Lattice for WorldLandform when v4 is active: covers the new outline + beach + shelf (multiples of 4 cells). */
// Includes the expanded north cape and its full beach/shelf; flat interiors still use coarse tiles.
export const TERRAIN_GRID_V4 = { minX: -176, minZ: -456, nx: 912, nz: 1160 };
/** Set to true by the WorldLandform integration patch (it evaluates ridgeHeightV4 itself); until then
 * WorldDistricts draws the ridge as a local terrain patch. Keeping one owner avoids a doubled surface. */
export const LANDFORM_HAS_RIDGE = true;
/** Ridge blocks must stay fine (never the coarse flat-top shortcut). */
export const nearRidgeV4 = (x: number, z: number) => Math.hypot(x - RIDGE_V4.center[0], z - RIDGE_V4.center[1]) < RIDGE_V4.footR + 4;
/** Seawall along the avenue's sea side (replaces the v3 townFactor box). */
export function townFactorV4(x: number, z: number) {
  const s = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  return s(22, 27, x) * s(-60, -52, z) * (1 - s(26, 34, z));
}
/** Paved centrelines + half widths for terrain caps / grass exclusion (every paved road and connector). */
export const TERRAIN_ROADS_V4 = [...ROADS_V4.filter(r => r.cls !== 'foot'), ...CONNECTORS_V4].map(r => ({ id: r.id, pts: r.id === 'hill-road' ? TRAIL_V4 : r.pts, half: paveHalf(r.cls) + .2 }));
const GRID_CELL = 8, GRID_REACH = 7;
type Seg = { a: P2; b: P2; off: number };
const roadIndex = /*#__PURE__*/ lazy(() => {
  const segs: Seg[] = [];
  for (const r of TERRAIN_ROADS_V4) for (let i = 1; i < r.pts.length; i++) segs.push({ a: xz(r.pts[i - 1]), b: xz(r.pts[i]), off: r.half - 5.4 });
  const cells = new Map<string, number[]>();
  segs.forEach((sg, k) => {
    const pad = GRID_REACH + Math.max(0, sg.off);
    const x0 = Math.floor((Math.min(sg.a[0], sg.b[0]) - pad) / GRID_CELL), x1 = Math.floor((Math.max(sg.a[0], sg.b[0]) + pad) / GRID_CELL);
    const z0 = Math.floor((Math.min(sg.a[1], sg.b[1]) - pad) / GRID_CELL), z1 = Math.floor((Math.max(sg.a[1], sg.b[1]) + pad) / GRID_CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const key = i + ',' + j; (cells.get(key) ?? cells.set(key, []).get(key)!).push(k); }
  });
  const extra = pavedV4().filter(p => p.kind !== 'road' && p.kind !== 'side' && p.kind !== 'boardwalk');
  return { segs, cells, extra };
});
/** Drop-in for WorldLandform.roadDistance under v4: distance to the nearest paved road centreline,
 * normalised to the v3 half width (5.4 m) so its 5.3-6.6 m thresholds keep their meaning; 0 inside
 * aprons, lay-by, walks, forecourts, car park and the windmill platform. Values beyond ~7 m are only
 * "far" (grid-indexed: callers only compare against thresholds below that). */
export function roadDistanceV4(x: number, z: number) {
  const idx = roadIndex(), list = idx.cells.get(Math.floor(x / GRID_CELL) + ',' + Math.floor(z / GRID_CELL));
  let best = GRID_REACH + 1;
  if (list) for (const k of list) { const sg = idx.segs[k]; best = Math.min(best, segmentDistance([x, z], sg.a, sg.b).distance - sg.off); }
  if (best > 0) for (const p of idx.extra) if (insidePolygon([x, z], p.pts)) return 0;
  return best;
}
/** Footprints that must stay flat at y = 1 and free of ground scatter (massing, plots, trunks). */
export const keepOutV4 = /*#__PURE__*/ lazy((): [number, number, number, number][] => solidsV4()
  .filter(s => (s.kind === 'massing' || s.kind === 'shelter' || s.kind === 'trunk' || s.kind === 'bench') && !s.seat)
  .map(s => [s.position[0] - s.size[0] / 2, s.position[2] - s.size[2] / 2, s.position[0] + s.size[0] / 2, s.position[2] + s.size[2] / 2] as [number, number, number, number])
  .concat(TREES_V4.filter(t => t[1] < 2).map(([x, , z]) => [x - .6, z - .6, x + .6, z + .6] as [number, number, number, number])));

/* ------------------------------------------------------------------ whole network as one polyline */

/** Sub-polyline of `pts` from point a to point b (both on the polyline), reversed when b precedes a. */
function slicePolyline(pts: Vec3[], a: P2, b: P2): Vec3[] {
  const at = (p: P2) => {
    let run = 0, best = Infinity, s = 0;
    for (let i = 1; i < pts.length; i++) {
      const A = xz(pts[i - 1]), B = xz(pts[i]), L = len(sub(B, A)), d = segmentDistance(p, A, B);
      if (d.distance < best) { best = d.distance; s = run + d.t * L; }
      run += L;
    }
    return s;
  };
  const sa = at(a), sb = at(b), lo = Math.min(sa, sb), hi = Math.max(sa, sb), out: Vec3[] = [];
  const pa = pointAt(pts, lo);
  out.push([pa.p[0], pa.y, pa.p[1]]);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += len(sub(xz(pts[i]), xz(pts[i - 1])));
    if (run > lo + 1e-6 && run < hi - 1e-6) out.push(pts[i]);
  }
  const pb = pointAt(pts, hi);
  out.push([pb.p[0], pb.y, pb.p[1]]);
  return sa <= sb ? out : out.reverse();
}
const road = (id: string) => ROADS_V4.find(r => r.id === id)!.pts;
/** Every drivable road walked once in one continuous polyline (repeats allowed, no off-road jumps).
 * Segments 0-1 are the frozen camp ramp, so WorldLandform's ramp embankment and road caps (which read
 * layout.ROAD_POINTS) keep working; roadDistance / nearestRoadPoint then cover the whole v4 network. */
export const NETWORK_WALK_V4: Vec3[] = (() => {
  const end = (id: string) => xz(road(id)[road(id).length - 1]), start = (id: string) => xz(road(id)[0]);
  const legs: Vec3[][] = [
    road('camp-ramp'), road('camp-road'),
    slicePolyline(road('avenue'), J('J1'), J('J8')),
    slicePolyline(road('ring-north'), J('J8'), J('J5')),
    HILL_DRIVE_V4,
    slicePolyline(road('ring-north'), J('J5'), J('J7')),
    road('ring-west'), road('ring-south'),
    slicePolyline(road('avenue'), J('J1'), J('J2')),
    road('year-street'),
    slicePolyline(road('back-street'), J('J6'), end('back-street')),
    slicePolyline(road('back-street'), end('back-street'), start('back-street')),
    slicePolyline(road('ring-north'), J('J4'), J('J8')),
    slicePolyline(road('avenue'), J('J8'), J('J3')),
    road('bridge-link'), road('bridge'), road('park-spur'),
    [...road('park-spur')].reverse(), [...road('bridge')].reverse(), [...road('bridge-link')].reverse(),
    slicePolyline(road('avenue'), J('J3'), J('J2')),
    road('year-street'), road('west-road'),
  ];
  const out: Vec3[] = [];
  for (const leg of legs) for (const p of leg) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[2] - last[2]) > 1e-4) out.push([+p[0].toFixed(4), +p[1].toFixed(4), +p[2].toFixed(4)]);
  }
  return out;
})();

/* ------------------------------------------------------------------ QA data for bots */

/** Representative splash points off the new shores (north, north-west, west, south-west, south), in
 * deep water: 32 m beyond the control outline, past the widest beach (12 m) plus the longest shelf
 * (18 m) of WorldLandform's shore profile. (At 18 m some points landed on the ~0.5 m deep shelf, where
 * the player wades and a car fords, so no recovery is expected there.) */
export const SHORE_SAMPLES_V4: { id: string; p: P2 }[] = (() => {
  const c: P2 = [-30, -10];
  return ([['north', [-40, -136]], ['north-west', [-114, -116]], ['west', [-122, -15]], ['south-west', [-85, 66]], ['south', [-38, 86]]] as [string, P2][])
    .map(([id, v]) => ({ id, p: add(v, mul(unit(sub(v, c)), 32)) }));
})();
export const heading = (d: P2) => Math.atan2(-d[1], d[0]);
/** Furniture contact fixtures (§12.6): per kind, the first pole whose 12 m straight approach, on the
 * pole's own lateral line, is paved and free of other furniture and fixed solids. The van starts there
 * and drives straight into it. Derived from data, never hand-picked. */
export function furnitureApproachesV4() {
  const out: { id: string; kind: KnockKind; start: Vec3; yaw: number; target: Vec3 }[] = [];
  for (const kind of ['delineator', 'lamp', 'stop', 'signal'] as KnockKind[]) {
    for (const k of knockablesV4().filter(o => o.kind === kind)) {
      const r = ROADS_V4.find(x => x.id === k.road);
      if (!r) continue;
      const tp = xz(k.position);
      let run = 0, best = Infinity, sAt = 0;
      for (let i = 1; i < r.pts.length; i++) {
        const A = xz(r.pts[i - 1]), B = xz(r.pts[i]), L = len(sub(B, A)), d = segmentDistance(tp, A, B);
        if (d.distance < best) { best = d.distance; sAt = run + d.t * L; }
        run += L;
      }
      for (const sign of [1, -1]) {
        const s0 = sAt - sign * 12;
        if (s0 < 0 || s0 > run) continue;
        const q0 = pointAt(r.pts, s0), q1 = pointAt(r.pts, sAt);
        if (dot(q0.dir, q1.dir) < Math.cos(4 * Math.PI / 180)) continue;
        const travel = mul(q1.dir, sign), start = sub(tp, mul(travel, 12));
        const corridor = (p: P2, a: P2, b: P2, r0: number) => segmentDistance(p, a, b).distance < r0;
        if (knockablesV4().some(o => o.id !== k.id && corridor(xz(o.position), start, tp, 2.4))) continue;
        if (allFixed().some(o => solidDistance(start, o) < 2 || [.25, .5, .75].some(t => solidDistance(add(start, mul(sub(tp, start), t)), o) < 1.6))) continue;
        if (![0, .25, .5, .75].every(t => onPavement(add(start, mul(sub(tp, start), t))))) continue;
        if (Object.values(VEHICLE_POSITIONS_V4).some(v => corridor(xz(v.position), start, tp, 4))) continue;
        out.push({ id: k.id, kind, start: [start[0], q0.y + ROAD_CLASSES[r.cls].raise, start[1]], yaw: heading(travel), target: k.position });
        break;
      }
      if (out.some(o => o.kind === kind)) break;
    }
  }
  return out;
}
/** Route data exposed as __worldDebug.layout() so playtest bots never hand-copy coordinates. */
export function layoutQaV4() {
  return {
    version: 'v4' as const,
    timeline: TIMELINE_ROUTE_V4, ring: RING_LOOP_V4, hill: HILL_DRIVE_V4,
    vehicles: VEHICLE_POSITIONS_V4, junctions: JUNCTIONS_V4, shoreSamples: SHORE_SAMPLES_V4,
    knockables: knockablesV4(), turnRadius: TURN_RADIUS, ridge: RIDGE_V4,
    furniture: furnitureApproachesV4(),
    roads: Object.fromEntries(DRIVABLE_V4.map(r => [r.id, r.pts])),
  };
}
