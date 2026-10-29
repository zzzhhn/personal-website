import type { Vec3 } from './types';
import type { ExchangeAction } from './alpha-exchange-state';
import { BOARDWALK_POINTS,BOARDWALK_WIDTH } from './layout';
import { EXCHANGE_PLAY_STATIONS, EXCHANGE_SECOND_DESK } from './alpha-exchange-play-layout';

export const ALPHA_EXCHANGE_ORIGIN: Vec3 = [60,1.14,-55];
export const ALPHA_EXCHANGE_FOOTPRINT = { minX:42,maxX:78,minZ:-95.8,maxZ:-53.8 } as const;
export const EXCHANGE_HALL={width:36,depth:42,front:1.2,back:-40.8,height:14,walkY:.45,pitY:0,galleryY:5.2,
  clock:[0,10.55,-39.8] as Vec3,board:[0,7.15,-39.65] as Vec3,project:[0,1.65,-34.6] as Vec3,
  bell:[0,1.48,-36.66] as Vec3};
/** Colonnade belongs to the perimeter; both working wings remain physically open. */
export const EXCHANGE_COLUMNS={x:17.2,baseWidth:1.3,baseDepth:1.7,lowerDrumRadius:.65,upperDrumRadius:.76,shaftTopRadius:.55,shaftBottomRadius:.65,
  bays:[.1,-8,-16,-24,-32,-40]};
export const EXCHANGE_CAPE={center:[60,-75] as [number,number],radii:[24.8,31] as [number,number],
  exitCenter:[81,-87.5] as [number,number],exitRadii:[5.8,6.2] as [number,number],beachWidth:5.5,shelfLength:12};
export function exchangeCapeDistance(x:number,z:number) {
  // Smoothly recess the north-west cove around the existing bridge channel, with no clipped map edge.
  const dx=x-EXCHANGE_CAPE.center[0],dz=z-EXCHANGE_CAPE.center[1],q=Math.hypot(dx/EXCHANGE_CAPE.radii[0],dz/EXCHANGE_CAPE.radii[1]),a=Math.atan2(dz/EXCHANGE_CAPE.radii[1],dx/EXCHANGE_CAPE.radii[0]);
  const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  const cove=12*(1-smooth(39,49,x))*smooth(-58,-47,z);
  const expanded=q<1e-8?-24:Math.hypot(dx,dz)*(1-(1.1+.025*Math.sin(3*a+.6)+.02*Math.cos(5*a-.3))/q)+cove;
  // Keep the existing north/park coast exactly from z=-48.5 onward; expansion is southward.
  const oz=z+69,oq=Math.hypot(dx/18.7,oz/22),oa=Math.atan2(oz/22,dx/18.7);
  const original=oq<1e-8?-20:Math.hypot(dx,oz)*(1-(1.13+.07*Math.sin(3*oa+.6)+.045*Math.cos(5*oa-.3))/oq)+cove;
  if(z>=-48.5)return original;
  const blend=smooth(-53.8,-48.5,z),main=expanded+(original-expanded)*blend;
  const ex=x-EXCHANGE_CAPE.exitCenter[0],ez=z-EXCHANGE_CAPE.exitCenter[1],eq=Math.hypot(ex/EXCHANGE_CAPE.exitRadii[0],ez/EXCHANGE_CAPE.exitRadii[1]);
  const exit=eq<1e-8?-5.8:Math.hypot(ex,ez)*(1-1/eq);
  return Math.min(main,exit);
}
export const ALPHA_EXCHANGE_APPROACH: Vec3[] = [[57.477545,1.14,-45.193861],[60,1.14,-55]];
export const ALPHA_EXCHANGE_APPROACH_WIDTH = 3.1;
export const exchangeWorld = (p: Vec3): Vec3 => p.map((v,i)=>v+ALPHA_EXCHANGE_ORIGIN[i]) as Vec3;
export interface ExchangeBox { id:string; center:Vec3; size:Vec3; rotation?:Vec3; color:string; surface?:boolean }
export interface ExchangePlatform {id:string;outline:[number,number][];y:number;depth:number;color:string;walls:boolean[]}
/** The park owns its whole strip up to this line; the exchange begins on the exterior side. */
export function exchangeParkSeam() {
  const p=ALPHA_EXCHANGE_APPROACH[0];let best={distance:Infinity,normal:[0,0] as [number,number],offset:0};
  for(let i=1;i<BOARDWALK_POINTS.length;i++){
    const a=BOARDWALK_POINTS[i-1],b=BOARDWALK_POINTS[i],dx=b[0]-a[0],dz=b[2]-a[2],l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/l2));
    const qx=a[0]+dx*t,qz=a[2]+dz*t,d=Math.hypot(p[0]-qx,p[2]-qz);
    if(d<best.distance){const normal:[number,number]=[(p[0]-qx)/d,(p[2]-qz)/d];best={distance:d,normal,offset:normal[0]*(qx-ALPHA_EXCHANGE_ORIGIN[0])+normal[1]*(qz-ALPHA_EXCHANGE_ORIGIN[2])+BOARDWALK_WIDTH/2};}
  }return best;
}
/** Convex clipping creates real butt joints, instead of overlapping rotated boxes. */
export function exchangePlatformSlabs():ExchangePlatform[] {
  const a=ALPHA_EXCHANGE_APPROACH[0].map((v,i)=>v-ALPHA_EXCHANGE_ORIGIN[i]),length=Math.hypot(a[0],a[2]),d=[-a[0]/length,-a[2]/length],n=[-d[1],d[0]],half=ALPHA_EXCHANGE_APPROACH_WIDTH/2;
  const point=(t:number,s:number):[number,number]=>[a[0]+d[0]*t+n[0]*s,a[2]+d[1]*t+n[1]*s];
  const clip=(poly:[number,number][],normal:number[],offset:number)=>{const out:[number,number][]=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],u=p[0]*normal[0]+p[1]*normal[1]-offset,v=q[0]*normal[0]+q[1]*normal[1]-offset;if(u>=-1e-9)out.push(p);if((u>=0)!==(v>=0)){const t=u/(u-v);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}return out;};
  const seam=exchangeParkSeam();
  const bridge=clip(clip([point(-4,-half),point(length,-half),point(length,half),point(-4,half)],[0,1],3.4),seam.normal,seam.offset);
  // Sort winding consistently before top triangulation; both clipped ends are exact shared lines.
  const area=(p:[number,number][])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0);
  if(area(bridge)<0)bridge.reverse();
  const end=bridge.filter(p=>Math.abs(p[1]-3.4)<1e-7).sort((a,b)=>a[0]-b[0]),left=end[0][0],right=end[1][0];
  const slab=(id:string,outline:[number,number][],color:string,omit:number[]=[],y=0):ExchangePlatform=>({id,outline,y,depth:.28,color,walls:outline.map((_,i)=>!omit.includes(i))});
  const rect=(id:string,x0:number,x1:number,z0:number,z1:number,y:number,color='#bba98a',omit:number[]=[])=>slab(id,[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],color,omit,y);
  const approach=slab('approach',bridge,'#9c7a58');
  approach.walls=bridge.map((p,i)=>{const q=bridge[(i+1)%bridge.length];return !(Math.abs(p[1]-3.4)<1e-7&&Math.abs(q[1]-3.4)<1e-7)&&!(Math.abs(p[0]*seam.normal[0]+p[1]*seam.normal[1]-seam.offset)<1e-7&&Math.abs(q[0]*seam.normal[0]+q[1]*seam.normal[1]-seam.offset)<1e-7);});
  return [
    rect('vestibule',-18,18,-5,1.2,0,'#bba98a',[0,2]),
    ...([[-9,-3,'west'],[3,9,'east']] as const).flatMap(([x0,x1,side])=>[
      rect(`entry-step-1-${side}`,x0,x1,-5.65,-5,.15,'#d4c4a5'),
      rect(`entry-step-2-${side}`,x0,x1,-6.3,-5.65,.3,'#d4c4a5'),
      rect(`entry-step-3-${side}`,x0,x1,-7,-6.3,.45,'#d4c4a5',[0]),
    ]),
    rect('south-walk',-18,18,-11,-7,.45,'#bba98a',[0,2]),
    rect('archive-wing',-18,-8.8,-28,-11,.45,'#a58b65',[1,2]),
    rect('clearing-wing',8.8,18,-28,-11,.45,'#a58b65',[2,3]),
    rect('rear-walk',-18,18,-40.8,-28,.45,'#bba98a',[2]),
    slab('pit-floor',[[-8.8,-28],[8.8,-28],[8.8,-11],[4,-11],[4,-12.8],[-4,-12.8],[-4,-11],[-8.8,-11]],'#8e7453',[],0),
    ...([[-4,-2,'west'],[2,4,'east']] as const).flatMap(([x0,x1,side])=>[
      rect(`pit-step-1-${side}`,x0,x1,-11.6,-11,.3,'#c9b99a'),
      rect(`pit-step-2-${side}`,x0,x1,-12.2,-11.6,.15,'#c9b99a'),
      rect(`pit-step-3-${side}`,x0,x1,-12.8,-12.2,0,'#c9b99a'),
    ]),
    slab('entry-porch',[[-3.25,1.2],[3.25,1.2],[3.25,3.4],[right,3.4],[left,3.4],[-3.25,3.4]],'#bba98a',[0,3]),
    approach,
    rect('side-exit-landing',18,20.8,-35,-30,.45,'#bba98a',[3]),
    rect('side-exit-ground',23.5,24.5,-35,-30,0,'#bba98a',[3]),
    rect('gallery-rear',-17.4,17.4,-40,-35.8,5.2,'#927456',[2]),
    rect('gallery-west',-13.4,-10,-35.8,-17,5.2,'#927456',[0]),
    rect('gallery-east',10,13.4,-35.8,-17,5.2,'#927456',[0]),
    rect('gallery-west-join',-17,-13.4,-31.6,-30,5.2,'#927456',[1,2]),
    rect('gallery-east-join',13.4,17,-31.6,-30,5.2,'#927456',[2,3]),
  ];
}
export const EXCHANGE_STATIONS: Array<{action:ExchangeAction;at:Vec3;stand:Vec3;yaw:number}> = [
  {action:'buy',at:[-1.35,0,-16.15],stand:[...EXCHANGE_PLAY_STATIONS.desk.stand],yaw:0},
  {action:'sell',at:[1.35,0,-16.15],stand:[...EXCHANGE_SECOND_DESK.stand],yaw:0},
  {action:'next',at:[0,.45,-37.16],stand:[...EXCHANGE_PLAY_STATIONS.bell.stand],yaw:0},
  {action:'reset',at:[-11.7,.45,-19.31],stand:[...EXCHANGE_PLAY_STATIONS.archive.stand],yaw:0},
];
/** Architectural solids with genuine entrance and side openings, baked into both visible and collider geometry. */
export function exchangeBoxes(): ExchangeBox[] {
  const boxes:ExchangeBox[]=[];
  const add=(id:string,center:Vec3,size:Vec3,color:string,rotation?:Vec3,surface=false)=>boxes.push({id,center,size,color,rotation,surface});
  // Tall, thick perimeter bays; the east rear opening is a genuine second exit.
  for(const side of [-1,1]) {
    for(const z of EXCHANGE_COLUMNS.bays) {
      if(side===1&&z===-32)continue;
      add(`pier-${side}-${z}`,[side*EXCHANGE_COLUMNS.x,6.5,z],[1.3,12.1,1.3],'#d5c7ad');
      add(`base-${side}-${z}`,[side*EXCHANGE_COLUMNS.x,.8,z],[EXCHANGE_COLUMNS.baseWidth,.7,EXCHANGE_COLUMNS.baseDepth],'#b8ab92');
      add(`capital-${side}-${z}`,[side*EXCHANGE_COLUMNS.x,12.55,z],[2.05,.55,1.9],'#e0d1b7');
    }
    for(const [z,length] of [[-4,6.7],[-12,6.7],[-20,6.7],[-27,4.7],[-37.5,4.3]]) {
      add(`dado-${side}-${z}`,[side*17.6,1.3,z],[.8,1.7,length],'#baae96');
    }
    for(const [y,depth,width] of [[12.9,.5,1.7],[13.35,.4,2.1],[13.75,.3,2.4]])add(`cornice-${side}-${y}`,[side*17.2,y,-19.8],[width,depth,42],'#d9cbb1');
  }
  for(const side of [-1,1]) {
    add(`front-wall-${side}`,[side*10.5,3.4,.65],[14,6.8,.85],'#d1c2a5');
    add(`entry-pier-${side}`,[side*3.4,3.6,.45],[1.2,7.2,1.6],'#dfd1b7');
    add(`entry-plinth-${side}`,[side*3.4,.35,.45],[1.7,.7,2],'#b6a990');
    add(`back-wall-${side}`,[side*9,6.5,-40.3],[18,12.1,1],'#d0c3aa');
  }
  add('entry-lintel',[0,6.45,.45],[8.3,1,1.8],'#e1d4bb');
  add('entry-sign',[0,5.65,1.02],[8.9,1.15,.22],'#5a4634');
  add('market-board',[EXCHANGE_HALL.board[0],EXCHANGE_HALL.board[1],EXCHANGE_HALL.board[2]-.25],[10.2,3,.35],'#5a4634');
  add('roof-front',[0,12.95,.2],[36,.7,1.6],'#d5c7ad');
  add('roof-back',[0,12.95,-40],[36,.7,1.6],'#d5c7ad');
  // Open coffer grid rather than a solid camera-trapping roof.
  for(const z of [-2,-9,-16,-23,-30,-37])add(`coffer-cross-${z}`,[0,13.35,z],[34.4,.38,.4],'#70543b');
  for(const x of [-14,-7,0,7,14])add(`coffer-long-${x}`,[x,13.55,-19.5],[.32,.35,38],'#816245');
  add('bell-pedestal',[0,.92,-37.16],[1.05,.94,.9],'#5a4634');
  add('bell-top',[0,1.44,-37.16],[1.35,.12,1.05],'#b8975a');
  return boxes;
}
/** Capsule center paths, local sole coordinates. Kept open in the actual collider fixture. */
export const EXCHANGE_OUTER_ROUTES:Vec3[][]=[
  [[0,0,1],[0,0,-3],[11.9,0,-3],[11.9,0,-5],[11.9,.45,-7],[11.9,.45,-15],[9.4,.45,-15],[9.4,.45,-29],[15,.45,-29],[15,.45,-32.5],[20.8,.45,-32.5],[23.5,0,-32.5],[24.2,0,-32.5]],
  [[0,0,1],[0,0,-3],[-11.9,0,-3],[-11.9,0,-5],[-11.9,.45,-7],[-11.9,.45,-16],[-9.4,.45,-16],[-9.4,.45,-29],[0,.45,-31],[15,.45,-31],[15,.45,-32.5],[20.8,.45,-32.5],[23.5,0,-32.5],[24.2,0,-32.5]],
];
/** Native route from the dealing position around the island to the rear ramp and bell.
 * The pit-to-walk rise is continuous; it does not require a jump or a return to the entrance. */
export const EXCHANGE_PIT_REAR_ROUTE:Vec3[]=[
  [...EXCHANGE_PLAY_STATIONS.desk.stand],[-1.35,0,-14.4],[-6,0,-14.4],[-6,0,-25.6],
  [-1.35,0,-25.6],[-1.35,.45,-28],[0,.45,-31],[...EXCHANGE_PLAY_STATIONS.bell.stand],
];
/** The central public approach. Only the final two points merge into the fixed desk
 * position; the preceding corridor may be walked at either +/-0.8 m side margin. */
export const EXCHANGE_ENTRY_DESK_ROUTE:Vec3[]=[
  [0,0,2.4],[0,0,-5],[0,.45,-7],[0,.45,-11],[0,0,-12.8],[0,0,-14.4],
  [-1.35,0,-14.4],[...EXCHANGE_PLAY_STATIONS.desk.stand],
];
export const EXCHANGE_WALK_PATHS: Vec3[][] = [
  EXCHANGE_ENTRY_DESK_ROUTE,
  [[0,.45,-9],[-7.6,.45,-9],[-7.6,.45,-11],[-7.6,0,-17],[-6,0,-17],[-6,0,-14.98],[...EXCHANGE_PLAY_STATIONS.desk.stand],[-1.35,0,-14.4],[1.35,0,-14.4],[...EXCHANGE_SECOND_DESK.stand]],
  [[-9.4,.45,-16],[-11.7,.45,-16],[...EXCHANGE_PLAY_STATIONS.archive.stand]],
  [[9.4,.45,-23],[11.7,.45,-23],[...EXCHANGE_PLAY_STATIONS.clearing.stand]],
  [[0,.45,-31],[...EXCHANGE_PLAY_STATIONS.bell.stand]],
  [[-11.7,5.2,-37.6],[-3,5.2,-37.6],[...EXCHANGE_PLAY_STATIONS.review.stand],[-3,5.2,-37.6],[11.7,5.2,-37.6]],
  EXCHANGE_PIT_REAR_ROUTE,
  [[-11.9,.45,-7.25],[-15.7,.45,-7.25],[-15.7,.45,-8],[-15.7,5.2,-30],[-15.7,5.2,-30.8],[-11.7,5.2,-30.8],[-11.7,5.2,-37.6],[11.7,5.2,-37.6],[11.7,5.2,-18]],
  ...EXCHANGE_OUTER_ROUTES,
];
