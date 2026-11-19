import type { BufferGeometry } from 'three';
import type { Vec3 } from '../types';
import { IBD_CRANE_Y } from './ibd-yard-layout.ts';

export const IBD_HOIST_CONTACT_ROOT='ibd-hoist-contact';
export const IBD_COIL_WHEEL_CENTER_Y=-2.12;
export const IBD_COIL_WHEEL_RADIUS=.13;
export const IBD_COIL_SUPPORT_Y=IBD_COIL_WHEEL_CENTER_Y-IBD_COIL_WHEEL_RADIUS;
export const IBD_HOIST_CARRY_Y=1.9-IBD_COIL_SUPPORT_Y;

export function ibdHoistPose([x,y]:Vec3) {
  const hookY=y+2.4, anchorY=IBD_CRANE_Y+.35;
  return {trolley:[x,IBD_CRANE_Y+.7,-4] as Vec3,hook:[x,hookY,-4] as Vec3,
    anchor:[x,anchorY,-4] as Vec3,cableLength:Math.max(.05,anchorY-hookY)};
}

/** Each cable is one contiguous source range in the two-rod draw. Radius is
 * the authored outer ring, with a cylindrical approximation to the octagon. */
export function ibdHoistCableSources(geometry:BufferGeometry) {
  const index=geometry.index!, position=geometry.getAttribute('position'), count=index.count/2;
  return [0,1].map(part=>{
    const firstIndex=part*count;
    let min=Infinity,max=-Infinity,radius=0;
    for(let i=firstIndex;i<firstIndex+count;i++){
      const vertex=index.getX(i),x=position.getX(vertex);
      min=Math.min(min,x);max=Math.max(max,x);radius=Math.max(radius,Math.abs(position.getZ(vertex)));
    }
    return {id:`ibd-hoist-cable-${part+1}`,firstIndex,indexCount:count,collision:'solid' as const,x:(min+max)/2,radius};
  });
}
