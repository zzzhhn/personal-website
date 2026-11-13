import { ALPHA_MAIN_PATH, ALPHA_BYPASS_PATH, ALPHA_SOCKETS, ALPHA_CABLE_PATH, ALPHA_SLED_PATH, alphaWorld } from './alpha-layout.ts';
import type { Vec3 } from '../types';
const clamp = (v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const alphaNoise=(x:number,z:number)=>Math.sin(x*.17+Math.sin(z*.11))*Math.cos(z*.14-x*.03);
export function nearestAlphaSegment(x:number,z:number,path:readonly Vec3[]) {
 let distance=Infinity,y=0,index=0,t=0;
 for(let i=1;i<path.length;i++) {const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],q=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz));
 const d=Math.hypot(x-a[0]-dx*q,z-a[2]-dz*q);if(d<distance){distance=d;y=a[1]+(b[1]-a[1])*q;index=i-1;t=q;}}
 return {distance,y,index,t};
}
/** Coast contracts toward old Club; grid footprint is not the coastline. */
export function alphaShoreRadius(a:number) {return 1+.055*Math.sin(a*3+.5)+.035*Math.sin(a*7-1);}
export function alphaRadial(x:number,z:number) {const a=Math.atan2(z/107,x/88);return Math.hypot(x/88,z/107)/alphaShoreRadius(a);}
export function alphaBaseHeight(x:number,z:number) {
 const r=alphaRadial(x,z),land=1-smooth(.77,1.02,r);
 const peak=Math.exp(-((x-3)**2/2300+(z-30)**2/3100));
 const ridge=Math.exp(-((x-7)**2/4500+(z+27)**2/2300));
 return -4+land*(7+65*peak+20*ridge+alphaNoise(x,z)*2.3);
}
export function alphaHeight(x:number,z:number) {
 let h=alphaBaseHeight(x,z);
 const p=nearestAlphaSegment(x,z,ALPHA_MAIN_PATH),b=nearestAlphaSegment(x,z,ALPHA_BYPASS_PATH);
 const n=p.distance<b.distance?p:b;
 const blend=1-smooth(2.3,6,n.distance);h=h*(1-blend)+n.y*blend;
 // Broad dry terminal aprons. Same geometric extent supports safe-exit rings.
 for(const s of Object.values(ALPHA_SOCKETS)) {
   const dx=x-s.ground[0],dz=z-s.ground[2],c=Math.cos(s.yaw),sn=Math.sin(s.yaw);
   const rx=c*dx-sn*dz,rz=sn*dx+c*dz;
   const d=Math.hypot(Math.max(0,Math.abs(rx)-s.size[0]/2-1.5),Math.max(0,Math.abs(rz)-s.size[2]/2-1.5));
   const w=1-smooth(0,3,d);h=h*(1-w)+s.ground[1]*w;
 }
 for(const [cx,cy,cz,r] of [[-64,3.8,-40,6],[-42,18,-29,8],[19,38,-42,9],[2,83,39,10],[-7,83,43,7]]) {
   const w=1-smooth(r,r+3,Math.hypot(x-cx,z-cz));h=h*(1-w)+cy*w;
 }
 const cable=nearestAlphaSegment(x,z,ALPHA_CABLE_PATH);
 if(cable.index>0&&cable.index<4&&cable.distance<7) {
   const terminal=Math.min(Math.hypot(x-35,z+39),Math.hypot(x-29,z-22));
   const w=(1-smooth(5,8,cable.distance))*smooth(5,14,terminal);h=Math.min(h,h*(1-w)+(cable.y-7)*w);
 }
 const sled=nearestAlphaSegment(x,z,ALPHA_SLED_PATH);
 if(sled.distance<5&&sled.index>0&&sled.index<ALPHA_SLED_PATH.length-2) h=Math.min(h,sled.y-.35);
 // Reapply walking datum after broad terraces; approach ramps must not become steps.
 h=h*(1-blend)+n.y*blend;
 if(sled.distance<5&&n.distance>3.5&&sled.index>0&&sled.index<ALPHA_SLED_PATH.length-2)h=Math.min(h,sled.y-.35);
 return h;
}
export const alphaPathDistance=(x:number,z:number)=>Math.min(nearestAlphaSegment(x,z,ALPHA_MAIN_PATH).distance,nearestAlphaSegment(x,z,ALPHA_BYPASS_PATH).distance);
export function alphaTerrainData(step=1.5) {
 const nx=Math.ceil(196/step),nz=Math.ceil(228/step),positions=new Float32Array((nx+1)*(nz+1)*3),surface:number[]=[],solid:number[]=[],indices:number[]=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=-98+i*196/nx,z=-114+j*228/nz,k=(j*(nx+1)+i)*3;positions.set([x,alphaHeight(x,z),z],k);}
 const tri=(a:number,b:number,c:number)=>{const ax=positions[b*3]-positions[a*3],ay=positions[b*3+1]-positions[a*3+1],az=positions[b*3+2]-positions[a*3+2],bx=positions[c*3]-positions[a*3],by=positions[c*3+1]-positions[a*3+1],bz=positions[c*3+2]-positions[a*3+2];
 const ny=az*bx-ax*bz,len=Math.hypot(ay*bz-az*by,ny,ax*by-ay*bx);(ny/len>.64?surface:solid).push(a,b,c);indices.push(a,b,c);};
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;tri(a,a+nx+1,a+1);tri(a+1,a+nx+1,a+nx+2);}
 return {positions,surface:new Uint32Array(surface),solid:new Uint32Array(solid),indices:new Uint32Array(indices),nx,nz};
}
export function alphaShoreline():[number,number][] {return Array.from({length:96},(_,i)=>{const a=i/96*Math.PI*2,r=alphaShoreRadius(a),p=alphaWorld([Math.cos(a)*88*r,0,Math.sin(a)*107*r]);return [p[0],p[2]];});}
