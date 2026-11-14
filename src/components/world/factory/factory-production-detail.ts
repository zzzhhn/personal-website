import { Builder, bar, box as rawBox, cbox, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactoryLamp, FactorySolid } from './factory-geometry.ts';
import { FACTORY_LINE_Z, FACTORY_RAW_HALF_HEIGHT, FACTORY_RAW_PICK } from './factory-operation.ts';
import { FACTORY_MODULES } from './factory-game.ts';
import { FACTORY_TASK_LIGHTS } from './factory-lighting.ts';

type Palette = Record<'cream'|'teal'|'steel'|'silver'|'dark'|'amber'|'lamp', Surf>;
export const FACTORY_TOOL_RACKS = FACTORY_MODULES.map(module => ({ module,
  at: [-36.5, .12, FACTORY_LINE_Z[module] + 5] as V3,
}));

/** Fixed reserve blanks, changeover tooling and service fixtures. No finished
 * product, batch ID or fictional running machine is generated. Merge this
 * geometry into the existing static factory batch before its light bake. */
export function buildFactoryProductionDetail(P: Palette) {
  const b = new Builder(), solids: FactorySolid[] = [];
  const box = (at: V3, size: V3, surf: Surf, solid = false, bevel = 0) => {
    cbox(b, at, size, surf, bevel);
    if (solid) solids.push({ at: [...at], size: [...size] });
  };
  for (const module of FACTORY_MODULES) {
    const [x, , z] = FACTORY_RAW_PICK[module], top = 1.42 - FACTORY_RAW_HALF_HEIGHT[module];
    const h = (top - .9) / 3, size = module === 'wheels' ? [.52, .52] : module === 'shell' ? [.58, .7] : [.62, .72];
    // The centre stack physically supports the live selectable blank. Adjacent
    // stacks are reserve inventory in the existing inexhaustible source bin.
    for (const [dx, dz] of [[0, 0], [-.8, -.82], [0, -.82], [.8, -.82], [-.8, .82], [0, .82], [.8, .82]]) {
      // Layers retain separate side colours, but share their hidden interfaces.
      // Their bottom is seated on the opaque source bin, not a visible face.
      for (let level = 0; level < 3; level++) rawBox(b,
        [x + dx - size[0] / 2, .9 + level * h, z + dz - size[1] / 2],
        [x + dx + size[0] / 2, .9 + (level + 1) * h, z + dz + size[1] / 2],
        level === 1 ? P.steel : P.silver, 0, { ny: null, ...(level < 2 ? { py: null } : {}) });
      solids.push({ at: [x + dx, (.9 + top) / 2, z + dz], size: [size[0], top - .9, size[1]] });
    }
    for (const dx of [-1.22, 1.22]) box([x + dx, .95, z], [.06, .1, 2.3], P.amber);
  }
  for (const { module, at: [x, y, z] } of FACTORY_TOOL_RACKS) {
    const width = 2.4, depth = 1.35;
    for (const dx of [-1.12, 1.12]) for (const dz of [-.58, .58]) {
      box([x + dx, y + .91, z + dz], [.09, 1.82, .09], P.teal, true);
      box([x + dx, y + .05, z + dz], [.28, .1, .28], P.steel, true);
    }
    for (const shelfY of [.28, .93, 1.58]) {
      box([x, y + shelfY, z], [width, .08, depth], P.steel, true);
      for (const dx of [-.66, .66]) {
        // Fixed U dies sit on the shelves, with a real open centre and ribs.
        const metal = module === 'shell' ? P.cream : P.silver;
        box([x + dx, y + shelfY + .09, z], [.65, .1, .78], metal);
        for (const side of [-1, 1]) box([x + dx + side * .26, y + shelfY + .23, z], [.13, .18, .78], metal);
        box([x + dx, y + shelfY + .17, z + .32], [.4, .06, .08], P.amber);
      }
    }
    box([x, y + 1.9, z + .59], [width, .15, .08], P.cream);
  }
  for (const z of Object.values(FACTORY_LINE_Z)) {
    // Recessed service panels outside the moving press/gate sweep. The supply
    // enters beside its left column, never across the ram or working throat.
    box([-27, 1.04, z - 3.4], [2.6, 1.84, 1.1], P.teal, true, .035);
    box([-27, 1.09, z - 3.965], [2.3, 1.53, .03], P.cream);
    for (const dx of [-.65, .65]) box([-27 + dx, 1.23, z - 3.99], [.06, .3, .025], P.steel);
    for (let i = 0; i < 5; i++) box([-27.7 + i * .35, .56, z - 3.99], [.2, .035, .025], P.dark);
    bar(b, [-28.29, .65, z - 3.4], [-29.9, .65, z - 3.4], .045, P.steel, 6);
    bar(b, [-29.9, .65, z - 3.4], [-29.9, .65, z - 2.3], .045, P.steel, 6);
    bar(b, [-29.9, .65, z - 2.3], [-29.6, .65, z - 2.2], .045, P.steel, 6);
    for (const side of [-1, 1]) {
      const lz = z + side * 2.65;
      bar(b, [-29.4, 3.58, z + side * 2.02], [-29.4, 3.58, lz], .055, P.teal, 6);
      box([-28.2, 3.5, lz], [3.6, .16, .32], P.steel);
      box([-28.2, 3.395, lz], [3.35, .05, .23], P.lamp);
    }
    // Broad side cheeks, drain tray and cross-members break up long thin rails.
    // They remain outside the real carrier footprint and below its support top.
    for (const side of [-1, 1]) for (const x of [-16, -8, 0, 8, 16, 24])
      box([x, 1.04, z + side * 1.15], [2.5, .38, .09], P.cream, true, .015);
    box([4, .46, z], [48, .06, 1.7], P.steel, true);
    for (let x = -15.85; x < 29; x += 4.5) {
      box([x, .38, z], [.16, .16, 2], P.teal, true);
      for (const side of [-1, 1]) box([x, .2, z + side * .95], [.38, .16, .36], P.steel, true);
    }
  }
  // One suspended source-bay work light clears the travelling gantry's top.
  box([-38.8, 8.2, -16], [8.4, .18, .4], P.teal);
  box([-38.8, 8.085, -16], [8.1, .05, .3], P.lamp);
  for (const x of [-42.4, -35.2]) bar(b, [x, 8.3, -16], [x, 10.785, -16], .035, P.steel, 6);
  const geometry = b.build();
  const lamps: FactoryLamp[] = FACTORY_TASK_LIGHTS.map(lamp => ({ ...lamp, at: [...lamp.at] as V3 }));
  return { geometry, solids, lamps, triangles: b.triangles };
}
