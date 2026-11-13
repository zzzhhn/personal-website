import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../types';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from '../actor-physics.ts';
/** The real standing capsule follows all authored foot-route segments before physics is disabled.
 * Flat query skin is 12mm. A measured sphere/plane tangent correction is added per slope. */
export function rideFootRouteClear(world:World,rapier:Pick<typeof Rapier,'Capsule'>,body:RigidBody,path:Vec3[]){
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],grade=Math.abs(b[1]-a[1])/Math.max(.001,Math.hypot(b[0]-a[0],b[2]-a[2])),lift=.012+PLAYER_RADIUS*(Math.sqrt(1+grade*grade)-1),from={x:a[0],y:a[1]+PLAYER_RADIUS+PLAYER_HALF_HEIGHT+lift,z:a[2]},delta={x:b[0]-a[0],y:b[1]-a[1],z:b[2]-a[2]};
  const hit=world.castShape(from,{x:0,y:0,z:0,w:1},delta,new rapier.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),.004,1,false,undefined,undefined,undefined,body,c=>!c.isSensor());
  if(hit)return false;
 }
 return true;
}
