import type { Vec3 } from './types';
import type { ColliderRequirement } from './collider-readiness';

export interface PassageRegion {
  id:string;
  loadSource?:string;
  /** A signed-distance footprint expanded by padding; must include its interior. */
  contains:(position:Vec3,padding:number)=>boolean;
  requirements:readonly ColliderRequirement[];
}
export interface RegionPassage {
  at:(position:Vec3,radius?:number)=>boolean;
  failureAt?:(position:Vec3,radius?:number)=>boolean;
  allows:(from:Vec3,to:Vec3,radius?:number)=>boolean;
}

/** Unlike terrain-only broad phases, the bounds expand with the caller's hull. */
export function polygonPassageFootprint(points:readonly (readonly [number,number])[]):PassageRegion['contains'] {
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
  return ([x,,z],radius)=>{
    if(x<minX-radius||x>maxX+radius||z<minZ-radius||z>maxZ+radius)return false;
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[j],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
      const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
      if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<=radius)return true;
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
}

/** Boarding/egress paths must check every leg, including a stationary endpoint. */
export function passageRoute(passage:RegionPassage,points:readonly Vec3[],radius:number):boolean {
  return points.length>0&&passage.at(points[0],radius)
    &&points.slice(1).every((point,i)=>passage.allows(points[i],point,radius));
}

/** This is a loading boundary, not a collision substitute. Real Rapier sweeps
 * still decide walls, support and slopes after the region is available. */
export function createRegionPassage(regions:readonly PassageRegion[],
  ready:(requirements:readonly ColliderRequirement[])=>boolean,
  base:readonly ColliderRequirement[]=[], failed: (region:string)=>boolean = ()=>false):RegionPassage {
  const valid=(p:Vec3)=>p.length===3&&p.every(Number.isFinite);
  const at=(p:Vec3,radius=0)=>valid(p)&&Number.isFinite(radius)&&radius>=0&&ready(base)
    &&regions.every(region=>!region.contains(p,radius)||ready(region.requirements));
  return {at,
    failureAt:(p,radius=0)=>regions.some(region=>region.contains(p,radius)
      &&failed(region.loadSource??region.id)&&!ready(region.requirements)),
    allows(from,to,radius=0) {
    if(!valid(from)||!valid(to)||!Number.isFinite(radius)||radius<0||!ready(base))return false;
    const distance=Math.hypot(to[0]-from[0],to[2]-from[2]);
    // Locomotion paths only. Teleports validate the destination with at(), not an imaginary corridor.
    if(distance>32)return false;
    const steps=Math.max(1,Math.ceil(distance/.25)),padding=radius+distance/steps/2;
    for(const region of regions) {
      for(let i=0;i<=steps;i++) {
        const t=i/steps,p:Vec3=[from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t,from[2]+(to[2]-from[2])*t];
        if(region.contains(p,padding)) {if(!ready(region.requirements))return false;break;}
      }
    }
    return true;
  }};
}

export function passageVelocity(passage:RegionPassage,position:Vec3,velocity:{x:number;y:number;z:number},dt:number,radius:number) {
  if(!Number.isFinite(dt)||dt<=0||![velocity.x,velocity.y,velocity.z].every(Number.isFinite))
    return {blocked:true,velocity:{x:0,y:0,z:0}};
  const next:Vec3=[position[0]+velocity.x*dt,position[1]+velocity.y*dt,position[2]+velocity.z*dt];
  const blocked=!passage.allows(position,next,radius);
  return {blocked,velocity:blocked?{x:0,y:velocity.y,z:0}:velocity};
}
