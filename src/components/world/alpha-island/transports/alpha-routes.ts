import dimensions from './transport-dimensions.json' with {type:'json'};
import { transportBoardingGeometry } from '../../rides/transport-boarding';
import { alphaHeight } from '../alpha-terrain';
import { Vector3 } from 'three';
import { ALPHA_CABLE_PATH, ALPHA_SLED_PATH, ALPHA_ORIGIN, ALPHA_YAW, ALPHA_SOCKETS, ALPHA_FERRY_WATER_PATH, ALPHA_MAINLAND_DOCK, ALPHA_MAINLAND_PIER_POLYGON, alphaWorld } from '../alpha-layout';
import type { Vec3 } from '../../types';
import type { TransportRoute, TransportTerminal } from '../../rides/ride-contract';
import { transportCurve } from '../../rides/transport-route';
const transform={origin:ALPHA_ORIGIN,yaw:ALPHA_YAW};
function terminal(id:string,p:Vec3,approach:Vec3[],exit:Vec3,kind:TransportRoute['kind'],path:Vec3[],u:number):TransportTerminal {
  const tangent=transportCurve({path,duration:1,id} as TransportRoute).getTangentAt(u);tangent.y=0;tangent.normalize();
  const yaw=Math.atan2(-tangent.z,tangent.x);
  // Interior standing point is ahead of the seat. Physical floor and doorway share this path.
  const footY=p[1]+(kind==='sled'?dimensions.footrestHeight:0);
  const standingForward=1.0;
  const inside:Vec3=[p[0]+tangent.x*standingForward,footY,p[2]+tangent.z*standingForward];
  const side=new Vector3(0,0,kind==='cable'?1:-1).applyAxisAngle(new Vector3(0,1,0),yaw);
  const stepHeight=dimensions.sledFootDecks[1].center[1]+dimensions.sledFootDecks[1].size[1]/2;
  const door:Vec3=[p[0]+tangent.x*standingForward+side.x*2.1,kind==='sled'?p[1]+stepHeight:footY,p[2]+tangent.z*standingForward+side.z*2.1];
  const outside:Vec3=[p[0]+tangent.x*standingForward+side.x*3.2,footY,p[2]+tangent.z*standingForward+side.z*3.2];
  const apron=kind==='sled'&&u===1?[...approach,exit]:approach.slice(0,-1),lastApron=apron.at(-1)!,rampDirection=new Vector3(...door).sub(new Vector3(...lastApron));rampDirection.y=0;rampDirection.normalize();
  const landing:Vec3[]=kind==='sled'?[[door[0]-rampDirection.x,door[1],door[2]-rampDirection.z]]:[],stepPoints:Vec3[]=kind==='sled'?[.8,.34,.15].map(offset=>[p[0]+tangent.x+side.x*offset,p[1]+stepHeight,p[2]+tangent.z+side.z*offset]):[],boarding=[...apron,...landing,door,...stepPoints,inside];
  let egress=[inside,door,outside,exit];
  if(kind==='sled'){
   // Upper: return behind the backrest along the known approach. Lower: the scene's
   // last approach is already its safe exit, so use that junction before the ramp.
   const exitAt=apron.findLastIndex(p=>Math.hypot(...p.map((v,i)=>v-exit[i]))<.01);
   egress=[inside,...stepPoints.slice().reverse(),door,...landing.slice().reverse(),...(exitAt>=0?apron.slice(exitAt):apron).slice().reverse()];
   if(exitAt<0){const a=apron[0],b=door,dx=a[0]-b[0],dz=a[2]-b[2],n=Math.hypot(dx,dz);egress.push([a[0]+dx/n,a[1],a[2]+dz/n],exit);}
  }
  return {id,vehicle:p,yaw,boarding,gangwayStart:kind==='sled'?Math.max(0,apron.length-1):Math.max(0,approach.length-2),gangwayEnd:kind==='sled'?apron.length+landing.length+1:undefined,safeExit:exit,egress,seat:[0,.48,0],clearance:kind==='ferry'?[5,4,8]:[3,kind==='cable'?dimensions.cable.clearanceHeight:3,4]};
}
const cablePath=ALPHA_CABLE_PATH.map(p=>[...p] as Vec3),sledPath=ALPHA_SLED_PATH.map(p=>[p[0],p[1]+.16,p[2]] as Vec3);
export const ALPHA_TRANSPORT_ROUTES: TransportRoute[]=[
 {id:'alpha-cable',kind:'cable',transform,path:cablePath,duration:46,terminals:[
  terminal('cable-lower',cablePath[0],ALPHA_SOCKETS.cableLower.approach,ALPHA_SOCKETS.cableLower.safeExit[0],'cable',cablePath,0),
  terminal('cable-upper',cablePath.at(-1)!,ALPHA_SOCKETS.cableUpper.approach,ALPHA_SOCKETS.cableUpper.safeExit[0],'cable',cablePath,1)]},
 {id:'alpha-sled',kind:'sled',transform,path:sledPath,duration:38,snowLine:64,terminals:[
  terminal('sled-upper',sledPath[0],ALPHA_SOCKETS.sledUpper.approach,ALPHA_SOCKETS.sledUpper.safeExit[0],'sled',sledPath,0),
  terminal('sled-lower',sledPath.at(-1)!,ALPHA_SOCKETS.sledLower.approach,ALPHA_SOCKETS.sledLower.safeExit[0],'sled',sledPath,1)]},
];
/** Surveyed r4 berths remain an explicit fixture until ordinary route acceptance. */
export function alphaFerryRoute():TransportRoute {
 const path=ALPHA_FERRY_WATER_PATH.map(p=>[p[0],.8,p[2]] as Vec3),dock=ALPHA_SOCKETS.dock;
 const polygon=([-1,1].flatMap(x=>[-1,1].map(z=>{const v=new Vector3(x*dock.size[0]/2,0,z*dock.size[2]/2).applyAxisAngle(new Vector3(0,1,0),dock.yaw);return alphaWorld([dock.ground[0]+v.x,dock.ground[1],dock.ground[2]+v.z]);})));
 // Sort the four source rectangle corners into their perimeter, never invent a second berth.
 const center=alphaWorld(dock.ground);polygon.sort((a,b)=>Math.atan2(a[2]-center[2],a[0]-center[0])-Math.atan2(b[2]-center[2],b[0]-center[0]));
 const route:TransportRoute={id:'alpha-ferry',kind:'ferry',transform:{origin:[0,0,0],yaw:0},path,duration:64,terminals:[
 terminal('mainland',path[0],[ALPHA_MAINLAND_DOCK.safeExit[0],ALPHA_MAINLAND_DOCK.ground],ALPHA_MAINLAND_DOCK.safeExit[0],'ferry',path,0),
 terminal('island',path.at(-1)!,dock.approach.slice(-2).map(alphaWorld),alphaWorld(dock.safeExit[0]),'ferry',path,1)]};
 for(const index of [0,1] as const){
  const t=route.terminals[index],q=new Vector3(1,0,0).applyAxisAngle(new Vector3(0,1,0),t.yaw),side=new Vector3(0,0,-1).applyAxisAngle(new Vector3(0,1,0),t.yaw);
  const inside:Vec3=[t.vehicle[0]+q.x,.8,t.vehicle[2]+q.z],door:Vec3=[inside[0]+side.x*1.45,.8,inside[2]+side.z*1.45],outline=index===0?ALPHA_MAINLAND_PIER_POLYGON:polygon;
  let edge:Vec3=[...outline[0]],distance=Infinity;
  for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[2]-a[2],u=Math.max(0,Math.min(1,((door[0]-a[0])*dx+(door[2]-a[2])*dz)/(dx*dx+dz*dz))),p:Vec3=[a[0]+dx*u,a[1],a[2]+dz*u],d=Math.hypot(p[0]-door[0],p[2]-door[2]);if(d<distance){distance=d;edge=p;}}
  const bridge:Vec3[]=[];const count=Math.max(2,Math.ceil(distance/.4));
  for(let i=0;i<=count;i++){const u=i/count,x=door[0]+(edge[0]-door[0])*u,z=door[2]+(edge[2]-door[2])*u,y=.8+(edge[1]-.8)*u,ground=index===1?alphaHeight(x-ALPHA_ORIGIN[0],z-ALPHA_ORIGIN[2]):-Infinity;bridge.push([x,Math.max(y,Math.min(edge[1],ground+.006)),z]);}
  const simplified:Vec3[]=[];for(const point of bridge){simplified.push(point);while(simplified.length>=3){const n=simplified.length,a=new Vector3(...simplified[n-3]),b=new Vector3(...simplified[n-2]),c=new Vector3(...simplified[n-1]);if(b.clone().sub(a).cross(c.clone().sub(b)).lengthSq()>1e-12)break;simplified.splice(n-2,1);}}
  t.boarding=[t.safeExit,...simplified.slice().reverse(),inside];t.gangwayStart=0;t.egress=[inside,...simplified,t.safeExit];
 }
 return route;
}

export function alphaTransportBoardingFootprints(includeFerry=false){return (includeFerry?[...ALPHA_TRANSPORT_ROUTES,alphaFerryRoute()]:ALPHA_TRANSPORT_ROUTES).flatMap(route=>route.terminals.flatMap((t,index)=>{const data=transportBoardingGeometry(route,index as 0|1);return data.segments.map(s=>({...s,halfWidth:.65}));}));}
