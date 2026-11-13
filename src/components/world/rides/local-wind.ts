import type { Vec3 } from '../types';
export const localWind:{center:Vec3;radius:number;strength:0|1|2;direction:[number,number]}={center:[0,0,0],radius:0,strength:0,direction:[0,1]};
/** Direction is wind velocity in world X/Z. Only walking against it loses speed. */
export function localWindPace(position:Vec3,heading:[number,number],running:boolean){
 if(running||!localWind.strength||localWind.radius<=0)return 1;
 const d=Math.hypot(position[0]-localWind.center[0],position[2]-localWind.center[2]);if(d>=localWind.radius)return 1;
 const wind=localWind.direction,n=Math.hypot(...wind);if(!n)return 1;
 const against=Math.max(0,-(heading[0]*wind[0]+heading[1]*wind[1])/n),edge=Math.min(1,(localWind.radius-d)/3);
 return 1-against*edge*(localWind.strength===2?.48:.24);
}
