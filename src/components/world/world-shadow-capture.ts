import { Box3, Vector3 } from 'three';
import { WORLD_SHOTS } from './layout';
import { IBD_YARD, INTENT_COASTER } from './attractions/attraction-layout.ts';

/** Close evidence views use the same local cascades as play, centred on the view
 * rather than a spawn elsewhere. Large overview views need their own surveyed
 * extent; the old island rectangle cannot cover the northern attractions.
 */
export function worldShadowCapture(id: string | null) {
  const view = WORLD_SHOTS.find(v => v.id === id);
  if (!view) return null;
  const wide = view.id.includes('overview');
  let bounds: Box3 | undefined;
  if (wide && view.id.startsWith('ibd-')) {
    const [x, y, z] = IBD_YARD.center, [w, d] = IBD_YARD.size;
    bounds = new Box3(new Vector3(x - w / 2, y - 2, z - d / 2), new Vector3(x + w / 2, y + 16, z + d / 2));
  } else if (wide && view.id.startsWith('coaster-')) {
    const b = INTENT_COASTER.bounds;
    // Conservative headroom for the lift, inversion train and tower fixtures.
    bounds = new Box3(new Vector3(b.minX, -2, b.minZ), new Vector3(b.maxX, 110, b.maxZ));
  }
  return { focus: view.target, wide, bounds };
}
