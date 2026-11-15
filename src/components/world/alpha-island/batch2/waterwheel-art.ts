import { CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { AlphaBuilder } from '../alpha-art';
import type { Vec3 } from '../../types';

const turnZ = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a);
const axleQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
export const WATERWHEEL_CENTER: Vec3 = [-5.3, 3.17, -1.5];
export const SLUICE_X = [-1.9, 1.1, 4.1] as const;

/** Editable timber construction, no filled wheel disc. Axial +Z, 18 hollow
 * buckets, twin segmented rims, mortised spokes, iron straps and bearing axle. */
export function buildWaterwheelRotor() {
  const b = new AlphaBuilder(), count = 18, r = 2.65;
  b.add(new CylinderGeometry(.17, .17, 2.9, 12), 'metal', [0, 0, 0], axleQ);
  for (const z of [-.72, .72]) {
    b.add(new CylinderGeometry(.41, .41, .25, 12), 'darkwood', [0, 0, z], axleQ);
    b.add(new CylinderGeometry(.22, .22, .3, 12), 'metal', [0, 0, z], axleQ);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      b.beam('wood', [Math.cos(a) * .3, Math.sin(a) * .3, z], [Math.cos(a) * r, Math.sin(a) * r, z], .24, .18);
      b.add(new CylinderGeometry(.045, .045, .24, 8), 'metal', [Math.cos(a) * 2.38, Math.sin(a) * 2.38, z], axleQ);
    }
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2, c = (i + 1) / count * Math.PI * 2;
      b.beam('darkwood', [Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(c) * r, Math.sin(c) * r, z], .23, .2);
    }
  }
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2, q = turnZ(a), place = (x: number, y: number, z: number): Vec3 => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y, z];
    // Tangential base and outer back retain a real open radial mouth and side cheeks.
    b.box('wood', place(2.61, -.17, 0), [.58, .12, 1.38], .025, q);
    b.box('wood', place(2.43, .08, 0), [.12, .48, 1.38], .025, q);
    for (const z of [-.67, .67]) b.box('wood', place(2.68, .04, z), [.57, .49, .1], .02, q);
    for (const z of [-.46, .46]) b.box('metal', place(2.63, -.24, z), [.62, .045, .075], .009, q);
  }
  return b.finish();
}

export function buildWaterwheelFrame() {
  const b = new AlphaBuilder();
  // Four footings carry the upper headrace. Lower bearing piers flank the wheel.
  for (const z of [-2.85, -.15]) {
    for (let row = 0; row < 4; row++) b.box('stone', [-5.3, .33 + row * .62, z], [1.05, .59, .88], .075);
    b.box('darkwood', [-5.3, 2.9, z], [1.18, .26, .92], .04);
    b.add(new CylinderGeometry(.34, .34, .26, 12), 'metal', [-5.3, 3.17, z], axleQ);
    for (const x of [-5.7, -4.9]) b.cyl('metal', [x, 3.08, z], .045, .45);
  }
  for (const x of [-8.15, -2.55]) for (const z of [-2.8, -.25]) {
    b.box('stone', [x, .28, z], [.85, .56, .85], .08);
    b.beam('wood', [x, .4, z], [x, 6.48, z], .31);
    b.beam('wood', [x, 4.95, z], [x + (x < -5 ? .95 : -.95), 6.12, z], .19);
    b.box('metal', [x, .72, z], [.34, .2, .34], .02);
  }
  // Open U-section trough, real planks and raised sides, flowing over the buckets.
  for (let x = -7.5; x <= -3.2; x += .48) if (x < -4.5 || x > -3.4) b.box('wood', [x, 6.22, -1.5], [.46, .18, 1.56], .025);
  for (const z of [-2.28, -.72]) b.box('wood', [-5.3, 6.48, z], [5.3, .58, .15], .025);
  b.beam('darkwood', [-8.32, 6.02, -2.8], [-2.35, 6.02, -2.8], .28);
  b.beam('darkwood', [-8.32, 6.02, -.25], [-2.35, 6.02, -.25], .28);
  // Massive layered rock ledge, with a 4.85m clear, open-backed passage beneath.
  for (const x of [-1.65, 8.05]) for (const z of [-6, -2.6]) for (let row = 0; row < 8; row++)
    b.box('stone', [x + Math.sin(row * 2.7) * .06, .32 + row * .65, z], [1.65, .66, .6], .1);
  for (let i = 0; i < 6; i++) b.box('stone', [-.55 + i * 1.44, 5.36, -4.3], [1.59, .92, 4.2], .16);
  // The bridge channel feeds the wheel headrace. Its support never reaches the passage.
  for (const z of [-2.9, -1.72]) b.beam('wood', [-2.8, 6.3, z], [6.6, 6.6, z], .16);
  b.box('darkwood', [1.9, 6.2, -2.31], [9.5, .16, 1.18], .03, turnZ(.032));
  for (const x of [-.9, 6.1]) b.beam('wood', [x, 5.8, -2.95], [x, 6.5, -2.95], .18);
  // A stepped stone drain crosses the passage floor without a raised trip edge.
  for (let i = 0; i < 11; i++) b.box('stone', [-2.22 + i * 1.09, -.04, -4.1], [1.07, .16, 2.58], .045);
  for (const x of [-1.9, 1.1, 4.1]) {
    // Three low sluice gates lie across the discharge race, each with a reachable crank.
    for (const side of [-.65, .65]) {
      b.box('stone', [x + side, .36, 2.3], [.35, .72, 1.35], .06);
      b.beam('wood', [x + side, .62, 2.3], [x + side, 2.08, 2.3], .16);
    }
    b.box('wood', [x, 1.92, 2.3], [1.6, .2, .45], .035);
    b.cyl('metal', [x, 1.92, 2.3], .055, 1.08);
    b.beam('metal', [x, 1.6, 2.3], [x, 1.6, 2.75], .09);
    for (const side of [-.54, .54]) b.box('metal', [x + side, 1.27, 2.3], [.08, 1.2, .14], .012);
    // Notches express the three stops physically, no extra floating labels.
    for (let j = 0; j < 3; j++) b.box('metal', [x + .73, .99 + j * .27, 2.56], [.14, .045, .04], .008);
  }
  // Discharge race and bank: south bank is low and never intrudes on the bypass.
  for (const z of [.7, 3.12]) for (let i = 0; i < 7; i++)
    b.box('stone', [-5.3 + i * 1.6, .15, z], [1.58, .3, .4], .07);
  return b.finish();
}

export function buildSluicePanel() {
  const b = new AlphaBuilder();
  for (let x = -.45; x < .6; x += .3) b.box('darkwood', [x, 0, 0], [.28, .91, .13], .024);
  for (const y of [-.29, .29]) b.box('metal', [0, y, .1], [1.16, .07, .07], .01);
  return b.finish();
}
export function buildSluiceCrank() {
  const b = new AlphaBuilder();
  b.beam('metal', [-.35, 0, 0], [.35, 0, 0], .075);
  for (const x of [-.35, .35]) b.cyl('darkwood', [x, .12, 0], .065, .27);
  return b.finish();
}

export function buildWaterwheelFlowers() {
  const stems = new AlphaBuilder(), petals = new AlphaBuilder();
  for (let i = 0; i < 36; i++) {
    const x = -.8 + (i % 12) * .67, z = -5.18 + Math.floor(i / 12) * .46, y = 5.88, h = .3 + (i % 5) * .045;
    stems.beam('leafplate', [x, y, z], [x + .04, y + h, z], .024);
    const leaf = new SphereGeometry(.12, 6, 4); leaf.scale(1.45, .2, .55);
    stems.add(leaf, 'leafplate', [x + .07, y + h * .55, z]);
    for (let j = 0; j < 5; j++) petals.add(new SphereGeometry(.09, 6, 4), 'paper', [x + Math.cos(j * 1.257) * .085, y + h, z + Math.sin(j * 1.257) * .085]);
    petals.add(new SphereGeometry(.052, 6, 4), 'metal', [x, y + h + .035, z]);
  }
  return { stems: stems.finish(), petals: petals.finish() };
}
