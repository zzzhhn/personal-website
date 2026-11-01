import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import type { IbdCube, IbdSolid } from './ibd-yard-architecture.ts';
import { IBD_TRUCK_FLOOR as floor, IBD_TRUCK_WHEELS as wheels } from './ibd-yard-layout.ts';

const trim: Surf = { color: '#b8c2c2', rough: .57, metal: .38 };
const seam: Surf = { color: '#40575c', rough: .67, metal: .28 };
const cabGlass: Surf = { color: '#819fa8', rough: .32, metal: .18 };

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
  cube([16, .71, 21.372], [3.48, .035, .018], trim, false, .008);
  cube([16, .65, 21.376], [.6, .16, .018], P.pale, false, .008);
}

/** Side-loading rigid truck. Its long axis follows the two real pallet bays (+Z).
 * West remains open all the way to the floor: no decorative sill crosses a ramp. */
export function buildIbdTruck(b: Builder, cube: IbdCube, solids: IbdSolid[]) {
  // Preserve the two original continuous collision envelopes. Three visible
  // deck bays and smaller liner panels give the static light bake real samples
  // between the distant corners, without adding coplanar overlay sheets.
  solids.push({ at: [16, floor - .15, 12.5], size: [4, .3, 9] });
  solids.push({ at: [18, 2.3, 12.5], size: [.2, 3.1, 9] });
  for (const z of [9.5, 12.5, 15.5]) {
    cube([16, floor - .15, z], [4, .3, 3], P.steel, false, 0);
    for (let row = 0; row < 3; row++) cube([18.01, .75 + (row + .5) * 3.1 / 3, z], [.18, 3.1 / 3, 3], P.green, false, 0);
  }
  cube([16, 3.9, 12.5], [4, .16, 9], P.green, true);
  for (const z of [8, 17]) cube([16, 2.3, z], [4, 3.1, .15], P.steel, true);

  // Body framing stays at the ends and east wall; the opening has no middle post.
  for (const z of [8.15, 16.85]) {
    cube([16, floor - .41, z], [3.8, .19, .18], P.steel);
    cube([16, floor + .08, z], [3.9, .12, .16], P.amber);
    for (const x of [14.18, 15.1, 16, 16.9, 17.82]) {
      cube([x, 2.3, z < 12 ? 7.905 : 17.095], [.08, 2.8, .035], seam, false, 0);
      for (const y of [1.05, 3.6]) cube([x, y, z < 12 ? 7.879 : 17.121], [.06, .06, .02], trim, false, 0);
    }
  }
  for (let z = 8.5; z < 17; z += .65) cube([16, floor + .007, z], [3.8, .014, .025], seam, false, 0);
  for (const x of [14.12, 17.88]) cube([x, 3.8, 12.5], [.15, .15, 8.8], trim);
  for (const z of [8.2, 12.5, 16.8]) {
    cube([18.105, 2.3, z], [.035, 2.85, .09], seam, false, 0);
    cube([18.13, .98, z], [.045, .09, .22], P.amber, false, .01);
  }
  // Interior wear/lashing rails remain east of the loaded cargo envelope.
  // The open west side, its ramps and the tyre/floor gap are untouched.
  for (const y of [1.53, 2.75]) {
    cube([17.945, y, 12.5], [.07, .14, 8.5], y < 2 ? P.timber : P.steel, false, 0);
    for (let z = 8.8; z <= 16.3; z += 1.25) cube([17.904, y, z], [.012, .045, .2], P.dark, false, 0);
  }
  for (const z of [8.2, 11, 14, 16.8]) cube([17.945, 2.3, z], [.07, 2.85, .075], P.steel, false, 0);
  for (const x of [14.7, 17.3]) cube([x, .38, 14.3], [.23, .24, 13.5], P.dark);
  for (const z of wheels.axles) cube([wheels.centerX, .47, z], [3.5, .18, .22], P.steel);

  buildIbdCab(b, cube, solids);

  // Six axle ends share the same travel axis as the chassis; rims face outwards.
  for (const z of wheels.axles) for (const side of [-1, 1]) {
    const x = wheels.centerX + side * wheels.halfTrack;
    b.tr([x, wheels.centerY, z], [0, 0, Math.PI / 2], () => {
      lathe(b, [[0, -wheels.halfWidth], [.5, -wheels.halfWidth], [wheels.radius, -.15], [wheels.radius, .15], [.5, wheels.halfWidth], [0, wheels.halfWidth]], P.rubber, { sides: 20 });
      for (const y of [-.237, .237]) lathe(b, [[0, y], [.3, y], [.34, y + .008], [0, y + .008]], P.steel, { sides: 16 });
    });
    for (let i = 0; i < 6; i++) cbox(b, [x + side * .25, wheels.centerY + .2 * Math.sin(i * Math.PI / 3), z + .2 * Math.cos(i * Math.PI / 3)], [.025, .05, .05], seam, .005);
  }
  for (const z of [10.5, 14.5]) cube([12.5, floor / 2, z], [Math.hypot(3, floor), .14, 2.9], P.steel, true, 0, [0, 0, Math.atan2(floor, 3)]);
}
