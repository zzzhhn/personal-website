import { Euler, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three';
import { bar, lathe, type Builder, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import { IBD_FIXTURES } from './ibd-yard-lighting.ts';
import { IBD_SHEDS } from './ibd-yard-layout.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';
import { IBD_BOUNDARY_SEGMENTS, IBD_FOOTPRINT, IBD_YARD } from './attraction-layout.ts';

type P2 = [number, number];
const local = ([x, z]: readonly number[]): P2 => [x - IBD_YARD.center[0], z - IBD_YARD.center[2]];
const area = (p: P2[]) => p.reduce((sum, a, i) => { const c = p[(i + 1) % p.length]; return sum + a[0] * c[1] - c[0] * a[1]; }, 0) / 2;
function clip(points: P2[], axis: 0 | 1, bound: number, keepAbove: boolean): P2[] {
  const result: P2[] = [], inside = (p: P2) => keepAbove ? p[axis] >= bound : p[axis] <= bound;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], end = points[(i + 1) % points.length], ai = inside(a), ei = inside(end);
    if (ai) result.push(a);
    if (ai !== ei) {
      const t = (bound - a[axis]) / (end[axis] - a[axis]);
      result.push([a[0] + (end[0] - a[0]) * t, a[1] + (end[1] - a[1]) * t]);
    }
  }
  return result;
}
function clean(points: P2[]): P2[] {
  const unique = points.filter((p, i) => { const q = points[(i + points.length - 1) % points.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7; });
  return unique.filter((p, i) => {
    const a = unique[(i + unique.length - 1) % unique.length], c = unique[(i + 1) % unique.length];
    return Math.abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 1e-8;
  });
}

/** One closed slab, clipped to the actual concave survey. Render vertices also form the collision mesh.
 * Each 2 m patch keeps the existing vertex light bake detailed without a second coplanar top surface.
 */
export function buildIbdPaving(b: Builder) {
  const polygon = IBD_FOOTPRINT.map(local), startVertex = b.pos.length / 3, startIndex = b.idx.length;
  const faces = ShapeUtils.triangulateShape(polygon.map(p => new Vector2(...p)), []);
  for (const ids of faces) {
    const triangle = ids.map(i => polygon[i]);
    const minX = Math.floor(Math.min(...triangle.map(p => p[0])) / 2) * 2, maxX = Math.max(...triangle.map(p => p[0]));
    const minZ = Math.floor(Math.min(...triangle.map(p => p[1])) / 2) * 2, maxZ = Math.max(...triangle.map(p => p[1]));
    for (let x = minX; x < maxX; x += 2) for (let z = minZ; z < maxZ; z += 2) {
      let patch = clip(clip(triangle, 0, x, true), 0, x + 2, false);
      patch = clean(clip(clip(patch, 1, z, true), 1, z + 2, false));
      if (patch.length < 3 || Math.abs(area(patch)) < 1e-7) continue;
      const top = b.face(patch.map(([xx, zz]): V3 => [xx, .085, zz]), P.paving, [0, 1, 0]);
      // The IBD shader reserves aMat.w=2 for paving; ordinary props/signs retain 0/1.
      // This changes only shading, never the closed collision slab or its tessellation.
      for (const vertex of top) b.mat[vertex * 4 + 3] = 2;
    }
    b.face(triangle.map(([x, z]): V3 => [x, -.32, z]), P.concrete, [0, -1, 0]);
  }
  for (let i = 0; i < polygon.length; i++) {
    const [x, z] = polygon[i], [xx, zz] = polygon[(i + 1) % polygon.length];
    b.face([[x, .085, z], [x, -.32, z], [xx, -.32, zz], [xx, .085, zz]], P.concrete, [zz - z, 0, x - xx]);
  }
  // Weld equal collision vertices across the tiled top, avoiding artificial edges between coplanar cells.
  const vertices: number[] = [], remap: number[] = [], ids = new Map<string, number>();
  for (let i = startVertex; i < b.pos.length / 3; i++) {
    const p = b.pos.slice(i * 3, i * 3 + 3), key = p.map(n => Math.round(n * 1e6)).join(',');
    let id = ids.get(key);
    if (id === undefined) { id = vertices.length / 3; ids.set(key, id); vertices.push(...p); }
    remap[i - startVertex] = id;
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(b.idx.slice(startIndex).map(i => remap[i - startVertex])) };
}

function perimeter(b: Builder, cube: IbdCube) {
  for (const edge of IBD_BOUNDARY_SEGMENTS) {
    const a = local(edge.a), end = local(edge.b), dx = end[0] - a[0], dz = end[1] - a[1];
    const length = Math.hypot(dx, dz), rotation: V3 = [0, -Math.atan2(dz, dx), 0];
    const x = (a[0] + end[0]) / 2, z = (a[1] + end[1]) / 2;
    if (edge.kind === 'open') continue;
    if (edge.kind === 'drain') {
      // Flush grated boundary, not a raised invisible perimeter wall across the service setback.
      cube([x, .092, z], [length, .012, .5], P.dark, false, 0, rotation);
      for (let d = .2; d < length; d += .4) cube([a[0] + dx * d / length, .105, a[1] + dz * d / length], [.06, .015, .48], P.steel, false, 0, rotation);
      continue;
    }
    cube([x, .22, z], [length - .12, .28, .22], P.concrete, true, 0, rotation);
    for (const y of [.8, 1.65]) cube([x, y, z], [length - .08, .08, .08], P.dark, true, 0, rotation);
    const count = Math.ceil(length / 3);
    for (let i = 0; i < count; i++) cube([a[0] + dx * i / count, .9, a[1] + dz * i / count], [.09, 1.8, .09], P.dark, true, 0);
  }
  // Green soakaway occupies the actual eastern notch. It stays below the paving and has no wall collider.
  b.face([[25.3, .045, -4.3], [25.3, .045, -.2], [33.5, .045, 1.8], [33, .045, -6]], P.leafDark, [0, 1, 0]);
  for (const z of [-4.5, -1.5]) b.tr([31, .045, z], [0, z, 0], () =>
    lathe(b, [[0, 0], [.65, .12], [.8, .55], [.35, 1], [0, 1.2]], P.leaf, { sides: 5, faceted: true }));
  // Broad turning path in the west apron, separated from the pedestrian approach and quarantine pad.
  for (let angle = -.3; angle <= Math.PI + .3; angle += .3) {
    const x = -34 + Math.cos(angle) * 8, z = 22 + Math.sin(angle) * 6;
    cube([x, .105, z], [1.1, .012, .12], P.pale, false, 0, [0, -angle - Math.PI / 2, 0]);
  }
}

export function buildIbdSite(b: Builder, cube: IbdCube) {
  // Working bays and clear forecourt. Flush paint has no collision geometry.
  for (const [x, z, w, d] of [[-17, -5, 20, 14], [14, -12, 18, 5], [-19, 12, 12, 9], [17, 14, 22, 19]]) {
    for (const xx of [x - w / 2, x + w / 2]) cube([xx, .1, z], [.12, .015, d], P.amber, false, 0);
    for (const zz of [z - d / 2, z + d / 2]) cube([x, .1, zz], [w, .015, .12], P.amber, false, 0);
  }
  for (let x = -10; x <= 11; x += 2) cube([x, .1, 23], [1, .015, 3], P.pale, false, 0);
  for (const z of [5, 15]) {
    cube([0, .11, z], [.2, .015, 2.5], P.amber, false, 0);
    b.face([[-.8, .12, z - .6], [0, .12, z - 1.5], [.8, .12, z - .6]], P.amber, [0, 1, 0]);
  }
  cube([0, .1, 29], [24, .02, .6], P.dark, false, 0);
  for (let x = -12; x < 12; x += .4) cube([x, .115, 29], [.06, .02, .58], P.steel, false, 0);
  perimeter(b, cube);
  // Few large faceted shrubs in contained planters, away from the inspection faces.
  for (const x of [-24, 24]) {
    cube([x, .5, 27], [6, .85, 2.3], P.concrete, true);
    cube([x, .95, 27], [5.6, .1, 1.9], P.timber, false, 0);
    for (const xx of [-1.8, 0, 1.8]) b.tr([x + xx, .95, 27], [0, xx, 0], () =>
      lathe(b, [[0, 0], [.8, .2], [1.1, .9], [.6, 1.65], [0, 1.9]], xx ? P.leaf : P.leafDark, { sides: 5, faceted: true }));
  }
  for (const f of IBD_FIXTURES) {
    const [x, y, z] = f.at;
    if (f.mount) {
      if (f.mount === 'bench') {
        // Clamped to the already-blocked rear edge of each desk, never a new
        // floor-standing obstacle in front of the receiving/tool station.
        const base = f.baseY!;
        cube([x - .24, base + .025, z - .12], [.18, .05, .18], P.dark, false, 0);
        bar(b, [x - .24, base, z - .12], [x - .24, y + .16, z - .12], .025, P.dark, 6);
        bar(b, [x - .24, y + .16, z - .12], [x, y + .08, z], .025, P.steel, 6);
      } else if (f.pendant) {
        const shed = IBD_SHEDS.find(s => Math.abs(x - s.x) < s.width / 2 && Math.abs(z - s.z) < s.depth / 2)!;
        const ceiling = shed.eave + shed.rise * (1 - Math.abs(x - shed.x) / (shed.width / 2)) - .3;
        bar(b, [x, y + .08, z], [x, ceiling, z], .025, P.dark, 4);
      }
      const aim = f.aim!, q = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0),
        new Vector3(aim[0] - x, aim[1] - y, aim[2] - z).normalize());
      const e = new Euler().setFromQuaternion(q, 'YXZ'), rotation: V3 = [e.x, e.y, e.z];
      b.tr(f.at, rotation, () => {
        const truck = f.mount === 'truck', width = f.mount === 'bench' ? .48 : 1.2;
        // Truck units sit flush under the unchanged ceiling: bottom 3.764m,
        // leaving >.25m above the actual closed loaded pallet/lid envelope.
        cube([0, 0, 0], [width, truck ? .05 : .14, .35], P.dark, false, 0);
        cube([0, truck ? -.032 : -.083, 0], [width - .1, .018, .25], P.lens, false, 0);
        for (const side of [-1, 1]) cube([side * (width / 2 - .025), 0, 0], [.05, truck ? .045 : .12, .37], P.cutSteel, false, 0);
      });
    } else if (f.pendant) {
      const shed = IBD_SHEDS.find(s => Math.abs(x - s.x) < s.width / 2 && Math.abs(z - s.z) < s.depth / 2)!;
      const ceiling = shed.eave + shed.rise * (1 - Math.abs(x - shed.x) / (shed.width / 2)) - .3;
      bar(b, [x, y, z], [x, ceiling, z], .035, P.dark, 4);
      b.tr([x, y, z], [0, 0, 0], () => lathe(b, [[0, .36], [.25, .36], [.65, .02], [.65, -.04], [0, -.04]], P.dark, { sides: 8 }));
      cube([x, y - .055, z], [.95, .04, .65], P.lens, false, 0);
    } else {
      cube([x, (y - .4) / 2, z], [.24, y - .4, .24], P.dark, true);
      cube([x, .25, z], [.6, .5, .6], P.concrete, true);
      cube([x, y, z], [.34, .6, .34], P.lens);
      cube([x, y + .38, z], [.48, .12, .48], P.dark);
    }
  }
}
