import type { SiteMesh } from './coaster-arrival-site.ts';

type Point = [number, number, number];
export interface ApproachTop { positions: ArrayLike<number>; indices: ArrayLike<number>; close?: boolean }
type Triangle = { a: Point; b: Point; c: Point };
type Edge = { a: Point; b: Point; inside: Point; owner: number; count: number };
const EPS = 1e-6, PROBE = 1e-4;
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
const key = (p: Point) => p.map(v => Math.round(v / EPS)).join(',');

/** Visual side faces only. Top triangles and their physics arrays remain owned by the caller.
 * Split partial shared edges before checking the neighbouring top: a branch opening must
 * not acquire a wall, and an overlapping lower shoulder must not add a second hidden wall.
 * `ground` is the caller's existing physical-terrain sampler, never another height datum. */
export function approachEdgeSkirts(tops: readonly ApproachTop[], ground: (x: number, z: number) => number): SiteMesh[] {
  const triangles: Triangle[] = [], edges: Edge[] = [];
  tops.forEach((top, owner) => {
    const own = new Map<string, Edge>();
    const point = (id: number): Point => [top.positions[id * 3], top.positions[id * 3 + 1], top.positions[id * 3 + 2]];
    for (let i = 0; i < top.indices.length; i += 3) {
      const a = point(top.indices[i]), b = point(top.indices[i + 1]), c = point(top.indices[i + 2]);
      triangles.push({ a, b, c });
      for (const [start, end, inside] of [[a, b, c], [b, c, a], [c, a, b]]) {
        const tag = [key(start), key(end)].sort().join('|'), old = own.get(tag);
        if (old) old.count++; else own.set(tag, { a: start, b: end, inside, owner, count: 1 });
      }
    }
    edges.push(...[...own.values()].filter(e => e.count === 1));
  });
  const height = (x: number, z: number, atX = x, atZ = z) => {
    let y = ground(atX, atZ);
    for (const { a, b, c } of triangles) {
      if (x < Math.min(a[0], b[0], c[0]) - EPS || x > Math.max(a[0], b[0], c[0]) + EPS
        || z < Math.min(a[2], b[2], c[2]) - EPS || z > Math.max(a[2], b[2], c[2]) + EPS) continue;
      const den = cross(b[0] - a[0], b[2] - a[2], c[0] - a[0], c[2] - a[2]);
      if (Math.abs(den) < EPS) continue;
      const u = cross(x - a[0], z - a[2], c[0] - a[0], c[2] - a[2]) / den;
      const v = cross(b[0] - a[0], b[2] - a[2], x - a[0], z - a[2]) / den;
      if (u >= -EPS && v >= -EPS && u + v <= 1 + EPS) {
        const atU = cross(atX - a[0], atZ - a[2], c[0] - a[0], c[2] - a[2]) / den;
        const atV = cross(b[0] - a[0], b[2] - a[2], atX - a[0], atZ - a[2]) / den;
        y = Math.max(y, a[1] + atU * (b[1] - a[1]) + atV * (c[1] - a[1]));
      }
    }
    return y;
  };
  const skirts = tops.map((): SiteMesh => ({ positions: [], indices: [] }));
  for (const edge of edges) {
    if (tops[edge.owner].close === false) continue;
    const { a, b, inside } = edge, dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    if (length < EPS) continue;
    const cuts = [0, 1];
    for (const other of edges) {
      const sx = other.b[0] - other.a[0], sz = other.b[2] - other.a[2];
      const qx = other.a[0] - a[0], qz = other.a[2] - a[2], den = cross(dx, dz, sx, sz);
      if (Math.abs(den) > EPS) {
        const t = cross(qx, qz, sx, sz) / den, u = cross(qx, qz, dx, dz) / den;
        if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) cuts.push(t);
      } else if (Math.abs(cross(qx, qz, dx, dz)) < EPS) {
        for (const p of [other.a, other.b]) {
          const t = ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (length * length);
          if (t > EPS && t < 1 - EPS) cuts.push(t);
        }
      }
    }
    const split = [...new Set(cuts.map(t => Math.round(t / EPS) * EPS))].sort((a, b) => a - b);
    const sign = Math.sign(cross(dx, dz, inside[0] - a[0], inside[2] - a[2]));
    const nx = sign * dz / length, nz = -sign * dx / length;
    const at = (t: number): Point => [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
    for (let i = 1; i < split.length; i++) {
      const start = at(split[i - 1]), end = at(split[i]), middle = at((split[i - 1] + split[i]) / 2);
      if (height(middle[0] + nx * PROBE, middle[2] + nz * PROBE) >= middle[1] - EPS) continue;
      const foot = (p: Point): Point => [p[0], Math.min(p[1], height(p[0] + nx * PROBE, p[2] + nz * PROBE, p[0], p[2])), p[2]];
      const target = skirts[edge.owner], base = target.positions.length / 3;
      target.positions.push(...start, ...foot(start), ...foot(end), ...end);
      target.indices.push(...(sign < 0 ? [base, base + 1, base + 2, base, base + 2, base + 3]
        : [base, base + 2, base + 1, base, base + 3, base + 2]));
    }
  }
  return skirts;
}
