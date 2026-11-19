import { BoxGeometry, CylinderGeometry } from 'three';
import { alphaGroundHeight } from './alpha-terrain';
import type { Vec3 } from '../types';

/** The foot keeps a level mounting surface. Its skirt reaches below every part
 * of the actual slope, including the downhill corners. */
export function createWindFlagStand(index: number) {
  const x = 22 + index * 2.4,
    z = -45 - index;
  const width = 0.6,
    depth = 0.65;
  let low = Infinity,
    high = -Infinity;
  for (let iz = 0; iz <= 8; iz++) {
    for (let ix = 0; ix <= 8; ix++) {
      const ground = alphaGroundHeight(x + width * (ix / 8 - 0.5), z + depth * (iz / 8 - 0.5));
      low = Math.min(low, ground);
      high = Math.max(high, ground);
    }
  }
  const bottom = low - high - 0.04,
    top = 0.24;
  const parts = [
    { kind: 'mast', geometry: new CylinderGeometry(0.04, 0.06, 3.6, 8).translate(0, 1.8, 0) },
    { kind: 'foot', geometry: new BoxGeometry(width, top - bottom, depth).translate(0, (bottom + top) / 2, 0) },
  ].map(({ kind, geometry }) => ({
    kind,
    id: `alpha-wind-flag-${index}-${kind}`,
    geometry,
    vertices: geometry.attributes.position.array as Float32Array,
    indices: Uint32Array.from(geometry.index!.array),
  }));
  return {
    position: [x, high, z] as Vec3,
    parts,
    dispose() {
      for (const part of parts) part.geometry.dispose();
    },
  };
}
