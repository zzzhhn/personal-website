import { Quaternion, Vector3 } from 'three';
import type { AttractionRidePose } from './attraction-ride.ts';
import type { Vec3 } from '../types';

/** User offsets live outside React; track motion never clears a manual look. */
export const attractionLook = { yaw: 0, pitch: 0, zoom: 1 };
/** Also invalidates obstruction recovery when a view button explicitly resets. */
export let attractionLookRevision = 0;
export function resetAttractionLook() {
  Object.assign(attractionLook, { yaw: 0, pitch: 0, zoom: 1 }); attractionLookRevision++;
}
export function turnAttractionLook(yaw: number, pitch: number) {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
  attractionLook.yaw = Math.atan2(Math.sin(attractionLook.yaw + yaw), Math.cos(attractionLook.yaw + yaw));
  attractionLook.pitch = Math.max(-1.15, Math.min(1.15, attractionLook.pitch + pitch));
}
export function zoomAttractionLook(delta: number) {
  if (Number.isFinite(delta)) attractionLook.zoom = Math.max(.45, Math.min(1.8, attractionLook.zoom * Math.exp(delta)));
}
export const ATTRACTION_CABIN_FOV = { min: 45, max: 75 };
/** Optical zoom preserves the seat eye and uses the same scroll direction as orbit zoom. */
export function attractionCabinFov(base: number, zoom: number) {
  if (zoom === 1) return base;
  return Math.max(ATTRACTION_CABIN_FOV.min, Math.min(ATTRACTION_CABIN_FOV.max,
    360 / Math.PI * Math.atan(Math.tan(base * Math.PI / 360) * zoom)));
}

/** Stabilizes only screen roll after collision has chosen the final position/target.
 * A world-up lookAt has no unique right axis at a vertical view and flips by 180°
 * across that pole. Parallel transport keeps a continuous axis there; away from
 * it, a bounded roll correction restores the horizon without steering the view. */
export class AttractionCameraOrientation {
  private previous:{forward:Vector3;up:Vector3;seat:Vector3;key:string}|null=null;
  clear(){this.previous=null;}
  step(pose:AttractionRidePose,position:Vector3,target:Vector3,delta:number,lifecycle:string):Vector3 {
    const preferred=new Vector3(...(pose.cameraUp??[0,1,0]));
    if(pose.firstPerson||!pose.orientation){this.clear();return preferred;}
    const key=`${lifecycle}:${pose.fov}:${attractionLookRevision}`,seat=new Vector3(...pose.seat),previous=this.previous;
    const forward=target.clone().sub(position);
    if(forward.lengthSq()<1e-10)return previous?.up.clone()??preferred;
    forward.normalize();
    const gravity=preferred.clone().addScaledVector(forward,-preferred.dot(forward)),poleDistance=gravity.length();
    const continuous=previous&&previous.key===key&&Number.isFinite(delta)&&delta>=0&&delta<=.25
      &&previous.seat.distanceTo(seat)<=Math.max(4,delta*100);
    let up:Vector3;
    if(continuous){
      up=previous.up.clone().applyQuaternion(new Quaternion().setFromUnitVectors(previous.forward,forward));
      up.addScaledVector(forward,-up.dot(forward)).normalize();
      if(poleDistance>.15){
        gravity.divideScalar(poleDistance);
        const roll=Math.atan2(forward.dot(new Vector3().crossVectors(up,gravity)),up.dot(gravity));
        const weight=Math.min(1,(poleDistance-.15)/.45),limit=1.8*delta*weight*weight*(3-2*weight);
        up.applyAxisAngle(forward,Math.max(-limit,Math.min(limit,roll)));
      }
    }else{
      up=gravity;
      if(up.lengthSq()<1e-8){
        up=new Vector3(0,1,0).applyQuaternion(new Quaternion(...pose.orientation));
        up.addScaledVector(forward,-up.dot(forward));
        if(up.lengthSq()<1e-8){up.set(Math.abs(forward.x)<.9?1:0,0,Math.abs(forward.x)<.9?0:1);up.addScaledVector(forward,-up.dot(forward));}
      }
      up.normalize();
    }
    this.previous={forward,up:up.clone(),seat,key};return up;
  }
}
// The coaster eye is 1.02 m above its seat contact. Its highest car panel is
// below that eye; the extra .3 m also clears the .22 m near-plane sphere.
const SEAT_EYE = 1.02, FOLD_WIDTH = .6;
function seatUp(pose: AttractionRidePose) {
  return pose.orientation ? new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...pose.orientation)) : null;
}
/** The sweep must start on the passenger side too: shortening a safe orbit from
 * a low look-at point can otherwise put the camera back behind the seat shell. */
export function attractionCameraSweepOrigin(pose: AttractionRidePose) {
  const origin = new Vector3(...pose.cameraTarget), up = seatUp(pose);
  if (up && !pose.firstPerson) origin.addScaledVector(up, Math.max(0,
    SEAT_EYE + FOLD_WIDTH / 2 - origin.clone().sub(new Vector3(...pose.seat)).dot(up)));
  return origin;
}
/** A view transform only: it cannot change the train, seat or character orientation. */
export function attractionCameraPose(pose: AttractionRidePose, look = attractionLook): AttractionRidePose {
  const cabin = pose.firstPerson && !!pose.orientation;
  const manual = !!(look.yaw || look.pitch || ((!pose.firstPerson || cabin) && look.zoom !== 1));
  const passengerUp = !pose.firstPerson ? seatUp(pose) : null;
  if (!manual && !passengerUp) return pose;
  const up = new Vector3(...(pose.cameraUp ?? [0, 1, 0])).normalize();
  const camera = new Vector3(...pose.cameraPosition), target = new Vector3(...pose.cameraTarget);
  if (manual) {
    const direction = pose.firstPerson ? target.clone().sub(camera) : camera.clone().sub(target);
    // Match the walking orbit: increasing yaw runs +X towards +Z. Three's
    // right-handed Y rotation runs the other way, for both orbit and head look.
    direction.applyAxisAngle(up, -look.yaw);
    const side = new Vector3().crossVectors(up, direction);
    // An authored third-person view can pass through world vertical. Use the
    // projected world-up tangent's magnitude as well as its direction: pitch
    // fades continuously at that pole instead of normalizing noise into a flip.
    const pitch = look.pitch * (passengerUp ? side.length() / Math.max(1e-8, direction.length()) : 1);
    direction.applyAxisAngle(side.normalize(), pose.firstPerson ? pitch : -pitch);
    if (pose.firstPerson) target.copy(camera).add(direction);
    else {
      const length = Math.max(4.2, direction.length() * look.zoom);
      if (passengerUp) direction.normalize();
      else {
        // Unoriented attractions retain their world-up orbit limits.
        const elevation = Math.max(.12, Math.min(1.2, Math.asin(Math.max(-1, Math.min(1, direction.clone().normalize().dot(up))))));
        const horizontal = direction.clone().addScaledVector(up, -direction.dot(up)).normalize();
        direction.copy(horizontal).multiplyScalar(Math.cos(elevation)).addScaledVector(up, Math.sin(elevation));
      }
      camera.copy(target).addScaledVector(direction, length);
    }
  }
  if (passengerUp) {
    const height = camera.clone().sub(new Vector3(...pose.seat)).dot(passengerUp) - SEAT_EYE;
    // Fold unsafe positions onto the seat side without normalizing a projected
    // tangent (singular directly under the train). This rounded absolute value
    // is C1, has derivative at most one, and is exactly identity above .6 m.
    // World yaw/pitch inputs and horizon stay unchanged; only unsafe positions
    // change. Apply at zero input too, so tiny drags and reset share one boundary.
    const safeHeight = Math.abs(height) >= FOLD_WIDTH ? Math.abs(height)
      : FOLD_WIDTH / 2 + height * height / (2 * FOLD_WIDTH);
    if (safeHeight !== height) camera.addScaledVector(passengerUp, safeHeight - height);
    else if (!manual) return pose;
  }
  return { ...pose, cameraPosition: camera.toArray() as Vec3, cameraTarget: target.toArray() as Vec3,
    fov: cabin ? attractionCabinFov(pose.fov, look.zoom) : pose.fov };
}
