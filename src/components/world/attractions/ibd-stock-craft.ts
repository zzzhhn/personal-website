import { Builder, bar, box, cbox, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';

const SHELF_ZINC = { color: '#c8cfcb', rough: .58, metal: .29 } satisfies Surf;
const RACK_PAINT = { color: '#435c6f', rough: .56, metal: .13 } satisfies Surf;

// Shelf skin section from the deck edge to the lower bearing return, in metres.
const SHELF_OUTER = [[1.6,.09],[1.663,.09],[1.7,.056],[1.7,-.026],[1.672,-.052],[1.54,-.052]];
const SHELF_INNER = [[1.6,.078],[1.659,.078],[1.688,.051],[1.688,-.021],[1.667,-.040],[1.54,-.040]];
const REAR_OUTER = [[1.6,.09],[1.7,.09],[1.7,-.052],[1.54,-.052]];
const REAR_INNER = [[1.6,.078],[1.688,.078],[1.688,-.040],[1.54,-.040]];
function addShelfFold(b: Builder, x: number, y: number, side: number, simpleRear: boolean) {
  const outer = simpleRear ? REAR_OUTER : SHELF_OUTER;
  const inner = simpleRear ? REAR_INNER : SHELF_INNER;
  const left = x - 3.2, right = x + 3.2;
  const at = (xx: number, [u, dy]: number[]): V3 => [xx, y + dy, -23 + side * u];
  for (let i = 1; i < outer.length; i++) {
    const outerStart = outer[i - 1], outerEnd = outer[i];
    const innerStart = inner[i - 1], innerEnd = inner[i];
    const normal: V3 = [0, outerEnd[0] - outerStart[0], side * (outerStart[1] - outerEnd[1])];
    b.face([at(left, outerStart), at(left, outerEnd), at(right, outerEnd), at(right, outerStart)], SHELF_ZINC, normal);
    b.face([at(left, innerStart), at(left, innerEnd), at(right, innerEnd), at(right, innerStart)], SHELF_ZINC, [0, -normal[1], -normal[2]]);
    for (const end of [-1, 1]) {
      const xx = x + end * 3.2;
      b.face([at(xx, outerStart), at(xx, outerEnd), at(xx, innerEnd), at(xx, innerStart)], SHELF_ZINC, [end, 0, 0]);
    }
  }
  const outerReturn = outer[outer.length - 1], innerReturn = inner[inner.length - 1];
  b.face([at(left, outerReturn), at(right, outerReturn), at(right, innerReturn), at(left, innerReturn)],
    SHELF_ZINC, [0, 0, -side]);
}

type OmittedFaces = Parameters<typeof box>[5];
function rackBox(b: Builder, at: V3, size: V3, material: Surf, faces: OmittedFaces) {
  const [x, y, z] = at;
  const [dx, dy, dz] = size.map(n => n / 2);
  box(b, [x - dx, y - dy, z - dz], [x + dx, y + dy, z + dz], material, 0, faces);
}

function addTrimmedRackBeam(b: Builder, x: number, y: number, side: number) {
  const z = -23 + side * 1.535;
  const noEnds = { px: null, nx: null };
  rackBox(b, [x, y - .155, z], [5.8, .126, .10], RACK_PAINT, { ...noEnds, py: null, ny: null });
  for (const [dy, depth] of [[-.072, .24], [-.238, .21]]) {
    rackBox(b, [x, y + dy, z], [5.8, .04, depth], RACK_PAINT, noEnds);
    // The post caps the beam end up to 1.6 m from the rack centreline.
    // Close the exposed flange overhang at both ends.
    const postEdge = -23 + side * 1.6, flangeEdge = z + side * depth / 2;
    const low = y + dy - .02, high = y + dy + .02;
    for (const end of [-1, 1]) {
      const xx = x + end * 2.9;
      b.face([[xx, low, postEdge], [xx, low, flangeEdge], [xx, high, flangeEdge], [xx, high, postEdge]],
        RACK_PAINT, [end, 0, 0]);
    }
  }
}

/** Open steel frame inside the original protected rack volume. Shelf top/bottom
 * planes and the amber frontage stay fixed; these details own no colliders. */
export function addIbdStockRack(b: Builder, cube: IbdCube, x: number, style: 'legacy' | 'sample' | 'family' = 'legacy') {
  const foldedShelf = style !== 'legacy';
  const family = style === 'family';
  for (const dx of [-3, 3]) for (const z of [-24.5, -21.5]) {
    if (family) {
      rackBox(b, [x + dx, 2.5, z], [.2, 5, .2], RACK_PAINT, { ny: null });
      rackBox(b, [x + dx, .1, z], [.34, .12, .34], P.steel, { ny: null });
    } else {
      cube([x + dx, 2.5, z], [.2, 5, .2], foldedShelf ? RACK_PAINT : P.dark, false, 0);
      cube([x + dx, .1, z], [.34, .12, .34], P.steel, false, 0);
    }
  }
  for (const y of [.4, 2.5, 4.7]) {
    cube([x, y + .06, -23], [6.4, .06, foldedShelf ? 3.2 : 3.4], foldedShelf ? SHELF_ZINC : P.steel, false, 0);
    for (const side of [-1, 1]) {
      if (family) {
        addShelfFold(b, x, y, side, side < 0);
        addTrimmedRackBeam(b, x, y, side);
      } else if (foldedShelf) {
        addShelfFold(b, x, y, side, false);
        // The zinc return rests at y - .052 on the top flange. The web is inset.
        const z = -23 + side * 1.535;
        cube([x, y - .072, z], [5.8, .04, .24], RACK_PAINT, false, 0);
        cube([x, y - .155, z], [5.8, .126, .10], RACK_PAINT, false, 0);
        cube([x, y - .238, z], [5.8, .04, .21], RACK_PAINT, false, 0);
      } else {
        const z = -23 + side * 1.57;
        cube([x, y - .015, z], [6.4, .15, .16], P.dark, false, 0);
        cube([x, y - .065, z], [6.4, .05, .26], P.steel, false, 0);
      }
      // Original-size cleat spans the end of the web and the front upright.
      cube([x + side * 3, foldedShelf ? y - .123 : y, foldedShelf ? -21.405 : -21.36], [.28, .18, foldedShelf ? .19 : .1], foldedShelf ? RACK_PAINT : P.blue, false, 0);
      cube([x + side * 3, foldedShelf ? y - .123 : y, -21.303], [.07, .07, .025], P.cutSteel, false, 0);
    }
    cube([x, y + .13, -21.29], [6.2, .12, .06], P.amber, false, 0);
  }
  for (const side of [-1, 1]) bar(b,
    [x + side * 3, .5, -24.45], [x + side * 3, 4.6, -21.55], .045, P.steel, 4);
}

/** External joinery only. The original shell, foam channel, hoist and label are
 * retained verbatim; all new faces stay below the lid and inside its envelope. */
export function addIbdPackBindings(b: Builder) {
  for (const x of [-1.44, 1.44]) {
    for (const z of [-1.16, 1.16]) cbox(b, [x, .6, z], [.06, .72, .15], P.endgrain, 0);
    cbox(b, [x, .6, 0], [.06, .72, .09], P.endgrain, 0);
  }
  for (const z of [-1.295, 1.295]) {
    for (const y of [.26, .94]) cbox(b, [0, y, z], [2.72, .1, .035], P.timber, 0);
    for (const x of [-1.27, 1.27]) cbox(b, [x, .62, z], [.09, .74, .035], P.endgrain, 0);
  }
  for (const x of [-.88, .88]) {
    cbox(b, [x, .6, 1.289], [.055, .77, .012], P.blue, 0);
    cbox(b, [x, .78, 1.3075], [.09, .1, .025], P.cutSteel, 0);
  }
  for (const x of [-1.415, 1.415]) for (const y of [.32, .92])
    cbox(b, [x, y, 0], [.018, .035, 2.28], P.blue, 0);
}
