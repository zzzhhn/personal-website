import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';

const cutSteel: Surf = { color: '#b8c2c2', rough: .57, metal: .38 };
const winding: Surf = { color: '#60737b', rough: .65, metal: .32 };
/** A continuous rolled sheet, with a genuinely recessed rear inspection defect.
 * All sheet faces and bands stay inside the existing 2 × 2 × 1.4 m half extents. */
export function addWoundCoil(b: Builder, damaged: boolean) {
  b.tr([0, 0, 0], [Math.PI / 2, 0, 0], () => {
    lathe(b, [[1.9, -1.35], [1.985, -1.2], [1.985, 1.2], [1.9, 1.35]], P.steel, { sides: 40, caps: false });
    lathe(b, [[.65, 1.35], [.65, -1.35]], winding, { sides: 32, caps: false });
    for (const z of [-.9, .9]) lathe(b, [[1.99, z - .07], [2, z - .07], [2, z + .07], [1.99, z + .07]], P.blue, { sides: 40, caps: false });
  });
  const dent = (x: number, y: number, side: number) => damaged && side < 0
    ? .24 * Math.max(0, 1 - Math.hypot((x + .72) / .53, (y - .82) / .68)) ** 2 : 0;
  const point = (r: number, a: number, side: number): V3 => {
    const x = r * Math.cos(a), y = r * Math.sin(a);
    return [x, y, side * (1.35 - dent(x, y, side))];
  };
  for (const side of [-1, 1]) {
    for (let ring = 0; ring < 10; ring++) for (let i = 0; i < 48; i++) {
      const r = .65 + ring * 1.25 / 10, outer = .65 + (ring + 1) * 1.25 / 10;
      const a = i / 48 * Math.PI * 2, next = (i + 1) / 48 * Math.PI * 2;
      const p = [point(r, a, side), point(outer, a, side), point(outer, next, side), point(r, next, side)];
      const depth = dent((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, side);
      b.face(p, depth > .012 ? (depth > .08 ? winding : P.rust) : ring % 3 === 0 ? P.steel : cutSteel, [0, 0, side]);
    }
    // One continuous spiral per end, not five disconnected decorative rings.
    const turns = 8.5, segments = 340;
    for (let i = 0; i < segments; i++) {
      const t = i / segments, u = (i + 1) / segments;
      const a = t * turns * Math.PI * 2, next = u * turns * Math.PI * 2;
      const p = [point(.69 + 1.16 * t, a, side), point(.69 + 1.16 * u, next, side),
        point(.707 + 1.16 * u, next, side), point(.707 + 1.16 * t, a, side)];
      p.forEach(v => v[2] += side * .003);
      b.face(p, winding, [0, 0, side]);
    }
  }
  // Buckles sit on the upper barrel instead of floating beyond its broad side.
  for (const z of [-.9, .9]) {
    cbox(b, [0, 1.975, z], [.23, .045, .22], winding, .015);
    cbox(b, [0, 1.998, z], [.14, .004, .15], cutSteel);
  }
}

export function addInspectionTools(b: Builder) {
  // Inspection head faces the cargo (-z); the handgrip stays in the old tool pivot.
  b.tr([0, 0, 0], [-Math.PI / 2, 0, 0], () => {
    lathe(b, [[0, -.27], [.085, -.27], [.09, -.23], [.09, .04], [.145, .1], [.145, .19], [0, .19]], P.dark, { sides: 16 });
    for (const y of [-.19, -.12, -.05]) lathe(b, [[.089, y], [.098, y], [.098, y + .025], [.089, y + .025]], P.rubber, { sides: 16 });
    lathe(b, [[.11, .18], [.147, .18], [.147, .205], [.11, .205]], cutSteel, { sides: 20, caps: false });
    lathe(b, [[0, .197], [.108, .197], [.108, .2], [0, .2]], P.pale, { sides: 20 });
  });
  cbox(b, [.04, .098, .04], [.065, .025, .09], P.amber, .008);
  // Caliper beam, fixed jaw, sliding jaw and an engraved scale.
  cbox(b, [.4, 0, 0], [.6, .045, .07], cutSteel, .008);
  for (const x of [.13, .5]) {
    cbox(b, [x, -.09, 0], [.045, .21, .065], cutSteel, .006);
    cbox(b, [x + (x < .2 ? .03 : -.03), -.185, 0], [.09, .035, .065], cutSteel, .006);
  }
  cbox(b, [.5, .02, 0], [.16, .1, .1], P.blue, .012);
  cbox(b, [.5, .073, 0], [.1, .008, .055], P.dark);
  for (let i = 0; i < 11; i++) cbox(b, [.21 + i * .043, .024, -.005], [.006, .003, i % 5 === 0 ? .05 : .026], winding);
}

/** Surface-mounted truck details. The open west side and both loading ramps remain clear. */
export function addDispatchTruckDetails(b: Builder, cube: IbdCube) {
  // Sill, crossmembers, bed seams and rear body rivets provide a readable layered construction.
  for (const z of [8.18, 16.82]) {
    cube([17, .47, z], [7.7, .19, .18], P.steel);
    cube([17, .96, z], [7.8, .12, .16], P.amber);
    for (let x = 13.5; x < 21; x += 1.1) {
      cube([x, 2.3, z < 12 ? 7.905 : 17.095], [.09, 2.8, .04], P.dark);
      for (const y of [1, 3.6]) cube([x, y, z < 12 ? 7.878 : 17.122], [.075, .075, .025], cutSteel);
    }
  }
  for (let z = 8.5; z < 17; z += .65) cube([17, .907, z], [7.8, .014, .025], winding, false, 0);
  for (const x of [14.5, 19]) cube([x, .37, 12.5], [.22, .24, 8.5], P.dark);
  // Six wheels face across the vehicle rather than pointing along its travel direction.
  for (const x of [14.5, 19, 23]) for (const side of [-1, 1]) {
    const z = 12.5 + side * (x === 23 ? 1.73 : 4.12), radius = x === 23 ? .53 : .58;
    b.tr([x, .6, z], [Math.PI / 2, 0, 0], () => {
      lathe(b, [[0, -.21], [radius - .09, -.21], [radius, -.13], [radius, .13], [radius - .09, .21], [0, .21]], P.rubber, { sides: 20 });
      for (const y of [-.216, .216]) lathe(b, [[0, y], [.31, y], [.34, y + .008], [0, y + .008]], P.steel, { sides: 16 });
    });
    for (let i = 0; i < 6; i++) cbox(b, [x + .2 * Math.cos(i * Math.PI / 3), .6 + .2 * Math.sin(i * Math.PI / 3), z + side * .23], [.052, .052, .03], P.dark, .008);
  }
  // Cab faces +x. Split the windshield with physical surrounds, wipers and a lower grille.
  cube([24.761, 2.25, 12.5], [.018, 1.05, 3.12], P.dark, false, .005);
  for (const side of [-1, 1]) {
    cube([24.777, 2.29, 12.5 + side * .77], [.018, .81, 1.38], P.glass, false, .005);
    bar(b, [24.796, 1.93, 12.5 + side * .15], [24.796, 2.14, 12.5 + side * 1.25], .016, P.dark, 6);
    cube([23.05, 2.33, 12.5 + side * 1.91], [2.54, .94, .024], P.dark, false, .01);
    cube([23.05, 2.36, 12.5 + side * 1.929], [2.28, .7, .018], P.glass, false, .005);
    cube([22.2, 1.58, 12.5 + side * 1.94], [.25, .055, .045], cutSteel);
    cube([24.78, 1.07, 12.5 + side * 1.36], [.04, .25, .44], P.pale, false, .02);
    cube([21.4, .95, 12.5 + side * 1.9], [.22, .12, .13], P.amber);
  }
  cube([24.78, .63, 12.5], [.08, .25, 3.35], P.dark);
  for (let y = .98; y <= 1.63; y += .13) cube([24.78, y, 12.5], [.035, .06, 1.9], winding, false, 0);
  for (const z of [8.25, 16.75]) cube([13.05, .62, z], [.18, .24, .34], P.rust);
}

/** Task-specific controls share the existing protected base and physical reach anchors. */
export function addYardControl(b: Builder, cube: IbdCube, x: number, z: number, kind: 'crane' | 'turn' | 'scale' | 'load' | 'dispatch') {
  cube([x, .6, z], [.8, 1.2, .7], P.dark, true);
  cube([x, .09, z], [.95, .16, .84], P.steel);
  cube([x, 1.25, z], [1, .16, .9], P.amber);
  if (kind === 'scale' || kind === 'dispatch') {
    cube([x, 1.51, z - .15], [.72, .39, .25], P.dark, false, .025, [-.2, 0, 0]);
    cube([x, 1.55, z - .008], [.55, .19, .026], P.pale, false, .005, [-.2, 0, 0]);
    for (const dx of [-.18, 0, .18]) cube([x + dx, 1.37, z + .18], [.1, .035, .1], dx === .18 ? P.rust : P.green);
    if (kind === 'dispatch') cube([x + .3, 1.38, z + .26], [.17, .06, .23], P.steel);
  } else if (kind === 'turn') {
    b.tr([x, 1.49, z], [Math.PI / 2 - .5, 0, 0], () => {
      lathe(b, [[.19, -.035], [.25, -.035], [.25, .035], [.19, .035], [.19, -.035]], P.dark, { sides: 20, caps: false });
      for (let i = 0; i < 3; i++) bar(b, [0, 0, 0], [.22 * Math.cos(i * Math.PI * 2 / 3), 0, .22 * Math.sin(i * Math.PI * 2 / 3)], .018, P.steel, 6);
    });
    bar(b, [x, 1.3, z], [x, 1.49, z], .05, P.steel, 8);
  } else {
    for (const dx of kind === 'crane' ? [-.22, .22] : [0]) {
      bar(b, [x + dx, 1.3, z], [x + dx, 1.61, z + .13], .045, P.steel, 8);
      cube([x + dx, 1.65, z + .15], [.15, .16, .15], P.rubber, false, .035);
    }
    cube([x + .31, 1.36, z - .2], [.13, .06, .13], P.rust);
  }
}
