import { Matrix4, TorusGeometry } from 'three';
import { CoasterBatch, COASTER_PALETTE as P } from './coaster-geometry.ts';
import { coasterWorld } from './coaster-track.ts';
import { WORKSHOP_HUB, WORKSHOP_INTAKE, WORKSHOP_POST_TOP, WORKSHOP_RAIL_Y, WORKSHOP_TOOLS } from './intent-workshop-layout.ts';
import type { IntentClass } from './intent-tasks.ts';
import type { Vec3 } from '../types';

// Local bench coordinates keep the motion lanes and the existing collider shell fixed.
function workshopArt(b: CoasterBatch, at: Vec3, kind: IntentClass | 'intake') {
  const [x, y, z] = coasterWorld(at);
  const point = (p: Vec3): Vec3 => [x + p[0], y + p[1], z + p[2]];
  const box = (p: Vec3, size: Vec3, color = P.dark) => b.box(point(p), size, color);
  const shell = (p: Vec3, size: Vec3, color = P.white) => b.housing(point(p), size, color);
  const rod = (a: Vec3, c: Vec3, r = .045, color = P.rail, sides = 6) => b.beam(point(a), point(c), r, color, sides);
  const wheel = (p: Vec3, r: number, color = P.copper) => {
    rod([p[0], p[1], p[2] - .05], [p[0], p[1], p[2] + .05], r, color, 10);
    rod([p[0], p[1], p[2] + .05], [p[0], p[1], p[2] + .09], r * .28, P.dark);
  };
  const bolts = (left: number, right: number, height: number, depth: number) => {
    for (const dx of [left, right]) rod([dx, height, depth], [dx, height, depth + .045], .045, P.rail);
  };
  // Distinct underframes replace the repeated solid cabinet without enlarging its footprint.
  if (kind === 'lookup' || kind === 'act') {
    shell([-.42, .7, 0], [1.6, 1.1, 1.9], P.steel);
    shell([.82, .7, 0], [.72, 1.1, 1.9], P.copper);
    shell([-.42, .76, .97], [1.3, .65, .08], P.dark);
    for (let i = 0; i < 4; i++) box([-.8 + i * .25, .76, 1.02], [.08, .44, .04], P.steel);
  } else if (kind === 'rewrite') {
    for (const dx of [-.94, .94]) shell([dx, .7, 0], [.52, 1.1, 1.9], P.steel);
    box([0, .42, .25], [1.4, .18, 1.15], P.copper);
    for (let i = 0; i < 3; i++) box([0, .56 + i * .09, .33], [1.1, .065, .85], P.white);
    rod([-.72, .82, -.65], [.72, .82, -.65], .16, P.dark, 10);
  } else if (kind === 'extract') {
    shell([0, .7, 0], [2.5, 1.1, 1.9], P.steel);
    for (let i = 0; i < 3; i++) {
      shell([-.78 + i * .78, .72, .98], [.65, .74, .12], i === 1 ? P.copper : P.white);
      box([-.78 + i * .78, .83, 1.06], [.28, .06, .06]);
    }
  } else {
    shell([-.9, .7, 0], [.65, 1.1, 1.9], P.steel);
    shell([.85, .7, 0], [.75, 1.1, 1.9], kind === 'debug' ? P.copper : P.steel);
    box([0, .72, -.72], [1.2, .9, .3]);
    rod([-.58, .43, .6], [.48, 1.13, .6], .065, P.copper);
    rod([-.58, 1.13, .6], [.48, .43, .6], .065, P.rail);
  }
  // Front service hinges, fasteners and a recessed control plate stay behind the worktop lip.
  for (const dx of [-1.08, 1.08]) {
    rod([dx, .53, 1.02], [dx, .83, 1.02], .055, P.copper);
    bolts(dx - .07, dx + .07, 1.07, 1.02);
  }
  box([0, 1.24, 1.13], [1.65, .09, .035], P.copper);
  if (kind === 'intake') {
    for (const dx of [-.96, .52]) box([dx, 1.48, 0], [.12, .28, 1.65], P.copper);
    wheel([-.8, .8, 1.08], .2);
    return;
  }
  if (kind === 'lookup' || kind === 'act') {
    // Seats have feet, cushions, inset backs and individual armrests, below the scanning ring.
    for (let i = 0; i < 3; i++) {
      const sx = -.7 + i * .58;
      rod([sx, 1.33, -.2], [sx, 1.49, -.2], .09, P.steel);
      shell([sx, 1.49, -.2], [.43, .15, .48], P.copper);
      shell([sx, 1.59, -.17], [.34, .08, .37], P.dark);
      shell([sx, 1.74, -.44], [.43, .46, .14], P.copper);
      shell([sx, 1.75, -.35], [.31, .3, .045], P.dark);
      for (const side of [-1, 1]) {
        rod([sx + side * .21, 1.5, -.03], [sx + side * .21, 1.73, -.03], .025);
        rod([sx + side * .21, 1.73, -.38], [sx + side * .21, 1.73, .06], .035, P.rail);
      }
    }
    if (kind === 'lookup') {
      shell([-1.04, 1.67, .57], [.42, .64, .45], P.steel);
      wheel([-1.04, 1.76, .82], .14, P.rail);
      rod([-1.04, 1.77, .91], [-1.04, 1.77, .94], .09, P.cyan, 8);
    } else {
      shell([.98, 1.69, -.4], [.48, .68, .65], P.steel);
      wheel([.98, 1.72, -.02], .2);
      box([.98, 1.5, .21], [.35, .035, .36], P.white);
      for (let i = 0; i < 3; i++) box([.98, 1.523, .1 + i * .08], [.22, .012, .018], P.dark);
    }
  } else if (kind === 'plan') {
    for (const dz of [-.55, .3]) rod([-1.02, 1.38, dz], [.82, 1.38, dz], .035, P.copper);
    rod([-.85, 1.38, .25], [-.2, 1.38, -.5], .045);
    rod([-.2, 1.38, -.5], [.45, 1.38, .25], .045);
    for (const [sx, sz] of [[-.85, .25], [-.2, -.5], [.45, .25]]) {
      shell([sx, 1.41, sz], [.4, .14, .35], P.copper);
      box([sx, 1.495, sz], [.22, .025, .2], P.dark);
    }
    shell([.98, 1.65, -.55], [.4, .63, .42], P.steel);
    wheel([.98, 1.7, -.31], .14);
  } else if (kind === 'debug') {
    // A split service housing exposes a copper loop while leaving the repair carriage's x lane clear.
    shell([-.85, 1.48, -.42], [.56, .28, .5], P.steel);
    b.add(new TorusGeometry(.27, .065, 5, 10, Math.PI * 1.7), P.copper,
      new Matrix4().makeTranslation(x - .85, y + 1.84, z - .42));
    for (const dx of [-1.1, -.6]) rod([dx, 1.48, -.42], [dx, 1.68, -.42], .045);
    shell([.86, 1.65, -.38], [.6, .64, .6], P.steel);
    for (let i = 0; i < 3; i++) box([.86, 1.47 + i * .14, -.065], [.4, .055, .035]);
    wheel([.86, 1.91, -.05], .17);
    for (const dz of [-.22, .22]) rod([-.98, 1.39, dz], [.65, 1.39, dz], .035, P.rail);
  } else if (kind === 'rewrite') {
    // Paper travels along z. Rollers span x and leave clearance above the moving sheet.
    for (const dz of [-.65, .65]) {
      rod([-.83, 1.78, dz], [.83, 1.78, dz], .15, P.copper, 10);
      rod([-1.05, 1.78, dz], [1.05, 1.78, dz], .055);
      for (const dx of [-.95, .95]) shell([dx, 1.61, dz], [.22, .54, .34], P.steel);
    }
    for (const dz of [-.94, .94]) {
      box([0, 1.375, dz], [1.55, .08, .36], P.dark);
      box([0, 1.43, dz], [1.2, .025, .3], P.white);
    }
    rod([-1.12, 1.78, -.65], [-1.02, 1.78, -.65], .25, P.copper, 10);
    rod([-1.14, 1.78, -.65], [-1.13, 1.78, -.65], .1, P.dark);
  } else if (kind === 'extract') {
    for (const dx of [-.91, .91]) {
      shell([dx, 1.76, -.73], [.28, .85, .45], P.steel);
      rod([dx, 1.4, -.46], [dx, 2.1, -.46], .065, P.copper);
    }
    shell([0, 2.05, -.84], [2.08, .28, .25], P.white);
    for (let i = 0; i < 3; i++) {
      const dx = -.6 + i * .55;
      box([dx, 1.37, .34], [.47, .07, 1.3], P.dark);
      for (const side of [-1, 1]) box([dx + side * .245, 1.42, .36], [.035, .16, 1.3], P.copper);
      box([dx, 1.425, .87], [.35, .035, .18], P.white);
    }
    bolts(-.85, .85, 2.05, -.7);
  }
}

export function createWorkshopGeometry() {
  const b = new CoasterBatch(), glow = new CoasterBatch();
  for (const { at, id } of [{ at: WORKSHOP_INTAKE, id: 'intake' as const }, ...WORKSHOP_TOOLS]) {
    const [x, y, z] = coasterWorld(at);
    b.housing([x, y + .15, z], [3.1, .3, 2.65], P.concrete);
    b.housing([x, y + 1.24, z], [2.8, .18, 2.3], P.rail);
    workshopArt(b, at, id);
    for (const dx of [-1.15, 1.15]) {
      b.beam([x + dx, y + .3, z - .85], [x + dx, y + WORKSHOP_POST_TOP, z - .85], .1, P.steel, 8);
      b.box([x + dx, y + .32, z - .85], [.35, .08, .35], P.copper);
      b.beam([x + dx, y + 2.8, z - .85], [x + dx, y + 2.8, z + .3], .07, P.rail, 8);
    }
    b.housing([x, y + 2.55, z - .92], [2.8, .65, .18], P.dark);
    b.box([x, y + 3.32, z - .86], [2.65, .12, .28], P.dark);
    glow.box([x, y + 3.24, z - .86], [2.4, .06, .2], P.gold);
    // Overhead carrier branches leave a full-height route through the courtyard.
    const hub = coasterWorld(WORKSHOP_HUB), branch: Vec3 = [x, y + WORKSHOP_RAIL_Y, z - .85];
    b.beam([x - 1.25, branch[1], branch[2]], [x + 1.25, branch[1], branch[2]], .13, P.steel, 8);
    b.housing(branch, [.5, .46, .55], P.copper);
    for (const dx of [-1.15, 1.15]) {
      b.beam([x + dx, y + WORKSHOP_POST_TOP, z - .85],
        [(hub[0] + branch[0]) / 2, branch[1] + .14, (hub[2] + branch[2]) / 2], .035, P.rail, 5);
      b.housing([x + dx, branch[1], branch[2]], [.3, .42, .3], P.copper);
    }
    b.beam(hub, branch, .15, P.dark, 8);
    glow.beam([hub[0], hub[1] + .17, hub[2]], [branch[0], branch[1] + .17, branch[2]], .025, P.cyan, 5);
  }
  const hub = coasterWorld(WORKSHOP_HUB);
  b.beam(hub, [hub[0], hub[1] + .46, hub[2]], .5, P.steel, 12);
  b.beam([hub[0], hub[1] + .46, hub[2]], [hub[0], hub[1] + .53, hub[2]], .34, P.copper, 12);
  glow.beam([hub[0], hub[1] + .34, hub[2]], [hub[0], hub[1] + .39, hub[2]], .505, P.cyan, 12);
  const [ix, iy, iz] = coasterWorld(WORKSHOP_INTAKE);
  for (let n = 0; n < 9; n++) b.beam([ix - .85, iy + 1.42, iz - .6 + n * .15], [ix + .4, iy + 1.42, iz - .6 + n * .15], .07, P.steel, 8);
  b.housing([ix - 2.5, iy + .65, iz], [.8, 1.3, .8], P.white);
  b.beam([ix - 2.5, iy + 1.3, iz], [ix - 2.5, iy + 1.7, iz], .22, P.copper, 12);
  return { body: b.finish(), glow: glow.finish() };
}
export function createWorkshopMoving(tool: IntentClass) {
  const b = new CoasterBatch();
  if (tool === 'lookup') b.add(new TorusGeometry(.32, .045, 6, 20), P.cyan, new Matrix4().makeRotationX(-Math.PI / 2));
  else if (tool === 'act') { b.beam([-.85, 0, -.15], [-.55, 0, -.15], .045, P.cyan, 6); b.box([-.7, -.15, -.2], [.4, .1, .45], P.cyan); }
  else if (tool === 'plan' || tool === 'debug') { b.housing([0, 0, 0], [.35, .2, .28], P.copper); b.box([-.05, .14, 0], [.15, .13, .22], P.white); }
  else if (tool === 'extract') for (let i = 0; i < 3; i++) b.housing([-.6 + i * .55, 0, 0], [.4, .08, .45], P.cyan);
  else { b.housing([0, 0, 0], [1.3, .08, .7], P.white); for (let i = 0; i < 3; i++) b.box([0, .05, -.2 + i * .2], [.9, .02, .05], P.dark); }
  return b.finish();
}
export function createWorkshopCapsule() {
  const b = new CoasterBatch();
  b.housing([0, 0, 0], [.65, .38, .45], P.white);
  for (const x of [-.24, .24]) b.box([x, 0, 0], [.07, .41, .49], P.copper);
  b.box([0, .2, 0], [.3, .02, .25], P.cyan);
  return b.finish();
}
export function createWorkshopLever() {
  const b = new CoasterBatch();
  b.beam([0, 0, 0], [0, .42, -.17], .055, P.rail, 8);
  b.beam([-.17, .42, -.17], [.17, .42, -.17], .065, P.copper, 8);
  return b.finish();
}
