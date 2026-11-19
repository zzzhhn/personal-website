import type { BufferGeometry } from 'three';
import type { Vec3 } from '../types';
import { ibdGeometryContact } from './ibd-static-contact.ts';
import { buildIbdShutter } from './ibd-yard-geometry.ts';

export const IBD_DISPATCH_SHUTTER_ROOT='ibd-dispatch-shutter';
export const IBD_DISPATCH_SHUTTER_FACE='ibd-dispatch-shutter-face';
export const IBD_DISPATCH_SHUTTER_YAW=Math.PI/2;

export function ibdDispatchShutterAt(progress:number,[x,y,z]:Vec3=[0,0,0]):Vec3 {
  return [7+z,1.65+3.7*progress+y,19.3-x];
}

type ShutterEnvelope={center:Vec3;half:Vec3};
let checkedEnvelope:ShutterEnvelope|undefined;

function getEnvelope(geometry:BufferGeometry):ShutterEnvelope {
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox!;
  return {
    center:[(min.x+max.x)/2,(min.y+max.y)/2,(min.z+max.z)/2],
    half:[(max.x-min.x)/2,(max.y-min.y)/2,(max.z-min.z)/2],
  };
}

export function createIbdDispatchShutter() {
  const geometry=buildIbdShutter();
  checkedEnvelope??=getEnvelope(geometry);
  const contact=ibdGeometryContact(geometry,IBD_DISPATCH_SHUTTER_FACE,0,geometry.index!.count);
  return {geometry,contact};
}

/** Conservative swept protection uses the bounds of the same shutter that Rapier moves. */
export function ibdDispatchShutterEnvelope() {
  if(!checkedEnvelope){
    const geometry=buildIbdShutter();
    checkedEnvelope=getEnvelope(geometry);
    geometry.dispose();
  }
  return checkedEnvelope;
}
