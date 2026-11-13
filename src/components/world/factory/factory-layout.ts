/** Shared survey. Metres; origin is the existing island's y=1 ground, not a capsule centre. */
export type FactoryPoint = [number, number, number];
export type FactoryXZ = [number, number];
export const FACTORY = {
  origin: [-197.5, 1, 12.5] as FactoryPoint,
  floorY: 1.12,
  building: { minX: -245, maxX: -150, minZ: -20, maxZ: 45 },
  courtyard: { minX: -145, maxX: -100, minZ: -5, maxZ: 25 },
  entrance: [-149, 1.12, -17] as FactoryPoint,
  height: 18,
  title: { zh: 'Video Rebirth · 机械伙伴工厂', en: 'Video Rebirth · Companion Works' },
};
/** Authored irregular headland overlaps the old island; it does not rewrite the convex old outline. */
export const FACTORY_CAPE: FactoryXZ[] = [
  [-115,-42],[-155,-48],[-210,-46],[-251,-35],[-268,-12],
  [-268,24],[-254,55],[-224,66],[-174,67],[-143,54],
  [-115,48],[-101,24],[-94,1],[-90,-24],
];
export const FACTORY_APPROACH: FactoryXZ[] = [[-88,-27],[-113,-27],[-139,-24],[-149,-17]];
export const FACTORY_FOOTPRINT: FactoryXZ[] = [
  [-246,-19],[-242,-23],[-157,-23],[-148,-17],[-148,-8],[-104,-8],
  [-97,-2],[-97,23],[-103,29],[-148,29],[-148,42],[-156,48],[-239,48],[-247,39],
];
export const factoryWorld = (p: FactoryPoint): FactoryPoint =>
  [p[0]+FACTORY.origin[0],p[1]+FACTORY.origin[1],p[2]+FACTORY.origin[2]];
export const factoryLocal = (p: readonly number[]): FactoryPoint =>
  [p[0]-FACTORY.origin[0],p[1]-FACTORY.origin[1],p[2]-FACTORY.origin[2]];
const segmentDistance = (x:number,z:number,a:FactoryXZ,b:FactoryXZ) => {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
};
export function factoryPolygonDistance(x:number,z:number,points:readonly FactoryXZ[]) {
  let inside=false,best=Infinity;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];
    best=Math.min(best,segmentDistance(x,z,a,b));
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside?-best:best;
}
export function factoryCapeDistance(x:number,z:number) {
  if(x < -300 || x > -65 || z < -78 || z > 97)return Infinity;
  return factoryPolygonDistance(x,z,FACTORY_CAPE);
}
export function factoryFootprintDistance(x:number,z:number) {
  if(x < -251 || x > -93 || z < -27 || z > 52)return Infinity;
  return factoryPolygonDistance(x,z,FACTORY_FOOTPRINT);
}
export function factoryApproachDistance(x:number,z:number) {
  if(x < -156 || x > -81 || z < -35 || z > -3)return Infinity;
  let best=Infinity;
  for(let i=1;i<FACTORY_APPROACH.length;i++)best=Math.min(best,segmentDistance(x,z,FACTORY_APPROACH[i-1],FACTORY_APPROACH[i]));
  return best;
}
export const factoryScatterBlocked=(x:number,z:number)=>
  factoryFootprintDistance(x,z)<1.2||factoryApproachDistance(x,z)<4.1;
export const inFactory=(x:number,z:number)=>factoryFootprintDistance(x,z)<5;
export type FactoryStationId='raw'|'batch'|'routing'|'frame'|'wheels'|'shell'|'assembly'|'test'|'compare'|'rework'|'finish'|'release';
export interface FactoryStation { id:FactoryStationId; at:FactoryPoint; machine:FactoryPoint; yaw:number; radius:number; }
export const FACTORY_STATIONS: readonly FactoryStation[] = [
  {id:'raw',at:[-37,.12,-25],machine:[-37,1.1,-19],yaw:0,radius:2.1},
  {id:'batch',at:[-23,.12,-25],machine:[-23,1,-22],yaw:0,radius:2.1},
  {id:'routing',at:[-8,.12,-25],machine:[-8,1,-22],yaw:0,radius:2.1},
  {id:'frame',at:[-32,.12,-11],machine:[-27,1,-11],yaw:Math.PI/2,radius:2.1},
  {id:'wheels',at:[-32,.12,2],machine:[-27,1,2],yaw:Math.PI/2,radius:2.1},
  {id:'shell',at:[-32,.12,15],machine:[-27,1,15],yaw:Math.PI/2,radius:2.1},
  {id:'assembly',at:[24,.12,-8],machine:[24,1,-4],yaw:0,radius:2.1},
  {id:'test',at:[60,.12,-12],machine:[60,1,-9],yaw:0,radius:2.1},
  {id:'compare',at:[72,.12,-12],machine:[72,1,-9],yaw:0,radius:2.1},
  {id:'rework',at:[38,.12,12],machine:[34,1,12],yaw:-Math.PI/2,radius:2.1},
  // Final fitting and inspection take place at the same physical fixture.
  {id:'finish',at:[24,.12,0],machine:[24,1,-4],yaw:Math.PI,radius:2.1},
  {id:'release',at:[43,.12,24],machine:[43,1,20],yaw:Math.PI,radius:2.1},
];
export const factoryStation=(id:FactoryStationId)=>FACTORY_STATIONS.find(s=>s.id===id)!;
/** Below the 4.32 m gallery: the old high orbit hit its underside and collapsed
 * into the return conveyor. Two views keep printing and companion movement legible. */
export const FACTORY_DISPATCH_VIEWS={
  dock:{eye:[41,3.65,30.2] as FactoryPoint,target:[37,1.1,26.5] as FactoryPoint},
  printer:{eye:[40.8,3.3,25.2] as FactoryPoint,target:[43,1.75,22.5] as FactoryPoint},
};
/** Work views look through the open machine throat from the operator aisle.
 * The routing view includes the actual transfer table rather than only its lever. */
export const FACTORY_WORK_VIEWS:Partial<Record<FactoryStationId,{eye:FactoryPoint;target:FactoryPoint}>>={
  raw:{eye:[-31.6,5.5,-27.8],target:[-37,1.5,-19]},
  batch:{eye:[-19.5,4.6,-28.5],target:[-24,1.4,-22]},
  routing:{eye:[-13,7,-26],target:[-21,1.8,-9]},
  ...Object.fromEntries((['frame','wheels','shell'] as const).map((id,i)=>{
    const z=[-11,2,15][i];
    return [id,{eye:[-39,5.2,z+3.5],target:[-27.5,2.2,z]}];
  })),
};
/** Shared track centreline; duplicated by translation only so test courses remain equivalent. */
export const FACTORY_COURSE_LOCAL: FactoryPoint[] = [
  [56,.12,-6],[56,.12,-2],[56,1.42,3],[56,1.42,6],
  [56,.12,11],[60,.12,11],[62,.12,8],[62,.12,2],
];
export const FACTORY_LANE_OFFSET=19;
