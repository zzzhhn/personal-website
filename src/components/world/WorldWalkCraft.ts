/** P02/P03 visuals only. Original layout, support slabs and knockable spec stay in WorldParkWalk. */
import { BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { ParkGeo } from './WorldParkKit';
import { FACILITY_WOOD_TILE, facilityCraftEnabled } from './WorldFacilitySurface';
import type { Vec3 } from './types';
export const walkCraftEnabled = () => facilityCraftEnabled() && (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('walkCraft') !== 'baseline');
type Part = { name: string; start: number; count: number };
const UP = new Vector3(0, 1, 0);
/** Author after ParkGeo's baked transform and before its shared merge. No new attributes or shader. */
function wood(g: BufferGeometry, axis: Vector3, cross: Vector3, origin: Vector3, seed: number, radius?: number) {
  axis.normalize(); cross.normalize(); const side = new Vector3().crossVectors(axis, cross).normalize();
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), col = g.getAttribute('color'), mat = g.getAttribute('aMat');
  const uv = new Float32Array(p.count * 2), point = new Vector3(), normal = new Vector3();
  const period = radius ? Math.PI * 2 * radius / FACILITY_WOOD_TILE[1] : 0;
  for (let t = 0; t < p.count; t += 3) {
    normal.set(0, 0, 0); for (let j = 0; j < 3; j++) normal.add(new Vector3().fromBufferAttribute(n, t + j)); normal.normalize();
    const end = Math.abs(normal.dot(axis)) > .74;
    for (let j = 0; j < 3; j++) {
      const i = t + j; point.fromBufferAttribute(p, i).sub(origin); const u = point.dot(axis), v = point.dot(cross), w = point.dot(side);
      if (end) {
        // Finite cut face: subtle growth arcs in pigment, no bark/long-grain normal stretched over the cut.
        const rings = Math.sin(Math.hypot(v + .09, w - .14) * 190 + seed * .7), tone = .965 + .025 * rings;
        col.setXYZ(i, col.getX(i) * tone, col.getY(i) * tone, col.getZ(i) * tone); mat.setW(i, 0);
      } else {
        mat.setW(i, -1); uv[i * 2] = u / FACILITY_WOOD_TILE[0] + seed * .137;
        uv[i * 2 + 1] = radius ? ((Math.atan2(w, v) + Math.PI) * radius / FACILITY_WOOD_TILE[1]) : (Math.abs(normal.dot(cross)) > .7 ? w : v) / FACILITY_WOOD_TILE[1];
      }
    }
    if (radius && !end) { const vs = [uv[t * 2 + 1], uv[(t + 1) * 2 + 1], uv[(t + 2) * 2 + 1]];
      if (Math.max(...vs) - Math.min(...vs) > period / 2) for (let j = 0; j < 3; j++) if (uv[(t + j) * 2 + 1] < period / 2) uv[(t + j) * 2 + 1] += period;
    }
  }
  g.setAttribute('aSuv', new BufferAttribute(uv, 2));
}
/** All additions are still merged into the existing two P02 draws / one P03 instance source. */
export class WalkCraftGeo extends ParkGeo {
  private parts: Part[] = [];
  private label = 'wood';
  constructor(private plankAxis: Vec3 = [1, 0, 0]) { super(); }
  named(name: string, draw: () => void) { const old = this.label; this.label = name; draw(); this.label = old; }
  private record(g: BufferGeometry) { this.parts.push({ name: this.label, start: this.parts.reduce((s, p) => s + p.count, 0), count: g.getAttribute('position').count }); }
  box(...args: Parameters<ParkGeo['box']>) {
    super.box(...args); const g = this.pieces[this.pieces.length - 1], [center, size, , o = {}] = args;
    const axisIndex = size.indexOf(Math.max(...size)), local = new Matrix4().makeRotationFromEuler(new Euler(o.pitch ?? 0, o.yaw ?? 0, 0, 'YXZ'));
    if (o.frame) local.premultiply(o.frame);
    const axis = new Vector3().setComponent(axisIndex, 1).transformDirection(local), cross = new Vector3().setComponent(axisIndex === 1 ? 0 : 1, 1).transformDirection(local);
    wood(g, axis, cross, new Vector3(...center).applyMatrix4(o.frame ?? new Matrix4()), o.seed ?? 0); this.record(g);
  }
  cyl(...args: Parameters<ParkGeo['cyl']>) {
    super.cyl(...args); const g = this.pieces[this.pieces.length - 1], [a, b, r0, r1, , , o = {}] = args;
    const axis = new Vector3(...b).sub(new Vector3(...a)).normalize(), cross = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().setFromUnitVectors(UP, axis));
    if (o.frame) { axis.transformDirection(o.frame); cross.transformDirection(o.frame); }
    wood(g, axis, cross, new Vector3(...a).applyMatrix4(o.frame ?? new Matrix4()), o.seed ?? 0, (r0 + r1) / 2); this.record(g);
  }
  raw(...args: Parameters<ParkGeo['raw']>) {
    if (!args[0].length) return; super.raw(...args); const g = this.pieces[this.pieces.length - 1], axis = new Vector3(...this.plankAxis);
    const cross = Math.abs(axis.y) < .7 ? UP.clone() : new Vector3(1, 0, 0);
    wood(g, axis, cross, new Vector3(), args[4] ?? 0); this.record(g);
  }
  metal(center: Vec3, size: Vec3, color: string, options: Parameters<ParkGeo['box']>[3] = {}) {
    super.box(center, size, color, options); const g = this.pieces[this.pieces.length - 1], a = g.getAttribute('aMat');
    for (let i = 0; i < a.count; i++) a.setW(i, -3); this.record(g);
  }
  build() { const g = super.build(); g.userData.craftParts = this.parts; return g; }
}
/** Actual contact: a U strap under the outer stringer, down both sides onto the crossbeam. */
export function walkBearing(g: WalkCraftGeo, center: Vec3, yaw: number) {
  const frame = new Matrix4().compose(new Vector3(...center), new Quaternion().setFromAxisAngle(UP, yaw), new Vector3(1, 1, 1));
  g.named('bearing.stringer-strap', () => {
    g.metal([0, -.112, 0], [.18, .014, .13], '#8A8E89', { frame, inset: .004 });
    for (const x of [-.081, .081]) g.metal([x, -.052, 0], [.014, .12, .13], '#8A8E89', { frame, inset: .004 });
  });
}
export function craftParkRail(low = false) {
  const g = new WalkCraftGeo();
  const member = (name: string, center: Vec3, size: Vec3, color: string, inset = 0) => g.named(name, () => g.box(center, size, color, { inset }));
  for (const z of [-.94, .94]) {
    member('post.vertical-grain', [0, .45, z], [.09, .9, .09], '#8E6E55', low ? 0 : .006);
    if (!low) {
      member('post.bearing-head', [0, .89, z], [.12, .02, .12], '#7A5F45', .006);
      g.named('post.foot-shoe', () => {
        g.metal([0, .011, z], [.15, .022, .14], '#7D837E', { inset: .006 });
        for (const x of [-.051, .051]) g.metal([x, .077, z], [.012, .132, .105], '#7D837E', { inset: .004 });
      });
    }
  }
  // 2.02 m is the authored placement pitch. All sections remain independent 40 kg bodies.
  member('handrail.continuous', [0, .935, 0], [.14, .07, 2.02], '#B99469', low ? 0 : .012);
  if (!low) {
    member('rail.middle', [0, .5, 0], [.055, .085, 1.94], '#9C7A58', .005);
    member('rail.lower', [0, .2, 0], [.055, .065, 1.94], '#9C7A58', .004);
  }
  return { geometry: g.build(), triangles: g.triangles };
}
