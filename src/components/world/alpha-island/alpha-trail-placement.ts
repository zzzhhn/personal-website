import { AlphaBuilder } from './alpha-art';
import { ALPHA_MAIN_PATH } from './alpha-layout';
import { alphaGroundHeight } from './alpha-terrain';
import type { Vec3 } from '../types';

/** Lowest of 25 square-footprint witnesses on the cached ground triangles.
 * This is a sampled low, not a mathematical minimum over every crossed triangle.
 * Callers retain burial margin and verify the actual lower mesh at their sites. */
export function alphaTrailFootprintLow(x:number,z:number,half:number) {
 let low=Infinity;
 for(let iz=0;iz<=4;iz++)for(let ix=0;ix<=4;ix++)
  low=Math.min(low,alphaGroundHeight(x-half+ix*half/2,z-half+iz*half/2));
 return low;
}

export function alphaTrailSignPosition(x:number,z:number):Vec3 {
 return [x,alphaTrailFootprintLow(x,z,.085)-.025,z];
}

export const alphaTrailLampLocations:Vec3[]=ALPHA_MAIN_PATH.filter((_,i)=>i%3===0).slice(0,9)
 .map(p=>[p[0]-2.6,p[1],p[2]+.4]);

export function createAlphaTrailLampParts() {
 const b=new AlphaBuilder();
 for(const p of alphaTrailLampLocations){
  const y=alphaGroundHeight(p[0],p[2]),top=y+.24;
  const bottom=alphaTrailFootprintLow(p[0],p[2],.19)-.05;
  b.box('stone',[p[0],(top+bottom)/2,p[2]],[.38,top-bottom,.38],.04);
  b.beam('wood',[p[0],y+.2,p[2]],[p[0],y+1.5,p[2]],.09);
  b.box('roof',[p[0],y+1.68,p[2]],[.4,.08,.4],.025);
 }
 return b.finish();
}
