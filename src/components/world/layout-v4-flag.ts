/**
 * Layout v4 switch and the light data that the shared layout.ts swaps in under the flag. Kept free of
 * geometry work so the default (v3) entry pays nothing for v4. Heavy v4 geometry: layout-v4.ts.
 * Switch: `?layout=v4`. The main thread flips DEFAULT_V4 after the parallel sessions deliver.
 */
import type { Vec3, VehicleId } from './types';

const DEFAULT_V4 = true;
const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('layout') : null;
export const LAYOUT_V4 = query === 'v4' || (DEFAULT_V4 && query !== 'v3');

export type P2 = [number, number];
export const ROAD_Y = 1.14;

/** Approved control outline (spec §12.1 A6, ~20,541 m2; convex for WorldLandform.coastFrame). Mostly
 * north / west / south growth plus the approved local east easing beside the avenue; the bridge-axis
 * shore crossing stays at x = 29.45 and the bridge, under-bridge water, park and boardwalk are kept. */
export const OUTLINE_V4: P2[] = [
  [-122, -15], [-124, -70], [-114, -116], [-80, -136], [-40, -136], [-2, -112], [16, -86], [27.4, -58],
  [29, -46], [31, -30], [33, -8], [34, 12], [32, 30], [25, 52], [8, 72], [-14, 82], [-38, 86], [-64, 80], [-85, 66], [-96, 48],
];

const PALETTE = { cream: '#E6DCCB', slate: '#4E647D', brick: '#8E6E55' };
/** Same ids / sizes / startDate order as v3; west of the avenue, south -> north. East faces at x = 11.5,
 * so the derived year pillar (east face + 5 m) stands on the avenue's west sidewalk. */
export const BUILDINGS_V4 = [
  { id: 'sdic', position: [7, 1, 18.5] as Vec3, size: [9, 8, 8] as Vec3, color: PALETTE.cream },
  { id: 'worldquant', position: [7, 1, 7.5] as Vec3, size: [9, 12, 8] as Vec3, color: PALETTE.slate },
  { id: 'moe', position: [6.5, 1, -2.5] as Vec3, size: [10, 5, 8] as Vec3, color: PALETTE.brick },
  { id: 'aime', position: [7, 1, -21.5] as Vec3, size: [9, 10, 8] as Vec3, color: PALETTE.cream },
  { id: 'video-rebirth', position: [7.5, 1, -32.5] as Vec3, size: [8, 11, 8] as Vec3, color: PALETTE.brick },
  { id: 'hunyuan', position: [6.5, 1, -43] as Vec3, size: [10, 15, 8] as Vec3, color: PALETTE.slate },
];
/** Only the film plot moves (spec A4); community and contact are protected. */
export const FOUNDATIONS_V4 = [
  { id: 'film', position: [8, 1.05, -68] as Vec3, size: [15, 0.2, 12] as Vec3 },
  { id: 'community', position: [-54, 1.05, -13] as Vec3, size: [14, 0.2, 12] as Vec3 },
  { id: 'contact', position: [-10, 1.05, 43] as Vec3, size: [13, 0.2, 10] as Vec3 },
];
/** Coupe lay-by on the avenue's sea side; offroad and van are protected. */
export const VEHICLE_POSITIONS_V4: Record<VehicleId, { position: Vec3; yaw: number }> = {
  offroad: { position: [-26, 4.84, 34], yaw: 0 },
  coupe: { position: [26.2, ROAD_Y, 2], yaw: Math.PI / 2 },
  van: { position: [46, ROAD_Y, -45], yaw: 0 },
};
/** v3 obstacle (10, 20) lies inside the new SDIC footprint; moved to the camp road's south sidewalk
 * (the proposal's (16, 26) falls inside the filleted J1 carriageway). The other three are unchanged. */
export const OBSTACLES_V4: Vec3[] = [[-3, 1.64, 28], [5, 1.65, 34.6], [24, 1.64, -18], [45, 1.64, -39]];
/** v3 greybox trees; (-51,-26) and (-36,-32) relocated off the west road (layout-v4.json relocations). */
export const TREES_V4: Vec3[] = [[-61, 1, -4], [-51, 1, -36], [-36, 1, -35.5], [-28, 1, -8], [-26, 1, 7], [-52, 4.8, 45], [-59, 4.8, 34], [-40, 4.8, 9], [-29, 4.8, 17], [-30, 1, 52], [2, 1, 40], [-44, 1, -43]];

export const WORLD_SHOTS_V4 = [
  { id: 'overview', position: [150, 175, 175] as Vec3, target: [-30, 0, -10] as Vec3 },
  { id: 'camp', position: [-11, 33, 67] as Vec3, target: [-42, 4.8, 30] as Vec3 },
  { id: 'camp-night', position: [-16, 24, 62] as Vec3, target: [-42, 4.8, 30] as Vec3 },
  { id: 'town', position: [72, 46, 30] as Vec3, target: [12, 4, -10] as Vec3 },
  { id: 'town-night', position: [66, 34, 18] as Vec3, target: [12, 5, -12] as Vec3 },
  { id: 'bridge', position: [66, 31, -6] as Vec3, target: [35, 1, -42] as Vec3 },
  { id: 'park', position: [98, 40, 13] as Vec3, target: [62, 1, -28] as Vec3 },
  { id: 'park-night', position: [89, 25, 0] as Vec3, target: [62, 1, -29] as Vec3 },
  { id: 'ridge', position: [10, 40, -40] as Vec3, target: [-30, 4, -84] as Vec3 },
  // Paired evidence cameras share geometry, projection and time presets across revisions.
  ...(['day', 'night'] as const).flatMap(time => [
    { id: `coaster-overview-${time}`, position: [147, 76, -83] as Vec3, target: [50, 16, -192] as Vec3 },
    { id: `coaster-entrance-${time}`, position: [50, 4.2, -114] as Vec3, target: [50, 14, -194] as Vec3 },
    { id: `workshop-${time}`, position: [48, 10, -110] as Vec3, target: [34, 2, -129] as Vec3 },
    { id: `ibd-overview-${time}`, position: [-16, 46, -104] as Vec3, target: [-88, 5, -177] as Vec3 },
    { id: `ibd-entrance-${time}`, position: [-84, 4.2, -134] as Vec3, target: [-88, 6, -179] as Vec3 },
  ]),
];

/* ------------------------------------------------------------------ zones (cheap; used every 90 ms) */

export const CAMP_XZ: P2 = [-42, 30];
/** WorldLandform: plateau rim <= 26.4 m plus the 19 deg grass flank down to y = 1 (11 m). */
export const CAMP_FOOT_RADIUS = 37.4;
export const RIDGE_CENTER: P2 = [-30, -84];
export const RIDGE_FOOT_R = 21.2;
export function insidePolygon(p: P2, poly: P2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export type ZoneV4 = 'camp' | 'town' | 'park' | 'ridge' | 'shore' | 'yard' | 'coaster';
const TOWN_POLY: P2[] = [[-36, -50], [31, -50], [31, 27], [-1, 27], [-1, 8], [-17, 8], [-24, -24], [-36, -31]];
export function zoneAtV4(x: number, z: number): ZoneV4 {
  if(z<-132&&x<-50)return 'yard';
  if(z<-110&&x>8)return 'coaster';
  if (x > 35) return 'park';
  if (Math.hypot(x - CAMP_XZ[0], z - CAMP_XZ[1]) < CAMP_FOOT_RADIUS - 2) return 'camp';
  if (Math.hypot(x - RIDGE_CENTER[0], z - RIDGE_CENTER[1]) < RIDGE_FOOT_R + 2) return 'ridge';
  if (insidePolygon([x, z], TOWN_POLY)) return 'town';
  return 'shore';
}
