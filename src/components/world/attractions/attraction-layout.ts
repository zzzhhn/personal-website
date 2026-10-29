import type { Vec3 } from '../types';

/** Shared site survey. Ground points are foot positions, never capsule centres. */
export const IBD_YARD = {
  center: [-88, 1, -177] as Vec3,
  size: [92, 70] as const, // broad-phase envelope only; the physical boundary is IBD_FOOTPRINT
  entrance: [-88, 1.08, -143] as Vec3,
  title: { zh: '国投证券 · 物资清点场', en: 'SDIC · The Inventory Yard' },
};
/** Local survey vertices and the edge leaving each vertex. Open edges have no perimeter collider.
 * West: vehicle turning court; east: drainage setback between sheds; south: shared pedestrian/service arrival.
 * The paving, its collision mesh, perimeter and map all consume this survey, never size as a rectangle.
 */
const ibdBoundary: readonly [number, number, 'fence' | 'drain' | 'open'][] = [
  [-33,-25,'fence'],[-28,-27,'fence'],[-2,-27,'fence'],[-2,-29,'fence'],[27,-29,'fence'],
  [33,-27,'fence'],[33,-6.3,'drain'],[25,-4.5,'drain'],[25,0,'drain'],[34,2.2,'fence'],
  [34,25,'fence'],[30,30,'open'],[8,30,'open'],[8,34,'open'],[-18,34,'open'],
  [-22,31,'fence'],[-32,35,'fence'],[-42,30,'fence'],[-46,21,'fence'],[-43,12,'fence'],[-33,8,'fence'],
];
export const IBD_FOOTPRINT: [number, number][] = ibdBoundary.map(([x,z]) => [x + IBD_YARD.center[0], z + IBD_YARD.center[2]]);
export const IBD_BOUNDARY_SEGMENTS = ibdBoundary.map(([, , kind], i) => ({
  a: IBD_FOOTPRINT[i], b: IBD_FOOTPRINT[(i + 1) % IBD_FOOTPRINT.length], kind,
}));
/** Signed distance in world x/z, shared by vegetation clearance and lightweight survey checks. */
export function ibdFootprintDistance(x: number, z: number): number {
  if (Math.abs(x - IBD_YARD.center[0]) > IBD_YARD.size[0] / 2 + 4 || Math.abs(z - IBD_YARD.center[2]) > IBD_YARD.size[1] / 2 + 4) return Infinity;
  let inside = false, nearest = Infinity;
  for (const { a, b } of IBD_BOUNDARY_SEGMENTS) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? -nearest : nearest;
}
export const INTENT_COASTER = {
  center: [50, 1, -195] as Vec3,
  size: [243, 298] as const,
  // center remains the interaction/track origin. The expanded survey is offset north/east.
  surveyCenter: [113.5, 1, -263] as Vec3,
  bounds: { minX: -8, maxX: 235, minZ: -412, maxZ: -114 },
  entrance: [50, 1.08, -125] as Vec3,
  title: { zh: '字节跳动 · 意图过山车', en: 'ByteDance · Intent Coaster' },
};

/** Irregular guest boundary in world x/z; the concave east side frames the inlet. */
export const INTENT_COASTER_FOOTPRINT: [number, number][] = [
  [-54,65],[-30,78],[-5,80],[10,71],[54,65],[177,38],[180,20],[157,5],[132,-6],[122,-25],
  [147,-45],[179,-66],[184,-102],[179,-146],[179,-174],[157,-204],[109,-216],[53,-217],
  [2,-210],[-44,-193],[-54,-163],[-54,-25],
].map(([x,z]) => [x + INTENT_COASTER.center[0], z + INTENT_COASTER.center[2]]);

/** Connected headland; western IBD frontage is preserved, with a real concave eastern inlet. */
export const ATTRACTIONS_CAPE: [number, number][] = [
  [-133,-114],[-146,-156],[-145,-197],[-137,-220],[-112,-237],[-82,-242],
  [-47,-233],[-29,-249],[-16,-273],[-24,-331],[-18,-375],[4,-401],[40,-417],
  [96,-426],[157,-422],[209,-406],[236,-375],[247,-333],[249,-293],
  [238,-256],[214,-235],[171,-230],[132,-220],[115,-206],[116,-191],[162,-183],[217,-185],[243,-175],
  [242,-153],[213,-136],[158,-127],[100,-114],
  [75,-111],[42,-104],[10,-105],[-20,-119],[-65,-121],[-103,-109],
];

export const ATTRACTION_ROADS: [number, number][][] = [
  [[-4,-54],[-5,-80],[-5,-103],[-15,-123],[-35,-140],[-62,-140],[-88,-140],[-88,-148]],
  [[-15,-123],[10,-120],[32,-120],[50,-125],[50,-131]],
];

export function attractionCapeDistance(x:number,z:number) {
  if(z>-75||z<-450||x<-185||x>275)return Infinity;
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
  const b=INTENT_COASTER.bounds;
  const coaster=x>b.minX-2&&x<b.maxX+2&&z>b.minZ-2&&z<INTENT_COASTER.entrance[2]+4;
  return coaster||attractionRoadDistance(x,z)<5.3||
    ibdFootprintDistance(x,z)<2;
}

/** Optional north-coast height hook for WorldLandform. Null preserves IBD and the old southern shore. */
export function attractionCliffCoastHeight(x:number,z:number,distance:number):number|null {
  if(x<0||z>-145||!Number.isFinite(distance))return null;
  if(distance<=0)return 1;
  return 1-7*Math.min(1,distance/3.5)-Math.min(2,Math.max(0,distance-3.5)*.08);
}
