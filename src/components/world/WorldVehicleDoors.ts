import { Quaternion, Vector3 } from 'three';
import contract from '../../../tools/world/vehicles/door-contract.json' with { type: 'json' };
import type { VehicleId } from './types';

export type DoorSide = -1 | 1;
export type VehicleDoorState = { side: DoorSide; openness: number };
/** Shipped mesh coordinates remain available to the local seat-geometry adapter. */
export const VEHICLE_AUTHORED_DOORS = contract;
export const VEHICLE_SEAT_ADJUSTMENT = {
  offroad: { top: .63, thickness: .075, shiftX:0, recline:Math.PI/6, headNod:.35 },
  van: { top: .835, thickness: .04, shiftX:.30, recline:Math.PI/6, headNod:-.30 },
};
/** The visible cushions and animation posterior targets use this same effective contract. */
export const VEHICLE_DOORS = { ...contract,
  offroad: { ...contract.offroad, seat: [contract.offroad.seat[0],VEHICLE_SEAT_ADJUSTMENT.offroad.top,contract.offroad.seat[2]] },
  van: { ...contract.van, standingX:1.33,seat: [contract.van.seat[0]+VEHICLE_SEAT_ADJUSTMENT.van.shiftX,VEHICLE_SEAT_ADJUSTMENT.van.top,contract.van.seat[2]] },
};
/** Interior floor and sill heights are in the shipped body GLB frame, as are the seat/hinge. */
export const VEHICLE_PASSAGE = {
  offroad: { floor: .55, sill: .535 }, coupe: { floor: .17, sill: .34 }, van: { floor: .79, sill: .755 },
};
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

/** Contact on the moving leaf, not a point fixed in the closed door or in world space. */
export function vehicleDoorContact(id: VehicleId, side: DoorSide, openness: number, inside: boolean, out: Vector3) {
  const spec = VEHICLE_DOORS[id], q = vehicleDoorQuaternion(id, side, openness, new Quaternion());
  // On the butterfly leaf the palm slides toward its inner pull as it rises, keeping
  // a reachable push contact instead of stretching an arm to the high outer handle.
  const lever = inside ? .14 : id === 'coupe' ? .65 - .35 * openness : .65;
  // Ordinary close uses a reachable push on the actual inner lining near the hinge.
  // Its inner face is at negative leaf depth, opposite the exterior handle.
  out.set(spec.doorBounds.min[0] * lever, inside ? id==='van'?-.10:.04 : id === 'van' ? -.06 : .08, side * (inside?-.049:.06)).applyQuaternion(q);
  return out.add(new Vector3(spec.hinge[0], spec.hinge[1], spec.hinge[2] * side));
}

/** The short-armed guide cannot reach a fully raised butterfly leaf from the bucket seat.
 * Its powered close switch is a real trim control, shared with the rendered button. */
export function vehicleDoorCloseContact(id: VehicleId, side: DoorSide, openness: number, out: Vector3) {
  if(id==='coupe'){const seat=VEHICLE_DOORS[id].seat;return out.set(seat[0]+.20,seat[1]+.42,side*(seat[2]+.27));}
  return vehicleDoorContact(id,side,openness,true,out);
}

/** Ordinary door choreography needs ground below both feet. A tipped car stays occupied and can
 * be righted with R; do not stand the driver upright through an inverted floor on E. */
export function vehicleDoorUpright(q: { x: number; y: number; z: number; w: number }) {
  return 1 - 2 * (q.x * q.x + q.z * q.z) >= Math.cos(Math.PI / 6);
}
