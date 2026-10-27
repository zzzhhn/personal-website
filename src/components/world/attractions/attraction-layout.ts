import type { Vec3 } from '../types';

/** Shared site survey. Ground points are foot positions, never capsule centres. */
export const IBD_YARD = {
  center: [-88, 1, -177] as Vec3,
  size: [55, 45] as const,
  entrance: [-88, 1.08, -150] as Vec3,
  title: { zh: '国投证券 · 物资清点场', en: 'SDIC · The Inventory Yard' },
};
export const INTENT_COASTER = {
  center: [50, 1, -175] as Vec3,
  size: [70, 84] as const,
  entrance: [50, 1.08, -128] as Vec3,
  title: { zh: '字节跳动 · 意图过山车', en: 'ByteDance · Intent Coaster' },
};

/** Connected northern headland; overlaps the old north shore by at least 15 m. */
export const ATTRACTIONS_CAPE: [number, number][] = [
  [-133,-114],[-140,-153],[-135,-203],[-118,-225],[-85,-234],[-47,-228],
  [-18,-218],[9,-234],[48,-242],[87,-232],[106,-207],[110,-167],
  [97,-132],[75,-111],[42,-104],[10,-105],[-20,-119],[-65,-121],[-103,-109],
];

export const ATTRACTION_ROADS: [number, number][][] = [
  [[-4,-54],[-5,-80],[-5,-103],[-15,-123],[-35,-143],[-62,-146],[-88,-146]],
  [[-15,-123],[10,-122],[32,-123],[50,-132]],
];

export function attractionCapeDistance(x:number,z:number) {
  if(z>-75||z<-280||x<-175||x>145)return Infinity;
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
  if(z>-48||z<-153||x<-96||x>59)return Infinity;
  let best=Infinity;
  for(const path of ATTRACTION_ROADS)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  return best;
}
export function attractionScatterBlocked(x:number,z:number) {
  const forecourt=x>13&&x<87&&z>-135&&z<-125;
  return forecourt||attractionRoadDistance(x,z)<5.3||[IBD_YARD,INTENT_COASTER].some(s=>
    Math.abs(x-s.center[0])<s.size[0]/2+2&&Math.abs(z-s.center[2])<s.size[1]/2+2);
}
