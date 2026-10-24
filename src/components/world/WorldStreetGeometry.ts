/**
 * Street props: procedural L1 geometry primitives (street session). Pure three.js geometry, no
 * scene objects, so node QA (tools/world/street/qa-runtime.mjs) can rebuild and inspect every asset.
 *
 * Every vertex carries: position, normal, color (linear), aMat = (roughness, metalness, glow code,
 * sign flag) and aSuv (sign-face uv, 0..1 inside the face). Glow codes are read by WorldStreetMaterial:
 * 1 warm lamp lens, 2 cyan light-tech strip, 3/4/5 signal red/amber/green, 6 retro reflector.
 * Hard props are closed shells with chamfered edges (one-segment bevel, flat normals); round parts are
 * lathes / tubes with smooth normals and creases above `smooth` degrees.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint32BufferAttribute, Vector3, Euler } from 'three';

export type V3 = [number, number, number];
export interface Surf { color: string; rough: number; metal: number; glow?: number; sign?: boolean }

/** Material vocabulary (Art Lock v1 §4: matte paint, frosted stone, light wood, canvas, frosted glass, glow strip;
 * "metal not highly reflective": metalness <= .4, roughness >= .5). */
export const S = {
  slate: { color: '#4E647D', rough: .6, metal: .22 },
  slateDark: { color: '#3B4C5E', rough: .62, metal: .24 },
  iron: { color: '#5E5B57', rough: .64, metal: .32 },
  galv: { color: '#9A958C', rough: .58, metal: .3 },
  cream: { color: '#E6DCCB', rough: .74, metal: .04 },
  creamPaint: { color: '#E6DCCB', rough: .6, metal: .12 },
  stoneLight: { color: '#B4A896', rough: .93, metal: 0 },
  stone: { color: '#8C8276', rough: .95, metal: 0 },
  stoneDark: { color: '#6F675E', rough: .96, metal: 0 },
  stoneCream: { color: '#D9D2C2', rough: .9, metal: 0 },
  slab: { color: '#A39B89', rough: .94, metal: 0 },
  woodLight: { color: '#B99469', rough: .74, metal: 0 },
  woodMid: { color: '#8E6E55', rough: .78, metal: 0 },
  woodDark: { color: '#5A4634', rough: .82, metal: 0 },
  brick: { color: '#8E6E55', rough: .86, metal: 0 },
  roof: { color: '#8A5A44', rough: .84, metal: 0 },
  orange: { color: '#E8803A', rough: .66, metal: .04 },
  glass: { color: '#C9D3D6', rough: .38, metal: 0 },
  lensWarm: { color: '#FFE2B0', rough: .3, metal: 0, glow: 1 },
  cyan: { color: '#4FD1C5', rough: .4, metal: 0, glow: 2 },
  lensRed: { color: '#7A2A24', rough: .25, metal: 0, glow: 3 },
  lensAmber: { color: '#7A5A1E', rough: .25, metal: 0, glow: 4 },
  lensGreen: { color: '#1F5A3A', rough: .25, metal: 0, glow: 5 },
  reflectOrange: { color: '#E8803A', rough: .45, metal: 0, glow: 6 },
  reflectCream: { color: '#EFE6D6', rough: .45, metal: 0, glow: 6 },
  black: { color: '#26282A', rough: .7, metal: .1 },
  rubber: { color: '#2E2C2A', rough: .9, metal: 0 },
} satisfies Record<string, Surf>;

const tmpC = new Color();
const va = new Vector3(), vb = new Vector3(), vc = new Vector3();

export class Builder {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; mat: number[] = []; suv: number[] = []; idx: number[] = [];
  /** Collision parts: vertex ranges [start, end) grouped into convex hulls for dynamic bodies;
   * collide=false ranges (lenses, decals, tiny bolts) are visual only. */
  parts: { name: string; start: number; end: number; collide: boolean }[] = [];
  /** Sign-face uv remap (atlas cell in 0..1 texture space: u0, v0, du, dv). */
  cell: [number, number, number, number] = [0, 0, 1, 1];
  private m = new Matrix4(); private n = new Matrix3();
  private stack: Matrix4[] = [];
  /** Start a new collision part (closes the previous one). */
  part(name: string, collide = true) {
    const v = this.pos.length / 3, last = this.parts[this.parts.length - 1];
    if (last && last.end < 0) last.end = v;
    this.parts.push({ name, start: v, end: -1, collide });
  }
  /** Hull point clouds (local space) for every colliding part. */
  hulls(): Float32Array[] {
    const v = this.pos.length / 3;
    return this.parts.filter(p => p.collide).map(p => new Float32Array(this.pos.slice(p.start * 3, (p.end < 0 ? v : p.end) * 3))).filter(a => a.length >= 12);
  }
  /** Run fn with an extra local transform (composed on the current one). */
  at(matrix: Matrix4, fn: () => void) {
    this.stack.push(this.m.clone());
    this.m.multiply(matrix); this.n.getNormalMatrix(this.m);
    try { fn(); } finally { this.m.copy(this.stack.pop()!); this.n.getNormalMatrix(this.m); }
  }
  /** Convenience: translate + Euler rotation (+ uniform scale). */
  tr(p: V3, r: V3 = [0, 0, 0], fn: () => void, s = 1) {
    this.at(new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2], 'YXZ')), new Vector3(s, s, s)), fn);
  }
  vert(p: V3, nrm: V3, s: Surf, uv: [number, number] = [0, 0]) {
    va.set(p[0], p[1], p[2]).applyMatrix4(this.m);
    vb.set(nrm[0], nrm[1], nrm[2]).applyMatrix3(this.n).normalize();
    tmpC.set(s.color);
    this.pos.push(va.x, va.y, va.z); this.nrm.push(vb.x, vb.y, vb.z); this.col.push(tmpC.r, tmpC.g, tmpC.b);
    this.mat.push(s.rough, s.metal, s.glow ?? 0, s.sign ? 1 : 0);
    // Sign faces sample the runtime atlas: v is flipped because canvas rows grow downward.
    if (s.sign) this.suv.push(this.cell[0] + uv[0] * this.cell[2], 1 - (this.cell[1] + (1 - uv[1]) * this.cell[3])); else this.suv.push(0, 0);
    return this.pos.length / 3 - 1;
  }
  /** Triangle, wound so its geometric normal agrees with its vertex normals. */
  tri(a: number, b: number, c: number) {
    const P = this.pos, N = this.nrm;
    va.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
    vb.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
    vc.crossVectors(va, vb);
    const dot = vc.x * (N[a * 3] + N[b * 3] + N[c * 3]) + vc.y * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + vc.z * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
    if (dot < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  /** Flat convex polygon (fan) with one normal; `out` = expected outward direction (local). */
  face(pts: V3[], s: Surf, out?: V3, uvs?: [number, number][]) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (out && nx * out[0] + ny * out[1] + nz * out[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const ids = pts.map((p, i) => this.vert(p, [nx, ny, nz], s, uvs?.[i]));
    for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1]);
    l = 0; return ids;
  }
  get triangles() { return this.idx.length / 3; }
  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new Float32BufferAttribute(this.mat, 4));
    g.setAttribute('aSuv', new Float32BufferAttribute(this.suv, 2));
    g.setIndex(new Uint32BufferAttribute(this.idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------------------------------------------ boxes */

/** Box from min to max corner with a one-segment chamfer `b` on every edge (44 triangles; 12 when b = 0). */
export function box(B: Builder, min: V3, max: V3, s: Surf, b = 0, faces?: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', Surf | null>>) {
  const c: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h: V3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  b = Math.min(b, h[0] * .45, h[1] * .45, h[2] * .45);
  const P = (sx: number, sy: number, sz: number, axis: number): V3 => {
    const o: V3 = [sx * (h[0] - b), sy * (h[1] - b), sz * (h[2] - b)];
    o[axis] = [sx, sy, sz][axis] * h[axis];
    return [c[0] + o[0], c[1] + o[1], c[2] + o[2]];
  };
  const key = ['x', 'y', 'z'];
  for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
    const surf = faces?.[`${sg > 0 ? 'p' : 'n'}${key[a]}` as 'px'];
    if (surf === null) continue;
    const u = (a + 1) % 3, v = (a + 2) % 3, pts: V3[] = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const sgn = [0, 0, 0]; sgn[a] = sg; sgn[u] = su; sgn[v] = sv; pts.push(P(sgn[0], sgn[1], sgn[2], a)); }
    const out: V3 = [0, 0, 0]; out[a] = sg;
    B.face(pts, surf ?? s, out);
  }
  if (b <= 0) return;
  for (let a = 0; a < 3; a++) for (let bb = a + 1; bb < 3; bb++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const w = 3 - a - bb, pts: V3[] = [];
    for (const [axis, sw] of [[a, -1], [a, 1], [bb, 1], [bb, -1]] as [number, number][]) { const sgn = [0, 0, 0]; sgn[a] = sa; sgn[bb] = sb; sgn[w] = sw; pts.push(P(sgn[0], sgn[1], sgn[2], axis)); }
    const out: V3 = [0, 0, 0]; out[a] = sa; out[bb] = sb;
    B.face(pts, s, out);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) B.face([P(sx, sy, sz, 0), P(sx, sy, sz, 1), P(sx, sy, sz, 2)], s, [sx, sy, sz]);
}
/** Centered box helper. */
export const cbox = (B: Builder, c: V3, size: V3, s: Surf, b = 0) => box(B, [c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2], [c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2], s, b);

/* ------------------------------------------------------------------ lathe / cylinders */

export interface LatheOpts { sides: number; smooth?: number; start?: number; caps?: boolean; faceted?: boolean; surfs?: Surf[] }
/** Revolve profile [r, y] (bottom -> top) about local +Y. Segment j uses surfs[j] (default s). Endpoints with r = 0
 * close as fans; otherwise flat caps. Normals are smooth across joints below `smooth` degrees (default 40). */
export function lathe(B: Builder, profile: [number, number][], s: Surf, o: LatheOpts) {
  const n = profile.length, sides = o.sides, start = o.start ?? 0, crease = Math.cos(((o.smooth ?? 40) * Math.PI) / 180);
  const segN: [number, number][] = [];
  for (let j = 0; j < n - 1; j++) {
    const dr = profile[j + 1][0] - profile[j][0], dy = profile[j + 1][1] - profile[j][1], l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  const joint = (k: number, j: number): [number, number] => {
    // Normal of segment j at profile vertex k (k = j or j + 1), smoothed with the neighbour segment if shallow.
    const other = k === j ? j - 1 : j + 1;
    if (other < 0 || other >= n - 1) return segN[j];
    const a = segN[j], b = segN[other];
    if (a[0] * b[0] + a[1] * b[1] < crease) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const ang = (i: number) => start + (2 * Math.PI * i) / sides;
  for (let j = 0; j < n - 1; j++) {
    const surf = o.surfs?.[j] ?? s;
    const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
    if (r0 < 1e-6 && r1 < 1e-6) continue;
    if (o.faceted) {
      for (let i = 0; i < sides; i++) {
        const a0 = ang(i), a1 = ang(i + 1);
        const q: V3[] = [];
        if (r0 > 1e-6) q.push([r0 * Math.cos(a0), y0, r0 * Math.sin(a0)], [r0 * Math.cos(a1), y0, r0 * Math.sin(a1)]); else q.push([0, y0, 0]);
        if (r1 > 1e-6) q.push([r1 * Math.cos(a1), y1, r1 * Math.sin(a1)], [r1 * Math.cos(a0), y1, r1 * Math.sin(a0)]); else q.push([0, y1, 0]);
        const am = (a0 + a1) / 2, nn = segN[j];
        B.face(q, surf, [nn[0] * Math.cos(am), nn[1], nn[0] * Math.sin(am)]);
      }
      continue;
    }
    const nb = joint(j, j), nt = joint(j + 1, j);
    const ring = (r: number, y: number, nn: [number, number]) => {
      if (r < 1e-6) return null;
      const ids: number[] = [];
      for (let i = 0; i < sides; i++) { const a = ang(i), c = Math.cos(a), sn = Math.sin(a); ids.push(B.vert([r * c, y, r * sn], [nn[0] * c, nn[1], nn[0] * sn], surf)); }
      return ids;
    };
    const rb = ring(r0, y0, nb), rt = ring(r1, y1, nt);
    for (let i = 0; i < sides; i++) {
      const i1 = (i + 1) % sides;
      if (rb && rt) { B.tri(rb[i], rt[i], rt[i1]); B.tri(rb[i], rt[i1], rb[i1]); }
      else if (rt) { const a = (ang(i) + ang(i + 1)) / 2, p = B.vert([0, y0, 0], [nb[0] * Math.cos(a), nb[1] || -1, nb[0] * Math.sin(a)], surf); B.tri(p, rt[i1], rt[i]); }
      else if (rb) { const a = (ang(i) + ang(i + 1)) / 2, p = B.vert([0, y1, 0], [nt[0] * Math.cos(a), nt[1] || 1, nt[0] * Math.sin(a)], surf); B.tri(rb[i], p, rb[i1]); }
    }
  }
  if (o.caps === false) return;
  const cap = (r: number, y: number, up: number, surf: Surf) => {
    if (r < 1e-6) return;
    const pts: V3[] = [];
    for (let i = 0; i < sides; i++) pts.push([r * Math.cos(ang(i)), y, r * Math.sin(ang(i))]);
    B.face(pts, surf, [0, up, 0]);
  };
  cap(profile[0][0], profile[0][1], -1, o.surfs?.[0] ?? s);
  cap(profile[n - 1][0], profile[n - 1][1], 1, o.surfs?.[n - 2] ?? s);
}

/** Cylinder / frustum along local Y from y0 to y1 with an optional top chamfer. */
export function cyl(B: Builder, r0: number, r1: number, y0: number, y1: number, s: Surf, sides: number, chamfer = 0, smooth = 40) {
  const prof: [number, number][] = chamfer > 0
    ? [[r0 - chamfer, y0], [r0, y0 + chamfer], [r1, y1 - chamfer], [r1 - chamfer, y1]]
    : [[r0, y0], [r1, y1]];
  lathe(B, prof, s, { sides, smooth });
}

/* ------------------------------------------------------------------ tubes */

/** Circular tube along a polyline (smooth, parallel-transported frames), flat end caps. */
export function tube(B: Builder, path: V3[], radius: number | number[], s: Surf, sides: number, caps = true) {
  const P = path.map(p => new Vector3(...p)), R = (i: number) => (Array.isArray(radius) ? radius[i] : radius);
  const tangents = P.map((p, i) => new Vector3().subVectors(P[Math.min(i + 1, P.length - 1)], P[Math.max(i - 1, 0)]).normalize());
  let u = new Vector3(0, 1, 0);
  if (Math.abs(u.dot(tangents[0])) > .9) u.set(1, 0, 0);
  u.sub(tangents[0].clone().multiplyScalar(u.dot(tangents[0]))).normalize();
  const rings: number[][] = [], frames: [Vector3, Vector3][] = [];
  for (let i = 0; i < P.length; i++) {
    const t = tangents[i];
    u.sub(t.clone().multiplyScalar(u.dot(t))).normalize();
    const w = new Vector3().crossVectors(t, u);
    frames.push([u.clone(), w.clone()]);
    const ids: number[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides, d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      ids.push(B.vert([P[i].x + d.x * R(i), P[i].y + d.y * R(i), P[i].z + d.z * R(i)], [d.x, d.y, d.z], s));
    }
    rings.push(ids);
  }
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    B.tri(rings[i][k], rings[i + 1][k], rings[i + 1][k1]); B.tri(rings[i][k], rings[i + 1][k1], rings[i][k1]);
  }
  if (!caps) return;
  for (const [i, sg] of [[0, -1], [P.length - 1, 1]] as [number, number][]) {
    const [fu, fw] = frames[i], pts: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides, d = fu.clone().multiplyScalar(Math.cos(a)).addScaledVector(fw, Math.sin(a));
      pts.push([P[i].x + d.x * R(i), P[i].y + d.y * R(i), P[i].z + d.z * R(i)]);
    }
    const t = tangents[i];
    B.face(pts, s, [t.x * sg, t.y * sg, t.z * sg]);
  }
}
/** Straight round bar between two points. */
export const bar = (B: Builder, a: V3, b: V3, r: number, s: Surf, sides = 8) => tube(B, [a, b], r, s, sides);

/** Quadratic Bezier samples (for arms and braces). */
export function bezier(a: V3, c: V3, b: V3, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]);
  }
  return out;
}

/* ------------------------------------------------------------------ extruded plates */

/** Inward offset of a convex CCW polygon (x, y) by d. */
export function inset(poly: [number, number][], d: number): [number, number][] {
  const n = poly.length, lines: { p: [number, number]; d: [number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    lines.push({ p: [a[0] + nx * d, a[1] + ny * d], d: [dx / l, dy / l] });
  }
  return lines.map((L1, i) => {
    const L0 = lines[(i + n - 1) % n], den = L0.d[0] * L1.d[1] - L0.d[1] * L1.d[0];
    if (Math.abs(den) < 1e-9) return L1.p;
    const t = ((L1.p[0] - L0.p[0]) * L1.d[1] - (L1.p[1] - L0.p[1]) * L1.d[0]) / den;
    return [L0.p[0] + L0.d[0] * t, L0.p[1] + L0.d[1] * t] as [number, number];
  });
}
export const regularPoly = (n: number, r: number, rot = 0): [number, number][] => Array.from({ length: n }, (_, i) => [r * Math.cos(rot + (2 * Math.PI * i) / n), r * Math.sin(rot + (2 * Math.PI * i) / n)]);
export const rectPoly = (w: number, h: number): [number, number][] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

/** Convex CCW outline in local XY, extruded along Z from -d/2 to +d/2, chamfer b on both rims. The front face
 * (+Z) uses `front` and gets sign uv mapped over the outline bounds (u right, v up) when front.sign. */
export function plate(B: Builder, outline: [number, number][], d: number, side: Surf, front: Surf, back: Surf = side, b = 0) {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const uv = (p: [number, number]): [number, number] => [(p[0] - x0) / (x1 - x0), (p[1] - y0) / (y1 - y0)];
  b = Math.min(b, d * .45);
  const inner = b > 0 ? inset(outline, b) : outline, h = d / 2;
  B.face(inner.map(p => [p[0], p[1], h] as V3), front, [0, 0, 1], front.sign ? inner.map(uv) : undefined);
  // A sign on the back reads mirrored-correct from behind (u runs right-to-left in local x).
  const rev = [...inner].reverse();
  B.face(rev.map(p => [p[0], p[1], -h] as V3), back, [0, 0, -1], back.sign ? rev.map(p => [1 - uv(p)[0], uv(p)[1]] as [number, number]) : undefined);
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i], c = outline[(i + 1) % n], dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1, out: V3 = [dy / l, -dx / l, 0];
    B.face([[a[0], a[1], -h + b], [c[0], c[1], -h + b], [c[0], c[1], h - b], [a[0], a[1], h - b]], side, out);
    if (b > 0) {
      const ia = inner[i], ic = inner[(i + 1) % n];
      B.face([[a[0], a[1], h - b], [c[0], c[1], h - b], [ic[0], ic[1], h], [ia[0], ia[1], h]], side, [out[0], out[1], 1]);
      B.face([[ia[0], ia[1], -h], [ic[0], ic[1], -h], [c[0], c[1], -h + b], [a[0], a[1], -h + b]], side, [out[0], out[1], -1]);
    }
  }
}

/* ------------------------------------------------------------------ matrices */

export const M4 = (p: V3, yaw = 0, pitch = 0, roll = 0, s = 1) =>
  new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ')), new Vector3(s, s, s));

/** Triangle and closed-shell statistics for QA (welds by position, 0.1 mm). */
export function shellStats(g: BufferGeometry) {
  const p = g.getAttribute('position'), idx = g.index!;
  const key = new Map<string, number>(), id = new Int32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let v = key.get(k); if (v === undefined) { v = key.size; key.set(k, v); } id[i] = v;
  }
  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const a = id[idx.getX(t)], b = id[idx.getX(t + 1)], c = id[idx.getX(t + 2)];
    va.fromBufferAttribute(p, idx.getX(t)); vb.fromBufferAttribute(p, idx.getX(t + 1)); vc.fromBufferAttribute(p, idx.getX(t + 2));
    if (vb.sub(va).cross(vc.sub(va)).length() < 1e-9 || a === b || b === c || a === c) degenerate++;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u < v ? `${u}_${v}` : `${v}_${u}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  }
  let open = 0, nonManifold = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }
  g.computeBoundingBox();
  return { triangles: idx.count / 3, vertices: p.count, degenerate, openEdges: open, nonManifoldEdges: nonManifold, bounds: [g.boundingBox!.min.toArray(), g.boundingBox!.max.toArray()] };
}
