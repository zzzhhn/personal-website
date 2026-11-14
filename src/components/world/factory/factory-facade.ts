import { Builder, cbox, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactorySolid } from './factory-geometry.ts';

export interface FactoryFacadePalette {
  cream: Surf; teal: Surf; steel: Surf; glass: Surf;
}

/** factory-v1 envelope, in the existing factory-local survey.
 * Integration by the scene owner:
 * - Replace the z=[-31,31], x=[-40,-25,-10,5,22,38] waist-wall/isolated-mullion
 *   loop and the z=[-24,-9,6,23] west-wall loop in factory-geometry.ts.
 * - Keep the preceding building ribs/feet, every roof face and rafter, lamps,
 *   machinery, slab, ramp, platform and railing. No existing path is replaced.
 * - Add this geometry as one PBR batch (or merge it before bakeFactoryLight),
 *   append solids, and dispose the geometry with the owning factory instance.
 * Glass is opaque coloured infill; the actual doors/loggias are open geometry. */
export function buildFactoryFacade(palette: FactoryFacadePalette) {
  const b = new Builder(), solids: FactorySolid[] = [], P = palette;
  const box = (at: V3, size: V3, surf: Surf, solid = false, bevel = 0) => {
    cbox(b, at, size, surf, bevel);
    if (solid) solids.push({ at: [...at], size: [...size] });
  };
  // Local X spans a wall bay, +Z is its exterior. Whole-bay colliders are valid
  // because glazing is opaque solid infill, with no hidden door in these bays.
  const bay = (x: number, z: number, span: number, bottom: number, top: number, yaw = 0, waist = false) => {
    const sill = waist ? 1.975 : bottom + .42, head = top - (waist ? 1.1 : .5);
    b.tr([x, 0, z], [0, yaw, 0], () => {
      cbox(b, [0, (bottom + sill) / 2, 0], [span, sill - bottom, .24], P.cream, .025);
      cbox(b, [0, (head + top) / 2, 0], [span, top - head, .27], P.cream, .025);
      for (const side of [-1, 1]) cbox(b, [side * (span / 2 - .275), (sill + top) / 2, 0],
        [.55, top - sill, .24], P.cream, .02);
      // Four-sided reveal, without the old full steel backing that made every
      // window black from indoors. One opaque pane is glass-coloured both ways.
      const innerW = span - 1.25, innerH = head - sill - .38, cy = (sill + head) / 2;
      for (const side of [-1, 1]) {
        cbox(b, [side * (innerW / 2 + .0875), cy, 0], [.175, innerH, .18], P.steel);
        cbox(b, [0, cy + side * (innerH / 2 + .095), 0], [span - .9, .19, .18], P.steel);
      }
      cbox(b, [0, cy, 0], [innerW, innerH, .06], P.glass);
      const divisions = Math.max(2, Math.round(span / 3.5));
      // Split verticals at the horizontal bar: no overlapping coplanar faces at
      // the cross joints, and the same readable frame on the interior face.
      const halfBar = (innerH - .15) / 2;
      for (let i = 1; i < divisions; i++) for (const side of [-1, 1]) cbox(b,
        [(i / divisions - .5) * innerW, cy + side * (innerH + .15) / 4, 0], [.12, halfBar, .18], P.teal);
      cbox(b, [0, cy, 0], [innerW, .15, .18], P.teal);
      for (const dx of [-span * .23, span * .23]) cbox(b,
        [dx, (head + top) / 2, .137], [.028, top - head - .1, .004], P.teal);
    });
    const alongZ = Math.abs(Math.sin(yaw)) > .5;
    solids.push({ at: [x, (bottom + top) / 2, z], size: alongZ ? [.29, top - bottom, span] : [span, top - bottom, .29] });
  };
  // Wall bays share the original footprint. Only surveyed service doors remain
  // open below their headers; gaps between every repeated bay were accidental.
  for (const z of [-31, 31]) for (const x of [-40, -25, -10, 5, 22, 38]) {
    // The east L1 landing also crosses the south facade at x=39..46,z=31.
    const top = z > 0 && x === 38 ? 3.75 : x < -1 ? 8.9 : 6.9;
    bay(x, z, 12, .125, top, z < 0 ? Math.PI : 0, true);
  }
  for (const z of [-24, -9, 6, 23]) bay(-46, z, 12, .1, 8.9, -Math.PI / 2, true);
  // North: raw delivery and east-entry corner. South: dispatch service exit.
  // Other bay gaps are infill, rather than repeated unassigned doorways.
  for (const z of [-31, 31]) for (const [a, end] of [[-34, -31], [-19, -16], [-4, -1], [11, 16], [28, 32], [44, 46]]) {
    const top = z > 0 && end === 46 ? 3.75 : end <= -1 ? 8.9 : 6.9;
    const open = z < 0 ? a === -34 || a === 44 : a === 28;
    const bottom = open ? 2.95 : .125;
    box([(a + end) / 2, (bottom + top) / 2, z], [end - a, top - bottom, .27], P.cream, true, .025);
  }
  for (const [a, end] of [[-18, -15], [-3, 0], [12, 17]]) {
    const bottom = a === -18 ? 2.95 : .125;
    box([-46, (bottom + 8.9) / 2, (a + end) / 2], [.27, 8.9 - bottom, end - a], P.cream, true, .025);
  }
  for (const [a, end] of [[-31, -30], [29, 31]])
    box([-46, 4.5125, (a + end) / 2], [.27, 8.775, end - a], P.cream, true, .025);
  for (const z of [-31, 31]) box([22.5, 7, z], [47, .2, .27], P.cream, true, .015);
  // Close the surplus mezzanine gap west of the actual east landing.
  bay(35.1, 31, 6.2, 3.75, 6.9);

  // Upper atrium: a broad clerestory below the existing roof truss. The south
  // platform x=2..16 crosses z=31 at Y=8.52, so its loggia stays genuinely open.
  for (const [a, end] of [[-1, 14], [14, 30], [30, 46]]) bay((a + end) / 2, -31, end - a, 7.1, 14.75, Math.PI);
  for (const [a, end] of [[17, 30], [30, 46]]) bay((a + end) / 2, 31, end - a, 7.1, 14.75);
  box([0, 10.925, 31], [2, 7.65, .27], P.cream, true, .025);
  box([9, 7.55, 31], [16, .9, .27], P.cream, true, .025);
  box([9, 13.15, 31], [16, 3.2, .27], P.cream, true, .025);
  // The east L1 passage Y=4.32 remains open up to the underside at Y=6.9.
  for (const [a, end] of [[-31, -16], [-16, -1], [-1, 14], [14, 31]])
    bay(46, (a + end) / 2, end - a, 7.1, 14.75, Math.PI / 2);
  box([46, 7.05, 0], [.28, .3, 62], P.teal, true, .02);
  // Full-height supports sit outside the existing x=46 walking edge, within
  // its original x=46.4 column-foot envelope, and align with closed ground bays.
  for (const z of [-24.2, 0, 29.6]) box([46.25, 7.5, z], [.28, 14.75, .35], P.teal, true, .025);
  // External fascia makes the open L1 gallery read as a deliberate floor band.
  // It sits above the 4.1 m courtyard crossing and outside the existing slab.
  for (const [a, end] of [[1, 29.425], [29.775, 31]])
    box([46.25, 4.205, (a + end) / 2], [.28, .19, end - a], P.cream, true, .015);
  for (const [a, end] of [[-25.95, -22.5], [-3.5, 3.5], [28.5, 30.8]])
    box([46, 1.725, (a + end) / 2], [.27, 3.2, end - a], P.cream, true, .025);

  // A recessed entrance portal and thick soffit provide an identifiable entry
  // volume without extending the building or changing the approach at -29.5.
  // The south jamb stays in the original corner-column foot, preserving the
  // old x=45,z=-31 corner door as well as the primary east approach.
  box([46.19, 2, -30.75], [.4, 3.75, .6], P.cream, true, .035);
  box([45.45, 2, -26.25], [1.1, 3.75, .6], P.cream, true, .035);
  box([44.5, 4.1, -28.5], [3, .45, 5], P.cream, true, .035);
  box([44.5, 3.89, -28.5], [2.85, .04, 4.85], P.teal);

  // Closed west sawtooth cheeks follow the existing three roof ramps exactly.
  const cheek = (z0: number, z1: number) => {
    const points: [number, number][] = [[9, z0], [9, z1], [11.5, z1]];
    for (const side of [-1, 1]) b.face(points.map(([y, z]) => [-46 + side * .1, y, z] as V3), P.cream, [side, 0, 0]);
    points.forEach(([y, z], i) => {
      const [ey, ez] = points[(i + 1) % points.length];
      b.face([[-46.1, y, z], [-45.9, y, z], [-45.9, ey, ez], [-46.1, ey, ez]], P.cream, [0, z - ez, ey - y]);
    });
  };
  for (const z0 of [-31, -10, 11]) {
    cheek(z0, z0 + 21);
    for (const y of [9, 11.5]) box([-23.5, y, z0], [45, .22, .2], P.teal);
    for (const x of [-45.85, -31, -16, -1.15]) box([x, 10.25, z0], [.28, 2.5, .22], P.cream);
  }
  // Eaves and layered gable fascias reinforce the roof silhouette; existing
  // steel rafters and all interior cross-bracing remain visible and unchanged.
  for (const z of [-31, 31]) {
    box([-23.5, 8.98, z], [45, .3, .32], P.teal);
    box([22.5, 14.9, z], [47, .3, .26], P.teal);
    for (const [a, ay, end, by] of [[-1, 15, 22.5, 18], [22.5, 18, 46, 15]]) {
      const length = Math.hypot(end - a, by - ay), angle = Math.atan2(by - ay, end - a);
      b.tr([(a + end) / 2, (ay + by) / 2, z + Math.sign(z) * .08], [0, 0, angle], () =>
        cbox(b, [0, 0, 0], [length, .32, .16], P.cream, .025));
    }
  }
  const geometry = b.build();
  return { geometry, solids, triangles: b.triangles };
}
