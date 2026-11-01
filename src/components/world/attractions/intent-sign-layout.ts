import { Matrix4, PlaneGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coasterWorld, COASTER_GATE_Z } from './coaster-track.ts';
import type { Vec3 } from '../types';

/** Station lettering belongs on the solid fascia. A board below the canopy
 * can cover the player through a gap that the physical camera correctly clears. */
export const INTENT_SIGN_PANELS: { at: Vec3; size: [number, number] }[] = [
  { at: [0, 6.4, COASTER_GATE_Z + 1.03], size: [10, .95] },
  { at: [-8, 2.6, 60.2], size: [6, .95] },
  { at: [-2, 6.7, 53.1], size: [8.5, .95] },
];

export function createIntentSignGeometry() {
  const parts = INTENT_SIGN_PANELS.map((panel, tile) => {
    const g = new PlaneGeometry(...panel.size), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + 2 - tile) / 3);
    g.applyMatrix4(new Matrix4().makeTranslation(...coasterWorld(panel.at))); return g;
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(p => p.dispose()); return merged;
}
