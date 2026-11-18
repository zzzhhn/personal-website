import { Box3, Vector3 } from 'three';
import type { BufferGeometry, Matrix4 } from 'three';
import { ALPHA_STATIONS } from './alpha-layout';

export const lodgeFoundation = { width:7.5, depth:6.1 };
export const lodgeRamp = { width:2.2, toe:4.6, landing:2.98 };
const [x,y,z]=ALPHA_STATIONS.lodge;
const occupied = [
  new Box3(new Vector3(x-lodgeFoundation.width/2,y-.3,z-lodgeFoundation.depth/2),
    new Vector3(x+lodgeFoundation.width/2,y+5.4,z+lodgeFoundation.depth/2)),
  new Box3(new Vector3(x-lodgeRamp.width/2,y-.3,z+lodgeFoundation.depth/2-.5),
    new Vector3(x+lodgeRamp.width/2,y+.53,z+lodgeRamp.toe)),
];

/** Plant matrices and the station plan both use island-local coordinates. */
export function outsideLodge<T extends {matrix:Matrix4}>(points:T[], geometries:BufferGeometry[]) {
  const bounds=new Box3(),placed=new Box3();
  for(const geometry of geometries) {
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox!);
  }
  return points.filter(point=>{
    placed.copy(bounds).applyMatrix4(point.matrix);
    return occupied.every(zone=>!placed.intersectsBox(zone));
  });
}
