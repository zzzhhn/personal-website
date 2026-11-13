import { Color,Vector3 } from 'three';
import type { TransportRoute } from '../../rides/ride-contract';
import type { Vec3 } from '../../types';
import { transportCurve,transportWorld,tuple } from '../../rides/transport-route.ts';
export interface SupportBeam {a:Vec3;b:Vec3}
export interface GuideRoller {center:Vec3;axis:Vec3;radius:number;halfWidth:number}
/** Engineering data shared by rendered deck/structure and clearance fixtures. */
export function transportInfrastructure(route:TransportRoute,groundHeight?:(x:number,z:number)=>number){
 const curve=transportCurve(route),count=Math.ceil(curve.getLength()/1.4),p:number[]=[],ix:number[]=[],colors:number[]=[],supports:SupportBeam[]=[],rollers:GuideRoller[]=[];
 const width=route.kind==='sled'?.73:.04,wood=new Color('#ad8050'),snow=new Color('#d7e2dc');let previousBent:Vec3[]|null=null;
 const world=(v:Vector3)=>transportWorld(tuple(v),route.transform);
 for(let i=0;i<=count;i++){
  const t=i/count,v=curve.getPointAt(t),forward=curve.getTangentAt(t),side=new Vector3(-forward.z,0,forward.x).normalize(),up=new Vector3().crossVectors(side,forward).normalize();
  const yOffset=route.kind==='cable'?3.5:route.kind==='sled'?-.16:0;
  for(const sign of [-1,1]){const point=v.clone().addScaledVector(side,width*sign);point.y+=yOffset;p.push(...world(point));const color=wood.clone().lerp(snow,route.kind==='sled'?Math.max(0,Math.min(1,(v.y-(route.snowLine??64))/3)):0);colors.push(color.r,color.g,color.b);}
  // Viewed from above: forward x across gives +Y with this left/right ordering.
  if(i<count){const a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}
  if(route.kind==='ferry'||i===0||i===count||i%(route.kind==='cable'?Math.max(1,Math.round(count/4)):7)!==0)continue;
  if(route.kind==='cable'){
   const tops:Vec3[]=[];
   for(const sign of [-1,1]){const x=v.clone().addScaledVector(side,sign*2.8),ground=groundHeight?.(x.x,x.z)??Math.min(...route.path.map(p=>p[1]))-.3;const a=[x.x,ground,x.z] as Vec3,b=[x.x,v.y+4.6,x.z] as Vec3;supports.push({a:transportWorld(a,route.transform),b:transportWorld(b,route.transform)});tops.push(transportWorld(b,route.transform));}
   supports.push({a:tops[0],b:tops[1]});
   const wire=v.clone().add(new Vector3(0,3.5,0)),center=wire.clone().addScaledVector(up,-.235),arm=center.clone().addScaledVector(side,-.4),top=v.clone().addScaledVector(side,-.4).add(new Vector3(0,4.6,0));
   supports.push({a:world(top),b:world(arm)},{a:world(arm),b:world(center)});
   const axis=side.clone().applyAxisAngle(new Vector3(0,1,0),route.transform.yaw);
   rollers.push({center:world(center),axis:tuple(axis),radius:.2,halfWidth:.02});
  }else{
   const bases:Vec3[]=[],tops:Vec3[]=[];
   for(const sign of [-1,1]){const x=v.clone().addScaledVector(side,sign*.9),ground=groundHeight?.(x.x,x.z)??-4;const a=transportWorld([x.x,ground,x.z],route.transform),b=transportWorld([x.x,v.y-.3,x.z],route.transform);supports.push({a,b});bases.push(a);tops.push(b);}
   supports.push({a:tops[0],b:tops[1]});
   if(previousBent)for(let k=0;k<2;k++){const bottom=[...bases[k]] as Vec3;bottom[1]=Math.max(bottom[1],tops[k][1]-4);supports.push({a:previousBent[k],b:bottom});}
   previousBent=tops;
  }
 }
 return {vertices:new Float32Array(p),indices:new Uint32Array(ix),colors:new Float32Array(colors),curve,supports,rollers};
}
