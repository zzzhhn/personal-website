import { BoxGeometry, CylinderGeometry } from 'three';
import { alphaGroundHeight } from './alpha-terrain';
import type { Vec3 } from '../types';

export function buildTumblingSign() {
  const parts = [
    { id: 'alpha-wind-sign-board', geometry: new BoxGeometry(.5, .5, .04), color: '#dbc696', roughness: .95 },
    { id: 'alpha-wind-sign-stake', geometry: new CylinderGeometry(.035, .04, .8, 8).translate(0, -.4, 0), color: '#82633f', roughness: 1 },
  ];
  const corners = new Map<string, Vec3>();
  for (const part of parts) {
    const position = part.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const point: Vec3 = [position.getX(i), position.getY(i), position.getZ(i)];
      corners.set(point.join(','), point);
    }
  }
  return { parts, corners: [...corners.values()], dispose() { for (const part of parts) part.geometry.dispose(); } };
}

/** Ground each orientation against the installed hillside beneath the board and the asymmetric stake. */
export function tumblingSignPose(corners: readonly Vec3[], strength: number, elapsed: number) {
  const age = Math.min(9, Math.max(0, elapsed));
  const angle = strength === 2 ? age * 3 : 0;
  const x = 22 + (strength === 2 ? age * 3.1 : 0), z = -40 + Math.sin(age * 3) * .1;
  const sin = Math.sin(angle), cos = Math.cos(angle);
  let y = -Infinity;
  for (const [px, py, pz] of corners) {
    const ground = alphaGroundHeight(x + cos * px - sin * py, z + pz);
    y = Math.max(y, ground - sin * px - cos * py);
  }
  return {position: [x, y, z] as Vec3, angle};
}
