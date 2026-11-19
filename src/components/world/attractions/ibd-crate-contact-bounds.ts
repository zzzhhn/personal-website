import type { BufferGeometry } from 'three';
import type { Vec3 } from '../types';
import { buildIbdPackShell } from './ibd-pack-geometry.ts';
import { buildIbdLid } from './ibd-yard-geometry.ts';

export type IbdLocalBounds={center:Vec3;half:Vec3};

function bounds(geometry:BufferGeometry):IbdLocalBounds {
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox!;
  geometry.dispose();
  return {center:[(min.x+max.x)/2,(min.y+max.y)/2,(min.z+max.z)/2],
    half:[(max.x-min.x)/2,(max.y-min.y)/2,(max.z-min.z)/2]};
}

let checked:{shell:IbdLocalBounds;lid:IbdLocalBounds}|undefined;

/** The distant geometry and the shipping GLB use matching measured envelopes. */
export function ibdCrateContactBounds() {
  return checked??={shell:bounds(buildIbdPackShell()),lid:bounds(buildIbdLid())};
}
