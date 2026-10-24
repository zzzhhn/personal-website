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
  lathe(B, [[.095, .7], [.085, 3.55], [0, 3.62]], S.slate, { sides, smooth: 50 });
  if (hi) { B.part('hatch', false); box(B, [-.06, .28, .12], [.06, .5, .15], S.slateDark, .01); lathe(B, [[.1, .7], [.11, .74], [.1, .78]], S.slateDark, { sides, smooth: 50 }); }
  B.part('mast');
  const path = bezier([0, 3.3, 0], [0, 3.42, -.6], [0, 3.42, -3.2], hi ? 8 : 3);
  tube(B, path, path.map((_, i) => .07 - .025 * i / (path.length - 1)), S.slate, hi ? 10 : 5);
  if (hi) tube(B, bezier([0, 2.8, 0], [0, 3.05, -.3], [0, 3.38, -1.4], 6), .028, S.slate, 6);
  B.part('head');
  B.tr([0, 2.86, -3.05], [0, 0, 0], () => { bar(B, [0, .46, 0], [0, .56, 0], .03, S.slate, 6); signalHead(B, hi); });
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
