import { Box3, Vector3, type SkinnedMesh } from 'three';
import { CLUB } from './djc-club-layout';
import type { Vec3 } from './types';

export const clubGuestContactId=(guest:0|1)=>`djc-guest-${guest}-core`;
export const DJC_GUESTS = [
  {position:[40,CLUB.dance[1],51.5] as Vec3,facing:Math.PI,step:0 as const},
  {position:[43,CLUB.dance[1],59] as Vec3,facing:Math.PI+.3,step:1 as const},
];
const up=new Vector3(0,1,0);

/** Use the custom guest's fitted clothing and floor to cap the body instead of
 * letting each gesturing hand claim the space it swings through on the floor. */
export function fitClubGuestContact(mesh:SkinnedMesh,scale:number) {
  const position=mesh.geometry.getAttribute('position');
  const ranges=mesh.userData.partRanges as {name:string;start:number;count:number}[];
  const shirt=ranges.find(({name})=>name==='sleeveless-seaglass-top'||name==='loose-linen-shirt');
  if(!shirt)throw new Error('Missing the DJC guest’s fitted torso range');
  const standing=new Box3(),torso=new Box3(),point=new Vector3();
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).multiplyScalar(scale);
    standing.expandByPoint(point);
    if(i>=shirt.start&&i<shirt.start+shirt.count)torso.expandByPoint(point);
  }
  const center=torso.getCenter(new Vector3());
  const radius=Math.max(torso.max.x-torso.min.x,torso.max.z-torso.min.z)*.5;
  const height=standing.max.y-standing.min.y;
  center.y=standing.min.y+height/2;
  return {center,radius,halfHeight:height*.5-radius};
}

/** The translated core follows the blended animation's chest and waist, while
 * the foot datum stays on the wood floor instead of following airborne shoes. */
export function clubGuestContactCenter(profile:ReturnType<typeof fitClubGuestContact>,base:Vector3,
  restTorso:Vector3,poseTorso:Vector3,facing:number,out:Vector3) {
  const y=base.y+profile.center.y;
  return out.copy(profile.center).sub(restTorso).applyAxisAngle(up,facing).add(poseTorso).setY(y);
}
