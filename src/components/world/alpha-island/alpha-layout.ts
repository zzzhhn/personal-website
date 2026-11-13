import type { Vec3 } from '../types';

/** Alpha batch 1 survey r1. Metres; +X east, -Z north. All route datums are surface/rail
 * points, NOT standing capsule centres. Transport author owns seat offsets and timing. */
export const ALPHA_LAYOUT_REVISION = 'alpha-scene-r3-20261113';
export const ALPHA_ORIGIN: Vec3 = [235, 0, 190];
export const ALPHA_YAW = 0;
export const alphaWorld = (p: readonly number[]): Vec3 => [p[0] + ALPHA_ORIGIN[0], p[1], p[2] + ALPHA_ORIGIN[2]];
export const alphaLocal = (p: readonly number[]): Vec3 => [p[0] - ALPHA_ORIGIN[0], p[1], p[2] - ALPHA_ORIGIN[2]];
export const ALPHA_BOUNDS = { minX: 137, maxX: 333, minZ: 76, maxZ: 304, minY: -5, maxY: 91 } as const;
export const ALPHA_STATIONS = {
  dock: [-82, 1.3, -44], lodge: [-64, 3.8, -40], tree: [-42, 18, -29],
  wind: [19, 38, -42], cableLower: [35, 38, -43], cableUpper: [29, 73, 26],
  summit: [2, 83, 39], lantern: [-7, 83, 43], sledUpper: [26, 76, 46], sledLower: [-67, 3.8, -29],
} satisfies Record<string, Vec3>;
/** 3.4m clear walk. No learning gates; upper path bypasses cable. */
export const ALPHA_MAIN_PATH: Vec3[] = [
 [-82,1.3,-44],[-74,1.3,-44],[-66,3.8,-44],[-59,3.8,-44],[-54,6,-40],[-36,12,-54],[-22,16,-40],[-42,18,-29],
 [-55,20,-11],[-27,25,2],[4,30,-10],[25,35,-29],[19,38,-42],[30,38,-43],
 [27,38,-34],[25,38,-20],[55,40,-12],[60,46,8],[38,51,5],[13,57,-10],[-9,63,6],[8,69,23],[25,73,28],
 [25,73,33],[29,76,42],[26,76,46],[19,76,46],[7,80,58],[2,83,48],[2,83,39],[-7,83,43],
];
export const ALPHA_BYPASS_PATH: Vec3[] = [[-42,18,-29],[-27,20,-17],[-9,23,-29],[-4,26,-45],[10,32,-56],[25,35,-54],[19,38,-42]];
export interface AlphaSocket {
 id: string; ground: Vec3; yaw: number; size: Vec3;
 /** Clear cuboid above ground [width,height,length], local +Z forward. */
 clearance: Vec3; approach: Vec3[]; safeExit: Vec3[];
}
const socket = (id: string, ground: Vec3, yaw: number, size: Vec3, approach: Vec3[], safeExit: Vec3[]): AlphaSocket =>
 ({ id, ground, yaw, size, clearance: [size[0], 5, size[2]], approach, safeExit });
export const ALPHA_SOCKETS = {
 dock: socket('alpha-dock',[-82,1.3,-44],-Math.PI/2,[7,0.35,11],[[-66,3.8,-44],[-74,1.3,-44],[-82,1.3,-44]],[[-79,1.3,-42],[-80,1.3,-47]]),
 cableLower: socket('alpha-cable-lower',[35,38,-43],0,[9,0.4,12],[[25,38,-42],[30,38,-43] ],[[31,38,-40],[38,38,-40]]),
 cableUpper: socket('alpha-cable-upper',[29,73,26],0,[9,0.4,12],[[20,73,26],[25,73,26]],[[25,73,28],[32,73,29]]),
 sledUpper: socket('alpha-sled-upper',[26,76,46],Math.PI/2,[9,0.4,10],[[21,76,42],[23,76,46]],[[22,76,47],[26,76,49]]),
 sledLower: socket('alpha-sled-lower',[-67,3.8,-29],Math.PI,[10,0.4,12],[[-62,3.8,-40],[-64,3.8,-33]],[[-64,3.8,-29],[-69,3.8,-33]]),
} satisfies Record<string, AlphaSocket>;
/** Rail/runner centreline; cab floor/seat offset belongs to transport. Lower/upper
 * 8m terminal segments stay horizontal; middle segment clears terrain by >= 6m. */
export const ALPHA_CABLE_PATH: Vec3[] = [[35,38,-47],[35,38,-39],[39,49,-21],[39,63,-1],[29,73,22],[29,73,30]];
/** Descending outer east/south corridor. Terrain must remain below runners; wood trough
 * is required below y=64. No banking/roll is implied by this polyline. */
export const ALPHA_SLED_PATH: Vec3[] = [[24,76,46],[32,76,46],[49,70,49],[66,62,34],[76,53,7],[78,43,-23],
 [67,34,-58],[43,25,-74],[8,18,-80],[-28,11,-74],[-57,6,-57],[-67,3.8,-37],[-67,3.8,-27]];
/** Mainland terminal is provisional until live shore/clearance survey; transport must not
 * build a route through the Club. Keep its route outside z>=116 until east of x=125. */
export const ALPHA_MAINLAND_DOCK = { ground: [-16,1.14,57] as Vec3, yaw: Math.PI, size: [7,.35,11] as Vec3,
 safeExit: [[-16,1.14,51],[-19,1.14,51]] as Vec3[], status: 'provisional-live-survey-required' as const };
export const ALPHA_FERRY_WATER_PATH: Vec3[] = [[-16,-.7,64],[-16,-.7,113],[61,-.7,125],[124,-.7,139],[147,-.7,146]];
export const ALPHA_SAFE_GROUND: Vec3[] = [ALPHA_STATIONS.lodge, ALPHA_STATIONS.tree, ALPHA_STATIONS.wind, ALPHA_STATIONS.summit,
 ...Object.values(ALPHA_SOCKETS).flatMap(s=>s.safeExit)];
export function alphaContainsWorld(p: readonly number[], margin = 0) {
 return p[0]>=ALPHA_BOUNDS.minX-margin&&p[0]<=ALPHA_BOUNDS.maxX+margin&&p[2]>=ALPHA_BOUNDS.minZ-margin&&p[2]<=ALPHA_BOUNDS.maxZ+margin;
}
