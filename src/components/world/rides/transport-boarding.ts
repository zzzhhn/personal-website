import { Vector3 } from 'three';
import type { Vec3 } from '../types';
import type { TransportRoute } from './ride-contract';
import { transportWorld,tuple } from './transport-route.ts';
/** Final fixed gangway ends at the doorway; the vehicle owns its interior floor. */
export function transportBoardingGeometry(route:TransportRoute,index:0|1,groundHeight?:(x:number,z:number)=>number){
 const terminal=route.terminals[index],full=terminal.boarding;
 const path=full.slice(terminal.gangwayStart??Math.max(0,full.length-2)).map(p=>[...p] as Vec3);
 const inside=path.at(-1)!,from=path.at(-2)!,direction=new Vector3(...inside).sub(new Vector3(...from)).normalize();
 path[path.length-1]=tuple(new Vector3(...inside).addScaledVector(direction,-.8));
 const positions:number[]=[],indices:number[]=[];
 for(let i=1;i<path.length;i++){
  const a=transportWorld(path[i-1],route.transform),b=transportWorld(path[i],route.transform),f=new Vector3(...b).sub(new Vector3(...a)),side=new Vector3(-f.z,0,f.x).normalize().multiplyScalar(.65),j=positions.length/3;
  positions.push(...new Vector3(...a).add(side).toArray(),...new Vector3(...a).sub(side).toArray(),...new Vector3(...b).add(side).toArray(),...new Vector3(...b).sub(side).toArray());indices.push(j,j+1,j+2,j+1,j+3,j+2);
 }
 const support=(x:number,z:number):number|null=>{
  const c=Math.cos(route.transform.yaw),sn=Math.sin(route.transform.yaw),dx=x-route.transform.origin[0],dz=z-route.transform.origin[2],lx=c*dx-sn*dz,lz=sn*dx+c*dz;
  const supportPath=full.slice(terminal.gangwayStart??Math.max(0,full.length-2));
  for(let i=1;i<supportPath.length;i++){
   const a=supportPath[i-1],b=supportPath[i],vx=b[0]-a[0],vz=b[2]-a[2],t=Math.max(0,Math.min(1,((lx-a[0])*vx+(lz-a[2])*vz)/(vx*vx+vz*vz)));
   if(Math.hypot(lx-a[0]-t*vx,lz-a[2]-t*vz)<.7)return a[1]+(b[1]-a[1])*t+route.transform.origin[1];
  }
  return groundHeight?groundHeight(lx,lz)+route.transform.origin[1]:null;
 };
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices),support,path:path.map(p=>transportWorld(p,route.transform))};
}
