import { Builder, bar, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import type { IbdCube, IbdSolid } from './ibd-yard-architecture.ts';
import { IBD_TRUCK_FLOOR as floor, IBD_TRUCK_WHEELS as wheels } from './ibd-yard-layout.ts';

const trim: Surf = { color: '#b8c2c2', rough: .43, metal: .62 };
const seam: Surf = { color: '#40575c', rough: .67, metal: .28 };
const cabGlass: Surf = { color: '#819fa8', rough: .28, metal: .12 };
const chassisPaint: Surf = { color: '#34464a', rough: .62, metal: .25 };
const deckWood: Surf = { color: '#ad8a61', rough: .82, metal: 0 };

/** Manufacturing coordinates travel through the existing merged aMat/aSuv path.
 * Grain runs along the chosen world axis; no sign UV, texture or draw is added. */
function finish(b: Builder, code: -2 | -3 | -4, along: 0 | 2, draw: () => void) {
  const start = b.pos.length / 3;
  draw();
  for (let i = start; i < b.pos.length / 3; i++) {
    if(code===-4 && b.nrm[i*3+1]<.5)continue;
    const cross = Math.abs(b.nrm[i * 3 + 1]) > .55 ? 2 - along : 1;
    b.mat[i * 4 + 3] = code;
    b.suv[i * 2] = b.pos[i * 3 + along];
    b.suv[i * 2 + 1] = b.pos[i * 3 + cross];
  }
}

/** Closed, dished steel wheel with open webs, a bead seat and three tread bands.
 * Local +Y points outboard. The tyre retains the fixed radius/width/contact. */
function truckWheel(b: Builder, side: number, z: number) {
  const x = wheels.centerX + side * wheels.halfTrack;
  b.tr([x, wheels.centerY, z], [0, 0, -side * Math.PI / 2], () => {
    lathe(b, [[.35, -wheels.halfWidth], [.49, -wheels.halfWidth], [.56, -.18],
      [wheels.radius, -.13], [wheels.radius, -.075], [.564, -.065], [.564, -.045], [wheels.radius, -.035],
      [wheels.radius, .035], [.564, .045], [.564, .065], [wheels.radius, .075],
      [wheels.radius, .13], [.56, .18], [.49, wheels.halfWidth], [.35, wheels.halfWidth], [.35, -wheels.halfWidth]],
    P.rubber, { sides: 24, caps: false });
    // A recessed brake drum is visible through the openings, rather than a
    // painted dark spot coplanar with a filled wheel disc.
    lathe(b, [[0, -.17], [.26, -.17], [.28, -.12], [.28, .09], [.25, .115], [0, .115]], chassisPaint, { sides: 16 });
    finish(b, -2, 2, () => {
      lathe(b, [[.29, .145], [.333, .165], [.35, .205], [.36, .225], [.373, .215],
        [.373, .185], [.35, .145], [.29, .12], [.29, .145]], trim, { sides: 24, caps: false });
      // Six pressed webs join the hub to the annular rim. Gaps remain actual
      // openings, with enough dish depth to read at the player's loading view.
      for (let spoke = 0; spoke < 6; spoke++) for (let step = 0; step < 2; step++) {
        const a = spoke * Math.PI / 3 - .19 + step * .19, end = a + .19;
        const point = (r: number, angle: number, back = 0): V3 => [r * Math.cos(angle), .225 - r * .25 - back, r * Math.sin(angle)];
        const face = [point(.105, a), point(.295, a), point(.295, end), point(.105, end)];
        const back = [point(.105, a, .025), point(.295, a, .025), point(.295, end, .025), point(.105, end, .025)];
        b.face(face, trim, [0, 1, 0]); b.face(back, trim, [0, -1, 0]);
        for (let i = 0; i < 4; i++) b.face([face[i], back[i], back[(i + 1) % 4], face[(i + 1) % 4]], trim);
      }
      lathe(b, [[0, .115], [.12, .115], [.125, .19], [.103, .235], [.07, .255], [0, .255]], trim, { sides: 16 });
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        b.tr([.145 * Math.cos(a), .198, .145 * Math.sin(a)], [0, 0, 0], () =>
          lathe(b, [[0, 0], [.024, 0], [.024, .025], [0, .025]], P.cutSteel, { sides: 6, faceted: true }));
      }
    });
  });
}

/** One cab-over sample, inside the original cab/mirror envelope. No seat or new gameplay collider. */
export function buildIbdCab(b: Builder, cube: IbdCube, solids: IbdSolid[]) {
  solids.push({ at: [16, 1.55, 19.5], size: [3.8, 2.6, 3.5] });
  const half = (y: number) => 1.9 - .15 * Math.max(0, Math.min(1.2, y - 1.65));
  const rear = (y: number) => 17.8 + .1 * Math.max(0, Math.min(1, (y - 1.46) / 1.38));
  const front = (y: number) => y < 1.5 ? 21.2 : y < 1.9 ? 21.2 - (y - 1.5) * .1 : 21.16 - (y - 1.9) * .462;
  const sidePoint = (side: number, y: number, z: number, depth = 0): V3 => [16 + side * (half(y) + depth), y, z];
  const frontPoint = (x: number, y: number, depth = 0): V3 => [16 + x, y, front(y) + depth];
  // Closed thin panels keep genuine openings/recesses instead of layering
  // window paint onto an opaque cab box. Each broad plane retains its own normal.
  const panel = (outline: V3[], surface: Surf, axis: V3, thickness = .065) => {
    const back = outline.map(p => p.map((v, k) => v - axis[k] * thickness) as V3);
    const center = outline[0].map((_, k) => outline.reduce((sum, p) => sum + p[k], 0) / outline.length);
    b.face(outline, surface, axis); b.face(back, surface, axis.map(v => -v) as V3);
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      const out = outline[i].map((v, k) => (v + outline[next][k]) / 2 - center[k]) as V3;
      b.face([outline[i], back[i], back[next], outline[next]], surface, out);
    }
  };
  const recessed = (outline: V3[], aperture: V3[], surface: Surf, axis: V3) => {
    const glass = aperture.map(p => p.map((v, k) => v - axis[k] * .035) as V3);
    const back = outline.map(p => p.map((v, k) => v - axis[k] * .075) as V3);
    const center = outline[0].map((_, k) => outline.reduce((sum, p) => sum + p[k], 0) / outline.length);
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      b.face([outline[i], outline[next], glass[next], glass[i]], P.dark, axis);
      b.face([outline[i], back[i], back[next], outline[next]], P.dark,
        outline[i].map((v, k) => (v + outline[next][k]) / 2 - center[k]) as V3);
    }
    b.face(glass, surface, axis); b.face(back, P.dark, axis.map(v => -v) as V3);
  };
  cube([16, .85, 19.4], [3.05, .75, 3.2], P.dark, false, .1);
  for (const side of [-1, 1]) {
    const sp = (y: number, z: number, depth = 0) => sidePoint(side, y, z, depth), axis: V3 = [side, 0, 0];
    const paint = (points: [number, number][]) => panel(points.map(([y, z]) => sp(y, z)), P.green, axis);
    paint([[1.46, rear(1.46)], [1.46, front(1.46) - .12], [1.89, front(1.89) - .12], [1.89, rear(1.89)]]);
    paint([[1.89, rear(1.89)], [1.89, 18.1], [2.64, 18.1], [2.64, rear(2.64)]]);
    paint([[1.89, front(1.89) - .3], [1.89, front(1.89) - .12], [2.64, front(2.64) - .12], [2.64, front(2.64) - .3]]);
    paint([[2.64, rear(2.64)], [2.64, front(2.64) - .12], [2.84, front(2.84) - .12], [2.84, rear(2.84)]]);
    recessed([sp(1.89, 18.1), sp(1.89, front(1.89) - .3), sp(2.64, front(2.64) - .3), sp(2.64, 18.1)],
      [sp(1.96, 18.19), sp(1.96, front(1.96) - .38), sp(2.57, front(2.57) - .38), sp(2.57, 18.19)], cabGlass, axis);
    // Quarter panels and the wheel-arch crown share the same side/body plane.
    paint([[.55, 17.8], [.55, 18.72], [1.46, 18.72], [1.46, rear(1.46)]]);
    paint([[.76, 20.28], [.76, front(.76) - .12], [1.46, front(1.46) - .12], [1.46, 20.28]]);
    const rim = (radius: number, angle: number, depth = 0) => sp(.6 + radius * Math.sin(angle), 19.5 + radius * Math.cos(angle), depth);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI, end = (i + 1) / 12 * Math.PI;
      const p = rim(.78, a), q = rim(.78, end);
      panel([p, q, sp(1.46, q[2]), sp(1.46, p[2])], P.green, axis);
      panel([rim(.7, a, .015), rim(.7, end, .015), rim(.8, end, .015), rim(.8, a, .015)], P.dark, axis, .035);
      b.face([rim(.7, a, .015), rim(.7, end, .015), rim(.7, end, -.16), rim(.7, a, -.16)], seam,
        [0, -Math.sin((a + end) / 2), -Math.cos((a + end) / 2)]);
    }
    // Closed door shut-line follows the arch rather than cutting across its air gap.
    const door = [[.78, 18.03], [2.69, 18.03], [2.69, front(2.69) - .14], [1.46, 20.98], [.78, 20.98], [.78, 20.32]];
    for (let i = 0; i <= 10; i++) {
      const a = .22 + (Math.PI - .44) * i / 10; door.push([.6 + .84 * Math.sin(a), 19.5 + .84 * Math.cos(a)]);
    }
    door.push([.78, 18.03]);
    for (let i = 0; i < door.length - 1; i++) bar(b, sp(door[i][0], door[i][1], .006), sp(door[i + 1][0], door[i + 1][1], .006), .009, seam, 4);
    // A pressed lower door field and a broad belt crease articulate the cab
    // without filling the existing wheel crown or changing the tread levels.
    panel([sp(1.52, 18.16, .012), sp(1.52, 20.83, .012), sp(1.71, 20.83, .012), sp(1.71, 18.16, .012)],
      { color: '#628b73', rough: .59, metal: .14 }, axis, .018);
    bar(b, sp(2.79, 18.03, .018), sp(2.79, front(2.79) - .16, .018), .026, P.green, 6);
    cube(sp(1.6, 18.52, .009), [.025, .13, .38], P.dark, false, .012);
    bar(b, sp(1.62, 18.4, .035), sp(1.62, 18.66, .035), .02, trim, 6);
    for (const y of [.4, .68, .96]) {
      cube([16 + side * 1.9, y, 18.21], [.3, .09, .66], P.steel, false, .018);
      for (const z of [18.02, 18.21, 18.4]) cube([16 + side * 1.9, y + .047, z], [.25, .006, .035], P.rubber, false, 0);
    }
    bar(b, sp(2.24, 20.72), [16 + side * 2.12, 2.39, 20.93], .027, P.dark, 6);
    cube([16 + side * 2.12, 2.39, 20.93], [.15, .4, .16], P.dark, false, .035);
    cube([16 + side * 2.12, 2.39, 20.839], [.105, .3, .018], cabGlass, false, .004);
  }
  panel([sidePoint(-1, 1.46, rear(1.46)), sidePoint(1, 1.46, rear(1.46)), sidePoint(1, 2.84, rear(2.84)), sidePoint(-1, 2.84, rear(2.84))], P.green, [0, 0, -1]);
  cube([16, 2.82, 19.35], [3.52, .11, 2.96], P.green, false, .055);
  cube([16, 2.755, 20.79], [3.3, .055, .22], P.dark, false, .015);
  for (const side of [-1, 1]) {
    recessed([frontPoint(side * .035, 1.89), frontPoint(side * 1.71, 1.89), frontPoint(side * 1.56, 2.64), frontPoint(side * .03, 2.64)],
      [frontPoint(side * .09, 1.96), frontPoint(side * 1.62, 1.96), frontPoint(side * 1.47, 2.58), frontPoint(side * .08, 2.58)], cabGlass, [0, 0, 1]);
    panel([frontPoint(side * 1.71, 1.89), sidePoint(side, 1.89, front(1.89) - .12),
      sidePoint(side, 2.64, front(2.64) - .12), frontPoint(side * 1.56, 2.64)], P.green, [side, 0, 1]);
    panel([frontPoint(side * 1.56, 2.64), sidePoint(side, 2.64, front(2.64) - .12),
      sidePoint(side, 2.84, front(2.84) - .12)], P.green, [side, 0, 1]);
    for (const [low, high] of [[.76, 1.46], [1.46, 1.89]]) panel([
      frontPoint(side * 1.82, low), sidePoint(side, low, front(low) - .12),
      sidePoint(side, high, front(high) - .12), frontPoint(side * 1.82, high)], P.green, [side, 0, 1]);
    bar(b, frontPoint(side * .16, 1.88, .018), frontPoint(side * .18, 1.98, .025), .018, P.dark, 6);
    bar(b, frontPoint(side * .18, 1.98, .025), frontPoint(side * 1.16, 2.07, .025), .014, P.dark, 6);
    cube([16 + side * 1.4, 2.875, 20.5], [.12, .03, .14], P.amber, false, .008);
  }
  panel([frontPoint(-.035, 1.89), frontPoint(.035, 1.89), frontPoint(.03, 2.64), frontPoint(-.03, 2.64)], P.dark, [0, 0, 1]);
  panel([frontPoint(-1.56, 2.64), frontPoint(1.56, 2.64), sidePoint(1, 2.84, front(2.84) - .12),
    sidePoint(-1, 2.84, front(2.84) - .12)], P.green, [0, 0, 1]);
  // Paint cells surround actual grille/lamp apertures. Neither opening has a
  // green face hidden behind its inset, so the black cavity has real depth.
  const xs = [-1.82, -1.7, -1.14, -.98, .98, 1.14, 1.7, 1.82];
  const ys = [.76, .92, .98, 1.3, 1.48, 1.58, 1.89];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
    if ((Math.abs(x) < .98 && y > .92 && y < 1.48) || (Math.abs(x) > 1.14 && Math.abs(x) < 1.7 && y > .98 && y < 1.3)) continue;
    panel([frontPoint(xs[i], ys[j]), frontPoint(xs[i + 1], ys[j]), frontPoint(xs[i + 1], ys[j + 1]), frontPoint(xs[i], ys[j + 1])], P.green, [0, 0, 1]);
  }
  recessed([frontPoint(-.98, .92), frontPoint(.98, .92), frontPoint(.98, 1.48), frontPoint(-.98, 1.48)],
    [frontPoint(-.9, .98), frontPoint(.9, .98), frontPoint(.9, 1.42), frontPoint(-.9, 1.42)], P.dark, [0, 0, 1]);
  for (const y of [1.02, 1.13, 1.24, 1.35]) cube(frontPoint(0, y, -.016), [1.73, .035, .05], trim, false, .008);
  for (const side of [-1, 1]) {
    recessed([frontPoint(side * 1.14, .98), frontPoint(side * 1.7, .98), frontPoint(side * 1.7, 1.3), frontPoint(side * 1.14, 1.3)],
      [frontPoint(side * 1.19, 1.025), frontPoint(side * 1.65, 1.025), frontPoint(side * 1.65, 1.255), frontPoint(side * 1.19, 1.255)], P.pale, [0, 0, 1]);
    cube(frontPoint(side * 1.765, 1.15, .01), [.08, .15, .018], P.amber, false, .008);
  }
  cube([16, .64, 21.26], [3.7, .24, .22], P.dark, false, .06);
  finish(b, -2, 0, () => cube([16, .71, 21.372], [3.48, .035, .018], trim, false, .008));
  // Separated lower valance and tow pockets sit within the existing bumper.
  for (const side of [-1, 1]) {
    cube([16 + side * 1.03, .6, 21.375], [.32, .065, .018], P.rubber, false, .015);
    cube([16 + side * 1.03, .605, 21.383], [.15, .025, .004], trim, false, .004);
  }
  cube([16, .65, 21.376], [.6, .16, .018], P.pale, false, .008);
}

/** Side-loading rigid truck. Its long axis follows the two real pallet bays (+Z).
 * West remains open all the way to the floor: no decorative sill crosses a ramp. */
export function buildIbdTruck(b: Builder, cube: IbdCube, solids: IbdSolid[]) {
  // Original collision floor, east wall, roof and end closures are unchanged.
  // The visible deck uses a steel carrier and actual hardwood wear boards with
  // flush 1.2 m tops, rather than a second sheet floating above the datums.
  solids.push({ at: [16, floor - .15, 12.5], size: [4, .3, 9] });
  solids.push({ at: [18, 2.3, 12.5], size: [.2, 3.1, 9] });
  for (const z of [9.5, 12.5, 15.5]) {
    cube([16, floor - .1625, z], [4, .275, 3], P.steel, false, 0);
    for (let row = 0; row < 3; row++) cube([18.01, .75 + (row + .5) * 3.1 / 3, z], [.18, 3.1 / 3, 3], P.green, false, 0);
  }
  finish(b, -3, 2, () => {
    for (let board = 0; board < 8; board++)
      cube([14.335 + board * .475, floor - .0125, 12.5], [.467, .025, 8.7], deckWood, false, .003);
  });
  cube([16, 3.9, 12.5], [4, .16, 9], P.green, true);
  // Roof skin and perimeter folds carry its edge; no brace crosses the open
  // loading side below the original ceiling plane at y=3.82.
  for (const x of [14.05, 17.95]) finish(b, -2, 2, () => cube([x, 3.93, 12.5], [.1, .12, 8.9], trim, false, .025));
  for (let z = 8.6; z < 17; z += 1.15) cube([16, 3.997, z], [3.8, .034, .09], P.green, false, .015);
  for (const z of [8, 17]) {
    solids.push({ at: [16, 2.3, z], size: [4, 3.1, .15] });
    // Two steel leaves with a real centre joint, returned jambs, compression
    // frame and connected closure bars replace the undifferentiated end slab.
    cube([16, 2.3, z], [4, 3.1, .07], P.dark, false, 0);
    for (const side of [-1, 1]) cube([16 + side * .985, 2.3, z], [1.91, 3.04, .15], P.steel, false, .025);
    for (const direction of [-1, 1]) {
      const faceZ = z + direction * .09;
      for (const x of [14.065, 17.935]) finish(b, -2, 2, () => cube([x, 2.3, faceZ], [.13, 3.1, .08], trim, false, .012));
      for (const y of [.79, 3.81]) finish(b, -2, 0, () => cube([16, y, faceZ], [3.86, .08, .08], trim, false, .012));
    }
    const outward = z < 12 ? -1 : 1, faceZ = z + outward * .099;
    for (const x of [14.42, 15.02, 15.62, 16.38, 16.98, 17.58])
      cube([x, 2.3, faceZ], [.095, 2.77, .047], P.steel, false, .018);
    for (const x of [15.82, 16.18]) {
      bar(b, [x, .99, faceZ + outward * .05], [x, 3.6, faceZ + outward * .05], .027, trim, 8);
      for (const y of [1.12, 2.28, 3.48]) cube([x, y, faceZ + outward * .05], [.13, .09, .1], seam, false, .01);
      cube([x + (x < 16 ? -.12 : .12), 1.56, faceZ + outward * .11], [.28, .065, .055], trim, false, .018);
    }
    for (const side of [-1, 1]) for (const y of [1.28, 2.3, 3.32])
      cube([16 + side * 1.86, y, faceZ + outward * .025], [.25, .13, .08], trim, false, .02);
  }
  // Formed exterior channels have broad, supported returns and remain on the
  // far side of the unchanged wall. They add depth at an ordinary oblique view.
  for (let z = 8.35; z <= 16.7; z += .44) {
    b.face([[18.1, .88, z-.08], [18.155, .88, z-.035], [18.155, 3.72, z-.035], [18.1, 3.72, z-.08]], P.green, [1,0,-1]);
    b.face([[18.155, .88, z-.035], [18.155, .88, z+.035], [18.155, 3.72, z+.035], [18.155, 3.72, z-.035]], P.green, [1,0,0]);
    b.face([[18.155, .88, z+.035], [18.1, .88, z+.08], [18.1, 3.72, z+.08], [18.155, 3.72, z+.035]], P.green, [1,0,1]);
    for (const y of [.88, 3.72]) b.face([[18.1,y,z-.08], [18.155,y,z-.035], [18.155,y,z+.035], [18.1,y,z+.08]], P.green, [0,y<2?-1:1,0]);
  }

  // Body framing stays at the ends and east wall; the opening has no middle post.
  for (const z of [8.15, 16.85]) {
    cube([16, floor - .41, z], [3.8, .19, .18], P.steel);
    cube([16, floor + .08, z], [3.9, .12, .16], P.amber);
  }
  // Continuous wear boards have real longitudinal gaps; no coplanar seam overlays.
  for (const x of [14.12, 17.88]) cube([x, 3.8, 12.5], [.15, .15, 8.8], trim);
  for (const z of [8.2, 12.5, 16.8]) {
    cube([18.105, 2.3, z], [.035, 2.85, .09], seam, false, 0);
    cube([18.13, .98, z], [.045, .09, .22], P.amber, false, .01);
  }
  // Interior wear/lashing rails remain east of the loaded cargo envelope.
  // The open west side, its ramps and the tyre/floor gap are untouched.
  for (const y of [1.53, 2.75]) {
    finish(b, y < 2 ? -3 : -2, 2, () => cube([17.945, y, 12.5], [.07, .14, 8.5], y < 2 ? deckWood : P.steel, false, .012));
    for (let z = 8.8; z <= 16.3; z += 1.25) cube([17.904, y, z], [.012, .045, .2], P.dark, false, 0);
  }
  for (const z of [8.2, 11, 14, 16.8]) cube([17.945, 2.3, z], [.07, 2.85, .075], P.steel, false, 0);
  for (const x of [14.7, 17.3]) {
    cube([x, .38, 14.3], [.085, .24, 13.5], chassisPaint, false, 0);
    for (const y of [.285, .475]) cube([x, y, 14.3], [.23, .05, 13.5], chassisPaint, false, .008);
    for (const z of [8.15, 11.5, 16.85]) cube([x, .625, z], [.22, .27, .24], P.dark, false, .015);
  }
  for (const z of [8.15, 11.5, 16.85]) {
    cube([16, .81, z], [3.8, .18, .09], chassisPaint, false, 0);
    for (const y of [.74, .88]) cube([16, y, z], [3.8, .04, .24], P.steel, false, .007);
  }
  // Axle saddles and laminated springs connect the existing axle beam to its
  // longitudinal rails; they stay entirely beneath the loading deck.
  for (const z of wheels.axles) for (const x of [14.7, 17.3]) {
    for (let leaf = 0; leaf < 3; leaf++) cube([x, .335 - leaf*.035, z], [.13, .025, 1.15-leaf*.2], P.dark, false, .005);
    for (const dz of [-.48, .48]) cube([x, .395, z+dz], [.18, .18, .08], P.steel, false, .01);
  }
  for (const z of wheels.axles) cube([wheels.centerX, .47, z], [3.5, .18, .22], P.steel);

  buildIbdCab(b, cube, solids);

  for (const z of wheels.axles) for (const side of [-1, 1]) truckWheel(b, side, z);
  for (const z of [10.5, 14.5]) finish(b, -4, 0, () => cube([12.5, floor / 2, z], [Math.hypot(3, floor), .14, 2.9], P.steel, true, 0, [0, 0, Math.atan2(floor, 3)]));
}
