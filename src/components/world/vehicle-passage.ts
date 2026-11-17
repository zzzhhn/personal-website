import { wheelGeometry } from './actor-physics';
import type { Vec3 } from './types';

/** Circumsphere covers yaw, tipping, authored hulls and fully extended wheels.
 * Used only at unloaded-region boundaries; normal contacts retain their exact hulls. */
export function vehiclePassageRadius(size:Vec3,hull?:{bodyY:number;hulls:readonly {points:ArrayLike<number>}[]}|null):number {
  const wheels=wheelGeometry(size);
  let radius=Math.hypot(size[0]/2,size[1]*.62,size[2]/2);
  // 0.5 m bounds the configured 0.32 m suspension travel; 0.15 m is the tyre half-width.
  for(const point of wheels.points)radius=Math.max(radius,
    Math.hypot(point[0],point[1]-wheels.rest-.5,point[2])+wheels.radius+.15);
  for(const part of hull?.hulls??[])for(let i=0;i<part.points.length;i+=3)
    radius=Math.max(radius,Math.hypot(part.points[i],part.points[i+1]+hull!.bodyY,part.points[i+2]));
  return radius+.02;
}
