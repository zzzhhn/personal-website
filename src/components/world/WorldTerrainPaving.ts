/**
 * Layout v4 road paving field (terrain session, docs/world/terrain/DESIGN.md §1-§2). Pure TypeScript
 * (no three.js) so tests, the terrain generator and other sessions can query it.
 *
 * Carriageway outline: union of every town / ring road (capsules by carriageway half width), the
 * turn connectors, the lay-by and the car park, then a morphological closing of radius R_CLOSE on that
 * distance field, so every junction gets rounded kerb corners and overlapping junctions (J3 / J8),
 * polyline kinks and short gaps (back street -> car park) merge without hand-made aprons.
 * D(p) = signed distance to the closed carriageway edge (negative inside). Cross-section by D:
 *   D < -0.40          carriageway, ROAD_Y
 *   -0.40 .. 0         gutter pan, drops GUTTER_DROP * k towards the kerb
 *   0 .. 0.12          rolled kerb face, rises to WALK_Y (walkable / drivable, not a wall)
 *   0.12 .. 0.26       kerb stone top
 *   0.26 .. sw         sidewalk pavers at WALK_Y (ring road: flush asphalt shoulder, k = 0)
 * k (0..1) is the kerb factor: 1 on roads with sidewalks, 0 on the ring, faded to 0 at the frozen ramp
 * and bridge joints and at crosswalk kerb ramps. Carriageway tops never change height (ROAD_Y), so
 * nothing already placed on the road moves.
 */
import {
  BUILDINGS_V4, CONNECTORS_V4, decorV4, insidePolygon, TRAIL_HALF, TRAIL_V4, JUNCTIONS_V4, LAYBY, pavedV4, PROMENADE, ROAD_CLASSES, ROAD_Y, ROADS_V4,
  segmentDistance, xz, type P2, type PavedPoly, type RoadV4,
} from './layout-v4';
import type { Vec3 } from './types';

/** Walkable top of sidewalks, kerb tops, forecourts and park paving (contract with town / park / street). */
export const WALK_Y = ROAD_Y + .01;
export const GUTTER_W = .40, KERB_FACE = .12, KERB_TOP = .14, GUTTER_DROP = .10;
/** Outer edge chamfer: sidewalk / shoulder edge falls to the natural ground (y = 1.0) over 0.4 m. */
export const CHAMFER = .4, EDGE_GROUND = ROAD_Y - .14;
export const R_CLOSE = 6;
const CELL = .25, MESH_CELL = .5;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lazy = <T,>(f: () => T) => { let v: T | undefined; return () => (v ??= f()); };
const unit = (a: P2): P2 => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/* ------------------------------------------------------------------ primitives */

/** Road meta used for sidewalk width and kerb factor (softmin over the nearest roads). */
interface Meta { sw: number; k: number }
const META: Record<string, Meta> = {
  avenue: { sw: 2, k: 1 }, collector: { sw: 1.5, k: 1 }, local: { sw: 1.5, k: 1 }, coastal: { sw: 1, k: 0 }, apron: { sw: .3, k: 0 },
};
type Prim = { a: P2; b: P2; hw: number; meta: Meta | null; road: string } | { box: [number, number, number, number]; meta: Meta | null; road: string };

const FIELD_CLASSES = new Set(['avenue', 'collector', 'local', 'coastal']);
const ramp = ROADS_V4.find(r => r.id === 'camp-ramp')!, bridge = ROADS_V4.find(r => r.id === 'bridge')!;
const RAMP_FOOT = xz(ramp.pts[2]), RAMP_DIR = unit([ramp.pts[2][0] - ramp.pts[1][0], ramp.pts[2][2] - ramp.pts[1][2]]);
const BRIDGE_START = xz(bridge.pts[0]), BRIDGE_DIR = unit([bridge.pts[1][0] - bridge.pts[0][0], bridge.pts[1][2] - bridge.pts[0][2]]);
/** Frozen prisms join the field along these lines; the field is not meshed beyond them. */
export const PAVE_CLIPS = [
  { p: RAMP_FOOT, n: RAMP_DIR, keep: 1, reach: 6.5 },       // keep dot(p - foot, dir) >= 0 (camp-road side)
  { p: BRIDGE_START, n: BRIDGE_DIR, keep: -1, reach: 6.5 }, // keep dot(p - start, dir) <= 0 (town side)
];
const clipDist = (x: number, z: number) => {
  // > 0 = kept side (signed distance to the nearest clip line within its lateral reach), Infinity elsewhere.
  let best = Infinity;
  for (const c of PAVE_CLIPS) {
    const dx = x - c.p[0], dz = z - c.p[1], along = (dx * c.n[0] + dz * c.n[1]) * c.keep, lat = Math.abs(dx * c.n[1] - dz * c.n[0]);
    if (lat < c.reach && Math.abs(along) < 30 && Math.abs(along) < Math.abs(best)) best = along;
  }
  return best;
};
export const pavingClipped = (x: number, z: number) => clipDist(x, z) < 0;

const prims = lazy((): Prim[] => {
  const out: Prim[] = [];
  const roads: RoadV4[] = [...ROADS_V4.filter(r => FIELD_CLASSES.has(r.cls) && r.id !== 'bridge-link'), ...CONNECTORS_V4];
  for (const r of roads) {
    const hw = ROAD_CLASSES[r.cls].width / 2, meta = r.cls === 'connector' ? null : META[r.cls];
    for (let i = 1; i < r.pts.length; i++) out.push({ a: xz(r.pts[i - 1]), b: xz(r.pts[i]), hw, meta, road: r.id });
  }
  // Bridge link rebuilt on the bridge's own axis (removes the 18 deg kink at the bridgehead).
  const back = (BRIDGE_START[0] - 21) / BRIDGE_DIR[0];
  out.push({ a: [BRIDGE_START[0] - BRIDGE_DIR[0] * back, BRIDGE_START[1] - BRIDGE_DIR[1] * back], b: BRIDGE_START, hw: 4, meta: META.collector, road: 'bridge-link' });
  // Aprons at the frozen joints, as wide as the frozen deck incl. its flush strips (5.35 m).
  out.push({ a: [BRIDGE_START[0] - BRIDGE_DIR[0] * 4, BRIDGE_START[1] - BRIDGE_DIR[1] * 4], b: BRIDGE_START, hw: 5.35, meta: META.apron, road: 'bridge-apron' });
  out.push({ a: RAMP_FOOT, b: [RAMP_FOOT[0] + RAMP_DIR[0] * 4, RAMP_FOOT[1] + RAMP_DIR[1] * 4], hw: 5.35, meta: META.apron, road: 'ramp-apron' });
  out.push({ box: [LAYBY.x0 - .5, LAYBY.z0, LAYBY.x1, LAYBY.z1], meta: null, road: 'layby' });
  out.push({ box: [-8, 4, 0, 14], meta: META.local, road: 'car-park' });
  return out;
});
function primDist(p: Prim, x: number, z: number): { e: number; lat: number } {
  if ('box' in p) {
    // Rounded box (corner radius 1.5 m) so kerbs around the lay-by and car park have no sharp corners.
    const rr = 1.5, [x0, z0, x1, z1] = p.box, ox = Math.max(x0 + rr - x, x - x1 + rr), oz = Math.max(z0 + rr - z, z - z1 + rr);
    return { e: (ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz)) - rr, lat: 99 };
  }
  const d = segmentDistance([x, z], p.a, p.b), dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], L = Math.hypot(dx, dz) || 1;
  return { e: d.distance - p.hw, lat: ((x - p.a[0]) * dz - (z - p.a[1]) * dx) / L };
}

/* ------------------------------------------------------------------ crosswalks (signal junctions) */

export interface Crosswalk { centre: P2; dir: P2; hw: number; road: string; junction: string; inbound: P2 }
function junctionRoads(jid: string) {
  const j = JUNCTIONS_V4.find(q => q.id === jid)!.p, out: { r: RoadV4; s: number; total: number }[] = [];
  for (const r of ROADS_V4) {
    if (!FIELD_CLASSES.has(r.cls) || r.id === 'bridge-link') continue;
    let run = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const a = xz(r.pts[i - 1]), b = xz(r.pts[i]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), d = segmentDistance(j, a, b);
      if (d.distance < .01) { out.push({ r, s: run + d.t * L, total: 0 }); break; }
      run += L;
    }
  }
  for (const o of out) { let t = 0; for (let i = 1; i < o.r.pts.length; i++) t += Math.hypot(o.r.pts[i][0] - o.r.pts[i - 1][0], o.r.pts[i][2] - o.r.pts[i - 1][2]); o.total = t; }
  return out;
}
function along(pts: Vec3[], s: number) {
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (run + L >= s || i === pts.length - 1) { const t = L ? clamp((s - run) / L, 0, 1) : 0; return { p: [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t] as P2, dir: unit([b[0] - a[0], b[2] - a[2]]), y: a[1] + (b[1] - a[1]) * t }; }
    run += L;
  }
  return { p: xz(pts[0]), dir: [1, 0] as P2, y: pts[0][1] };
}
export const junctionReach = (jid: string) => Math.max(...junctionRoads(jid).map(o => ROAD_CLASSES[o.r.cls].width / 2)) + R_CLOSE;
export const crosswalksV4 = lazy((): Crosswalk[] => {
  const out: Crosswalk[] = [];
  for (const j of JUNCTIONS_V4.filter(q => q.kind === 'signal')) {
    const rs = junctionRoads(j.id);
    for (const o of rs) {
      const other = Math.max(...rs.filter(q => q.r !== o.r).map(q => ROAD_CLASSES[q.r.cls].width / 2), j.id === 'J3' ? 4 : 0);
      for (const sign of [-1, 1]) {
        const s = o.s + sign * (other + R_CLOSE + 2.2);
        if (s < 2 || s > o.total - 2) continue;
        const q = along(o.r.pts, s);
        // Skip if it lands inside another junction's rounded area (J3 / J8 merge).
        if (JUNCTIONS_V4.some(k => k.id !== j.id && Math.hypot(q.p[0] - k.p[0], q.p[1] - k.p[1]) < junctionReach(k.id) + 2)) continue;
        const outward: P2 = [q.dir[0] * sign, q.dir[1] * sign];
        out.push({ centre: q.p, dir: q.dir, hw: ROAD_CLASSES[o.r.cls].width / 2, road: o.r.id, junction: j.id, inbound: [-outward[0], -outward[1]] });
      }
    }
  }
  return out;
});

/* ------------------------------------------------------------------ field grid */

export interface PavingField {
  minX: number; minZ: number; nx: number; nz: number; cell: number;
  /** Signed distance to the closed carriageway edge (m, negative inside). */
  D: Float32Array;
  /** Kerb factor 0..1 (after joint fades and crosswalk ramps). */
  K: Float32Array;
  /** Sidewalk / shoulder width beyond the carriageway edge (m). */
  SW: Float32Array;
  /** Signed lateral offset from the nearest centreline (m), for lane wear. */
  LAT: Float32Array;
  /** Sidewalk presence 0..1 (road type only, before kerb ramps / joint fades): paver vs shoulder shading. */
  W: Float32Array;
  buildMs: number;
}

/** Felzenszwalb 1-D squared distance transform with argmin sites. */
function dt1d(f: Float64Array, n: number, d: Float64Array, site: Int32Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    if (f[q] === Infinity) continue;
    if (f[v[k]] === Infinity) { v[k] = q; continue; }
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = f[v[k]] === Infinity ? Infinity : (q - v[k]) ** 2 + f[v[k]]; site[q] = v[k]; }
}

export const pavingField = lazy((): PavingField => {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const P = prims();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of P) {
    const pts = 'box' in p ? [[p.box[0], p.box[1]], [p.box[2], p.box[3]]] : [p.a, p.b];
    for (const q of pts) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]); }
  }
  const M = 16, minX = Math.floor(x0 - M), minZ = Math.floor(z0 - M), nx = Math.ceil((x1 + M - minX) / CELL), nz = Math.ceil((z1 + M - minZ) / CELL);
  const NX = nx + 1, NZ = nz + 1, N = NX * NZ;
  const U = new Float32Array(N), SW = new Float32Array(N), K = new Float32Array(N), LAT = new Float32Array(N), W = new Float32Array(N);
  // Spatial hash of primitives (8 m cells, reach 14 m).
  const HC = 8, REACH = 14, hash = new Map<number, number[]>();
  const hk = (i: number, j: number) => i * 4096 + j;
  P.forEach((p, k) => {
    const bx = 'box' in p ? [p.box[0], p.box[2]] : [Math.min(p.a[0], p.b[0]) - p.hw, Math.max(p.a[0], p.b[0]) + p.hw];
    const bz = 'box' in p ? [p.box[1], p.box[3]] : [Math.min(p.a[1], p.b[1]) - p.hw, Math.max(p.a[1], p.b[1]) + p.hw];
    for (let i = Math.floor((bx[0] - REACH - minX) / HC); i <= Math.floor((bx[1] + REACH - minX) / HC); i++)
      for (let j = Math.floor((bz[0] - REACH - minZ) / HC); j <= Math.floor((bz[1] + REACH - minZ) / HC); j++) {
        const key = hk(i, j); (hash.get(key) ?? hash.set(key, []).get(key)!).push(k);
      }
  });
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = minX + i * CELL, z = minZ + j * CELL, n = j * NX + i, list = hash.get(hk(Math.floor((x - minX) / HC), Math.floor((z - minZ) / HC)));
    let u = REACH, emin = Infinity, ws = 0, sw = 0, kk = 0, lat = 99;
    if (list) {
      const es: number[] = [];
      for (const k of list) { const d = primDist(P[k], x, z); es.push(d.e); if (d.e < u) u = d.e; if (P[k].meta && d.e < emin) { emin = d.e; lat = d.lat; } }
      list.forEach((k, m) => { const meta = P[k].meta; if (!meta) return; const w = Math.exp(-(es[m] - emin) / 1.2); ws += w; sw += w * meta.sw; kk += w * meta.k; });
    }
    U[n] = u; SW[n] = ws ? sw / ws : 1; K[n] = ws ? smooth(.35, .65, kk / ws) : 0; W[n] = K[n]; LAT[n] = lat;
  }
  // Closing: D = U outside the dilation C = {U <= R}; inside, D = R - dist(p, boundary of C).
  // Boundary segments of C (marching squares on U - R), stored per cell.
  const segs = new Map<number, number[]>();
  const cross = (a: number, b: number) => (R_CLOSE - a) / (b - a);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const n = j * NX + i, v = [U[n], U[n + 1], U[n + 1 + NX], U[n + NX]], inn = v.map(q => q <= R_CLOSE);
    if (inn.every(Boolean) || !inn.some(Boolean)) continue;
    const c: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]], pts: number[] = [];
    for (let e = 0; e < 4; e++) {
      const a = e, b = (e + 1) % 4;
      if (inn[a] !== inn[b]) { const t = cross(v[a], v[b]); pts.push(minX + (i + c[a][0] + (c[b][0] - c[a][0]) * t) * CELL, minZ + (j + c[a][1] + (c[b][1] - c[a][1]) * t) * CELL); }
    }
    segs.set(n, pts);
  }
  // EDT (with sites) from seed nodes just outside C.
  const f = new Float64Array(Math.max(NX, NZ)), d = new Float64Array(Math.max(NX, NZ)), site = new Int32Array(Math.max(NX, NZ));
  const vv = new Int32Array(Math.max(NX, NZ)), zz = new Float64Array(Math.max(NX, NZ) + 1);
  const colD = new Float64Array(N), colRow = new Int32Array(N), feat = new Int32Array(N).fill(-1);
  const inside = (n: number) => U[n] <= R_CLOSE;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const n = j * NX + i;
      const seed = !inside(n) && ((i > 0 && inside(n - 1)) || (i < NX - 1 && inside(n + 1)) || (j > 0 && inside(n - NX)) || (j < NZ - 1 && inside(n + NX)));
      f[j] = seed ? 0 : Infinity;
    }
    dt1d(f, NZ, d, site, vv, zz);
    for (let j = 0; j < NZ; j++) { colD[j * NX + i] = d[j]; colRow[j * NX + i] = site[j]; }
  }
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) f[i] = colD[j * NX + i];
    dt1d(f, NX, d, site, vv, zz);
    for (let i = 0; i < NX; i++) if (d[i] < Infinity) feat[j * NX + i] = colRow[j * NX + site[i]] * NX + site[i];
  }
  const D = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    if (!inside(n)) { D[n] = U[n]; continue; }
    const fs = feat[n];
    if (fs < 0) { D[n] = U[n]; continue; }
    const x = minX + (n % NX) * CELL, z = minZ + Math.floor(n / NX) * CELL, fi = fs % NX, fj = Math.floor(fs / NX);
    let best = Infinity;
    for (let b = fj - 2; b <= fj + 1; b++) for (let a = fi - 2; a <= fi + 1; a++) {
      const s = segs.get(b * NX + a); if (!s) continue;
      best = Math.min(best, segmentDistance([x, z], [s[0], s[1]], [s[2], s[3]]).distance);
    }
    D[n] = best < Infinity ? R_CLOSE - best : U[n];
  }
  // Kerb factor: fade at the frozen joints and ramp down at crosswalk ends.
  const ramps: P2[] = [];
  for (const c of crosswalksV4()) for (const s of [-1, 1]) ramps.push([c.centre[0] - c.dir[1] * s * (c.hw + .3), c.centre[1] + c.dir[0] * s * (c.hw + .3)]);
  for (let n = 0; n < N; n++) {
    if (K[n] <= 0 || D[n] > 8) continue;
    const x = minX + (n % NX) * CELL, z = minZ + Math.floor(n / NX) * CELL;
    let k = K[n] * smooth(1.5, 4.5, clipDist(x, z));
    for (const r of ramps) { const q = Math.hypot(x - r[0], z - r[1]); if (q < 2.6) k *= smooth(1.4, 2.6, q); }
    K[n] = k;
  }
  // Promenade: the avenue's sea-side sidewalk widens to the seawall walk edge.
  for (let n = 0; n < N; n++) {
    const x = minX + (n % NX) * CELL, z = minZ + Math.floor(n / NX) * CELL;
    if (x > 24.4 && x < PROMENADE.x1 + 1 && z < PROMENADE.z0 + 3 && z > PROMENADE.z1 - 3 && D[n] > -1) {
      // Tapered over 3 m at both promenade ends, so the widened walk's edge never steps.
      const taper = smooth(PROMENADE.z1 - 3, PROMENADE.z1, z) * (1 - smooth(PROMENADE.z0, PROMENADE.z0 + 3, z));
      SW[n] = Math.max(SW[n], SW[n] + (PROMENADE.x1 - (x - D[n]) - SW[n]) * taper);
    }
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { minX, minZ, nx, nz, cell: CELL, D, K, SW, LAT, W, buildMs: Math.round(t1 - t0) };
});

/** Bilinear sample of a field channel (Infinity-safe outside: returns `out`). */
export function sampleField(ch: Float32Array, x: number, z: number, out = 99) {
  const F = pavingField(), u = (x - F.minX) / F.cell, v = (z - F.minZ) / F.cell;
  if (u < 0 || v < 0 || u >= F.nx || v >= F.nz) return out;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, NX = F.nx + 1, n = j * NX + i;
  return (ch[n] * (1 - fu) + ch[n + 1] * fu) * (1 - fv) + (ch[n + NX] * (1 - fu) + ch[n + NX + 1] * fu) * fv;
}

/* ------------------------------------------------------------------ cross-section */

/** Profile rows: offset from the gutter line (D = -GUTTER_W), height factor of k, smooth-normal flag. */
const PROFILE: { o: number; y: (k: number) => number }[] = [
  { o: -.7, y: () => 0 },
  { o: 0, y: () => 0 },
  { o: GUTTER_W, y: k => -GUTTER_DROP * k },
  { o: GUTTER_W + .03, y: k => -GUTTER_DROP * .62 * k },
  { o: GUTTER_W + .07, y: k => -GUTTER_DROP * .15 * k },
  { o: GUTTER_W + .105, y: k => .006 * k },
  { o: GUTTER_W + KERB_FACE, y: k => .01 * k },
];
export function profileY(o: number, k: number) {
  if (o <= 0) return 0;
  for (let r = 1; r < PROFILE.length; r++) {
    const a = PROFILE[r - 1], b = PROFILE[r];
    if (o <= b.o) { const t = (o - a.o) / (b.o - a.o); return a.y(k) + (b.y(k) - a.y(k)) * t; }
  }
  return .01 * k;
}
export type PaveKind = 'carriageway' | 'gutter' | 'kerb' | 'sidewalk' | 'shoulder' | 'frozen' | 'deck' | 'forecourt' | 'platform';

/* ------------------------------------------------------------------ frozen prisms + extras */

const FROZEN_ROADS = new Set(['camp-ramp', 'bridge', 'park-spur']);
/** Prisms that keep their layout-v4 geometry (frozen ramp / bridge / park spur, beach boardwalk,
 * windmill pad) plus the building forecourts (town's claim key `building-forecourt`). */
export const pavingPrisms = lazy(() => pavedV4().filter(p => (FROZEN_ROADS.has(p.road) && (p.kind === 'road' || p.kind === 'side'))
  || p.kind === 'boardwalk' || p.kind === 'platform' || p.kind === 'forecourt'));
function prismTop(p: PavedPoly, x: number, z: number) {
  if (!insidePolygon([x, z], p.pts)) return null;
  const [a, b] = p.pts, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  if (!L2 || p.pts.length !== 4) return p.ys[0];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
  return p.ys[0] + (p.ys[1] - p.ys[0]) * t;
}

/* ------------------------------------------------------------------ queries */

/** Walk/drive top of the v4 paving at (x, z), or null off the paving (frozen decks included). */
export function paveTopAt(x: number, z: number): number | null {
  return paveSample(x, z)?.y ?? null;
}
export function paveKindAt(x: number, z: number): PaveKind | null {
  return paveSample(x, z)?.kind ?? null;
}
export function paveSample(x: number, z: number): { y: number; kind: PaveKind } | null {
  for (const p of pavingPrisms()) {
    const y = prismTop(p, x, z);
    if (y !== null) return { y, kind: p.kind === 'boardwalk' ? 'deck' : p.kind === 'platform' ? 'platform' : p.kind === 'forecourt' ? 'forecourt' : 'frozen' };
  }
  if (pavingClipped(x, z)) return null;
  const F = pavingField(), D = sampleField(F.D, x, z);
  if (D <= -GUTTER_W) return { y: ROAD_Y, kind: 'carriageway' };
  const sw = sampleField(F.SW, x, z, 0);
  if (D > sw) return null;
  const k = clamp(sampleField(F.K, x, z, 0), 0, 1), o = D + GUTTER_W;
  const y = ROAD_Y + profileY(o, k);
  const kind: PaveKind = k < .5 ? (D < 0 ? 'carriageway' : 'shoulder') : D < 0 ? 'gutter' : D < KERB_FACE + KERB_TOP ? 'kerb' : 'sidewalk';
  return { y, kind };
}
/** Distance to the hill trail centreline (plan). */
export function trailDistance(x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < TRAIL_V4.length; i++) best = Math.min(best, segmentDistance([x, z], xz(TRAIL_V4[i - 1]), xz(TRAIL_V4[i])).distance);
  return best;
}
/** Height of the paving's outer chamfer foot: natural town ground, except where the dirt hill trail
 * joins the ring (there the shoulder runs flush onto the trail at ROAD_Y). */
export function edgeFootY(_x: number, _z: number) { return EDGE_GROUND; }
/** Distance outside the field paving's outer edge incl. forecourts (negative inside); frozen decks,
 * the boardwalk and the windmill pad are excluded (they carry their own ground). For terrain caps and
 * ground-detail exclusion. */
export function paveClearance(x: number, z: number) {
  for (const p of pavingPrisms()) if (p.kind === 'forecourt' && insidePolygon([x, z], p.pts)) return -1;
  // The frozen-joint clip only limits meshing; the ground under the clipped stub (below the frozen
  // deck's lower end) is still capped / filled, so the clipped chamfer never hangs in the air.
  const F = pavingField(), D = sampleField(F.D, x, z, 99);
  return D - sampleField(F.SW, x, z, 1);
}
/** Top of the paving edge nearest (x, z) (ROAD_Y or WALK_Y by kerb factor), for terrain shoulders. */
export function paveEdgeY(x: number, z: number) {
  return ROAD_Y + .01 * clamp(sampleField(pavingField().K, x, z, 0), 0, 1);
}

/* ------------------------------------------------------------------ mesh */

/** Chunk rule shared with the terrain and districts (west/east of x = -30, north/south of z = -20). */
export const chunkKey = (x: number, z: number) => (x < -30 ? 0 : 1) + (z < -20 ? 0 : 2);
/** Vertex stride: x y z, nx ny nz, mode, o (offset from the gutter line / prism lateral), s (arclength), lat. */
export const PAVE_STRIDE = 10;
/** Shading modes (WorldTerrainRoads shader). */
export const PAVE_MODE = { asphalt: 0, gutter: 1, kerbFace: 2, kerbTop: 3, sidewalk: 4, edge: 5, shoulder: 6, deckAsphalt: 7, deckSlab: 8, wood: 9, pad: 10, forecourt: 11, paint: 12, shoulderEdge: 13 } as const;
export interface PaveChunk {
  key: number;
  v: number[]; top: number[]; walls: number[];
  /** Forecourt prisms (shown / collided while `building-forecourt` is unclaimed). */
  fv: number[]; ftop: number[]; fwalls: number[];
  /** Visual handover only. Original vertices / collider indices remain intact. */
  parkSpurTriangles: number[];
}
const newChunk = (key: number): PaveChunk => ({ key, v: [], top: [], walls: [], fv: [], ftop: [], fwalls: [], parkSpurTriangles: [] });

function clipPolygon(poly: number[][], keep: (p: number[]) => number) {
  // Sutherland-Hodgman against keep(p) >= 0 (linear along edges).
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = keep(a), fb = keep(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push(a.map((v, k) => v + (b[k] - v) * t)); }
  }
  return out;
}
const keepClip = (p: number[]) => { const c = clipDist(p[0], p[2]); return c === Infinity ? 1 : c; };

/** The formal park plaza starts at WorldParkWalk's existing BRIDGE_X=43.6. Clip only the
 * old park-spur visual there after the plaza claims readiness; never alter its collision soup. */
export function parkPlazaPavingVisual(c: PaveChunk) {
  const handover = new Set(c.parkSpurTriangles), out: number[] = [];
  for (let i = 0; i < c.v.length; i += PAVE_STRIDE * 3) {
    if (!handover.has(i / PAVE_STRIDE)) { out.push(...c.v.slice(i, i + PAVE_STRIDE * 3)); continue; }
    const tri = [0, 1, 2].map(k => c.v.slice(i + k * PAVE_STRIDE, i + (k + 1) * PAVE_STRIDE));
    const poly = clipPolygon(tri, p => 43.6 - p[0]);
    for (let k = 1; k < poly.length - 1; k++) out.push(...poly[0], ...poly[k], ...poly[k + 1]);
  }
  return out;
}

/** Douglas-Peucker on an open/closed point chain (xz). */
function simplify(pts: P2[], eps: number, closed: boolean): P2[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  if (closed) { const m = Math.floor(pts.length / 2); keep[m] = 1; stack.length = 0; stack.push([0, m], [m, pts.length - 1]); }
  while (stack.length) {
    const [a, b] = stack.pop()!; let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) { const d = segmentDistance(pts[i], pts[a], pts[b]).distance; if (d > best) { best = d; bi = i; } }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Gutter-line contours (D = -GUTTER_W) as point chains. */
function gutterContours(F: PavingField): { pts: P2[]; closed: boolean }[] {
  const NX = F.nx + 1, L = -GUTTER_W, D = F.D;
  const point = new Map<number, P2>();
  const edgePt = (id: number): P2 => {
    let p = point.get(id); if (p) return p;
    const h = id < NX * (F.nz + 1);
    const n = h ? id : id - NX * (F.nz + 1), i = n % NX, j = Math.floor(n / NX), m = h ? n + 1 : n + NX;
    const t = (L - D[n]) / (D[m] - D[n]);
    p = h ? [F.minX + (i + t) * F.cell, F.minZ + j * F.cell] : [F.minX + i * F.cell, F.minZ + (j + t) * F.cell];
    point.set(id, p); return p;
  };
  const VOFF = NX * (F.nz + 1), adj = new Map<number, number[]>();
  const link = (a: number, b: number) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (let j = 0; j < F.nz; j++) for (let i = 0; i < F.nx; i++) {
    const n = j * NX + i, v = [D[n], D[n + 1], D[n + 1 + NX], D[n + NX]];
    const c = (v[0] <= L ? 1 : 0) | (v[1] <= L ? 2 : 0) | (v[2] <= L ? 4 : 0) | (v[3] <= L ? 8 : 0);
    if (c === 0 || c === 15) continue;
    // Edges: 0 top (n -> n+1), 1 right (n+1 -> n+1+NX), 2 bottom (n+NX -> n+NX+1), 3 left (n -> n+NX).
    const E = [n, VOFF + n + 1, n + NX, VOFF + n];
    const pairs: Record<number, [number, number][]> = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
    };
    let pr = pairs[c];
    if (c === 5 || c === 10) {
      const centre = (v[0] + v[1] + v[2] + v[3]) / 4 <= L;
      pr = c === 5 ? (centre ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]]) : (centre ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]]);
    }
    for (const [a, b] of pr) link(E[a], E[b]);
  }
  const seen = new Set<number>(), out: { pts: P2[]; closed: boolean }[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    // Walk to an end first (open chains), then collect.
    let s = start;
    { let prev = -1, cur = start; const guard = new Set<number>([cur]);
      for (;;) { const nx = (adj.get(cur) ?? []).filter(q => q !== prev); if (nx.length < 1 || (adj.get(cur)!.length === 1 && prev !== -1)) break; const q = nx[0]; if (guard.has(q)) break; guard.add(q); prev = cur; cur = q; if ((adj.get(cur) ?? []).length === 1) break; }
      if ((adj.get(cur) ?? []).length === 1) s = cur; }
    const chain: number[] = [s]; seen.add(s);
    let prev = -1, cur = s, closed = false;
    for (;;) {
      const nb = (adj.get(cur) ?? []).filter(q => q !== prev);
      const q = nb.find(r => !seen.has(r));
      if (q === undefined) { closed = nb.includes(s) && chain.length > 2; break; }
      chain.push(q); seen.add(q); prev = cur; cur = q;
    }
    out.push({ pts: chain.map(edgePt), closed });
  }
  return out;
}

export const pavingMesh = lazy(() => {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const F = pavingField(), NX = F.nx + 1, chunks = new Map<number, PaveChunk>(), M = PAVE_MODE;
  const chunk = (x: number, z: number) => { const k = chunkKey(x, z); return chunks.get(k) ?? chunks.set(k, newChunk(k)).get(k)!; };
  /** Vertex = [x, y, z, nx, ny, nz, o, s, lat] (mode is per triangle). */
  type V = number[];
  const pushTri = (c: PaveChunk, a: V, b: V, d: V, mode: number, collide: 'top' | 'walls' | null, fore = false) => {
    // Wind every triangle so its geometric normal agrees with the supplied vertex normals (front face
    // = visible side; also the side Rapier's one-sided queries expect).
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * (a[3] + b[3] + d[3]) + gy * (a[4] + b[4] + d[4]) + gz * (a[5] + b[5] + d[5]) < 0) { const t = b; b = d; d = t; }
    const arr = fore ? c.fv : c.v, base = arr.length / PAVE_STRIDE;
    for (const q of [a, b, d]) arr.push(q[0], q[1], q[2], q[3], q[4], q[5], mode, q[6], q[7], q[8]);
    const list = collide === 'top' ? (fore ? c.ftop : c.top) : collide === 'walls' ? (fore ? c.fwalls : c.walls) : null;
    if (list) list.push(base, base + 1, base + 2);
  };
  const fieldV = (x: number, z: number): V => [x, ROAD_Y - .002, z, 0, 1, 0, sampleField(F.D, x, z) + GUTTER_W, 0, sampleField(F.LAT, x, z, 0)];
  // 1) Carriageway interior: 0.5 m cells whose corners all lie at D <= -0.25 (row runs merged); the
  // kerb strips start 0.6 m inside the gutter line, so the coplanar overlap hides the staircase.
  const step = Math.round(MESH_CELL / F.cell), Dn = (i: number, j: number) => F.D[j * NX + i];
  let cellTris = 0;
  for (let j = 0; j + step <= F.nz; j += step) {
    let runStart = -1;
    const za = F.minZ + j * F.cell, zb = za + MESH_CELL;
    const flush = (iEnd: number) => {
      if (runStart < 0) return;
      // Long runs keep 4 m vertex spacing so lateral wear attributes still interpolate.
      for (let i0 = runStart; i0 < iEnd; i0 += step * 8) {
        const i1 = Math.min(iEnd, i0 + step * 8), xa = F.minX + i0 * F.cell, xb = F.minX + i1 * F.cell, c = chunk((xa + xb) / 2, (za + zb) / 2);
        const A = fieldV(xa, za), B = fieldV(xa, zb), C = fieldV(xb, zb), D = fieldV(xb, za);
        pushTri(c, A, B, C, M.asphalt, 'top'); pushTri(c, A, C, D, M.asphalt, 'top'); cellTris += 2;
      }
      runStart = -1;
    };
    for (let i = 0; i + step <= F.nx; i += step) {
      const xc = F.minX + (i + step / 2) * F.cell, zc = (za + zb) / 2;
      const ok = Dn(i, j) <= -.5 && Dn(i + step, j) <= -.5 && Dn(i, j + step) <= -.5 && Dn(i + step, j + step) <= -.5;
      const corners = [[i, j], [i + step, j], [i + step, j + step], [i, j + step]].map(([a, b]) => fieldV(F.minX + a * F.cell, F.minZ + b * F.cell));
      const clipped = corners.some(p => keepClip(p) < .01);
      const boundary = runStart >= 0 && chunkKey(xc, zc) !== chunkKey(F.minX + (runStart + step / 2) * F.cell, zc);
      if (!ok || clipped || boundary) flush(i);
      if (ok && clipped) {
        const poly = clipPolygon(corners, keepClip);
        if (poly.length >= 3) { const c = chunk(xc, zc); for (let t = 1; t < poly.length - 1; t++) { pushTri(c, poly[0], poly[t + 1], poly[t], M.asphalt, 'top'); cellTris++; } }
        continue;
      }
      if (ok && runStart < 0) runStart = i;
    }
    flush(F.nx - (F.nx % step));
  }
  // 2) Gutter / kerb / sidewalk strips along the simplified gutter contours.
  let stripTris = 0;
  const Dat = (x: number, z: number) => sampleField(F.D, x, z);
  for (const ch of gutterContours(F)) {
    const pts = simplify(ch.pts, .02, ch.closed), n = pts.length;
    if (n < 2) continue;
    const segN: P2[] = [];
    for (let i = 0; i < n - 1; i++) { const d = unit([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]); segN.push([-d[1], d[0]]); }
    if (ch.closed) { const d = unit([pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]]); segN.push([-d[1], d[0]]); }
    const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    const sgn = Dat(mid[0] + segN[0][0] * .2, mid[1] + segN[0][1] * .2) > Dat(mid[0] - segN[0][0] * .2, mid[1] - segN[0][1] * .2) ? 1 : -1;
    const vN: P2[] = pts.map((_, i) => {
      const a = ch.closed ? segN[(i - 1 + segN.length) % segN.length] : segN[Math.max(0, i - 1)], b = ch.closed ? segN[i % segN.length] : segN[Math.min(segN.length - 1, i)];
      const m = unit([a[0] + b[0], a[1] + b[1]]), c = Math.max(.5, m[0] * b[0] + m[1] * b[1]);
      return [m[0] * sgn / c, m[1] * sgn / c];
    });
    let arc = 0;
    const rows = pts.map((p, i) => {
      if (i) arc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const nn = vN[i], k = clamp(sampleField(F.K, p[0], p[1], 0), 0, 1), w = sampleField(F.W, p[0], p[1], 0), m = Math.hypot(nn[0], nn[1]);
      let sw = sampleField(F.SW, p[0] + nn[0] * .4, p[1] + nn[1] * .4, 1);
      sw = Math.max(sw, KERB_FACE + KERB_TOP + .04);
      const offs = [...PROFILE.map(r => r.o), GUTTER_W + KERB_FACE + KERB_TOP, GUTTER_W + sw, GUTTER_W + sw + CHAMFER];
      const top = .01 * k, ys = [...PROFILE.map(r => r.y(k)), top, top, edgeFootY(p[0] + nn[0] * (GUTTER_W + sw + CHAMFER), p[1] + nn[1] * (GUTTER_W + sw + CHAMFER)) - ROAD_Y];
      const v = offs.map((o, r) => [p[0] + nn[0] * o, ROAD_Y + ys[r], p[1] + nn[1] * o]);
      return { v, ys, offs, nn: [nn[0] / m, nn[1] / m] as P2, k, w, arc, lat: sampleField(F.LAT, p[0], p[1], 0) };
    });
    type Row = typeof rows[number];
    const bandNormal = (R: Row, s: number) => { const l = Math.hypot(s, 1); return [-s * R.nn[0] / l, 1 / l, -s * R.nn[1] / l]; };
    const slope = (R: Row, r: number) => (R.ys[r + 1] - R.ys[r]) / (R.offs[r + 1] - R.offs[r]);
    // Rolled kerb face (bands 2..5) gets smoothed vertex normals; other bands stay crisp.
    const vtx = (R: Row, r: number, band: number): V => {
      const nrm = band >= 2 && band <= 5 && r >= 3 && r <= 5 ? bandNormal(R, (slope(R, r - 1) + slope(R, r)) / 2) : bandNormal(R, slope(R, band));
      return [...R.v[r], ...nrm, R.offs[r], R.arc, R.lat];
    };
    const BAND_MODE = [M.asphalt, M.gutter, M.kerbFace, M.kerbFace, M.kerbFace, M.kerbFace, M.kerbTop, M.sidewalk, M.edge];
    const segs = ch.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const A = rows[i], B = rows[(i + 1) % n];
      if (ch.closed && i === n - 1) B.arc = A.arc + Math.hypot(B.v[1][0] - A.v[1][0], B.v[1][2] - A.v[1][2]);
      const flat = A.k < .02 && B.k < .02, walk = A.w > .5 || B.w > .5;
      for (let r = 0; r < A.v.length - 1; r++) {
        if (flat && !walk && r === 1) { quadOut([vtx(A, 1, 1), vtx(B, 1, 1), vtx(B, 8, 7), vtx(A, 8, 7)], M.shoulder, 'top'); r = 7; continue; }
        if (r === 8) { quadOut([vtx(A, 8, 8), vtx(B, 8, 8), vtx(B, 9, 8), vtx(A, 9, 8)], walk ? M.edge : M.shoulderEdge, 'top'); continue; }
        if (flat && walk && r === 1) { quadOut([vtx(A, 1, 1), vtx(B, 1, 1), vtx(B, 6, 5), vtx(A, 6, 5)], M.gutter, 'top'); r = 5; continue; }
        quadOut([vtx(A, r, r), vtx(B, r, r), vtx(B, r + 1, r), vtx(A, r + 1, r)], BAND_MODE[r], 'top');
      }
      // Short skirt below the edge chamfer foot (solid), hidden by the terrain shoulder.
      const a = A.v[A.v.length - 1], b = B.v[B.v.length - 1], wn = [A.nn[0], 0, A.nn[1]], o = A.offs[A.offs.length - 1];
      quadOut([[...a, ...wn, o, A.arc, 0], [...b, ...wn, o, B.arc, 0], [b[0], b[1] - .2, b[2], ...wn, o + .2, B.arc, 0], [a[0], a[1] - .2, a[2], ...wn, o + .2, A.arc, 0]], M.edge, 'walls');
    }
    function quadOut(q: V[], mode: number, kind: 'top' | 'walls') {
      let poly = q;
      if (poly.some(p => keepClip(p) < 0)) {
        poly = clipPolygon(poly, keepClip);
        if (poly.length < 3) return;
      }
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[2], 0) / poly.length, c = chunk(cx, cz);
      for (let t = 1; t < poly.length - 1; t++) { pushTri(c, poly[0], poly[t + 1], poly[t], mode, kind); stripTris++; }
    }
  }
  // 3) Prisms (frozen decks, boardwalk, windmill pad, forecourts): top + outward walls, joint walls skipped.
  const UP = [0, 1, 0];
  for (const p of pavingPrisms()) {
    const fore = p.kind === 'forecourt';
    const mode = p.kind === 'road' ? M.deckAsphalt : p.kind === 'side' ? M.deckSlab : p.kind === 'boardwalk' ? M.wood : p.kind === 'platform' ? M.pad : M.forecourt;
    let area = 0; for (let i = 0; i < p.pts.length; i++) { const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const order = area < 0 ? [...p.pts.keys()].reverse() : [...p.pts.keys()];
    // Local frame: s along the first edge (road direction for strips), o across it.
    const td = unit([p.pts[1][0] - p.pts[0][0], p.pts[1][1] - p.pts[0][1]]), nd: P2 = [-td[1], td[0]];
    const os = p.pts.map(q => (q[0] - p.pts[0][0]) * nd[0] + (q[1] - p.pts[0][1]) * nd[1]), oMid = (Math.max(...os) + Math.min(...os)) / 2;
    const local = (x: number, z: number) => { const o = (x - p.pts[0][0]) * nd[0] + (z - p.pts[0][1]) * nd[1]; return [o, x * td[0] + z * td[1], o - oMid]; };
    const T = order.map(i => [p.pts[i][0], p.ys[i], p.pts[i][1]]), B = T.map(v => [v[0], v[1] - p.thickness, v[2]]);
    const cx = T.reduce((s, v) => s + v[0], 0) / T.length, cz = T.reduce((s, v) => s + v[2], 0) / T.length, c = chunk(cx, cz);
    const tv = (v: number[], nrm: number[]): V => [...v, ...nrm, ...local(v[0], v[2])];
    const startVertex = c.v.length / PAVE_STRIDE;
    for (let i = 1; i < T.length - 1; i++) pushTri(c, tv(T[0], UP), tv(T[i + 1], UP), tv(T[i], UP), mode, 'top', fore);
    for (let i = 0; i < T.length; i++) {
      const j = (i + 1) % T.length;
      const onClip = PAVE_CLIPS.some(cl => [T[i], T[j]].every(v => Math.abs((v[0] - cl.p[0]) * cl.n[0] + (v[2] - cl.p[1]) * cl.n[1]) < .2));
      if (onClip) continue;
      const ex = T[j][0] - T[i][0], ez = T[j][2] - T[i][2], el = Math.hypot(ex, ez) || 1, wn = [ez / el, 0, -ex / el];
      pushTri(c, tv(T[i], wn), tv(T[j], wn), tv(B[j], wn), mode, 'walls', fore); pushTri(c, tv(T[i], wn), tv(B[j], wn), tv(B[i], wn), mode, 'walls', fore);
    }
    if (p.road === 'park-spur') for (let i = startVertex; i < c.v.length / PAVE_STRIDE; i += 3) c.parkSpurTriangles.push(i);
  }
  // 4) Boardwalk stilts (visual only, as the greybox decor): 8-sided posts.
  for (const d of decorV4().filter(q => q.color === '#6E5642')) {
    const c = chunk(d.position[0], d.position[2]), r = d.size[0] / 2, y0 = d.position[1] - d.size[1] / 2, y1 = d.position[1] + d.size[1] / 2;
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2, am = (a0 + a1) / 2, nrm = [Math.cos(am), 0, Math.sin(am)];
      const P = (a: number, y: number): V => [d.position[0] + Math.cos(a) * r, y, d.position[2] + Math.sin(a) * r, ...nrm, a * r, y, 0];
      pushTri(c, P(a0, y1), P(a1, y1), P(a1, y0), M.wood, null); pushTri(c, P(a0, y1), P(a1, y0), P(a0, y0), M.wood, null);
    }
  }
  // 5) Road paint (visual only, 12 mm proud of the deck so it never depth-fights at any distance).
  const paint = markingsV4();
  for (let i = 0; i < paint.length; i += 9) {
    const P = [0, 1, 2].map(k => [paint[i + k * 3], paint[i + k * 3 + 1] + .008, paint[i + k * 3 + 2], 0, 1, 0, 0, 0, 0]);
    pushTri(chunk((P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][2] + P[1][2] + P[2][2]) / 3), P[0], P[1], P[2], M.paint, null);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { chunks: [...chunks.values()], stats: { cellTris, stripTris, buildMs: Math.round(t1 - t0), fieldMs: F.buildMs } };
});

/* ------------------------------------------------------------------ markings */

/** Flat marking quads (x, z per vertex; y = deck top + lift): centre dashes, ring edge lines, zebra
 * crosswalks and stop lines. Junction areas (reach) are skipped for lane lines. */
export const markingsV4 = lazy(() => {
  const tris: number[] = [];
  const lift = .004;
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => { tris.push(...a, ...c, ...b, ...a, ...d, ...c); };
  const reach = Object.fromEntries(JUNCTIONS_V4.map(j => [j.id, junctionReach(j.id)]));
  const inJunction = (p: P2, extra: number) => JUNCTIONS_V4.some(j => Math.hypot(p[0] - j.p[0], p[1] - j.p[1]) < reach[j.id] + extra);
  const ribbon = (pts: Vec3[], s0: number, s1: number, off: number, w: number) => {
    const n = Math.max(1, Math.ceil((s1 - s0) / .5));
    let prev: { l: Vec3; r: Vec3 } | null = null;
    for (let i = 0; i <= n; i++) {
      const q = along(pts, s0 + (s1 - s0) * i / n), rx = -q.dir[1], rz = q.dir[0];
      const cx = q.p[0] + rx * off, cz = q.p[1] + rz * off, y = q.y + lift;
      const cur = { l: [cx - rx * w / 2, y, cz - rz * w / 2] as Vec3, r: [cx + rx * w / 2, y, cz + rz * w / 2] as Vec3 };
      if (prev) quad(prev.l, prev.r, cur.r, cur.l);
      prev = cur;
    }
  };
  const len = (pts: Vec3[]) => { let t = 0; for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); return t; };
  for (const r of ROADS_V4) {
    if (!FIELD_CLASSES.has(r.cls) && r.cls !== 'bridge' && r.cls !== 'ramp') continue;
    if (r.id === 'bridge-link') continue;
    const total = len(r.pts), frozen = r.cls === 'bridge' || r.cls === 'ramp';
    const dash = r.cls === 'local' ? 2 : 3, period = r.cls === 'local' ? 5 : 7.5;
    for (let s = 1; s + dash < total - 1; s += period) {
      const q0 = along(r.pts, s), q1 = along(r.pts, s + dash);
      if (!frozen && (inJunction(q0.p, 4) || inJunction(q1.p, 4))) continue;
            ribbon(r.pts, s, s + dash, 0, .14);
    }
    // Solid edge lines on the kerbless ring and on the frozen decks (asphalt / strip boundary).
    if (r.cls === 'coastal' || frozen) {
      const hw = ROAD_CLASSES[r.cls].width / 2 - .2;
      let runStart = -1;
      for (let s = 0; s <= total; s += 1) {
        const ok = frozen || !inJunction(along(r.pts, s).p, 2);
        if (ok && runStart < 0) runStart = s;
        if ((!ok || s + 1 > total) && runStart >= 0) { const e = ok ? total : s; if (e - runStart > 1) for (const side of [-1, 1]) ribbon(r.pts, runStart, e, side * hw, .12); runStart = -1; }
      }
    }
  }
  // Zebra crosswalks and stop lines.
  for (const c of crosswalksV4()) {
    const rx = -c.dir[1], rz = c.dir[0], y = ROAD_Y + lift;
    for (let w = -c.hw + .6; w <= c.hw - .6 + 1e-6; w += 1) {
      const cx = c.centre[0] + rx * w, cz = c.centre[1] + rz * w;
      const a: Vec3 = [cx - c.dir[0] * 1.5 - rx * .25, y, cz - c.dir[1] * 1.5 - rz * .25], b: Vec3 = [cx + c.dir[0] * 1.5 - rx * .25, y, cz + c.dir[1] * 1.5 - rz * .25];
      quad(a, b, [b[0] + rx * .5, y, b[2] + rz * .5], [a[0] + rx * .5, y, a[2] + rz * .5]);
    }
    // Stop line across the inbound lane (right of inbound travel, right-hand traffic), 1.4 m upstream.
    const ib = c.inbound, rr: P2 = [-ib[1], ib[0]], sx = c.centre[0] - ib[0] * 2.9, sz = c.centre[1] - ib[1] * 2.9, w1 = c.hw - .35;
    const p0: Vec3 = [sx + rr[0] * .15, y, sz + rr[1] * .15], p1: Vec3 = [sx + rr[0] * w1, y, sz + rr[1] * w1];
    quad(p0, p1, [p1[0] - ib[0] * .4, y, p1[2] - ib[1] * .4], [p0[0] - ib[0] * .4, y, p0[2] - ib[1] * .4]);
  }
  return new Float32Array(tris);
});

/** Building forecourt ids in order (for town: forecourt polygons stay in layout-v4 pavedV4). */
export const FORECOURT_IDS = BUILDINGS_V4.map(b => b.id);

/* ------------------------------------------------------------------ terrain coupling */

const FROZEN_LINES = lazy(() => ROADS_V4.filter(r => FROZEN_ROADS.has(r.id)).flatMap(r => r.pts.slice(1).map((b, i) => ({ a: xz(r.pts[i]), b: xz(b), half: 5.35 }))));
const PAD = lazy(() => pavedV4().filter(p => p.kind === 'platform'));
/** Drop-in for WorldLandform.roadDistance under v4 (5.4 = paved outer edge incl. chamfer, as in v3):
 * field paving by its real outline, frozen decks / trail by their half widths, 0 on the windmill pad. */
export function groundRoadDistance(x: number, z: number) {
  let best = 5.5 + paveClearance(x, z) - CHAMFER;
  if (best < 5.2) return best;
  for (const l of FROZEN_LINES()) best = Math.min(best, segmentDistance([x, z], l.a, l.b).distance - l.half + 5.4);
  if (z < -50) best = Math.min(best, trailDistance(x, z) - TRAIL_HALF - .5 + 5.4);
  if (PAD().some(p => insidePolygon([x, z], p.pts))) return 0;
  return best;
}
/** Terrain cap / fill against the field paving. Returns [cap, floor] (Infinity / -Infinity when far):
 * under the paving the ground stays 3 cm below the top, under the outer chamfer it follows the chamfer,
 * beyond it the ground may rise again at 64 deg (cut) and must not drop below the chamfer foot for the
 * first 0.3 m (fill), so no paving edge hangs in the air. */
export function pavingGround(x: number, z: number): [number, number] {
  const c = paveClearance(x, z);
  if (c > CHAMFER + 3) return [Infinity, -Infinity];
  const top = paveEdgeY(x, z), foot = edgeFootY(x, z);
  const t = clamp(c / CHAMFER, 0, 1), surf = top + (foot - top) * t;
  const cap = c <= CHAMFER ? surf - .03 : foot - .03 + (c - CHAMFER) * 2.05;
  const floor = c <= CHAMFER + .3 ? Math.min(surf, foot) - .05 : -Infinity;
  return [cap, floor];
}
