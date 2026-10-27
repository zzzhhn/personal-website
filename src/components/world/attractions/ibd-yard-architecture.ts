import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_SHEDS, IBD_CRANE_Y } from './ibd-yard-layout.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import { buildIbdPaving } from './ibd-yard-site.ts';

export interface IbdSolid { at: V3; size: V3; rotation?: V3 }
export type IbdCube = (at: V3, size: V3, surface: Surf, solid?: boolean, bevel?: number, rotation?: V3) => void;

/** Three distinct building sections, sharing only construction details and the physical roof contract. */
export function buildIbdArchitecture(b: Builder, cube: IbdCube) {
  const groundSurface = buildIbdPaving(b);
  for (const shed of IBD_SHEDS) {
    const { x, z, width: w, depth: d, eave: h, rise } = shed;
    const left = x - w / 2, right = x + w / 2, back = z - d / 2, front = z + d / 2;
    const roof = shed.id === 'coil' ? P.roof : shed.id === 'parts' ? P.blue : P.green;
    cube([x, h - .5, front + .2], [8.2, 1.4, .16], P.dark);
    // Full-height rear and outer side cladding, deliberately open across the working frontage.
    const wall = (cx: number, cz: number, length: number, side: boolean) => {
      cube([cx, h / 2, cz], side ? [.18, h, length] : [length, h, .18], P.wall, true, 0);
      const n = Math.ceil(length / 2);
      for (let i = 0; i < n; i++) for (let y = 1.4; y < h; y += 2.8) {
        const p = -length / 2 + (i + .5) * length / n;
        cube([cx + (side ? .11 : p), Math.min(y, h - 1.4), cz + (side ? p : .11)],
          side ? [.04, 2.65, length / n - .04] : [length / n - .04, 2.65, .04], i % 3 ? P.wall : P.pale, false, 0);
      }
    };
    // The dispatch rear stays open along both pallet lanes; its east wall forms the long low silhouette.
    if (shed.id !== 'dispatch') wall(x, back, w, false);
    wall(shed.id === 'coil' ? left : right, z, d, true);
    for (const zz of [back, z, front]) {
      for (const xx of [left, right]) {
        cube([xx, h / 2, zz], [.46, h, .55], P.dark, true);
        cube([xx, .35, zz], [.86, .7, .95], P.concrete, true);
        cube([xx, 1.7, zz + .29], [.32, 2, .06], P.amber);
        bar(b, [xx, h - 2.2, zz], [xx + (xx === left ? 2.2 : -2.2), h, zz], .18, P.steel, 4);
      }
      bar(b, [left, h, zz], [x, h + rise, zz], .24, P.dark, 4);
      bar(b, [x, h + rise, zz], [right, h, zz], .24, P.dark, 4);
      bar(b, [left, h - .25, zz], [right, h - .25, zz], .12, P.steel, 4);
      for (let i = 1; i < 8; i++) {
        const xx = left + w * i / 8, yy = h + rise * (1 - Math.abs(xx - x) / (w / 2));
        bar(b, [xx, h - .25, zz], [xx, yy, zz], .06, P.steel, 4);
      }
    }
    const angle = Math.atan2(rise, w / 2), span = Math.hypot(w / 2, rise);
    for (const side of [-1, 1]) {
      cube([x + side * w / 4, h + rise / 2, z], [span + .65, .22, d + .9], roof, true, 0, [0, 0, -side * angle]);
      // Standing seams follow each slope, not arbitrary diagonal decorative bars.
      for (let zz = back - .3; zz <= front + .3; zz += 1.2)
        bar(b, [x + side * (w / 2 + .2), h + .16, zz], [x, h + rise + .16, zz], .035, P.steel, 4);
      cube([x + side * (w / 2 + .2), h - .03, z], [.25, .32, d + 1], P.dark);
    }
    // A closed front gable gives a readable shed rather than a pair of floating roof planes.
    for (const zz of [back - .2, front + .2]) {
      for (const dir of [-1, 1]) b.face([[left, h, zz], [right, h, zz], [x, h + rise, zz]], roof, [0, 0, dir]);
      for (let xx = left + 1; xx < right; xx += 1.2) {
        const hh = rise * (1 - Math.abs(xx - x) / (w / 2));
        cube([xx, h + hh / 2, zz + .03], [.045, hh, .05], P.steel, false, 0);
      }
    }
    if (shed.id === 'parts') {
      cube([x, h + rise + .45, z], [3.2, .9, d - 3], P.dark);
      for (const side of [-1, 1]) for (let zz = back + 2; zz < front - 2; zz += 2.5)
        cube([x + side * 1.62, h + rise + .5, zz], [.035, .65, 2.1], P.lens, false, 0);
      cube([x, h + rise + 1, z], [3.7, .16, d - 2.5], roof);
    } else {
      // Roof lantern strips: metal frames, opaque frosted glass, no transparency sorting or extra draw.
      for (const side of [-1, 1]) for (let zz = back + 3; zz < front - 2; zz += shed.id === 'coil' ? 7 : 5) {
        const xx = x + side * w * .19, yy = h + rise * .62 + .22;
        cube([xx, yy, zz], [span * .45, .12, 2.6], P.dark, false, 0, [0, 0, -side * angle]);
        cube([xx, yy + .08, zz], [span * .45 - .24, .05, 2.3], P.glass, false, 0, [0, 0, -side * angle]);
      }
    }
  }
  // Heavy double bridge over the coil court. Trolley, sling and coil remain independently animated.
  for (const z of [-6, -2]) {
    cube([-17, IBD_CRANE_Y, z], [27, .78, .5], P.amber);
    cube([-17, IBD_CRANE_Y + .43, z], [27, .12, .7], P.dark);
    for (const x of [-30, -3.8]) {
      cube([x, IBD_CRANE_Y / 2, z], [.42, IBD_CRANE_Y, .48], P.dark, true);
      bar(b, [x, IBD_CRANE_Y - 1.5, z], [x + (x < -10 ? 1.8 : -1.8), IBD_CRANE_Y, z], .15, P.steel, 4);
    }
  }
  // Gallery columns support the existing continuous walking shell, outside its clear capsule corridor.
  for (const x of [-25.4, -18, -10, -4.9]) cube([x, 2, -15.7], [.22, 4, .22], P.dark, true);
  for (const z of [-11, -6, -2.7]) cube([-4.9, 2, z], [.22, 4, .22], P.dark, true);
  return groundSurface;
}

/** Deep rear stores and maintenance alcove, kept outside inspection faces and every animated pallet lane. */
export function buildIbdStores(b: Builder, cube: IbdCube, solids: IbdSolid[]) {
  const crate = (x: number, y: number, z: number, w = 2.2) => {
    cube([x, y, z], [w, 1.5, 1.65], P.timber, false, .04);
    for (const xx of [-w / 2 + .14, w / 2 - .14]) cube([x + xx, y, z + .84], [.14, 1.5, .08], P.endgrain);
    for (const yy of [-.6, .6]) cube([x, y + yy, z + .85], [w, .12, .1], P.endgrain);
  };
  for (const x of [5, 13, 23]) {
    solids.push({ at: [x, 2.5, -23], size: [6.4, 5, 3.4] });
    for (const xx of [x - 3, x + 3]) cube([xx, 2.5, -23], [.2, 5, 3.2], P.dark);
    for (const y of [.4, 2.5, 4.7]) cube([x, y, -23], [6.4, .18, 3.4], P.steel);
    for (const xx of [x - 1.6, x + 1.5]) crate(xx, 1.3, -23);
    if (x === 13) {
      for (const xx of [x - 1.8, x, x + 1.8]) b.tr([xx, 2.6, -23], [0, 0, 0], () => {
        lathe(b, [[0, 0], [.6, 0], [.65, .12], [.65, 1.5], [.6, 1.65], [0, 1.65]], P.blue, { sides: 10 });
        for (const y of [.3, 1.3]) lathe(b, [[.65, y], [.68, y], [.68, y + .08], [.65, y + .08]], P.steel, { sides: 10 });
      });
    } else for (const xx of [x - 1.6, x + 1.5]) crate(xx, 3.35, -23);
  }
  // Background coils on yellow cradles stay behind the gallery, distinct from the two numbered specimens.
  for (const x of [-26, -20, -14]) {
    cube([x, .3, -21], [4.5, .45, 2.7], P.amber, true);
    b.tr([x, 2, -21], [Math.PI / 2, 0, 0], () => lathe(b,
      [[.65, -1.2], [1.7, -1.2], [1.8, -1], [1.8, 1], [1.7, 1.2], [.65, 1.2], [.65, -1.2]], P.steel, { sides: 16, caps: false, faceted: true }));
    solids.push({ at: [x, 2, -21], size: [3.6, 3.6, 2.4] });
  }
  // Small service cabinet and louvred vent, not a fourth competing warehouse.
  cube([-28.5, 1.7, 12], [3, 3.4, 5.5], P.wall, true);
  cube([-28.5, 3.5, 12], [3.5, .22, 6], P.roof);
  for (let y = 1.1; y < 2.8; y += .23) cube([-26.94, y, 12], [.1, .09, 2], P.dark, false, 0);
  cube([-27.1, .7, 16], [2.2, 1.4, 1.5], P.green, true);
}
