import { CLUB_POOL } from './djc-club-layout';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout';
import type { MineManifest } from './alpha-mine-assets';
import { terrainHeight } from './WorldLandform';
import { WATER_Y } from './layout';

/** Returns the actual world elevation of contained water, never the terrain below a pool. */
export function waterSurfaceAt(x: number, z: number, basin?: MineManifest['basin'] | null): number | null {
  if (basin && Math.hypot(x - ALPHA_MINE_ORIGIN[0] - basin.center[0], z - ALPHA_MINE_ORIGIN[2] - basin.center[2]) < basin.innerRadius) {
    return ALPHA_MINE_ORIGIN[1] + basin.waterY;
  }
  if (CLUB_POOL.contains(x, z)) return CLUB_POOL.waterY;
  return terrainHeight(x, z) < WATER_Y + .02 ? WATER_Y : null;
}
