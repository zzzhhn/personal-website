import { Builder, bar, cbox, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactoryLamp } from './factory-geometry.ts';
import { factorySourceContact, type FactorySourceContact } from './factory-contact.ts';

export const FACTORY_FORECOURT_GUARDS = [
  [[51.2, -20], [93.1, -20]], [[93.1, -20], [99.9, -14.1]],
  [[99.9, -14.1], [99.9, 9.8]], [[99.9, 9.8], [94.1, 15.8]],
] satisfies Array<[[number, number], [number, number]]>;
export const FACTORY_FORECOURT_RACKS = [-7.4, -.8];

type Palette = Record<'cream' | 'teal' | 'steel' | 'floor' | 'amber' | 'dark' | 'silver' | 'glass' | 'lamp', Surf>;

/** Architectural plinths, entrance portal framing, perimeter curb/guardrails,
 * yard luminaire standards and an east-apron spare-module staging bay.
 * Merged into the single static factory batch (0 extra draw calls, 0 new pointLight slots). */
export function buildFactoryForecourtDetail(P: Palette) {
  const b = new Builder();
  const lamps: FactoryLamp[] = [];
  const contacts: FactorySourceContact[] = [];

  const box = (at: V3, size: V3, s: Surf, bevel = .02) => cbox(b, at, size, s, bevel);
  const beam = (a: V3, end: V3, width = 0.075, s: Surf = P.steel) => bar(b, a, end, width, s, 6);

  const bollard = (x: number, z: number) => {
    box([x, 0.16, z], [0.28, 0.08, 0.28], P.steel, 0);
    bar(b, [x, 0.2, z], [x, 0.96, z], 0.085, P.dark, 6);
    bar(b, [x, 0.76, z], [x, 0.86, z], 0.092, P.amber, 6);
    bar(b, [x, 0.96, z], [x, 1.02, z], 0.09, P.silver, 6);
  };

  const yardLamp = (x: number, z: number, armDx: number, armDz: number, reach = 10, strength = 1.05) => {
    box([x, 0.22, z], [0.46, 0.2, 0.46], P.steel, 0.02);
    box([x, 0.42, z], [0.28, 0.22, 0.28], P.teal, 0);
    bar(b, [x, 0.5, z], [x, 4.15, z], 0.075, P.teal, 6);
    const hx = x + armDx, hz = z + armDz;
    beam([x, 4.08, z], [hx, 4.22, hz], 0.06, P.steel);
    beam([x, 3.62, z], [x + armDx * 0.55, 4.13, z + armDz * 0.55], 0.04, P.teal);
    box([hx, 4.16, hz], [0.56, 0.14, 0.32], P.steel, 0.015);
    box([hx, 4.07, hz], [0.44, 0.045, 0.22], P.lamp, 0);
    lamps.push({ at: [hx, 3.98, hz], reach, strength });
  };

  const perimeterRun = (id: number, a: [number, number], end: [number, number]) => {
    const firstVertex = b.pos.length / 3, firstIndex = b.idx.length;
    const dx = end[0] - a[0], dz = end[1] - a[1], len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    // Continuous low concrete curb + thin solid guard matching visible rails
    b.tr([(a[0] + end[0]) / 2, 0.19, (a[1] + end[1]) / 2], [0, yaw, 0], () => {
      cbox(b, [0, 0, 0], [0.26, 0.14, len], P.steel, 0.015);
    });
    const steps = Math.max(2, Math.round(len / 4.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      box([px, 0.68, pz], [0.12, 0.96, 0.12], P.steel, 0);
      box([px, 0.29, pz], [0.18, 0.08, 0.18], P.teal, 0);
    }
    for (const [h, surf] of [[0.62, P.teal], [1.08, P.amber]] as const) {
      beam([a[0], 0.12 + h, a[1]], [end[0], 0.12 + h, end[1]], 0.052, surf);
    }
    contacts.push(factorySourceContact(b, `factory-forecourt-guard-${id}`, firstVertex, firstIndex));
  };

  // 1. East Entrance Portal Framing & Canopy Luminaire (clear of [42..50, .13..2.4, -30.1..-28.9] & door [45,-31])
  // Plinths & vertical steel trims on north/south jambs
  box([46.19, 0.26, -30.75], [0.54, 0.28, 0.72], P.steel, 0.02);
  box([45.45, 0.26, -26.25], [1.24, 0.28, 0.72], P.steel, 0.02);
  box([46.06, 2.02, -26.25], [0.1, 3.65, 0.64], P.teal, 0.012);
  // Canopy fascia trim, amber signage bar, and high steel corbel brackets (all y >= 3.15)
  box([46.04, 4.12, -28.5], [0.12, 0.48, 5.06], P.teal, 0.018);
  box([46.12, 4.12, -28.5], [0.05, 0.14, 3.6], P.amber, 0.01);
  for (const z of [-30.65, -26.35]) {
    beam([45.95, 3.22, z], [46.02, 3.92, z], 0.07, P.steel);
  }
  // Warm welcome luminaire tucked beneath the portal canopy soffit (y = 3.78, well above 2.4m head clearance)
  box([45.55, 3.82, -28.5], [0.46, 0.1, 0.92], P.steel, 0.015);
  box([45.55, 3.75, -28.5], [0.34, 0.04, 0.76], P.lamp, 0);
  lamps.push({ at: [45.65, 3.65, -28.5], reach: 9.5, strength: 1.2 });

  // Articulation on the blank east wing wall (x = 46, z = -25.95..-22.5): plinth, coping, pilasters & electrical junction box
  box([46.08, 0.26, -24.225], [0.38, 0.28, 3.52], P.steel, 0.02);
  box([46.06, 3.36, -24.225], [0.38, 0.14, 3.56], P.teal, 0.018);
  for (const z of [-25.35, -23.1]) box([46.16, 1.78, z], [0.09, 2.95, 0.14], P.teal, 0.01);
  box([46.24, 1.52, -24.22], [0.22, 0.68, 0.52], P.teal, 0.018);
  box([46.36, 1.62, -24.22], [0.04, 0.12, 0.28], P.amber, 0.008);
  bar(b, [46.22, 1.86, -24.1], [46.22, 3.28, -24.1], 0.028, P.silver, 6);

  // North exterior wall plinths (z = -31.18, skipping doors at x = -32.5 and x = 45) & north apron bollards
  for (const [x0, x1] of [[-29.5, 43.2]] as const) {
    box([(x0 + x1) / 2, 0.25, -31.18], [x1 - x0, 0.26, 0.18], P.steel, 0.018);
  }
  for (const x of [12, 22, 32, 41]) bollard(x, -34.4);
  // Flanking bollards outside the semi-circular entrance apron (clear of road & entrance path)
  bollard(47.3, -25.2);
  bollard(47.3, -23.1);

  contacts.push(factorySourceContact(b, 'factory-forecourt-east-entry-and-bollards', 0, 0));

  // 2. Courtyard North & East Perimeter Curbs, Guardrails & Luminaires
  // Footprint inside edges: [51.2, -20.0] -> [93.1, -20.0] -> [99.9, -14.1] -> [99.9, 9.8] -> [94.1, 15.8]
  FACTORY_FORECOURT_GUARDS.forEach(([a, end], id) => perimeterRun(id, a, end));

  const lampVertex = b.pos.length / 3, lampIndex = b.idx.length;
  yardLamp(56.5, -19.55, 0, 1.05, 10, 1.05);
  yardLamp(74.5, -19.55, 0, 1.05, 10, 1.05);
  yardLamp(91.5, -19.55, -0.35, 0.95, 10, 1.05);
  yardLamp(99.45, -2.0, -1.05, 0, 10, 1.05);
  contacts.push(factorySourceContact(b, 'factory-forecourt-yard-luminaires', lampVertex, lampIndex));

  // 3. East-Apron Spare-Module & Wheel-Set Staging Bay (x = 90..95.5, z = -10..4, 9m east of compare lane x=75..81)
  // Two heavy steel pallet racks with crated chassis/shell spares
  FACTORY_FORECOURT_RACKS.forEach((rackZ, id) => {
    const firstVertex = b.pos.length / 3, firstIndex = b.idx.length;
    for (const dx of [-1.8, 0, 1.8]) for (const dz of [-0.55, 0.55]) {
      box([93.2 + dx, 1.28, rackZ + dz], [0.11, 2.32, 0.11], P.teal, 0);
    }
    for (const y of [0.34, 1.28, 2.22]) {
      box([93.2, y, rackZ], [3.85, 0.09, 1.24], P.steel, 0);
    }
    // Lower & middle spare crates with varied proportions & finishes
    box([92.3, 0.72, rackZ], [1.35, 0.66, 0.94], P.cream, 0.025);
    box([92.3, 0.72, rackZ + 0.48], [1.15, 0.12, 0.03], P.teal, 0);
    box([94.05, 0.68, rackZ], [1.22, 0.58, 0.88], P.teal, 0.025);
    box([94.05, 0.68, rackZ], [1.25, 0.08, 0.9], P.amber, 0);
    box([92.45, 1.62, rackZ], [1.18, 0.58, 0.86], P.silver, 0.02);
    box([94.0, 1.66, rackZ], [1.28, 0.66, 0.92], P.cream, 0.025);
    contacts.push(factorySourceContact(b, `factory-forecourt-spares-${id}`, firstVertex, firstIndex));
  });

  // Spare wheel-set cradle rack at z = 2.2
  const firstVertex = b.pos.length / 3, firstIndex = b.idx.length;
  box([92.8, 0.24, 2.2], [2.6, 0.24, 0.96], P.steel, 0.02);
  for (const dx of [-0.85, -0.28, 0.28, 0.85]) {
    bar(b, [92.8 + dx, 0.62, 1.82], [92.8 + dx, 0.62, 2.58], 0.32, P.dark, 10);
    bar(b, [92.8 + dx, 0.62, 1.79], [92.8 + dx, 0.62, 2.61], 0.14, P.silver, 8);
  }
  contacts.push(factorySourceContact(b, 'factory-forecourt-wheel-cradle', firstVertex, firstIndex));

  const markingIndex = b.idx.length;
  for (const z of [-10.4, 3.6]) box([92.8, 0.135, z], [5.8, 0.025, 0.12], P.amber, 0);
  box([89.9, 0.135, -3.4], [0.12, 0.025, 14.0], P.amber, 0);
  const decorations = [{ id: 'factory-forecourt-staging-markings', firstIndex: markingIndex, indexCount: b.idx.length - markingIndex }];
  return { geometry: b.build(), contacts, decorations, lamps, triangles: b.triangles };
}
