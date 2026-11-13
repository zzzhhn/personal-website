import dimensions from '../alpha-island/transports/transport-dimensions.json' with {type:'json'};
import { Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../types';
import type { TransportRoute } from './ride-contract';
import { sampleTransport, transportWorld,tuple } from './transport-route.ts';
/** Final fixed gangway ends at the doorway; the vehicle owns its interior floor. */
export function transportBoardingGeometry(route:TransportRoute,index:0|1,groundHeight?:(x:number,z:number)=>number){
 const terminal=route.terminals[index],full=terminal.boarding;
 const path=full.slice(terminal.gangwayStart??Math.max(0,full.length-2),terminal.gangwayEnd===undefined?undefined:terminal.gangwayEnd+1).map(p=>[...p] as Vec3);
 const inside=path.at(-1)!,from=path.at(-2)!,direction=new Vector3(...inside).sub(new Vector3(...from)).normalize();
 path[path.length-1]=tuple(new Vector3(...inside).addScaledVector(direction,terminal.gangwayEnd===undefined?-.8:-.06));
 const paths=[path];
 if(terminal.egress){const boundary=terminal.gangwayEnd===undefined?-1:terminal.egress.findIndex(p=>Math.hypot(...p.map((v,i)=>v-inside[i]))<1e-5),exit=terminal.egress.slice(Math.max(0,boundary)).map(p=>[...p] as Vec3),d=new Vector3(...exit[1]).sub(new Vector3(...exit[0])).normalize();exit[0]=tuple(new Vector3(...exit[0]).addScaledVector(d,boundary<0?.8:.06));paths.push(exit);}
 const segments:{a:Vec3;b:Vec3}[]=[],seen=new Set<string>();
 for(const chain of paths)for(let i=1;i<chain.length;i++){const a=chain[i-1],b=chain[i],key=[a.map(v=>v.toFixed(5)).join(','),b.map(v=>v.toFixed(5)).join(',')].sort().join('|');if(!seen.has(key)){seen.add(key);segments.push({a,b});}}
 const positions:number[]=[],indices:number[]=[],covered:Vec3[][]=[];
 const cross=(a:Vec3,b:Vec3,p:Vec3)=>(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);
 const half=(poly:Vec3[],a:Vec3,b:Vec3,inside:boolean)=>{const out:Vec3[]=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q),ip=inside?dp>=-1e-8:dp<=1e-8,iq=inside?dq>=-1e-8:dq<=1e-8;if(ip)out.push(p);if(ip!==iq){const t=dp/(dp-dq);out.push(p.map((v,k)=>v+(q[k]-v)*t) as Vec3);}}return out;};
 const subtract=(poly:Vec3[],clip:Vec3[])=>{let rest=poly;const out:Vec3[][]=[];for(let i=0;i<clip.length&&rest.length>=3;i++){const outside=half(rest,clip[i],clip[(i+1)%clip.length],false);if(outside.length>=3)out.push(outside);rest=half(rest,clip[i],clip[(i+1)%clip.length],true);}return out;};
 for(const {a:localA,b:localB} of segments){
  const a=new Vector3(...transportWorld(localA,route.transform)),b=new Vector3(...transportWorld(localB,route.transform)),f=b.clone().sub(a),side=new Vector3(-f.z,0,f.x).normalize().multiplyScalar(.65);
  // X/Z polygon is CCW; subtract already covered coplanar strips before triangulating.
  const quad=[tuple(a.clone().add(side)),tuple(a.clone().sub(side)),tuple(b.clone().sub(side)),tuple(b.clone().add(side))];
  let pieces:Vec3[][]=[quad];
  for(const old of covered){const normal=new Vector3(...old[1]).sub(new Vector3(...old[0])).cross(new Vector3(...old[2]).sub(new Vector3(...old[0]))).normalize();if(quad.every(p=>Math.abs(new Vector3(...p).sub(new Vector3(...old[0])).dot(normal))<1e-5))pieces=pieces.flatMap(poly=>subtract(poly,old));}
  for(const poly of pieces){const j=positions.length/3;poly.forEach(p=>positions.push(...p));for(let k=1;k<poly.length-1;k++){const x=new Vector3(...poly[k]).sub(new Vector3(...poly[0])),z=new Vector3(...poly[k+1]).sub(new Vector3(...poly[0]));if(x.cross(z).lengthSq()>1e-12)indices.push(j,j+k+1,j+k);}}
  covered.push(quad);
 }
 const sample=sampleTransport(route,index),inverse=new Quaternion(...sample.orientation).invert();
 const support=(x:number,z:number):number|null=>{
  const c=Math.cos(route.transform.yaw),sn=Math.sin(route.transform.yaw),dx=x-route.transform.origin[0],dz=z-route.transform.origin[2],lx=c*dx-sn*dz,lz=sn*dx+c*dz;
  let top:number|null=null;
  for(const {a,b} of segments){
   const vx=b[0]-a[0],vz=b[2]-a[2],t=((lx-a[0])*vx+(lz-a[2])*vz)/(vx*vx+vz*vz);
   if(t>=-1e-6&&t<=1+1e-6&&Math.hypot(lx-a[0]-t*vx,lz-a[2]-t*vz)<=.65001)top=Math.max(top??-Infinity,a[1]+(b[1]-a[1])*t+route.transform.origin[1]);
  }
  const v=new Vector3(x,0,z).sub(new Vector3(sample.vehicle[0],0,sample.vehicle[2])).applyQuaternion(inverse);
  if(route.kind==='sled'){
   for(const deck of dimensions.sledFootDecks)if(Math.abs(v.x-deck.center[0])<=deck.size[0]/2&&Math.abs(v.z-deck.center[2])<=deck.size[2]/2)top=Math.max(top??-Infinity,sample.vehicle[1]+deck.center[1]+deck.size[1]/2);
  }else{
   const halfX=route.kind==='ferry'?3.5:1.6,halfZ=route.kind==='ferry'?1.45:1.2;
   if(Math.abs(v.x)<=halfX&&Math.abs(v.z)<=halfZ){const deck=sample.vehicle[1]+(v.x>=.31&&v.x<=.71&&Math.abs(v.z)<=.34?.13:0);top=Math.max(top??-Infinity,deck);}
  }
  if(top!==null)return top;
  return groundHeight?groundHeight(lx,lz)+route.transform.origin[1]:null;
 };
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices),support,path:path.map(p=>transportWorld(p,route.transform)),segments:segments.map(s=>({a:transportWorld(s.a,route.transform),b:transportWorld(s.b,route.transform)}))};
}
