import { Quaternion, Vector3 } from 'three';
import contract from '../../../tools/world/vehicles/door-contract.json' with { type: 'json' };
import type { VehicleId } from './types';

export type DoorSide = -1 | 1;
export type VehicleDoorState = { side: DoorSide; openness: number };
export const VEHICLE_DOORS = contract;
const axis = new Vector3();

/** Mirror a rotation's axial vector, not a position vector. Both butterfly doors lift upward. */
export function vehicleDoorQuaternion(id: VehicleId, side: DoorSide, openness: number, out: Quaternion) {
  const spec = VEHICLE_DOORS[id];
  axis.set(spec.axis[0] * side, spec.axis[1] * side, spec.axis[2]).normalize();
  return out.setFromAxisAngle(axis, spec.angle * Math.max(0, Math.min(1, openness)));
}

export function vehicleDoorStanding(id: VehicleId, side: DoorSide): [number, number, number] {
  const spec = VEHICLE_DOORS[id];
  // Stay beyond the leaf's outward sweep until it has finished opening.
  return [spec.standingX, 0, side * (id === 'van' ? 2.35 : 2.25)];
}
