import type { Vec3 } from './types';

/** Shared world frame: entrance at local z=0, quarry extends north to z=-53.
 * Local +Y is up, +Z faces the entrance; all walk heights are relative to FLOOR_Y. */
export const ALPHA_MINE_ORIGIN: Vec3 = [-84, 1.14, -55];
export const ALPHA_MINE_YAW = 0;
export const ALPHA_MINE_BASE_Y = 1;
export const ALPHA_MINE_FLOOR_Y = ALPHA_MINE_ORIGIN[1];

/** WorldQuant's quarry is part of the expanded northwest mainland. */
export const ALPHA_MINE_FOOTPRINT = { minX: -110, maxX: -58, minZ: -109, maxZ: -52 } as const;
export const ALPHA_MINE_FOOTPRINT_POINTS: [number, number][] = [
  [ALPHA_MINE_FOOTPRINT.minX, ALPHA_MINE_FOOTPRINT.minZ],
  [ALPHA_MINE_FOOTPRINT.maxX, ALPHA_MINE_FOOTPRINT.minZ],
  [ALPHA_MINE_FOOTPRINT.maxX, ALPHA_MINE_FOOTPRINT.maxZ],
  [ALPHA_MINE_FOOTPRINT.minX, ALPHA_MINE_FOOTPRINT.maxZ],
];

/** A packed-earth approach from the existing western island road. */
export const ALPHA_MINE_CONNECTOR: Vec3[] = [
  [-54, 1.14, -36],
  [-68, 1.14, -43],
  ALPHA_MINE_ORIGIN,
];
export const ALPHA_MINE_CONNECTOR_WIDTH = 4;

export function mineLocalToWorld(point: Vec3): Vec3 {
  return [ALPHA_MINE_ORIGIN[0] + point[0], ALPHA_MINE_ORIGIN[1] + point[1], ALPHA_MINE_ORIGIN[2] + point[2]];
}

/** Shore mask only; the mine component owns the independent support geometry. */
export function isOnAlphaMineBase(x: number, z: number) {
  const { minX, maxX, minZ, maxZ } = ALPHA_MINE_FOOTPRINT;
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}
