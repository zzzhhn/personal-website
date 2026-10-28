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
