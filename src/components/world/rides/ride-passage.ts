import { passageRoute, type RegionPassage } from '../region-passage';
import type { Vec3 } from '../types';

/** pointAt uses normalized arc distance, as do the shipped Three ride curves.
 * Midpoint envelopes include the remaining half arc, so bends cannot shortcut a cold region. */
export function rideSegmentReady(passage:RegionPassage,pointAt:(u:number)=>Vec3,from:number,to:number,length:number,radius:number):boolean {
  if(![from,to,length,radius].every(Number.isFinite)||length<0||radius<0)return false;
  const travel=Math.abs(to-from)*length,steps=Math.max(1,Math.ceil(travel/.5));
  if(steps>8192)return false;
  for(let i=0;i<steps;i++) {
    const point=pointAt(from+(to-from)*(i+.5)/steps);
    if(!passage.at(point,radius+travel/steps/2))return false;
  }
  return true;
}

export function rideDestinationReady(passage:RegionPassage,position:Vec3,radius:number,egress:readonly Vec3[],actorRadius:number):boolean {
  return passage.at(position,radius)&&passageRoute(passage,egress,actorRadius);
}
