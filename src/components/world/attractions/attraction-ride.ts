import { createCoasterTransition, type CoasterTransition } from './coaster-transition.ts';
import type { Vec3 } from '../types';
import { resetAttractionLook } from './attraction-camera.ts';

/** Mutable frame bridge: the ride publishes poses without rerendering the world store. */
export interface AttractionRidePose {
  /** World seat contact point. WorldActors positions its disabled capsule above this. */
  seat: Vec3;
  /** Guide heading: forward is (cos(yaw), 0, -sin(yaw)). */
  yaw: number;
  /** Optional full world rotation, guide local +X forward and +Y up. */
  orientation?: [number,number,number,number];
  cameraPosition: Vec3;
  cameraTarget: Vec3;
  /** Optional view up axis; full-roll first-person uses the train up, comfort stays world-up. */
  cameraUp?: Vec3;
  firstPerson: boolean;
  fov: number;
}
export const attractionRide: {
  active: boolean;
  revision: number;
  transition: CoasterTransition | null;
  completed: boolean;
  pose: AttractionRidePose;
  /** Verified flat station egress foot position. */
  exit: Vec3;
} = {
  active: false, revision: 0, transition: null, completed: false, exit: [50,1.08,-128],
  pose: { seat:[50,1.6,-145],yaw:Math.PI/2,cameraPosition:[50,6,-136],cameraTarget:[50,2,-145],firstPerson:false,fov:55 },
};
export function beginAttractionRide(pose: AttractionRidePose, exit: Vec3, from?: Vec3, yaw = pose.yaw) {
  if(attractionRide.active) return false;
  resetAttractionLook();
  attractionRide.completed = false;
  attractionRide.transition = from ? createCoasterTransition(from, yaw, pose) : null;
  attractionRide.pose=pose; attractionRide.exit=[...exit]; attractionRide.active=true; attractionRide.revision++;
  return true;
}
export function updateAttractionRide(pose: AttractionRidePose) {
  if(attractionRide.active) attractionRide.pose=pose;
}
/** A running train finishes its existing loop; a boarding cancellation skips dispatch. */
export function requestAttractionExit() {
  if (attractionRide.active && attractionRide.transition) attractionRide.transition.exitRequested = true;
}
export function completeAttractionRide() {
  attractionRide.completed = true;
  if (attractionRide.active) { attractionRide.active = false; attractionRide.revision++; }
}
/** Also called by camp recovery; the coaster must stop when active becomes false. */
export function endAttractionRide() {
  attractionRide.transition = null; attractionRide.completed = false;
  if(attractionRide.active){attractionRide.active=false;attractionRide.revision++;}
}
