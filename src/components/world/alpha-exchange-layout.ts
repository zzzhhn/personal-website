import type { Vec3 } from './types';
import type { ExchangeAction } from './alpha-exchange-state';
import { BOARDWALK_POINTS,BOARDWALK_WIDTH } from './layout';

export const ALPHA_EXCHANGE_ORIGIN: Vec3 = [60,1.14,-55];
export const ALPHA_EXCHANGE_FOOTPRINT = { minX:47,maxX:73,minZ:-83.8,maxZ:-53.8 } as const;
export const EXCHANGE_HALL={width:26,depth:30,front:1.2,back:-28.8,height:12,clock:[0,8.05,-27.65] as Vec3,board:[0,2.65,-27.25] as Vec3,project:[0,1.4,-24.2] as Vec3,bell:[0,1.55,-1.45] as Vec3};
/** Wall-integrated colonnade leaves a 0.925 m minimum aisle outside the full-size trading posts. */
export const EXCHANGE_COLUMNS={x:12.35,baseWidth:1.25,baseDepth:1.7,lowerDrumRadius:.62,upperDrumRadius:.7,shaftTopRadius:.53,shaftBottomRadius:.62};
export const EXCHANGE_CAPE={center:[60,-69] as [number,number],radii:[18.7,22] as [number,number],beachWidth:5.5,shelfLength:12};
export function exchangeCapeDistance(x:number,z:number) {
  // Smoothly recess the north-west cove around the existing bridge channel, with no clipped map edge.
  const dx=x-60,dz=z+69,q=Math.hypot(dx/18.7,dz/22),a=Math.atan2(dz/22,dx/18.7);
  const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  const cove=12*(1-smooth(39,49,x))*smooth(-58,-47,z);
  return q<1e-8?-20:Math.hypot(dx,dz)*(1-(1.13+.07*Math.sin(3*a+.6)+.045*Math.cos(5*a-.3))/q)+cove;
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
  const slab=(id:string,outline:[number,number][],color:string,omit:number[]=[]):ExchangePlatform=>({id,outline,y:0,depth:.28,color,walls:outline.map((_,i)=>!omit.includes(i))});
  const approach=slab('approach',bridge,'#9c7a58');
  approach.walls=bridge.map((p,i)=>{const q=bridge[(i+1)%bridge.length];return !(Math.abs(p[1]-3.4)<1e-7&&Math.abs(q[1]-3.4)<1e-7)&&!(Math.abs(p[0]*seam.normal[0]+p[1]*seam.normal[1]-seam.offset)<1e-7&&Math.abs(q[0]*seam.normal[0]+q[1]*seam.normal[1]-seam.offset)<1e-7);});
  return [
    slab('floor',[[-13,-28.8],[13,-28.8],[13,-24.5],[13,-19.5],[13,1.2],[3.25,1.2],[-3.25,1.2],[-13,1.2]],'#bba98a',[2,5]),
    slab('entry-porch',[[-3.25,1.2],[3.25,1.2],[3.25,3.4],[right,3.4],[left,3.4],[-3.25,3.4]],'#bba98a',[0,3]),
    approach,
    slab('side-exit-landing',[[13,-24.5],[15.5,-24.5],[15.5,-19.5],[13,-19.5]],'#bba98a',[3]),
  ];
}
export const EXCHANGE_STATIONS: Array<{action:ExchangeAction;at:Vec3;stand:Vec3;yaw:number}> = [
  {action:'buy',at:[-6.6,0,-5.4],stand:[-6.6,0,-3.75],yaw:0},
  {action:'sell',at:[6.6,0,-5.4],stand:[6.6,0,-3.75],yaw:0},
  {action:'next',at:[-3,0,-9],stand:[-1.45,0,-9],yaw:Math.PI/2},
  {action:'reset',at:[3,0,-9],stand:[1.45,0,-9],yaw:-Math.PI/2},
];
/** Architectural solids with genuine entrance and side openings, baked into both visible and collider geometry. */
export function exchangeBoxes(): ExchangeBox[] {
  const boxes:ExchangeBox[]=[];
  const add=(id:string,center:Vec3,size:Vec3,color:string,rotation?:Vec3,surface=false)=>boxes.push({id,center,size,color,rotation,surface});
  // Thick wall piers and deep cornices enclose a high room, with two broad ground exits.
  for(const side of [-1,1]) {
    for(const z of [.2,-8.2,-17,-27.6]) {
      add(`pier-${side}-${z}`,[side*EXCHANGE_COLUMNS.x,4.9,z],[1.25,9.8,1.3],'#d5c7ad');
      add(`base-${side}-${z}`,[side*EXCHANGE_COLUMNS.x,.35,z],[EXCHANGE_COLUMNS.baseWidth,.7,EXCHANGE_COLUMNS.baseDepth],'#b8ab92');
      add(`capital-${side}-${z}`,[side*EXCHANGE_COLUMNS.x,9.45,z],[1.95,.55,1.9],'#e0d1b7');
    }
    for(const [z,length] of [[-4,6.9],[-12.6,7.2],[-22.3,8.2]]) {
      if(side===1&&z===-22.3)continue;
      add(`dado-${side}-${z}`,[side*12.6,1,z],[.7,2,length],'#baae96');
    }
    for(const [y,depth,width] of [[9.95,.5,1.7],[10.4,.4,2.1],[10.75,.25,2.4]])add(`cornice-${side}-${y}`,[side*12.35,y,-13.8],[width,depth,30.4],'#d9cbb1');
  }
  for(const side of [-1,1]) {
    add(`front-wall-${side}`,[side*7.7,3.4,.65],[9.9,6.8,.85],'#d1c2a5');
    add(`entry-pier-${side}`,[side*3.4,3.6,.45],[1.2,7.2,1.6],'#dfd1b7');
    add(`entry-plinth-${side}`,[side*3.4,.35,.45],[1.7,.7,2],'#b6a990');
    add(`back-wall-${side}`,[side*7.4,5.2,-28.3],[10.4,10.4,.9],'#d0c3aa');
  }
  add('entry-lintel',[0,6.45,.45],[8.3,1,1.8],'#e1d4bb');
  add('entry-sign',[0,5.65,1.02],[8.9,1.15,.22],'#5a4634');
  add('rear-center-wall',[0,5.2,-28.3],[4.4,10.4,.9],'#d9cbb1');
  add('gallery',[0,4.25,-26.4],[23,.3,4.2],'#927456',undefined,true);
  add('market-board',[EXCHANGE_HALL.board[0],EXCHANGE_HALL.board[1],EXCHANGE_HALL.board[2]-.25],[10.2,3,.35],'#5a4634');
  add('roof-front',[0,10.4,.2],[26,.8,1.6],'#d5c7ad');
  add('roof-back',[0,10.4,-28],[26,.8,1.6],'#d5c7ad');
  for(const z of [-2,-7,-12,-17,-22,-27])add(`roof-truss-${z}`,[0,11.6,z],[25,.32,.32],'#8d7352');
  for(const x of [-12,-6,0,6,12])add(`roof-joist-${x}`,[x,11.75,-14],[.22,.28,29],'#927856');
  add('bell-pedestal',[0,.57,-1.8],[.68,1.14,.68],'#5a4634');
  add('bell-top',[0,1.17,-1.8],[.84,.12,.8],'#b8975a');
  return boxes;
}
/** Capsule center paths, local sole coordinates. Kept open in the actual collider fixture. */
export const EXCHANGE_OUTER_ROUTES:Vec3[][]=[
  [[0,0,1],[-1.2,0,-2.5],[0,0,-3],[11.22,0,-3],[11.22,0,-22],[14.7,0,-22]],
  [[0,0,1],[-1.2,0,-2.5],[0,0,-3],[-11.22,0,-3],[-11.22,0,-13.2],[-5.5,0,-13.2],[-5.5,0,-15],[11.22,0,-15],[11.22,0,-22],[14.7,0,-22]],
];
export const EXCHANGE_WALK_PATHS: Vec3[][] = [
  [[0,0,1],[-1.2,0,-2.5],[0,0,-4.3],[0,0,-13.5],[5.5,0,-15],[5.5,0,-24.2],[0,0,-24.2]],
  [[0,0,-3],[-6.6,0,-3.75]],[[0,0,-3],[6.6,0,-3.75]],
  [[0,0,-4.3],[-1.45,0,-9]],[[0,0,-4.3],[1.45,0,-9]],
  [[5.5,0,-22],[13.7,0,-22]],
  ...EXCHANGE_OUTER_ROUTES,
];
