import { CLUB_POOL } from './djc-club-layout';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout';
import type { MineManifest } from './alpha-mine-assets';
import { meshHeight } from './WorldLandform';
import { alphaGroundSample } from './alpha-island/alpha-terrain';
import { ALPHA_ORIGIN } from './alpha-island/alpha-layout';
import { WATER_Y } from './layout';

/** Returns the actual world elevation of contained water, never the terrain below a pool. */
export function waterSurfaceAt(x: number, z: number, basin?: MineManifest['basin'] | null): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (basin && Math.hypot(x - ALPHA_MINE_ORIGIN[0] - basin.center[0], z - ALPHA_MINE_ORIGIN[2] - basin.center[2]) < basin.innerRadius) {
    return ALPHA_MINE_ORIGIN[1] + basin.waterY;
  }
  if (CLUB_POOL.contains(x, z)) return CLUB_POOL.waterY;
  const mainland = meshHeight(x, z);
  const alpha = alphaGroundSample(x - ALPHA_ORIGIN[0], z - ALPHA_ORIGIN[2]);
  // Missing terrain is open ocean, not an extrapolated island. Either real land
  // surface can occlude the sea where the finite terrain footprints overlap.
  if (mainland !== null && mainland >= WATER_Y + .02 || alpha && alpha.height + ALPHA_ORIGIN[1] >= WATER_Y + .02) return null;
  return WATER_Y;
}
