import { Color } from 'three';
import type { Vec3 } from '../types';

/** Erode broad benches out of the authored ridge, never raise it into a ride envelope.
 * Tilted strata and short risers interrupt the former uninterrupted rounded slope. */
export function beddedRockHeight(height:number,x:number,z:number) {
  if(height<=2)return height;
  const level=(height+.075*x-.035*z)/2.8,fraction=level-Math.floor(level);
  const t=Math.max(0,(fraction-.65)/.35),riser=t*t*(3-2*t);
  const cut=2.8*(fraction-Math.min(fraction,riser));
  return height-cut*Math.min(1,(height-2)/3);
}

const mineral=new Color('#a5a393'),shadow=new Color('#7c8988'),moss=new Color('#828b66');
/** Grey mineral faces dominate the coast; sparse moss belongs to broad upper shelves. */
export function beddedRockColour(a:Vec3,b:Vec3,c:Vec3) {
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const slope=Math.hypot(nx,nz)/Math.max(1e-6,Math.abs(ny));
  const x=(a[0]+b[0]+c[0])/3,y=(a[1]+b[1]+c[1])/3,z=(a[2]+b[2]+c[2])/3;
  const patch=Math.sin(x*.11+z*.07)*Math.cos(z*.09-x*.04);
  const colour=shadow.clone().lerp(mineral,Math.min(.9,.52+slope*.19+patch*.12));
  if(y>3&&slope<.4)colour.lerp(moss,Math.max(0,.34-slope*.7+patch*.1));
  return colour;
}
