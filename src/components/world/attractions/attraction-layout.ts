import type { Vec3 } from '../types';

/** Shared site survey. Ground points are foot positions, never capsule centres. */
export const IBD_YARD = {
  center: [-88, 1, -177] as Vec3,
  size: [68, 60] as const,
  entrance: [-88, 1.08, -143] as Vec3,
  title: { zh: '国投证券 · 物资清点场', en: 'SDIC · The Inventory Yard' },
};
export const INTENT_COASTER = {
  center: [50, 1, -195] as Vec3,
  size: [110, 130] as const,
  entrance: [50, 1.08, -125] as Vec3,
  title: { zh: '字节跳动 · 意图过山车', en: 'ByteDance · Intent Coaster' },
};

/** Connected northern headland; overlaps the old north shore by at least 15 m. */
export const ATTRACTIONS_CAPE: [number, number][] = [
  [-133,-114],[-146,-156],[-145,-197],[-137,-220],[-112,-237],[-82,-242],
  [-47,-233],[-29,-249],[-16,-273],[17,-285],[60,-288],[94,-282],
  [120,-269],[132,-240],[138,-201],[132,-162],[122,-139],[104,-122],
  [75,-111],[42,-104],[10,-105],[-20,-119],[-65,-121],[-103,-109],
];

export const ATTRACTION_ROADS: [number, number][][] = [
  [[-4,-54],[-5,-80],[-5,-103],[-15,-123],[-35,-140],[-62,-140],[-88,-140],[-88,-148]],
  [[-15,-123],[10,-120],[32,-120],[50,-125],[50,-131]],
];

export function attractionCapeDistance(x:number,z:number) {
  if(z>-75||z<-325||x<-185||x>180)return Infinity;
  let inside=false,best=Infinity;
  for(let i=0,j=ATTRACTIONS_CAPE.length-1;i<ATTRACTIONS_CAPE.length;j=i++){
    const a=ATTRACTIONS_CAPE[j],b=ATTRACTIONS_CAPE[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside?-best:best;
}
export function attractionRoadDistance(x:number,z:number) {
  if(z>-48||z<-161||x<-96||x>59)return Infinity;
  let best=Infinity;
  for(const path of ATTRACTION_ROADS)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  return best;
}
export function attractionScatterBlocked(x:number,z:number) {
  const forecourt=x>INTENT_COASTER.center[0]-INTENT_COASTER.size[0]/2-2
    &&x<INTENT_COASTER.center[0]+INTENT_COASTER.size[0]/2+2
    &&z>INTENT_COASTER.center[2]+INTENT_COASTER.size[1]/2-2&&z<INTENT_COASTER.entrance[2]+4;
  return forecourt||attractionRoadDistance(x,z)<5.3||[IBD_YARD,INTENT_COASTER].some(s=>
    Math.abs(x-s.center[0])<s.size[0]/2+2&&Math.abs(z-s.center[2])<s.size[1]/2+2);
}
