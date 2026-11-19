import { streetBuilderRanges } from './street-builder-ranges';
import { Builder } from './WorldStreetGeometry';
import type { Terrain } from './WorldLandform';
import type { Vec3 } from './types';

type Vertex = number[];
type Polygon = Vertex[];
type Plane = (point: Vertex) => number;

function clip(polygon: Polygon, distance: Plane): Polygon {
  const result: Polygon = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = distance(a),
      db = distance(b);
    if (da >= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push(a.map((value, k) => value + (b[k] - value) * t));
    }
  }
  return result;
}

type Burial = { boundary: Plane[]; x0: number; x1: number; z0: number; z1: number };

/** Read only nearby terrain blocks. The 2 cm cover margin keeps the cut behind
 * the soil surface even above the raised scoring on the slab. */
export function foundationBurial(
  terrain: Terrain,
  grid: { minX: number; minZ: number; nx: number },
  cell: number,
  centre: Vec3,
  size: Vec3,
): Burial[] {
  const [x, y, z] = centre,
    [w, h, d] = size;
  const blocks = terrain.blocks,
    step = (grid.nx * cell) / blocks.NB,
    result: Burial[] = [];
  const block = (v: number, start: number) => Math.floor((v - start) / step);
  for (
    let j = Math.max(0, block(z - d / 2 - 1, grid.minZ));
    j <= Math.min(blocks.MB - 1, block(z + d / 2 + 1, grid.minZ));
    j++
  ) {
    for (
      let i = Math.max(0, block(x - w / 2 - 1, grid.minX));
      i <= Math.min(blocks.NB - 1, block(x + w / 2 + 1, grid.minX));
      i++
    ) {
      const b = j * blocks.NB + i,
        start = blocks.start[b];
      for (let k = start; k < start + blocks.count[b]; k += 3) {
        const tri = [0, 1, 2].map((c) => {
          const off = 3 * terrain.indices[k + c];
          return [terrain.positions[off] - x, terrain.positions[off + 1], terrain.positions[off + 2] - z];
        });
        const top = y + h / 2 + 0.02;
        if (tri.every((p) => p[1] <= top)) continue;
        const polygon = clip(tri, (p) => p[1] - top);
        if (polygon.length < 3) continue;
        const xs = polygon.map((p) => p[0]),
          zs = polygon.map((p) => p[2]);
        const x0 = Math.min(...xs),
          x1 = Math.max(...xs),
          z0 = Math.min(...zs),
          z1 = Math.max(...zs);
        if (x0 >= w / 2 || x1 <= -w / 2 || z0 >= d / 2 || z1 <= -d / 2) continue;
        const area = polygon.reduce((sum, p, n) => {
          const q = polygon[(n + 1) % polygon.length];
          return sum + p[0] * q[2] - p[2] * q[0];
        }, 0);
        if (Math.abs(area) < 1e-12) continue;
        const sign = Math.sign(area);
        const boundary = polygon.map((p, n) => {
          const q = polygon[(n + 1) % polygon.length];
          return (v: Vertex) => sign * ((q[0] - p[0]) * (v[2] - p[2]) - (q[2] - p[2]) * (v[0] - p[0]));
        });
        result.push({ boundary, x0, x1, z0, z1 });
      }
    }
  }
  return result;
}

function exposed(polygon: Polygon, ground: Burial): Polygon[] {
  if (
    polygon.every((p) => p[0] < ground.x0) ||
    polygon.every((p) => p[0] > ground.x1) ||
    polygon.every((p) => p[2] < ground.z0) ||
    polygon.every((p) => p[2] > ground.z1)
  )
    return [polygon];
  if (ground.boundary.some((f) => polygon.every((p) => f(p) < -1e-10))) return [polygon];
  const outside: Polygon[] = [];
  let inside = polygon;
  for (const f of ground.boundary) {
    if (inside.every((p) => f(p) >= 0)) continue;
    if (inside.every((p) => f(p) <= 0)) {
      outside.push(inside);
      return outside;
    }
    const piece = clip(inside, (p) => -f(p));
    if (piece.length >= 3) outside.push(piece);
    inside = clip(inside, f);
    if (inside.length < 3) break;
  }
  return outside;
}

export function exposedFoundation(source: Builder, coverage: Burial[]) {
  if (!coverage.length) return source;
  const out = new Builder();
  function vertex(id: number) {
    return [
      ...source.pos.slice(3 * id, 3 * id + 3),
      ...source.nrm.slice(3 * id, 3 * id + 3),
      ...source.col.slice(3 * id, 3 * id + 3),
      ...source.mat.slice(4 * id, 4 * id + 4),
      ...source.suv.slice(2 * id, 2 * id + 2),
    ];
  }
  let cursor = 0;
  for (const part of source.parts) {
    out.part(part.name, part.collide);
    const end = part.end < 0 ? source.pos.length / 3 : part.end;
    while (cursor < source.idx.length && source.idx[cursor] < end) {
      let polys = [source.idx.slice(cursor, cursor + 3).map(vertex)];
      cursor += 3;
      for (const face of coverage) polys = polys.flatMap((poly) => exposed(poly, face));
      for (const poly of polys)
        for (let n = 1; n < poly.length - 1; n++) {
          const a = poly[0],
            b = poly[n],
            c = poly[n + 1];
          const ux = b[0] - a[0],
            uy = b[1] - a[1],
            uz = b[2] - a[2],
            vx = c[0] - a[0],
            vy = c[1] - a[1],
            vz = c[2] - a[2];
          if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-9) continue;
          for (const p of [a, b, c]) {
            out.idx.push(out.pos.length / 3);
            out.pos.push(...p.slice(0, 3));
            out.nrm.push(...p.slice(3, 6));
            out.col.push(...p.slice(6, 9));
            out.mat.push(...p.slice(9, 13));
            out.suv.push(...p.slice(13, 15));
          }
        }
    }
  }
  return out;
}

export function foundationRanges(source: Builder) {
  return streetBuilderRanges(source).map(part => {
    if (part.name !== 'slab' && part.name !== 'scoring') throw new Error('Unclassified slab part ' + part.name);
    return {id: part.name, firstIndex: part.firstIndex, indexCount: part.indexCount,
      collision: part.collide ? 'solid' as const : 'none' as const, surfaceIds: part.collide ? ['concrete'] : undefined};
  });
}
