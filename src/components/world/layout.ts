import type { Vec3, VehicleId } from './types';

/** World convention: +X east / vehicle forward, +Y up, -Z north. Metres. */
export const PALETTE = {
  sand: '#C9A978', grass: '#7E8C3E', slate: '#4E647D', cream: '#E6DCCB',
  brick: '#8E6E55', road: '#6B6A68', edge: '#D9D2C2', sea: '#1E5A5E',
  beach: '#E3D3B4', orange: '#E8803A', cyan: '#4FD1C5', wood: '#8E6E55',
};
export const WATER_Y = -0.7;
export const GROUND_Y = 1;
export const CAMP_CENTER: Vec3 = [-42, 4.8, 30];
/** Capsule spawn centre; camp surface is y=4.8. */
export const CAMP_SPAWN: Vec3 = [-42, 5.85, 35];

export interface VehiclePlacement {
  id: VehicleId; position: Vec3; yaw: number; size: Vec3; color: string;
  mass: number; engineForce: number; grip: number; suspension: number;
}
/** Positions are road surface heights. Actors add chassis/clearance offset.
 * Suspension is spring force coefficient in N/m; grip is dimensionless. */
export const VEHICLES: VehiclePlacement[] = [
  { id: 'offroad', position: [-26, 4.84, 34], yaw: 0, size: [3.9, 1.35, 2], color: PALETTE.slate, mass: 1400, engineForce: 9200, grip: 1.35, suspension: 26000 },
  { id: 'coupe', position: [19.8, 1.14, 12], yaw: Math.PI / 2, size: [4.3, 1.05, 1.9], color: PALETTE.cream, mass: 1100, engineForce: 12000, grip: 0.88, suspension: 42000 },
  { id: 'van', position: [46, 1.14, -45], yaw: 0, size: [4.5, 1.9, 2.2], color: PALETTE.cream, mass: 2100, engineForce: 10500, grip: 1.1, suspension: 34000 },
];

/** Continuous camp exit, descent, coastal road, bridge, then entry plaza. */
export const ROAD_POINTS: Vec3[] = [
  [-30, 4.84, 34], [-18, 4.84, 34], [-5, 1.14, 29], [6, 1.14, 24],
  [16, 1.14, 9], [22, 1.14, -10], [26, 1.14, -30], [26, 1.14, -42], [43, 1.14, -44], [49, 1.14, -46],
];
export const ROAD_WIDTH = 8;
export const BOARDWALK_POINTS: Vec3[] = [[49, 1.14, -46], [64, 1.14, -40], [69, 1.14, -22], [56, 1.14, -7]];
export const BOARDWALK_WIDTH = 5.5;
export const BRIDGE_START: Vec3 = [26, 1.14, -42];
export const BRIDGE_END: Vec3 = [43, 1.14, -44];
export const ISLAND_OUTLINE: [number, number][] = [
  [-70, 20], [-65, -20], [-48, -47], [-15, -57], [16, -55], [29, -46],
  [31, -30], [28, -10], [23, 10], [12, 32], [-4, 52], [-35, 59], [-57, 49],
];
export const BUILDINGS = [
  { id: 'sdic', position: [0, 1, 15] as Vec3, size: [9, 8, 8] as Vec3, color: PALETTE.cream, year: '2025.05' },
  { id: 'worldquant', position: [2, 1, 5] as Vec3, size: [9, 12, 8] as Vec3, color: PALETTE.slate, year: '2025.08' },
  { id: 'moe', position: [6, 1, -7] as Vec3, size: [10, 5, 8] as Vec3, color: PALETTE.brick, year: '2025.11' },
  { id: 'aime', position: [9, 1, -19] as Vec3, size: [9, 10, 8] as Vec3, color: PALETTE.cream, year: '2025.12' },
  { id: 'video-rebirth', position: [11, 1, -31] as Vec3, size: [8, 11, 8] as Vec3, color: PALETTE.brick, year: '2026.02' },
  { id: 'hunyuan', position: [11, 1, -43] as Vec3, size: [10, 15, 8] as Vec3, color: PALETTE.slate, year: '2026.09' },
];
export const BOOTHS = [
  { id: 'alpha-agent', position: [59, 1.14, -49] as Vec3 },
  { id: 'evalforge', position: [72, 1.14, -40] as Vec3 },
  { id: 'djc', position: [77, 1.14, -28] as Vec3 },
  { id: 'hepai', position: [73, 1.14, -16] as Vec3 },
  { id: 'accompany', position: [61, 1.14, -20] as Vec3 },
  { id: 'interactive-learning', position: [50, 1.14, -12] as Vec3 },
];
export const FOUNDATIONS = [
  { id: 'film', position: [-17, 1.05, -42] as Vec3, size: [15, 0.2, 12] as Vec3 },
  { id: 'community', position: [-54, 1.05, -13] as Vec3, size: [14, 0.2, 12] as Vec3 },
  { id: 'contact', position: [-10, 1.05, 43] as Vec3, size: [13, 0.2, 10] as Vec3 },
];
export const WORLD_SHOTS = [
  { id: 'overview', position: [115, 132, 140] as Vec3, target: [0, 0, 0] as Vec3 },
  { id: 'camp', position: [-11, 33, 67] as Vec3, target: [-42, 4.8, 30] as Vec3 },
  { id: 'camp-night', position: [-16, 24, 62] as Vec3, target: [-42, 4.8, 30] as Vec3 },
  { id: 'town', position: [58, 39, 43] as Vec3, target: [8, 4, -12] as Vec3 },
  { id: 'town-night', position: [53, 29, 26] as Vec3, target: [10, 5, -13] as Vec3 },
  { id: 'bridge', position: [66, 31, -6] as Vec3, target: [35, 1, -42] as Vec3 },
  { id: 'park', position: [98, 40, 13] as Vec3, target: [62, 1, -28] as Vec3 },
  { id: 'park-night', position: [89, 25, 0] as Vec3, target: [62, 1, -29] as Vec3 },
];

/** Projects onto every driveable centreline segment (including the ramp),
 * preserving surface Y so water recovery never returns an object underwater. */
export function nearestRoadPoint(position: Vec3): Vec3 {
  let closest: Vec3 = [...ROAD_POINTS[0]];
  let best = Infinity;
  for (let i = 0; i < ROAD_POINTS.length - 1; i++) {
    const a = ROAD_POINTS[i], b = ROAD_POINTS[i + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((position[0] - a[0]) * dx + (position[2] - a[2]) * dz) / (dx * dx + dz * dz)));
    const p: Vec3 = [a[0] + t * dx, a[1] + t * (b[1] - a[1]), a[2] + t * dz];
    const distance = (position[0] - p[0]) ** 2 + (position[2] - p[2]) ** 2;
    if (distance < best) { best = distance; closest = p; }
  }
  return closest;
}
