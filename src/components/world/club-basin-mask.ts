import { Vector2 } from 'three';
import { CLUB_POOL } from './djc-club-layout.ts';

const count=CLUB_POOL.segments,center=CLUB_POOL.center,radii=CLUB_POOL.radii;
/** The basin outline is star-shaped in normalized pool coordinates. Its actual
 * triangulated edge is found in O(1), without approximating it by a circle or
 * running a 96-edge point-in-polygon test for every ground fragment. */
export function clubBasinMasksGround(x:number,z:number){
  const dx=x-center[0],dz=z-center[2];
  if(Math.abs(dx)>radii[0]*1.12||Math.abs(dz)>radii[1]*1.12)return false;
  const angle=(Math.atan2(dz/radii[1],dx/radii[0])+Math.PI*2)%(Math.PI*2);
  const i=Math.min(count-1,Math.floor(angle*count/(Math.PI*2)));
  const a=CLUB_POOL.outline[i],b=CLUB_POOL.outline[(i+1)%count];
  return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=0;
}
export function clubBasinMaskUniforms(){
  return {uClubBasinMounted:{value:0},uClubBasinOutline:{value:CLUB_POOL.outline.map(p=>new Vector2(...p))}};
}
const n=(v:number)=>v.toFixed(8);
export const CLUB_BASIN_MASK_GLSL=`
uniform float uClubBasinMounted;
uniform vec2 uClubBasinOutline[${count}];
bool clubBasinMasksGround(vec2 p) {
  if(uClubBasinMounted<.5) return false;
  vec2 d=p-vec2(${n(center[0])},${n(center[2])});
  if(abs(d.x)>${n(radii[0]*1.12)}||abs(d.y)>${n(radii[1]*1.12)}) return false;
  float a=mod(atan(d.y/${n(radii[1])},d.x/${n(radii[0])})+6.28318530718,6.28318530718);
  int i=min(${count-1},int(floor(a*${n(count/(Math.PI*2))})));
  vec2 left=uClubBasinOutline[i],right=uClubBasinOutline[(i+1)%${count}];
  vec2 edge=right-left,rel=p-left;
  return edge.x*rel.y-edge.y*rel.x>=0.;
}`;
