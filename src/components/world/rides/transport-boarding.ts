import { Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../types';
import type { TransportRoute } from './ride-contract';
import { sampleTransport, transportWorld,tuple } from './transport-route.ts';
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
 const sample=sampleTransport(route,index),inverse=new Quaternion(...sample.orientation).invert();
 const support=(x:number,z:number):number|null=>{
  const c=Math.cos(route.transform.yaw),sn=Math.sin(route.transform.yaw),dx=x-route.transform.origin[0],dz=z-route.transform.origin[2],lx=c*dx-sn*dz,lz=sn*dx+c*dz;
  let top:number|null=null;
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],vx=b[0]-a[0],vz=b[2]-a[2],t=((lx-a[0])*vx+(lz-a[2])*vz)/(vx*vx+vz*vz);
   if(t>=-1e-6&&t<=1+1e-6&&Math.hypot(lx-a[0]-t*vx,lz-a[2]-t*vz)<=.65001)top=Math.max(top??-Infinity,a[1]+(b[1]-a[1])*t+route.transform.origin[1]);
  }
  const v=new Vector3(x,0,z).sub(new Vector3(sample.vehicle[0],0,sample.vehicle[2])).applyQuaternion(inverse);
  const halfX=route.kind==='ferry'?3.5:route.kind==='sled'?.9:1.6,halfZ=route.kind==='ferry'?1.45:route.kind==='sled'?.5:1.2;
  if(Math.abs(v.x)<=halfX&&Math.abs(v.z)<=halfZ&&(route.kind!=='sled'||(v.x>=.31&&v.x<=.71&&Math.abs(v.z)<=.34))){const deck=sample.vehicle[1]+(v.x>=.31&&v.x<=.71&&Math.abs(v.z)<=.34?.13:0);top=Math.max(top??-Infinity,deck);}
  if(top!==null)return top;
  return groundHeight?groundHeight(lx,lz)+route.transform.origin[1]:null;
 };
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices),support,path:path.map(p=>transportWorld(p,route.transform))};
}
