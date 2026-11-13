import { Box3, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { Builder, bar, cbox, type Surf, type V3 } from '../WorldStreetGeometry.ts';

type Palette = Record<'cream'|'teal'|'steel'|'dark'|'silver'|'amber', Surf>;
/** Factory-local placement; model geometry uses a floor-relative origin. Output is +Z. */
export const FACTORY_PRINTER = {
  at: [43, .12, 22] as const,
  card: { width: .94, length: .58, y: 1.069, startZ: -.12, endZ: .89 },
  roller: { z: .49, radius: .067, lowerY: 1.002, upperY: 1.136 },
  tray: { top: 1.067, startZ: .56, endZ: 1.26 },
} as const;

/** Four draws: one merged enamel chassis, two turning feed rollers, one printable
 * card. Feed is an absolute 0..1 progress so pause/re-entry does not accumulate
 * motion. The whole rigid card travels through a genuinely open horizontal throat.
 * The caller owns any report texture/material it attaches to `card`. */
export function buildFactoryPrinter(p: Palette) {
  const group = new Group(); group.name = 'factory-report-printer';
  group.position.set(...FACTORY_PRINTER.at);
  const b = new Builder();
  const solids: Array<{ at: V3; size: V3 }> = [];
  const cube = (at: V3, size: V3, surface: Surf, bevel = .025, solid = false) => {
    cbox(b, at, size, surface, bevel);
    if (solid) solids.push({ at: [at[0] + FACTORY_PRINTER.at[0], at[1] + FACTORY_PRINTER.at[1], at[2] + FACTORY_PRINTER.at[2]], size: [...size] });
  };
  // Four rubber feet and a steel plinth carry the enclosure, rather than a floating box.
  for (const x of [-.67, .67]) for (const z of [-.39, .39]) {
    cube([x, .075, z], [.23, .15, .25], p.dark, .025, true);
    cube([x, .18, z], [.15, .12, .17], p.steel, .015);
  }
  cube([0, .24, 0], [1.58, .12, 1.05], p.teal, .035, true);
  cube([0, .61, 0], [1.7, .74, 1.15], p.cream, .065, true);
  // Separate hood, cheeks and back wall leave the full paper passage empty.
  cube([0, 1.27, 0], [1.7, .18, 1.15], p.cream, .06, true);
  for (const x of [-.75, .75]) cube([x, 1.08, 0], [.2, .2, 1.15], p.cream, .02, true);
  cube([0, 1.08, -.53], [1.3, .2, .09], p.teal, .015, true);
  // Internal paper bed ends before the nip; external tray begins beyond its sweep.
  cube([0, 1.047, -.01], [1.22, .04, .86], p.steel, 0);
  for (const x of [-.5, .5]) cube([x, 1.0035, -.01], [.07, .047, .72], p.steel, 0);
  cube([0, 1.047, .91], [1.22, .04, .70], p.silver, 0, true);
  for (const x of [-.585, .585]) {
    cube([x, 1.107, .91], [.05, .08, .7], p.teal, .012);
    bar(b, [x, .71, .40], [x, 1.027, 1.14], .045, p.teal, 6);
  }
  cube([0, 1.107, 1.28], [1.22, .08, .04], p.teal, .01);
  // Bearings are housed in the cheeks; shafts physically bridge bearings to rubber.
  for (const y of [FACTORY_PRINTER.roller.lowerY, FACTORY_PRINTER.roller.upperY]) {
    bar(b, [-.68, y, .49], [.68, y, .49], .022, p.silver, 10);
    for (const x of [-.65, .65]) cube([x, y, .49], [.08, .12, .14], p.steel, .01);
  }
  // Top-mounted controls and an inset lower service panel stay out of the slot.
  cube([-.45, 1.366, .22], [.41, .025, .23], p.teal, .01);
  cube([-.54, 1.392, .22], [.11, .035, .12], p.amber, .012);
  cube([-.36, 1.392, .22], [.1, .035, .12], p.dark, .012);
  cube([0, .64, .578], [1.25, .4, .016], p.teal, .015);
  cube([0, .78, .601], [.3, .045, .035], p.steel, .01);
  const chassisGeometry = b.build();
  const chassisMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .64, metalness: .2 });
  const chassis = new Mesh(chassisGeometry, chassisMaterial); chassis.name = 'printer-open-throat-chassis';
  chassis.castShadow = true; chassis.receiveShadow = true; group.add(chassis);
  const rollerGeometry = new CylinderGeometry(.067, .067, 1.04, 12, 1);
  rollerGeometry.rotateZ(Math.PI / 2);
  const rollerMaterial = new MeshStandardMaterial({ color: p.dark.color, roughness: .9, metalness: .02 });
  const lower = new Mesh(rollerGeometry, rollerMaterial), upper = new Mesh(rollerGeometry, rollerMaterial);
  lower.name = 'printer-lower-feed-roller'; upper.name = 'printer-upper-feed-roller';
  lower.position.set(0, 1.002, .49); upper.position.set(0, 1.136, .49);
  lower.castShadow = true; upper.castShadow = true; group.add(lower, upper);
  const cardGeometry = new PlaneGeometry(.94, .58); cardGeometry.rotateX(-Math.PI / 2);
  const cardMaterial = new MeshStandardMaterial({ color: '#F2EAD8', roughness: .94, metalness: 0, side: DoubleSide });
  const card = new Mesh(cardGeometry, cardMaterial); card.name = 'printer-report-card';
  card.receiveShadow = true; group.add(card);
  const bounds = new Box3(new Vector3(-.85, 0, -.575), new Vector3(.85, 1.41, 1.3));
  const triangles = b.triangles + rollerGeometry.index!.count / 3 * 2 + cardGeometry.index!.count / 3;
  group.userData.factoryPrinter = { triangles, meshes: 4, coordinates: 'floor-relative', output: '+Z' };
  let disposed = false;
  function update(feed: number) {
    if (disposed) return;
    const progress = Number.isFinite(feed) ? Math.min(1, Math.max(0, feed)) : 0;
    const distance = (FACTORY_PRINTER.card.endZ - FACTORY_PRINTER.card.startZ) * progress;
    card.position.set(0, FACTORY_PRINTER.card.y, FACTORY_PRINTER.card.startZ + distance);
    lower.rotation.x = distance / FACTORY_PRINTER.roller.radius;
    upper.rotation.x = -lower.rotation.x;
  }
  update(0);
  return { group, card, update, bounds, solids, triangles, dispose() {
    if (disposed) return; disposed = true;
    chassisGeometry.dispose(); rollerGeometry.dispose(); cardGeometry.dispose();
    chassisMaterial.dispose(); rollerMaterial.dispose(); cardMaterial.dispose();
  } };
}
