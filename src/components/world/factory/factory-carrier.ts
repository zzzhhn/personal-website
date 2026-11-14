import { ShapeUtils, Vector2 } from 'three';
import { Builder, cbox, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactoryModule } from './factory-game.ts';

export interface FactoryCarrierPalette {
  teal: Surf; steel: Surf; silver: Surf; dark: Surf; amber: Surf;
}
export interface FactoryCarrierPad {
  /** Centre of the horizontal carrier surface, in companion-local metres. */
  at: V3;
  /** Available supporting surface width/depth, not the module's contact patch. */
  size: [number, number];
  /** Faceted tyre corners can vary by less than 2 mm as the wheel turns. */
  toleranceM: number;
}
export interface FactoryCarrierLocator { min: V3; max: V3 }
export const FACTORY_CARRIER_BASE = {
  lengthX: 1.7, depthZ: 1.05, bottomY: -.06, topY: 0, bevel: .008,
} as const;
/** Clear neck dimensions, excluding the wider 8 mm machined entry chamfer.
 * Outboard of every module, locator and hoist jaw; no texture/decal holes. */
export const FACTORY_CARRIER_HANDHOLDS = [-.66, .66].map(x => ({
  x, halfX: .09, halfZ: .15, corner: .025,
}));

function carrierDeck(b: Builder, palette: FactoryCarrierPalette) {
  const spec = FACTORY_CARRIER_BASE, edge = spec.bevel;
  const loop = (x: number, hx: number, hz: number, corner: number): Vector2[] => [
    [-hx + corner, -hz], [hx - corner, -hz], [hx, -hz + corner], [hx, hz - corner],
    [hx - corner, hz], [-hx + corner, hz], [-hx, hz - corner], [-hx, -hz + corner],
  ].map(([dx, z]) => new Vector2(x + dx, z));
  const outer = loop(0, spec.lengthX / 2, spec.depthZ / 2, edge);
  const flat = loop(0, spec.lengthX / 2 - edge, spec.depthZ / 2 - edge, edge);
  const necks = FACTORY_CARRIER_HANDHOLDS.map(h => loop(h.x, h.halfX, h.halfZ, h.corner));
  const mouths = FACTORY_CARRIER_HANDHOLDS.map(h => loop(h.x, h.halfX + edge, h.halfZ + edge, h.corner + edge));
  const point = (p: Vector2, y: number): V3 => [p.x, y, p.y];
  const ring = (a: Vector2[], ay: number, c: Vector2[], cy: number, s: Surf, inward = false) => {
    a.forEach((p, i) => {
      const next = (i + 1) % a.length, q = a[next];
      const out: V3 = [q.y - p.y, 0, p.x - q.x];
      if (inward) { out[0] *= -1; out[2] *= -1; }
      b.face([point(p, ay), point(q, ay), point(c[next], cy), point(c[i], cy)], s, out);
    });
  };
  // Triangulate the actual two-holed deck once, then reuse for its underside.
  // All loops meet at shared boundaries; there is no hidden solid cap or
  // overlapping box face behind the handholds or their silver chamfers.
  const vertices = [flat, ...mouths].flat();
  for (const triangle of ShapeUtils.triangulateShape(flat, mouths)) {
    b.face(triangle.map(i => point(vertices[i], spec.topY)), palette.teal, [0, 1, 0]);
    b.face(triangle.map(i => point(vertices[i], spec.bottomY)), palette.teal, [0, -1, 0]);
  }
  ring(flat, spec.topY, outer, spec.topY - edge, palette.teal);
  ring(outer, spec.topY - edge, outer, spec.bottomY + edge, palette.teal);
  ring(outer, spec.bottomY + edge, flat, spec.bottomY, palette.teal);
  necks.forEach((neck, i) => {
    ring(mouths[i], spec.topY, neck, spec.topY - edge, palette.silver, true);
    ring(neck, spec.topY - edge, neck, spec.bottomY + edge, palette.steel, true);
    ring(neck, spec.bottomY + edge, mouths[i], spec.bottomY, palette.silver, true);
  });
}

/** Reusable transport nest, sharing the module's ground/contact-plane origin.
 * Set its origin to roller/press-bed top + .06; the base underside is -.06.
 * Frame/shell pads continue down to the base. Wheel support is the flat base
 * itself, with no posts through the running gear. Locators are fixed guides,
 * not clamps. Lift the module away and leave the carrier on the conveyor.
 * One merged geometry, no material or disposal side effects: caller owns both.
 * The tyre tolerance describes a bounded polygon approximation, not physics. */
export function buildFactoryCarrier(module: FactoryModule, palette: FactoryCarrierPalette) {
  const b = new Builder(), P = palette, supportPads: FactoryCarrierPad[] = [];
  const locatorBounds: FactoryCarrierLocator[] = [];
  const spec = FACTORY_CARRIER_BASE;
  const base = {
    footprint: [spec.lengthX, spec.depthZ] as [number, number],
    flatUndersideFootprint: [spec.lengthX - 2 * spec.bevel, spec.depthZ - 2 * spec.bevel] as [number, number],
    bottomY: spec.bottomY, topY: spec.topY,
  };
  // 1.684 m of flat underside spans at least two .8 m-spaced rollers at every
  // travel phase; bevelled ends are excluded from the support footprint.
  carrierDeck(b, P);
  const locator = (at: V3, size: V3) => {
    cbox(b, at, size, P.amber, .003);
    locatorBounds.push({
      min: at.map((n, i) => n - size[i] / 2) as V3,
      max: at.map((n, i) => n + size[i] / 2) as V3,
    });
  };
  const pad = (x: number, z: number, y: number, size: [number, number], column: [number, number]) => {
    const cap = .016;
    cbox(b, [x, (y - cap) / 2, z], [column[0], y - cap, column[1]], P.silver, .004);
    cbox(b, [x, y - cap / 2, z], [size[0], cap, size[1]], P.dark);
    supportPads.push({ at: [x, y, z], size, toleranceM: .00001 });
  };
  if (module === 'frame') {
    // Flat deck underside, well inboard of the bumper and chamfered deck edges.
    for (const x of [-.135, .135]) for (const z of [-.2, .2]) {
      pad(x, z, .245, [.075, .08], [.06, .065]);
      locator([Math.sign(x) * .224, .145, z], [.02, .29, .11]);
    }
  } else if (module === 'shell') {
    // Narrow pads land on the real lower side-panel rim, not the empty middle.
    for (const x of [-.2325, .2325]) for (const z of [-.19, .19])
      pad(x, z, .32, [.016, .06], [.04, .05]);
    // Below the existing shell hoist jaw's .36 m lower edge, and outside skin.
    for (const side of [-1, 1]) locator([side * .272, .17, 0], [.018, .34, .1]);
  } else if (module === 'wheels') {
    // These four footprints cover both tyre configurations on the same base.
    for (const x of [-.27, .27]) for (const z of [-.275, .275]) {
      supportPads.push({ at: [x, 0, z], size: [.13, .12], toleranceM: .002 });
      locator([Math.sign(x) * .352, .0275, z], [.022, .055, .23]);
      locator([x, .0225, Math.sign(z) * .445], [.13, .045, .035]);
    }
  } else {
    throw new TypeError('Invalid factory carrier module');
  }
  const geometry = b.build();
  return { geometry, module, base, supportPads, locatorBounds, triangles: b.triangles };
}
