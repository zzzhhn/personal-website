import { Vector3 } from 'three';
import { ALPHA_CABLE_PATH, ALPHA_SLED_PATH, ALPHA_ORIGIN, ALPHA_YAW, ALPHA_SOCKETS, ALPHA_FERRY_WATER_PATH, ALPHA_MAINLAND_DOCK, alphaWorld } from '../alpha-layout';
import type { Vec3 } from '../../types';
import type { TransportRoute, TransportTerminal } from '../../rides/ride-contract';
import { transportCurve } from '../../rides/transport-route';
const transform={origin:ALPHA_ORIGIN,yaw:ALPHA_YAW};
function terminal(id:string,p:Vec3,approach:Vec3[],exit:Vec3,kind:TransportRoute['kind'],path:Vec3[],u:number):TransportTerminal {
  const tangent=transportCurve({path,duration:1,id} as TransportRoute).getTangentAt(u);tangent.y=0;tangent.normalize();
  const yaw=Math.atan2(-tangent.z,tangent.x);
  // Interior standing point is ahead of the seat. Physical floor and doorway share this path.
  const inside:Vec3=[p[0]+tangent.x*1.0,p[1],p[2]+tangent.z*1.0];
  const side=new Vector3(0,0,-1).applyAxisAngle(new Vector3(0,1,0),yaw);
  const door:Vec3=[p[0]+tangent.x*1.0+side.x*2.1,p[1],p[2]+tangent.z*1.0+side.z*2.1];
  return {id,vehicle:p,yaw,boarding:[...approach.slice(0,-1),door,inside],gangwayStart:Math.max(0,approach.length-2),safeExit:exit,seat:[0,.48,0],clearance:kind==='ferry'?[5,4,8]:[3,3,4]};
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
/** Provisional mainland route remains opt-in until scene's shoreline survey is complete. */
export function alphaFerryRoute():TransportRoute {
 const path=ALPHA_FERRY_WATER_PATH.map(p=>[p[0],.8,p[2]] as Vec3),dock=ALPHA_SOCKETS.dock;
 return {id:'alpha-ferry',kind:'ferry',transform:{origin:[0,0,0],yaw:0},path,duration:64,terminals:[
 terminal('mainland',path[0],[ALPHA_MAINLAND_DOCK.safeExit[0],ALPHA_MAINLAND_DOCK.ground],ALPHA_MAINLAND_DOCK.safeExit[0],'ferry',path,0),
 terminal('island',path.at(-1)!,dock.approach.slice(-2).map(alphaWorld),alphaWorld(dock.safeExit[0]),'ferry',path,1)]};
}
