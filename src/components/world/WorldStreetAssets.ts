/**
 * Street props: procedural L1 asset builders (street session). Pure geometry (no scene objects), so
 * node QA (tools/world/street/qa-runtime.mjs) rebuilds and inspects exactly what the runtime draws.
 *
 * Conventions: metres, +Y up, origin = bottom centre (ground contact at y = 0).
 *   - lamp / signal: the arm reaches toward local -Z (layout-v4 yaw puts -Z over the carriageway).
 *   - stop / direction / chevron: the sign face looks toward local -X (layout-v4 yaw makes local +X the
 *     travel direction of the approaching vehicle, so the face meets the driver).
 * Every builder returns { L0, L1 } Builders; L1 (beyond ~60 m) keeps the silhouette at <= 30 % of L0.
 * Collision parts (Builder.part) mark convex pieces used for dynamic hull colliders.
 */
import {
  Builder, S, bar, bezier, box, cbox, cyl, lathe, plate, rectPoly, regularPoly, tube, type Surf, type V3,
} from './WorldStreetGeometry.ts';

export type Lod = { L0: Builder; L1: Builder };
type Cell = [number, number, number, number];

/* ------------------------------------------------------------------ G10 lamp generator (shared with G11 / P04) */

export interface LampOpts {
  /** Pole height to the arm root (m). */
  height: number;
  /** Arm reach toward -Z (m); 0 = post-top lantern (P04 boardwalk / G11 year pillar style). */
  arm: number;
  pole?: Surf; base?: Surf;
  /** Cyan light-tech ring on the head (Art Lock v1 5: lamp heads are one of the six places). */
  cyanRing?: boolean;
  lod?: 0 | 1;
}

/** G10 street lamp / G11 / P04 lantern post: cast footing, fluted base flare, tapered pole with collars,
 * swept arm and a shallow dome luminaire with a warm lens underneath. */
export function lampGeometry(o: LampOpts) {
  const B = new Builder(), hi = (o.lod ?? 0) === 0, pole = o.pole ?? S.slate, base = o.base ?? S.slateDark;
  const sides = hi ? 12 : 6, H = o.height;
  // Separate convex parts (base flare / shaft) keep the hull colliders within ~2 cm of the visual.
  B.part('base');
  lathe(B, [[.2, 0], [.2, .06], [.17, .09]], S.stoneLight, { sides: hi ? 10 : 6, faceted: true });
  lathe(B, hi ? [[.15, .09], [.15, .16], [.12, .2], [.11, .55], [.085, .62], [.07, .66]] : [[.14, .09], [.11, .55], [.07, .66]], base, { sides, smooth: 50 });
  if (hi) lathe(B, [[.072, .63], [.085, .645], [.085, .675], [.072, .69]], base, { sides, smooth: 50 });
  B.part('shaft');
  lathe(B, hi ? [[.07, .66], [.066, H * .55], [.06, H]] : [[.07, .66], [.06, H]], pole, { sides, smooth: 50, caps: false });
  if (hi) {
    lathe(B, [[.068, H * .55 - .03], [.08, H * .55 - .015], [.08, H * .55 + .015], [.067, H * .55 + .03]], base, { sides, smooth: 50 });
    B.part('hatch', false);
    box(B, [-.05, .26, .1], [.05, .46, .128], base, .008);
    B.part('cap');
  }
  // Arm root cap.
  lathe(B, [[.06, H], [.07, H + .04], [.05, H + .1], [0, H + .14]], pole, { sides, smooth: 60 });
  let head: V3 = [0, H + .02, 0];
  if (o.arm > 0) {
    B.part('arm');
    const reach = o.arm, rise = .32;
    const path = bezier([0, H - .1, 0], [0, H + rise + .12, -reach * .35], [0, H + rise, -reach], hi ? 10 : 4);
    tube(B, path, path.map((_, i) => .045 - .015 * i / (path.length - 1)), pole, hi ? 8 : 5);
    if (hi) {
      // Under-brace (slim) closes the silhouette like a cast lamp bracket.
      const brace = bezier([0, H - .55, 0], [0, H - .1, -reach * .2], [0, H + rise - .02, -reach * .62], 7);
      tube(B, brace, .018, pole, 6);
      for (let i = 1; i < 4; i++) { const t = i / 4; bar(B, [0, H - .5 + t * .45, -reach * .17 * t], [0, H + .06 + t * .22, -reach * .5 * t], .01, pole, 5); }
    }
    head = [0, H + rise - .02, -reach];
  }
  // Luminaire: dome shell, rim, lens disc (glow 1), optional cyan ring.
  B.part('head');
  B.tr(head, [0, 0, 0], () => {
    const R = o.arm > 0 ? .3 : .22;
    lathe(B, hi ? [[R, -.06], [R + .015, -.04], [R * .92, .04], [R * .7, .1], [R * .35, .14], [.05, .16], [0, .17]] : [[R, -.06], [R * .8, .07], [0, .15]],
      pole, { sides: hi ? 16 : 6, smooth: 45, caps: false });
    lathe(B, [[0, -.075], [R * .9, -.075], [R, -.06]], S.lensWarm, { sides: hi ? 16 : 6, caps: false });
    if (o.cyanRing !== false && hi) lathe(B, [[R + .016, -.045], [R + .016, -.03]], S.cyan, { sides: 16, caps: false });
  });
  return B;
}
export const lamp = (): Lod => ({ L0: lampGeometry({ height: 4.4, arm: 1.35 }), L1: lampGeometry({ height: 4.4, arm: 1.35, lod: 1 }) });
/** Ground point of the lamp light (local), for the night light pool. */
export const LAMP_HEAD_LOCAL: V3 = [0, 4.7, -1.35];

/* ------------------------------------------------------------------ signal */

/** Half-round sun visor over a lens (local frame: lens axis +Y, top of the head +X): five thin panels
 * on the upper half only, so the lit lens stays readable from oblique street views. */
function visor(B: Builder, r: number, len: number) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i + .5) * Math.PI / n, w = 2 * r * Math.sin(Math.PI / (2 * n)) + .004;
    B.tr([r * Math.cos(a), len / 2, r * Math.sin(a)], [0, -a, 0], () => box(B, [-.005, -len / 2, -w / 2], [.005, len / 2, w / 2], S.black));
  }
}

function signalHead(B: Builder, hi: boolean) {
  // Housing faces -X: chamfered box, backplate with a cream edge, three lenses with hoods.
  box(B, [-.12, -.46, -.15], [.12, .46, .15], S.slateDark, hi ? .025 : 0);
  if (hi) B.tr([.02, 0, 0], [0, -Math.PI / 2, 0], () => plate(B, rectPoly(.56, 1.18), .025, S.creamPaint, S.black, S.black, .006));
  [[.29, S.lensRed], [0, S.lensAmber], [-.29, S.lensGreen]].forEach(([y, s]) => {
    B.tr([-.125, y as number, 0], [0, 0, Math.PI / 2], () => {
      cyl(B, .1, .1, -.004, .012, s as Surf, hi ? 14 : 6);
      if (hi) visor(B, .112, .13);
    });
  });
}
export function signalGeometry(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0, sides = hi ? 14 : 6;
  B.part('base');
  lathe(B, [[.24, 0], [.24, .07], [.2, .1]], S.stoneLight, { sides: hi ? 10 : 6, faceted: true });
  lathe(B, [[.17, .1], [.13, .6], [.095, .7]], S.slateDark, { sides, smooth: 50 });
  B.part('shaft');
  // Overhead mast: head bottom >= 4.5 m so a van cabin (top ~3.2 m) passes under it.
  lathe(B, [[.095, .7], [.08, 5.45], [0, 5.52]], S.slate, { sides, smooth: 50 });
  if (hi) { B.part('hatch', false); box(B, [-.06, .28, .12], [.06, .5, .15], S.slateDark, .01); lathe(B, [[.1, .7], [.11, .74], [.1, .78]], S.slateDark, { sides, smooth: 50 }); }
  B.part('mast');
  const path = bezier([0, 5.2, 0], [0, 5.32, -.6], [0, 5.32, -3.2], hi ? 8 : 3);
  tube(B, path, path.map((_, i) => .07 - .025 * i / (path.length - 1)), S.slate, hi ? 10 : 5);
  if (hi) tube(B, bezier([0, 4.7, 0], [0, 4.95, -.3], [0, 5.28, -1.4], 6), .028, S.slate, 6);
  B.part('head');
  B.tr([0, 4.98, -3.05], [0, 0, 0], () => { bar(B, [0, .46, 0], [0, .3, 0], .03, S.slate, 6); signalHead(B, hi); });
  if (hi) { B.part('near-head'); B.tr([-.16, 2.1, 0], [0, 0, 0], () => signalHead(B, hi)); }
  return B;
}
export const signal = (): Lod => ({ L0: signalGeometry(0), L1: signalGeometry(1) });

/* ------------------------------------------------------------------ sign posts */

function post(B: Builder, h: number, hi: boolean, cap = true) {
  B.part('post');
  lathe(B, [[.11, 0], [.11, .05], [.05, .08]], S.stoneLight, { sides: hi ? 8 : 6, faceted: true });
  lathe(B, cap ? [[.038, .08], [.038, h], [.03, h + .02], [0, h + .03]] : [[.038, .08], [.038, h]], S.galv, { sides: hi ? 10 : 5, smooth: 50 });
}
function clamp2(B: Builder, ys: number[], hi: boolean) {
  if (!hi) return;
  B.part('clamps', false);
  for (const y of ys) { lathe(B, [[.044, y - .025], [.044, y + .025]], S.iron, { sides: 10 }); box(B, [-.07, y - .02, -.03], [-.035, y + .02, .03], S.iron, .004); }
}
/** Stop sign: octagon plate (atlas cell), galv back with a rim. */
export function stopGeometry(lod: 0 | 1, cell: Cell) {
  const B = new Builder(), hi = lod === 0;
  post(B, 2.35, hi);
  clamp2(B, [1.88, 2.22], hi);
  B.part('plate'); B.cell = cell;
  B.tr([-.075, 2.05, 0], [0, -Math.PI / 2, 0], () => plate(B, regularPoly(8, .34, Math.PI / 8), .022, S.galv, { ...S.orange, sign: true }, S.galv, hi ? .006 : 0));
  return B;
}
/** Direction sign: slate rectangle (per-instance atlas cell), two posts on wide boards. */
export function directionGeometry(lod: 0 | 1, cell: Cell) {
  const B = new Builder(), hi = lod === 0;
  post(B, 2.6, hi);
  clamp2(B, [1.95, 2.42], hi);
  B.part('plate'); B.cell = cell;
  B.tr([-.075, 2.18, 0], [0, -Math.PI / 2, 0], () => plate(B, rectPoly(1.5, .66), .03, S.galv, { ...S.slate, sign: true }, S.galv, hi ? .008 : 0));
  return B;
}
export function chevronGeometry(lod: 0 | 1, cell: Cell) {
  const B = new Builder(), hi = lod === 0;
  post(B, 1.5, hi);
  clamp2(B, [1.05, 1.38], hi);
  B.part('plate'); B.cell = cell;
  B.tr([-.065, 1.2, 0], [0, -Math.PI / 2, 0], () => plate(B, rectPoly(.95, .55), .022, S.galv, { ...S.orange, sign: true }, S.galv, hi ? .006 : 0));
  return B;
}
/** Flexible delineator post: cream body, orange reflector band, dark cap, weighted foot. */
export function delineatorGeometry(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0, n = hi ? 10 : 4;
  B.part('post');
  lathe(B, hi ? [[.13, 0], [.13, .04], [.09, .07], [.06, .09]] : [[.13, 0], [.06, .09]], S.rubber, { sides: n, smooth: 40 });
  lathe(B, hi ? [[.055, .09], [.05, .7], [.05, .78], [.05, .9], [.044, .98], [0, 1.0]] : [[.055, .09], [.05, .9], [0, 1.0]], S.cream,
    { sides: n, smooth: 50, surfs: hi ? [S.cream, S.reflectOrange, S.cream, S.black, S.black] : [S.cream, S.black] });
  if (!hi) { B.part('band', false); lathe(B, [[.052, .7], [.052, .78]], S.reflectOrange, { sides: n, caps: false }); }
  return B;
}

/* ------------------------------------------------------------------ G13 bin */

/** G13 bin (contract: slate-blue round bin with a cream lid). Ribbed drum, rolled rim, domed lid with a
 * dark mouth, plinth ring. */
export function binGeometry(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0, n = hi ? 20 : 8;
  B.part('drum');
  lathe(B, [[.21, 0], [.235, .03], [.235, .06]], S.slateDark, { sides: n, smooth: 40 });
  lathe(B, hi
    ? [[.24, .06], [.255, .12], [.26, .3], [.252, .32], [.262, .34], [.268, .6], [.258, .62], [.27, .64], [.275, .8], [.285, .82], [.285, .85]]
    : [[.24, .06], [.275, .8], [.285, .85]], S.slate, { sides: n, smooth: 35 });
  B.part('lid');
  lathe(B, hi ? [[.295, .85], [.3, .87], [.27, .93], [.2, .975], [.12, .995], [0, 1.0]] : [[.295, .85], [.22, .96], [0, 1.0]], S.creamPaint, { sides: n, smooth: 45 });
  if (hi) {
    B.part('mouth', false);
    // Dark mouth recess on the lid front (+Z side) and a stainless band.
    B.tr([0, .93, .2], [-.55, 0, 0], () => box(B, [-.11, -.006, -.05], [.11, .006, .05], S.black, .003));
    lathe(B, [[.277, .7], [.279, .72], [.277, .74]], S.galv, { sides: n, caps: false, smooth: 60 });
  }
  return B;
}
export const bin = (): Lod => ({ L0: binGeometry(0), L1: binGeometry(1) });
export const delineator = (): Lod => ({ L0: delineatorGeometry(0), L1: delineatorGeometry(1) });

/** Triangle budgets (declared, L0 / L1). QA compares measured counts against these. */
export const BUDGET: Record<string, [number, number]> = {
  lamp: [1400, 420], signal: [1900, 560], stop: [420, 126], direction: [420, 126], chevron: [420, 126], delineator: [260, 78], bin: [900, 270],
};

/* ------------------------------------------------------------------ G12 roadblock */

/** G12 roadblock (contract: orange + cream diagonal-stripe low barrier). A-frame barricade: two splayed
 * slate-steel trestles with rubber feet, two stacked boards whose diagonal stripes are real alternating
 * strip geometry (no painted texture), reflector studs. Footprint 1.3 x 0.7 m, height 1.0 m (greybox). */
export function roadblockGeometry(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0;
  const W = 1.3, legH = 1.0, spread = .3;
  B.part('frame');
  for (const x of [-.56, .56]) {
    // Splayed legs (A-frame) joined by a top bracket and a low stretcher.
    for (const z of [-1, 1]) bar(B, [x, .02, z * spread], [x, legH - .02, z * .05], .028, S.slateDark, hi ? 8 : 4);
    box(B, [x - .04, legH - .06, -.08], [x + .04, legH, .08], S.slateDark, hi ? .01 : 0);
    if (hi) bar(B, [x, .32, -spread * .7], [x, .32, spread * .7], .015, S.slateDark, 6);
    for (const z of [-1, 1]) box(B, [x - .05, 0, z * spread - .06], [x + .05, .035, z * spread + .06], S.rubber, hi ? .008 : 0);
  }
  // Boards: front face (-Z) and back face (+Z) carry the stripes on the upper and middle boards.
  const board = (y: number, h: number, side: number) => {
    const z = side * (spread * (1 - (y + h / 2) / legH) + .045);
    const tilt = Math.atan2(spread, legH) * side;
    B.tr([0, y + h / 2, z], [tilt, 0, 0], () => {
      box(B, [-W / 2, -h / 2, -.012], [W / 2, h / 2, .012], S.creamPaint, hi ? .006 : 0);
      // Diagonal orange stripes as raised strips (parallelograms clipped to the board).
      const n = hi ? 5 : 3, step = W / n;
      for (let i = 0; i < n; i++) {
        const x0 = -W / 2 + i * step, sw = step * .5;
        const pts: [number, number][] = [[x0, -h / 2], [x0 + sw, -h / 2], [Math.min(W / 2, x0 + sw + h * .6), h / 2], [Math.min(W / 2, x0 + h * .6), h / 2]];
        const q = pts.map(p => [Math.max(-W / 2, Math.min(W / 2, p[0])), p[1]] as [number, number]);
        B.face(q.map(p => [p[0], p[1], side * .0135] as V3), S.orange, [0, 0, side]);
      }
      if (hi) for (const x of [-W / 2 + .08, W / 2 - .08]) B.tr([x, 0, side * .016], [Math.PI / 2, 0, 0], () => cyl(B, .028, .028, -.004, .006, S.reflectOrange, 8));
    });
  };
  B.part('boards', false);
  for (const side of [-1, 1]) { board(.66, .22, side); board(.38, .2, side); }
  return B;
}
export const roadblock = (): Lod => ({ L0: roadblockGeometry(0), L1: roadblockGeometry(1) });

/* ------------------------------------------------------------------ G14 bench, bollard, bus shelter */

/** G14 bench (contract: light-wood slats + slate-blue metal legs). 1.8 m long (local X), seat 0.45 m,
 * back toward +Z, seat front toward -Z. Cast slate legs with armrests, 5 seat slats + 3 back slats. */
export const BENCH_SEAT_LOCAL: V3 = [0, .47, -.06];
export function benchGeometry(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0, L = 1.8;
  for (const x of [-.78, .78]) {
    B.part(`leg${x}`);
    // Side frame: front leg, rear leg rising into the back support, armrest, foot plates.
    bar(B, [x, .03, -.24], [x, .42, -.22], .03, S.slate, hi ? 8 : 4);
    tube(B, hi ? bezier([x, .03, .2], [x, .45, .22], [x, .86, .3], 6) : [[x, .03, .2], [x, .86, .3]], .03, S.slate, hi ? 8 : 4);
    box(B, [x - .025, .4, -.27], [x + .025, .44, .24], S.slate, hi ? .008 : 0);
    if (hi) {
      tube(B, bezier([x, .44, -.27], [x, .68, -.3], [x, .66, -.02], 6), .022, S.slate, 8);
      box(B, [x - .04, .64, -.3], [x + .04, .68, 0], S.slate, .01);
      for (const z of [-.24, .2]) box(B, [x - .05, 0, z - .05], [x + .05, .02, z + .05], S.slateDark, .005);
    }
  }
  B.part('seat');
  const ns = hi ? 5 : 3;
  for (let i = 0; i < ns; i++) { const z = -.24 + i * .48 / (ns - 1); box(B, [-L / 2, .44, z - .035], [L / 2, .47, z + .035], S.woodLight, hi ? .008 : 0); }
  B.part('back');
  const nb = hi ? 3 : 2;
  for (let i = 0; i < nb; i++) { const t = (i + .5) / nb, y = .55 + t * .3, z = .24 + t * .06; B.tr([0, y, z], [-.2, 0, 0], () => box(B, [-L / 2, -.04, -.015], [L / 2, .04, .015], S.woodLight, hi ? .008 : 0)); }
  if (hi) { B.part('bolts', false); for (const x of [-.78, .78]) for (let i = 0; i < ns; i++) { const z = -.24 + i * .48 / (ns - 1); B.tr([x, 0, z], [0, 0, 0], () => cyl(B, .009, .009, .47, .476, S.iron, 6)); } }
  return B;
}
export const bench = (): Lod => ({ L0: benchGeometry(0), L1: benchGeometry(1) });

/** Forecourt bollard: slate cast post, rounded crown, cream reflective band. 0.9 m. */
export function bollardGeometry(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0, n = hi ? 16 : 6;
  B.part('post');
  lathe(B, hi
    ? [[.15, 0], [.15, .04], [.12, .07], [.115, .7], [.125, .72], [.125, .76], [.115, .78], [.11, .84], [.08, .885], [.04, .9], [0, .9]]
    : [[.14, 0], [.115, .07], [.115, .78], [.08, .885], [0, .9]], S.slate, { sides: n, smooth: 40 });
  if (hi) { B.part('band', false); lathe(B, [[.117, .58], [.117, .64]], S.reflectCream, { sides: n, caps: false }); }
  return B;
}
export const bollard = (): Lod => ({ L0: bollardGeometry(0), L1: bollardGeometry(1) });

/** Bus shelter (footprint 1.4 x 3.2, h 2.5; open side toward local -X = the road). Slate posts, cantilever
 * roof with a fascia, frosted rear glass in mullions, end panel carrying the island-map poster (atlas
 * cell), perch bench. Seat point for the bench interaction. */
export const SHELTER_SEAT_LOCAL: V3 = [-.05, .5, -.4];
export function shelterGeometry(lod: 0 | 1, posterCell: Cell) {
  const B = new Builder(), hi = lod === 0, D = 1.4, L = 3.2, H = 2.5;
  B.part('slab');
  box(B, [-D / 2 - .1, 0, -L / 2 - .1], [D / 2 + .1, .04, L / 2 + .1], S.stoneCream, hi ? .015 : 0);
  for (const z of [-L / 2 + .06, L / 2 - .06]) for (const x of [-D / 2 + .08, D / 2 - .06]) { B.part('post'); box(B, [x - .04, .04, z - .04], [x + .04, H - .1, z + .04], S.slate, hi ? .01 : 0); }
  B.part('roof');
  box(B, [-D / 2 - .25, H - .12, -L / 2 - .12], [D / 2 + .08, H - .02, L / 2 + .12], S.slateDark, hi ? .02 : 0);
  box(B, [-D / 2 - .28, H - .2, -L / 2 - .12], [-D / 2 - .22, H - .02, L / 2 + .12], S.slate, hi ? .01 : 0);
  if (hi) box(B, [-D / 2 - .29, H - .17, -L / 2], [-D / 2 - .282, H - .15, L / 2], S.cyan, 0);
  B.part('rear');
  // Rear wall: frosted glass panes between mullions, kick rail.
  const panes = hi ? 3 : 1;
  for (let i = 0; i < panes; i++) {
    const z0 = -L / 2 + .1 + i * (L - .2) / panes, z1 = z0 + (L - .2) / panes - .03;
    box(B, [D / 2 - .08, .32, z0], [D / 2 - .05, H - .2, z1], S.glass, 0);
  }
  box(B, [D / 2 - .09, .2, -L / 2 + .06], [D / 2 - .04, .32, L / 2 - .06], S.slate, hi ? .008 : 0);
  if (hi) for (let i = 1; i < panes; i++) { const z = -L / 2 + .1 + i * (L - .2) / panes - .015; box(B, [D / 2 - .09, .32, z - .02], [D / 2 - .04, H - .2, z + .02], S.slate, .006); }
  B.part('end');
  // End panel (+Z): poster in a frame, facing -X... the poster faces the waiting area (-Z side of the panel).
  box(B, [-D / 2 + .12, .2, L / 2 - .1], [D / 2 - .08, H - .2, L / 2 - .03], S.slate, hi ? .01 : 0);
  B.part('poster', false); B.cell = posterCell;
  B.tr([0, 1.3, L / 2 - .105], [0, Math.PI, 0], () => plate(B, rectPoly(1.0, 1.4), .01, S.creamPaint, { ...S.cream, sign: true, glow: 7 }, S.creamPaint));
  B.part('perch');
  box(B, [D / 2 - .5, .46, -L / 2 + .3], [D / 2 - .1, .5, L / 2 - .3], S.woodLight, hi ? .01 : 0);
  for (const z of [-L / 2 + .45, 0, L / 2 - .45]) box(B, [D / 2 - .14, .04, z - .03], [D / 2 - .1, .46, z + .03], S.slate, hi ? .006 : 0);
  return B;
}

Object.assign(BUDGET, { roadblock: [900, 270], bench: [1700, 400], bollard: [380, 110], shelter: [1100, 400] });
/** Extra QA-only assets for qa-runtime (cells are placeholders there). */
export const extraAssets = () => ({ roadblock: roadblock(), bench: bench(), bollard: bollard(), shelter: { L0: shelterGeometry(0, [0, 0, .1, .1]), L1: shelterGeometry(1, [0, 0, .1, .1]) } });

/* ------------------------------------------------------------------ G09 rails */

/** Seawall / promenade rail bay, local X along the rail (0 -> len), base at y = 0, sea side +Z irrelevant
 * (symmetric). Cream painted square post at x = 0 with a cap, round handrail at 1.0 m, two lower rails,
 * three balusters. The post sinks 0.5 m so it never floats over the final terrain. */
export function seawallBay(lod: 0 | 1, len = 2) {
  const B = new Builder(), hi = lod === 0, paint = S.creamPaint;
  B.part('post');
  box(B, [-.045, -.5, -.045], [.045, .96, .045], paint, hi ? .012 : 0);
  if (hi) { box(B, [-.06, .96, -.06], [.06, 1.0, .06], paint, .012); lathe(B, [[.05, 0], [.05, .04], [.08, .07]], S.stoneCream, { sides: 8, faceted: true }); }
  bar(B, [0, 1.0, 0], [len, 1.0, 0], .034, paint, hi ? 10 : 5);
  bar(B, [0, .55, 0], [len, .55, 0], .02, paint, hi ? 6 : 4);
  if (hi) {
    bar(B, [0, .14, 0], [len, .14, 0], .02, paint, 6);
    for (let i = 1; i <= 3; i++) bar(B, [len * i / 4, .14, 0], [len * i / 4, .98, 0], .012, paint, 5);
  }
  return B;
}
/** Collision solid of a rail run (same extent as the visual): one thin box per bay span. */
export function railCollider(len: number, h: number, thick: number) {
  const B = new Builder(); B.part('collider');
  box(B, [0, 0, -thick / 2], [len, h, thick / 2], S.cream);
  return B;
}
/** End post for a rail run (closes the last bay). */
export function railEndPost(lod: 0 | 1, kind: 'seawall' | 'guard') {
  const B = new Builder(), hi = lod === 0;
  B.part('post');
  if (kind === 'seawall') { box(B, [-.06, -.5, -.06], [.06, 1.04, .06], S.creamPaint, hi ? .015 : 0); if (hi) box(B, [-.075, 1.0, -.075], [.075, 1.06, .075], S.creamPaint, .015); }
  else { box(B, [-.06, -.5, -.05], [.06, .78, .05], S.galv, hi ? .01 : 0); }
  return B;
}

/** Ring guardrail post (galvanised I-post look, sunk 0.5 m), at panel joints. */
export function guardPost(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0;
  B.part('post');
  box(B, [-.05, -.5, -.04], [.05, .78, .04], S.galv, hi ? .008 : 0);
  B.part('blockout', false); box(B, [-.04, .5, -.19], [.04, .72, -.04], S.galv, hi ? .006 : 0);
  return B;
}
/** Ring guardrail W-beam panel (knockable): local X along the rail centred on 0, beam centre 0.6 m above
 * the base, profile in the road-side plane z = -0.2. Origin at the base (y = 0) under the panel centre. */
export function guardPanel(lod: 0 | 1, len: number) {
  const B = new Builder(), hi = lod === 0;
  B.part('beam');
  const strips: [number, number, number][] = hi
    ? [[.74, -.2, .3], [.67, -.24, -.4], [.6, -.215, 0], [.53, -.24, .4], [.46, -.2, -.3]]
    : [[.67, -.22, 0], [.53, -.22, 0]];
  for (const [y, z, tilt] of strips) B.tr([0, y, z], [tilt, 0, 0], () => box(B, [-len / 2, hi ? -.04 : -.075, -.006], [len / 2, hi ? .04 : .075, .006], S.galv, 0));
  if (hi) {
    B.part('reflectors', false);
    for (let x = -len / 2 + .6; x < len / 2; x += 1.6) B.tr([x, .6, -.245], [0, 0, 0], () => box(B, [-.04, -.05, -.004], [.04, .05, .004], S.reflectCream, .002));
  }
  return B;
}

/** Hill timber rail post: round log with a domed top, base sunk 0.45 m. */
export function timberPost(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0, n = hi ? 10 : 5;
  B.part('post');
  lathe(B, hi ? [[.1, -.45], [.1, .4], [.096, .5], [.07, .55], [0, .57]] : [[.1, -.45], [.1, .5], [0, .57]], S.woodMid, { sides: n, smooth: 50 });
  return B;
}
/** Hill timber rail beam (knockable): log along local X centred on 0, resting on the post domes.
 * Origin at its bottom centre. Bark rings (low ridges) every 0.8 m on L0. */
export function timberBeam(lod: 0 | 1, len: number) {
  const B = new Builder(), hi = lod === 0, r = .085;
  B.part('beam');
  B.tr([-len / 2, r, 0], [0, 0, -Math.PI / 2], () => {
    const prof: [number, number][] = [[r * .8, 0], [r, .02]];
    if (hi) for (let x = .8; x < len - .4; x += .8) prof.push([r, x - .03], [r * 1.05, x], [r, x + .03]);
    prof.push([r, len - .02], [r * .8, len]);
    lathe(B, prof, S.woodMid, { sides: hi ? 10 : 5, smooth: 40, surfs: prof.slice(1).map((_, i) => (i === 0 || i === prof.length - 2 ? S.woodLight : S.woodMid)) });
  });
  return B;
}

/** Bridge parapet (structural, fixed): local X along the deck from 0 to len, deck level y = 0, height 1.25.
 * Cream masonry wall with a projecting coping, pilasters every ~2.8 m, recessed panels, plinth. */
export function parapet(lod: 0 | 1, len: number) {
  const B = new Builder(), hi = lod === 0, t = .22, H = 1.25;
  B.part('wall');
  box(B, [0, 0, -t / 2], [len, H - .1, t / 2], S.stoneCream, hi ? .02 : 0);
  B.part('coping');
  box(B, [-.02, H - .1, -t / 2 - .04], [len + .02, H, t / 2 + .04], S.cream, hi ? .02 : 0);
  if (hi) {
    B.part('detail', false);
    const n = Math.max(2, Math.round(len / 2.8));
    for (let i = 0; i <= n; i++) { const x = len * i / n; for (const z of [-1, 1]) box(B, [x - .14, 0, z * t / 2 - .04], [x + .14, H - .1, z * t / 2 + .04], S.stoneLight, .015); }
    for (let i = 0; i < n; i++) { const x0 = len * i / n + .22, x1 = len * (i + 1) / n - .22; for (const z of [-1, 1]) box(B, [x0, .2, z * (t / 2 + .012) - .012], [x1, .26, z * (t / 2 + .012) + .012], S.stoneLight, .006); }
    for (const z of [-1, 1]) box(B, [0, 0, z * t / 2 - .05], [len, .14, z * t / 2 + .05], S.stone, .015);
  }
  return B;
}
/** Bridge end pillar: square cream pier from below the deck to above the coping, with a cap. */
export function bridgePier(lod: 0 | 1, h: number) {
  const B = new Builder(), hi = lod === 0;
  B.part('pier');
  box(B, [-.18, 0, -.18], [.18, h - .08, .18], S.stoneCream, hi ? .02 : 0);
  box(B, [-.22, h - .08, -.22], [.22, h, .22], S.cream, hi ? .02 : 0);
  if (hi) lathe(B, [[.12, h], [.1, h + .05], [0, h + .08]], S.cream, { sides: 8, faceted: true });
  return B;
}

Object.assign(BUDGET, { seawallBay: [420, 130], guardPost: [80, 24], guardPanel: [260, 80], timberPost: [90, 30], timberBeam: [520, 160] });
const _extra = extraAssets;
export const extraAssets2 = () => ({ ..._extra(), seawallBay: { L0: seawallBay(0), L1: seawallBay(1) }, guardPost: { L0: guardPost(0), L1: guardPost(1) }, guardPanel: { L0: guardPanel(0, 4.67), L1: guardPanel(1, 4.67) },
  timberPost: { L0: timberPost(0), L1: timberPost(1) }, timberBeam: { L0: timberBeam(0, 4.2), L1: timberBeam(1, 4.2) }, parapet: { L0: parapet(0, 11.3), L1: parapet(1, 11.3) } });

/* G29: modern ridge windmill, no additional light sources. */
export function windmillTower(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0;
  B.part('plinth'); lathe(B, [[1.1, -.12], [1.1, .13], [.96, .2]], S.stoneCream, { sides: hi ? 24 : 8, smooth: 40 });
  B.part('tower'); lathe(B, hi ? [[.72, .18], [.7, .32], [.68, 1.2], [.55, 6], [.38, 11.5], [.4, 11.65]] : [[.7, .18], [.38, 11.65]], S.creamPaint, { sides: hi ? 24 : 8, smooth: 40 });
  B.part('nacelle'); box(B, [-1.15, 11.2, -.55], [1.25, 12.22, .55], S.creamPaint, hi ? .14 : 0);
  if (hi) {
    B.part('door'); box(B, [-.29, .2, .652], [.29, 1.87, .73], S.slate, .03); box(B, [-.245, .28, .73], [.245, 1.8, .752], S.slateDark, .015);
    box(B, [.13, .92, .75], [.2, .96, .78], S.iron, .008);
    B.part('seams', false);
    for (const y of [1.9, 6, 10.7]) lathe(B, [[.72 - y * .029, y], [.72 - y * .029, y + .035]], S.stoneLight, { sides: 24, caps: false, smooth: 40 });
    for (const z of [-.555, .555]) for (let i = 0; i < 8; i++) box(B, [.25 + i * .08, 11.5, z - .014], [.29 + i * .08, 11.92, z + .014], S.slateDark, .008);
    B.part('inspection'); box(B, [-.2, 12.22, -.3], [.6, 12.25, .3], S.stoneLight, .02);
  }
  return B;
}
/** Rotor local origin is the spindle; local +X is axis. Blades are swept, tapering closed shells. */
export function windmillRotor(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0;
  B.part('hub'); B.tr([0, 0, 0], [0, 0, -Math.PI / 2], () => lathe(B, [[.24, -.2], [.32, -.08], [.32, .15], [.18, .34], [0, .43]], S.creamPaint, { sides: hi ? 24 : 6, smooth: 50 }));
  for (let k = 0; k < 3; k++) B.tr([0, 0, 0], [k * Math.PI * 2 / 3, 0, 0], () => {
    B.part('blade'); B.tr([0, 0, 0], [0, Math.PI / 2, 0], () => plate(B,
      hi ? [[-.1, .2], [.28, .7], [.4, 1.35], [.12, 3.9], [-.04, 4.7], [-.18, 4.65], [-.27, 1.2]] : [[-.12, .2], [.35, 1.1], [0, 4.7], [-.2, 1.1]], hi ? .065 : .045, S.creamPaint, S.creamPaint, S.stoneCream));
    if (hi) { B.part('blade-root'); B.tr([0, .42, 0], [0, 0, 0], () => lathe(B, [[.13, -.2], [.16, 0], [.12, .32]], S.stoneLight, { sides: 16, smooth: 50 })); }
  });
  return B;
}

export function foundationSlab(lod: 0 | 1, w: number, d: number) {
  const B = new Builder(), hi = lod === 0;
  B.part('slab'); box(B, [-w / 2, 0, -d / 2], [w / 2, .2, d / 2], S.slab, hi ? .035 : 0);
  if (hi) {
    B.part('scoring', false);
    for (let x = -w / 2 + 2.5; x < w / 2; x += 2.5) box(B, [x - .008, .201, -d / 2 + .1], [x + .008, .204, d / 2 - .1], S.stoneDark, 0);
    for (let z = -d / 2 + 2.5; z < d / 2; z += 2.5) box(B, [-w / 2 + .1, .201, z - .008], [w / 2 - .1, .204, z + .008], S.stoneDark, 0);
    for (const x of [-w / 2 + .12, w / 2 - .12]) box(B, [x - .03, .201, -d / 2 + .12], [x + .03, .21, d / 2 - .12], S.stoneLight, .006);
  }
  return B;
}
export function foundationSign(lod: 0 | 1) {
  const B = new Builder(), hi = lod === 0;
  for (const x of [-1.02, 1.02]) { B.part('post'); box(B, [x - .065, 0, -.07], [x + .065, 1.78, .07], S.woodMid, hi ? .018 : 0); }
  B.part('panel'); box(B, [-1.25, .8, -.06], [1.25, 1.68, .08], S.woodLight, hi ? .02 : 0);
  if (hi) {
    B.part('top-cap'); box(B, [-1.3, 1.68, -.1], [1.3, 1.75, .12], S.woodDark, .015);
    B.part('brace'); bar(B, [-1.02, .35, -.08], [1.02, 1.5, -.08], .04, S.woodMid, 6);
    B.part('plank-joints', false); for (const y of [1.08, 1.38]) box(B, [-1.22, y, .081], [1.22, y + .009, .084], S.woodMid, 0);
  }
  B.part('lettering', false); B.cell = [0, 0, 1, 1]; B.tr([0, 1.23, .087], [0, 0, 0], () => plate(B, rectPoly(2.18, .64), .002, S.woodLight, { ...S.cream, sign: true }, S.woodLight));
  return B;
}
const _extra2 = extraAssets2;
export const extraAssets3 = () => ({ ..._extra2(), windmillTower: { L0: windmillTower(0), L1: windmillTower(1) }, windmillRotor: { L0: windmillRotor(0), L1: windmillRotor(1) }, foundationSlab: { L0: foundationSlab(0, 15, 12), L1: foundationSlab(1, 15, 12) }, foundationSign: { L0: foundationSign(0), L1: foundationSign(1) } });

/* G11: shared G10/P04 lamp generator with a portrait date placard; plate and light move with the post. */
export function yearPillar(lod: 0 | 1, cell: Cell) {
  const B = lampGeometry({ height: 2.3, arm: 0, cyanRing: true, lod }), hi = lod === 0;
  B.part('date-frame');
  box(B, [-.29, 1.02, .035], [.29, 2.15, .145], S.slate, hi ? .025 : 0);
  if (hi) {
    B.part('date-rim', false);
    for (const x of [-.257, .257]) box(B, [x - .014, 1.06, .146], [x + .014, 2.11, .16], S.stoneCream, .004);
    for (const y of [1.065, 2.105]) box(B, [-.26, y - .012, .146], [.26, y + .012, .16], S.stoneCream, .004);
  }
  B.part('date-face', false); B.cell = cell;
  B.tr([0, 1.585, .153], [0, 0, 0], () => plate(B, rectPoly(.49, 1.01), .003, S.slate, { color: '#FFFFFF', rough: .9, metal: 0, sign: true, glow: 8 }, S.slate));
  return B;
}
/** G15: shallow light-wood campaign billboard. Two spread feet, braces, pegged frame and drip cap. */
export function billboard(lod: 0 | 1, cell: Cell) {
  const B = new Builder(), hi = lod === 0, w = 2.4, y0 = 1.02, h = 1.24;
  for (const x of [-1.12, 1.12]) {
    B.part('foot'); box(B, [x - .1, 0, -.34], [x + .1, .08, .34], S.woodMid, hi ? .018 : 0);
    B.part('post'); box(B, [x - .055, .04, -.06], [x + .055, 2.39, .06], S.woodLight, hi ? .012 : 0);
    if (hi) {
      B.part('braces'); for (const z of [-.27, .27]) bar(B, [x, .08, z], [x, .58, 0], .024, S.woodMid, 6);
      B.part('pegs', false); for (const y of [y0 + .1, y0 + h - .1]) B.tr([x, y, .08], [Math.PI / 2, 0, 0], () => cyl(B, .014, .014, -.01, .01, S.woodDark, 10));
    }
  }
  B.part('panel'); box(B, [-w / 2, y0, -.035], [w / 2, y0 + h, .035], S.cream, hi ? .012 : 0);
  for (const y of [y0 - .035, y0 + h + .035]) { B.part('rail'); box(B, [-w / 2 - .07, y - .035, -.06], [w / 2 + .07, y + .035, .065], S.woodLight, hi ? .012 : 0); }
  for (const x of [-w / 2 - .035, w / 2 + .035]) { B.part('stile'); box(B, [x - .035, y0, -.06], [x + .035, y0 + h, .065], S.woodLight, hi ? .012 : 0); }
  B.part('cap'); box(B, [-w / 2 - .12, 2.33, -.105], [w / 2 + .12, 2.4, .105], S.woodMid, hi ? .018 : 0);
  B.part('campaign-face', false); B.cell = cell;
  B.tr([0, y0 + h / 2, .039], [0, 0, 0], () => plate(B, rectPoly(w - .07, h - .07), .003, S.cream, { color: '#FFFFFF', rough: .95, metal: 0, sign: true }, S.cream));
  return B;
}
const _extra3 = extraAssets3;
export const extraAssets4 = () => ({ ..._extra3(), yearPillar: { L0: yearPillar(0, [0, 0, 1, 1]), L1: yearPillar(1, [0, 0, 1, 1]) }, billboard: { L0: billboard(0, [0, 0, 1, 1]), L1: billboard(1, [0, 0, 1, 1]) } });
Object.assign(BUDGET, { yearPillar: [1100, 300], billboard: [1000, 300] });
