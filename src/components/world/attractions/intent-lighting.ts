import { BufferAttribute, Color, type BufferGeometry } from 'three';
import { coasterWorld, coasterFrame, COASTER_LENGTH } from './coaster-track.ts';
import type { Vec3 } from '../types';

export const INTENT_LAMP_POINTS: Vec3[] = [-47, -32, -16, 0, 16, 32, 48].map(x => [x, 3.2, 64]);
const warm = new Color('#ffd29a'), cool = new Color('#a6cedc');
/** Authored static diffuse fill, stored per vertex; these are not runtime point lights. */
const sources = [
  ...[[-48, 3, -49], [-42, 8, -23], [-48, 18, -28], [-40, 33, -27], [-40, 43, -27],
    [-43, 4, 8], [-30, 4, 19], [2, 4, -32], [29, 3, -48], [45, 4, -22], [32, 3, 20], [40, 3, 42],
    [-17, 3, 52], [16, 3, 52], [30, 3, 52], [46, 3, 52]].map(p => ({ p: coasterWorld(p as Vec3), radius: 13, power: 3.4, color: warm })),
  ...Array.from({ length: Math.ceil(COASTER_LENGTH / 12) }, (_, i) => {
    const f = coasterFrame(i / Math.ceil(COASTER_LENGTH / 12));
    return { p: f.point.clone().addScaledVector(f.up, -.3).toArray() as Vec3, radius: 7, power: 1.3, color: new Color('#45bdcf') };
  }),
  ...INTENT_LAMP_POINTS.map(p => ({ p: coasterWorld(p), radius: 12, power: 2.8, color: warm })),
  ...[[-5, 5, 39], [3, 5, 48], [-25, 3, 60], [23, 3, 60], [39, 3, 60], [-40, 5, -24], [-38, 22, -24], [-42, 40, -27], [-34, 5, 12], [9, 6, -41]].map(p => ({ p: coasterWorld(p as Vec3), radius: 15, power: 2.4, color: warm })),
  { p: coasterWorld([-26, 22, -23]), radius: 33, power: .75, color: cool },
  { p: coasterWorld([37, 18, -37]), radius: 28, power: .65, color: cool },
];
export function bakeIntentNight(geometry: BufferGeometry, origin: Vec3 = [0, 0, 0]) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), color = geometry.getAttribute('color');
  const night = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + origin[0], y = p.getY(i) + origin[1], z = p.getZ(i) + origin[2];
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const base = .14 + Math.max(0, ny) * .12 + Math.max(0, nx * .4 + nz * .6) * .09;
    let r = base * .72, g = base * .91, b = base;
    for (const light of sources) {
      const dx = light.p[0] - x, dy = light.p[1] - y, dz = light.p[2] - z, d = Math.hypot(dx, dy, dz);
      if (d >= light.radius) continue;
      const facing = Math.max(.05, (nx * dx + ny * dy + nz * dz) / Math.max(.01, d));
      const attenuation = (1 - d / light.radius) ** 2 * facing * light.power;
      r += light.color.r * attenuation; g += light.color.g * attenuation; b += light.color.b * attenuation;
    }
    night[i * 3] = color.getX(i) * r; night[i * 3 + 1] = color.getY(i) * g; night[i * 3 + 2] = color.getZ(i) * b;
  }
  geometry.setAttribute('nightRadiance', new BufferAttribute(night, 3));
}
