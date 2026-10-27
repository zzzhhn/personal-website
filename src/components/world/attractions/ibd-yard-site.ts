import { bar, lathe, type Builder } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import { IBD_FIXTURES } from './ibd-yard-lighting.ts';
import { IBD_SHEDS } from './ibd-yard-layout.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';

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
  // Rear and side fencing; the south path and portal approach remain open.
  for (const x of [-33, 33]) {
    cube([x, .2, 0], [.25, .4, 58], P.concrete, true, 0);
    for (const y of [.65, 1.7]) bar(b, [x, y, -29], [x, y, 29], .045, P.dark, 4);
    for (let z = -29; z <= 29; z += 2) cube([x, .95, z], [.08, 1.5, .08], P.dark, false, 0);
  }
  for (const x of [-24, 24]) {
    cube([x, .2, 29], [17, .4, .25], P.concrete, true, 0);
    for (const y of [.65, 1.7]) bar(b, [x - 8.5, y, 29], [x + 8.5, y, 29], .045, P.dark, 4);
    for (let xx = x - 8; xx <= x + 8; xx += 2) cube([xx, .95, 29], [.08, 1.5, .08], P.dark, false, 0);
  }
  // Few large faceted shrubs in contained planters, away from the inspection faces.
  for (const x of [-24, 24]) {
    cube([x, .5, 27], [6, .85, 2.3], P.concrete, true);
    cube([x, .95, 27], [5.6, .1, 1.9], P.timber, false, 0);
    for (const xx of [-1.8, 0, 1.8]) b.tr([x + xx, .95, 27], [0, xx, 0], () =>
      lathe(b, [[0, 0], [.8, .2], [1.1, .9], [.6, 1.65], [0, 1.9]], xx ? P.leaf : P.leafDark, { sides: 5, faceted: true }));
  }
  for (const f of IBD_FIXTURES) {
    const [x, y, z] = f.at;
    if (f.pendant) {
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
