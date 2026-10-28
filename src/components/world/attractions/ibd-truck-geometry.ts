import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import type { IbdCube, IbdSolid } from './ibd-yard-architecture.ts';

const trim: Surf = { color: '#b8c2c2', rough: .57, metal: .38 };
const seam: Surf = { color: '#40575c', rough: .67, metal: .28 };

/** Side-loading rigid truck. Its long axis follows the two real pallet bays (+Z).
 * West remains open all the way to the floor: no decorative sill crosses a ramp. */
export function buildIbdTruck(b: Builder, cube: IbdCube, solids: IbdSolid[]) {
  cube([16, .75, 12.5], [4, .3, 9], P.dark, true);
  cube([18, 2.3, 12.5], [.2, 3.1, 9], P.green, true);
  cube([16, 3.9, 12.5], [4, .16, 9], P.green, true);
  for (const z of [8, 17]) cube([16, 2.3, z], [4, 3.1, .15], P.steel, true);

  // Body framing stays at the ends and east wall; the opening has no middle post.
  for (const z of [8.15, 16.85]) {
    cube([16, .49, z], [3.8, .19, .18], P.steel);
    cube([16, .98, z], [3.9, .12, .16], P.amber);
    for (const x of [14.18, 15.1, 16, 16.9, 17.82]) {
      cube([x, 2.3, z < 12 ? 7.905 : 17.095], [.08, 2.8, .035], seam, false, 0);
      for (const y of [1.05, 3.6]) cube([x, y, z < 12 ? 7.879 : 17.121], [.06, .06, .02], trim, false, 0);
    }
  }
  for (let z = 8.5; z < 17; z += .65) cube([16, .907, z], [3.8, .014, .025], seam, false, 0);
  for (const x of [14.12, 17.88]) cube([x, 3.8, 12.5], [.15, .15, 8.8], trim);
  for (const z of [8.2, 12.5, 16.8]) {
    cube([18.105, 2.3, z], [.035, 2.85, .09], seam, false, 0);
    cube([18.13, .98, z], [.045, .09, .22], P.amber, false, .01);
  }
  for (const x of [14.7, 17.3]) cube([x, .38, 14.3], [.23, .24, 13.5], P.dark);
  for (const z of [9.5, 14.5, 19.5]) cube([16, .47, z], [3.5, .18, .22], P.steel);

  // One conservative cabin collider, with a shaped visual shell instead of a box
  // hiding the wheels. The lower side panel follows the wheel opening itself.
  solids.push({ at: [16, 1.55, 19.5], size: [3.8, 2.6, 3.5] });
  cube([16, 2.04, 19.5], [3.8, 1.62, 3.5], P.green, false, .15);
  cube([16, .85, 19.5], [3.05, .75, 3.45], P.dark, false, .1);
  for (const side of [-1, 1]) {
    const x = 16 + side * 1.9;
    // Bottom boundary rises over the wheel, producing a true side silhouette.
    const rim = (radius: number, angle: number, depth = 0): V3 =>
      [x + side * depth, .6 + radius * Math.sin(angle), 19.5 + radius * Math.cos(angle)];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI, c = (i + 1) / 12 * Math.PI;
      const p = rim(.73, a), q = rim(.73, c);
      b.face([p, q, [x, 1.4, q[2]], [x, 1.4, p[2]]], P.green, [side, 0, 0]);
      b.face([rim(.66, a, .025), rim(.66, c, .025), rim(.73, c, .025), rim(.73, a, .025)], P.dark, [side, 0, 0]);
    }
    for (const z of [18.25, 20.75]) cube([x - side * .06, .97, z], [.12, .88, 1.02], P.green, false, .03);
    cube([x + side * .012, 2.24, 19.65], [.018, .93, 2.45], P.dark, false, .005);
    cube([x + side * .026, 2.28, 19.65], [.012, .7, 2.2], P.glass, false, .005);
    cube([x + side * .034, 2.28, 18.85], [.014, .72, .055], P.dark, false, 0);
    // Door seam, grab handle, step and mirror bracket are real layered pieces.
    cube([x + side * .02, 1.65, 18.35], [.02, .7, .025], seam, false, 0);
    cube([x + side * .043, 1.63, 18.65], [.04, .055, .29], trim, false, .008);
    cube([x, .49, 18.3], [.3, .1, .74], P.steel, false, .025);
    bar(b, [x, 2.1, 20.72], [x + side * .24, 2.38, 20.83], .035, P.dark, 6);
    cube([x + side * .24, 2.46, 20.87], [.15, .38, .18], P.dark, false, .04);
    cube([x + side * .24, 2.46, 20.766], [.11, .29, .018], P.glass, false, .005);
  }
  // Front faces +Z: broad split glazing, wipers, modest grille and inset lamps.
  cube([16, 2.24, 21.258], [3.2, 1.02, .018], P.dark, false, .005);
  for (const side of [-1, 1]) {
    cube([16 + side * .79, 2.29, 21.275], [1.4, .77, .016], P.glass, false, .005);
    bar(b, [16 + side * .15, 1.93, 21.292], [16 + side * 1.22, 2.13, 21.292], .017, P.dark, 6);
    cube([16 + side * 1.35, 1.05, 21.285], [.49, .28, .055], P.dark, false, .025);
    cube([16 + side * 1.35, 1.06, 21.32], [.38, .19, .025], P.pale, false, .02);
    cube([16 + side * 1.69, 1.06, 21.29], [.12, .18, .025], P.amber, false, .01);
    cube([16 + side * 1.62, 2.87, 20.5], [.12, .045, .16], P.amber, false, .01);
  }
  cube([16, 1.06, 21.23], [3.55, .63, .12], P.green, false, .04);
  cube([16, 1.1, 21.3], [1.75, .57, .035], P.dark, false, .01);
  for (let y = .9; y < 1.4; y += .13) cube([16, y, 21.325], [1.64, .04, .025], trim, false, 0);
  cube([16, .64, 21.26], [3.7, .24, .22], P.dark, false, .06);
  cube([16, .65, 21.376], [.6, .16, .018], P.pale, false, .008);

  // Six axles ends share the same travel axis as the chassis; rims face outwards.
  for (const z of [9.5, 14.5, 19.5]) for (const side of [-1, 1]) {
    const x = 16 + side * 1.73;
    b.tr([x, .6, z], [0, 0, Math.PI / 2], () => {
      lathe(b, [[0, -.23], [.5, -.23], [.58, -.15], [.58, .15], [.5, .23], [0, .23]], P.rubber, { sides: 20 });
      for (const y of [-.237, .237]) lathe(b, [[0, y], [.3, y], [.34, y + .008], [0, y + .008]], P.steel, { sides: 16 });
    });
    for (let i = 0; i < 6; i++) cbox(b, [x + side * .25, .6 + .2 * Math.sin(i * Math.PI / 3), z + .2 * Math.cos(i * Math.PI / 3)], [.025, .05, .05], seam, .005);
  }
  for (const z of [10.5, 14.5]) cube([12.5, .45, z], [Math.hypot(3, .9), .14, 2.9], P.steel, true, 0, [0, 0, Math.atan2(.9, 3)]);
}
