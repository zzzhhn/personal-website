import type { Vec3 } from '../types';

/** Island-local metres, same origin as alpha-layout. Shared by visible assemblies,
 * terrain grading and route/vegetation clearance; never a second player datum. */
export const ALPHA_SHALLOWS = { center: [-36,12,-60] as Vec3, size: [18,12] as const, waterY:11.92, bedY:11.55 };
export const ALPHA_WATERWHEEL = { center: [-29,24,9] as Vec3, size: [18,16] as const };
export const ALPHA_CAVE_PATH: Vec3[] = [[-15,24,-35],[-10,26,-42],[0,29,-48],[10,32,-56]];
export const ALPHA_CAVE_DEAD_END: Vec3[] = [[-10,26,-42],[-14,27,-48],[-19,27.5,-49]];
export const ALPHA_WATER_PASSAGE: Vec3[] = [[-31.8,24,4.8],[-19.8,24,4.8]];
/** Public playtest arrivals on permanent support, independent of puzzle state. */
export const ALPHA_BATCH2_ARRIVALS: Record<string,Vec3> = {
 'alpha-shallows':[-44.75,12.08,-56],
 'alpha-waterwheel':[-29,24,16],
 'alpha-cave':[-15,24.12,-35],
};
export const ALPHA_BATCH2_PATHS: Vec3[][] = [
  [[-54,6,-40],[-47,9.2,-48],[-45,12,-56],[-27,12,-56],[-22,16,-40]],
  [[-42,18,-29],[-46,21,-12],[-39.2,24,8],[-29,24,16],[-20,24,8],[-27,25,2]],
  [[-27,20,-17],[-15,24,-35],...ALPHA_CAVE_PATH.slice(1)],
  ALPHA_CAVE_DEAD_END,
  ALPHA_WATER_PASSAGE,
];

export function batch2Segment(x:number,z:number,path:readonly Vec3[]) {
  let distance=Infinity,y=0;
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
    if(d<distance){distance=d;y=a[1]+(b[1]-a[1])*t;}
  }
  return {distance,y};
}
export function batch2PathDistance(x:number,z:number) {
  return Math.min(...ALPHA_BATCH2_PATHS.map(p=>batch2Segment(x,z,p).distance));
}
export function batch2PlantClearance(x:number,z:number) {
  const a=ALPHA_SHALLOWS,b=ALPHA_WATERWHEEL;
  return batch2PathDistance(x,z)<3.2 ||
    (Math.abs(x-a.center[0])<a.size[0]/2+1&&Math.abs(z-a.center[2])<a.size[1]/2+1)||
    (Math.abs(x-b.center[0])<b.size[0]/2+1&&Math.abs(z-b.center[2])<b.size[1]/2+1);
}
