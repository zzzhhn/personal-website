import type { Vec3 } from '../types';
import type { IbdSolid } from './ibd-yard-architecture';

/** Existing local paving survey, shared by its draw/collider and the parked truck. */
export const IBD_YARD_PAVING_Y = .085;
export const IBD_TRUCK_MODEL_FLOOR = 1.2;
export const IBD_TRUCK_MODEL_WHEEL_Y = .6;
export const IBD_TRUCK_WHEEL_RADIUS = .58;
export const IBD_TRUCK_GROUND_LIFT = IBD_YARD_PAVING_Y - (IBD_TRUCK_MODEL_WHEEL_Y - IBD_TRUCK_WHEEL_RADIUS);
export const IBD_TRUCK_FLOOR = IBD_TRUCK_MODEL_FLOOR + IBD_TRUCK_GROUND_LIFT;
export const ibdTruckMountedPoint = (p: Vec3): Vec3 => [p[0], p[1] + IBD_TRUCK_GROUND_LIFT, p[2]];

/** Translate only this appended body, including cubes recorded by the caller.
 * Manufacturing UVs, proportions, unrelated yard meshes and solids are untouched. */
export function groundIbdTruckBody(positions: number[], firstPosition: number, solids: IbdSolid[], firstSolid: number) {
  for (let i = firstPosition + 1; i < positions.length; i += 3) positions[i] += IBD_TRUCK_GROUND_LIFT;
  for (let i = firstSolid; i < solids.length; i++) solids[i].at = ibdTruckMountedPoint(solids[i].at);
}

/** The landward end stays at its original datum; only the truck-side rise changes. */
export const ibdTruckLoadingRamp = (z: number): IbdSolid => ({
  at: [12.5, IBD_TRUCK_FLOOR / 2, z],
  size: [Math.hypot(3, IBD_TRUCK_FLOOR), .14, 2.9],
  rotation: [0, 0, Math.atan2(IBD_TRUCK_FLOOR, 3)],
});
