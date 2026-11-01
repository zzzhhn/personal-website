import { Builder, bar, cbox } from '../WorldStreetGeometry.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';

/** Open steel frame inside the original protected rack volume. Shelf top/bottom
 * planes and the amber frontage stay fixed; these details own no colliders. */
export function addIbdStockRack(b: Builder, cube: IbdCube, x: number) {
  for (const dx of [-3, 3]) for (const z of [-24.5, -21.5]) {
    cube([x + dx, 2.5, z], [.2, 5, .2], P.dark, false, 0);
    cube([x + dx, .1, z], [.34, .12, .34], P.steel, false, 0);
  }
  for (const y of [.4, 2.5, 4.7]) {
    cube([x, y + .06, -23], [6.4, .06, 3.4], P.steel, false, 0);
    for (const side of [-1, 1]) {
      const z = -23 + side * 1.57;
      cube([x, y - .015, z], [6.4, .15, .16], P.dark, false, 0);
      cube([x, y - .065, z], [6.4, .05, .26], P.steel, false, 0);
      // Flush cleats reveal where the shelf beams meet the front uprights.
      cube([x + side * 3, y, -21.36], [.28, .18, .1], P.blue, false, 0);
      cube([x + side * 3, y, -21.303], [.07, .07, .025], P.cutSteel, false, 0);
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
