import type { Vec3 } from './types';
import type { ExchangeAction } from './alpha-exchange-state';

export const ALPHA_EXCHANGE_ORIGIN: Vec3 = [60,1.14,-55];
export const ALPHA_EXCHANGE_FOOTPRINT = { minX:51.4,maxX:68.6,minZ:-71.5,maxZ:-53 } as const;
export const ALPHA_EXCHANGE_APPROACH: Vec3[] = [[57.477545,1.14,-45.193861],[60,1.14,-55]];
export const ALPHA_EXCHANGE_APPROACH_WIDTH = 3.1;
export const exchangeWorld = (p: Vec3): Vec3 => p.map((v,i)=>v+ALPHA_EXCHANGE_ORIGIN[i]) as Vec3;
export interface ExchangeBox { id:string; center:Vec3; size:Vec3; rotation?:Vec3; color:string; surface?:boolean }
export const EXCHANGE_STATIONS: Array<{action:ExchangeAction;at:Vec3;stand:Vec3}> = [
  {action:'buy',at:[-5.3,0,-5.8],stand:[-4.25,0,-4.95]},
  {action:'sell',at:[5.3,0,-5.8],stand:[4.25,0,-4.95]},
  {action:'next',at:[-5.3,0,-10.6],stand:[-4.25,0,-9.75]},
  {action:'reset',at:[5.3,0,-10.6],stand:[4.25,0,-9.75]},
];
/** A shared physical/visual description: the narrowest deliberate walk gap is over 1.4 m. */
export function exchangeBoxes(): ExchangeBox[] {
  const boxes:ExchangeBox[]=[];
  const add=(id:string,center:Vec3,size:Vec3,color:string,rotation?:Vec3,surface=false)=>boxes.push({id,center,size,color,rotation,surface});
  add('floor',[0,-.14,-7.25],[17.2,.28,18.5],'#9b8263',undefined,true);
  const a=ALPHA_EXCHANGE_APPROACH[0].map((v,i)=>v-ALPHA_EXCHANGE_ORIGIN[i]) as Vec3;
  const dx=-a[0],dz=-a[2],length=Math.hypot(dx,dz);
  add('approach',[a[0]/2,-.14,a[2]/2],[ALPHA_EXCHANGE_APPROACH_WIDTH,.28,length+.15],'#9c7a58',[0,Math.atan2(dx,dz),0],true);
  for(const z of [0,-7.2,-14.4])for(const side of [-1,1]){
    add(`column-${side}-${z}`,[side*7.45,1.8,z],[.48,3.6,.56],'#d7ccb9');
    add(`plinth-${side}-${z}`,[side*7.45,.18,z],[.8,.36,.86],'#9d9586');
    add(`capital-${side}-${z}`,[side*7.45,3.54,z],[.76,.25,.82],'#b8975a');
  }
  for(const z of [0,-7.2,-14.4])for(let i=0;i<18;i++){
    const angle=i*Math.PI/18,next=(i+1)*Math.PI/18;
    const p=[7.45*Math.cos(angle),3.6+2.5*Math.sin(angle)],q=[7.45*Math.cos(next),3.6+2.5*Math.sin(next)];
    const vx=q[0]-p[0],vy=q[1]-p[1];
    add(`arch-${z}-${i}`,[(p[0]+q[0])/2,(p[1]+q[1])/2,z],[.3,Math.hypot(vx,vy)+.04,.46],'#d7ccb9',[0,0,-Math.atan2(vx,vy)]);
  }
  for(const x of [-7.45,7.45])add(`cornice-${x}`,[x,3.63,-7.2],[.3,.35,15.1],'#b8975a');
  for(const station of EXCHANGE_STATIONS){const [x,,z]=station.at,id=station.action;
    add(`${id}-desk`,[x,.54,z],[1.7,1.08,.74],'#5a4634');
    add(`${id}-counter`,[x,1.11,z],[1.88,.1,.9],'#b8975a');
    add(`${id}-screen`,[x,1.5,z-.05],[1.45,.64,.14],'#253e39');
    add(`${id}-stool`,[x,.24,z+1.3],[.58,.48,.58],'#647261');
  }
  // Two large openings in the pit rail align with the entrance and rear circulation.
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,next=(i+1)*Math.PI/8,mid=(angle+next)/2;
    if(Math.abs(Math.cos(mid))<.4)continue;
    const p=[2.9*Math.cos(angle),-8.1+2.9*Math.sin(angle)],q=[2.9*Math.cos(next),-8.1+2.9*Math.sin(next)];
    add(`pit-rail-${i}`,[(p[0]+q[0])/2,.84,(p[1]+q[1])/2],[Math.hypot(q[0]-p[0],q[1]-p[1])+.03,.13,.13],'#b8975a',[0,-Math.atan2(q[1]-p[1],q[0]-p[0]),0]);
    add(`pit-post-${i}`,[p[0],.43,p[1]],[.09,.86,.09],'#5a4634');
  }
  add('market-board',[0,3.05,-14.28],[10.2,3.05,.3],'#5a4634');
  add('entry-sign',[0,4.5,.12],[8.9,1.15,.18],'#5a4634');
  add('bell-pedestal',[0,.57,-1.8],[.68,1.14,.68],'#5a4634');
  add('bell-top',[0,1.17,-1.8],[.84,.12,.8],'#b8975a');
  return boxes;
}
/** Capsule center paths, local sole coordinates. Kept open in the actual collider fixture. */
export const EXCHANGE_WALK_PATHS: Vec3[][] = [
  [[0,0,1.8],[-1.2,0,-2.5],[0,0,-4.3],[0,0,-10.7],[0,0,-12.3]],
  [[0,0,-3.6],[-3.8,0,-3.6],[-4.25,0,-4.95],[-3.8,0,-4.95],[-3.8,0,-8.8],[-4.25,0,-9.75]],
  [[0,0,-3.6],[3.8,0,-3.6],[4.25,0,-4.95],[3.8,0,-4.95],[3.8,0,-8.8],[4.25,0,-9.75]],
];
