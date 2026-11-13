import { Builder, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactorySolid } from './factory-geometry.ts';

export interface FactoryFixturePalette {
  cream: Surf; teal: Surf; steel: Surf; silver: Surf; dark: Surf;
}
/** Exact existing assembly/final-fitting datum, not an alternate robot scale. */
export const FACTORY_FIXTURE_CONTACT = [24, 1.14, -4] as const;

/** One static batch. Integration owner replaces only the old assembly base,
 * worktop and four-post loop in factory-geometry.ts, retaining both crane-rail
 * lines, the overhead cross-beam and all station consoles. Append solids and
 * merge geometry before the existing lighting bake; dispose temporary inputs.
 * No positioning, animation, actuator, light, texture or gameplay state is owned
 * here. The four pads meet the existing chassis underside at datum Y + .245.
 * Wheel recesses are real openings, allowing both configurations to spin without
 * moving the datum. Caller owns geometry.dispose(). */
export function buildFactoryFixture(palette: FactoryFixturePalette) {
  const b = new Builder(), solids: FactorySolid[] = [], P = palette;
  const box = (at: V3, size: V3, surf: Surf, solid = false, bevel = 0) => {
    const placed: V3 = [at[0] + FACTORY_FIXTURE_CONTACT[0], at[1] + FACTORY_FIXTURE_CONTACT[1], at[2] + FACTORY_FIXTURE_CONTACT[2]];
    cbox(b, placed, size, surf, bevel);
    if (solid) solids.push({ at: placed, size: [...size] });
  };
  // Open steel frame, broad levelling feet and an inset service enclosure.
  for (const x of [-.78, .78]) for (const z of [-.58, .58]) {
    box([x, -.97, z], [.26, .1, .22], P.steel, false, .012);
    box([x, -.56, z], [.12, .72, .12], P.teal, false, .012);
  }
  for (const z of [-.75, .75]) {
    box([0, -.15, z], [2.02, .14, .12], P.teal, false, .014);
    box([0, -.16, z + Math.sign(z) * .075], [2.02, .16, .04], P.cream, false, .008);
    box([0, -.75, Math.sign(z) * .58], [1.56, .1, .1], P.steel);
    box([0, -.16, Math.sign(z) * .58], [1.9, .16, .12], P.steel);
  }
  for (const x of [-.94, .94]) box([x, -.15, 0], [.12, .14, 1.5], P.teal, false, .014);
  box([0, -.53, .05], [.7, .7, .6], P.cream, false, .02);
  for (const x of [-.28, .28]) box([x, -.13, .05], [.06, .1, .4], P.steel);
  box([0, -.52, -.255], [.56, .54, .03], P.dark);
  box([0, -.52, -.277], [.51, .49, .015], P.teal, false, .006);
  box([.17, -.46, -.289], [.045, .13, .02], P.steel, false, .004);
  for (const y of [-.69, -.62, -.55, -.48]) box([0, y, .355], [.44, .025, .02], P.dark);
  // Under-table volume ends at the recess floors. It cannot intrude into the
  // rotating wheels; the upright player cannot enter this sub-1.06 m space.
  solids.push({ at: [24, .59, -4], size: [2.1, .94, 1.7] });

  // Nine actual plates tile a 2.1 x 1.7 m worktop at Y=1.14, leaving four
  // 0.16 x 0.33 m wheel pockets instead of a painted dark rectangle on a solid.
  box([0, -.04, 0], [.38, .08, 1.7], P.silver, true, .004);
  for (const side of [-1, 1]) {
    box([side * .7, -.04, 0], [.7, .08, 1.7], P.silver, true, .006);
    for (const [z, depth] of [[-.645, .41], [0, .22], [.645, .41]])
      box([side * .27, -.04, z], [.16, .08, depth], P.silver, true, .003);
    for (const z of [-.275, .275]) box([side * .27, -.095, z], [.16, .03, .33], P.dark);
  }
  // A fixed central saddle carries the chassis while leaving the steady
  // configuration's low ballast (local Z +/- .15) and wishbones untouched.
  box([0, .015, 0], [.16, .03, .18], P.teal, false, .004);
  box([0, .06, 0], [.34, .06, .43], P.steel, false, .006);
  for (const x of [-.15, .15]) for (const z of [-.18, .18]) {
    box([x, .1615, z], [.035, .143, .03], P.silver);
    box([x, .239, z], [.055, .012, .04], P.dark, true);
  }
  // Fixed side fences are between the axles, below the enclosure and clear of
  // the frame edge. They do not claim to close or grip through an animation.
  for (const side of [-1, 1]) {
    box([side * .23, .12, 0], [.04, .24, .08], P.teal, false, .004);
    box([side * .228, .252, 0], [.04, .016, .1], P.silver);
  }
  // Large locating pins give the fixture a readable assembly interface. These
  // are stationary datums outside the full companion/wheel sweep, not bolts.
  for (const x of [-.48, .48]) for (const z of [-.54, .54]) b.tr(
    [FACTORY_FIXTURE_CONTACT[0] + x, FACTORY_FIXTURE_CONTACT[1], FACTORY_FIXTURE_CONTACT[2] + z], [0, 0, 0], () => lathe(b,
      [[0, 0], [.05, 0], [.05, .025], [.026, .025], [.026, .14], [.018, .17], [0, .17]], P.silver, { sides: 8, faceted: true }));
  const geometry = b.build();
  return { geometry, solids, triangles: b.triangles };
}
