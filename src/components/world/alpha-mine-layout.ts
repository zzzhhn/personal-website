import type { Vec3 } from './types';

/** Shared world frame: entrance at local z=0, quarry extends north to z=-53.
 * Local +Y is up, +Z faces the entrance; all walk heights are relative to FLOOR_Y. */
export const ALPHA_MINE_ORIGIN: Vec3 = [-84, 1.14, -55];
export const ALPHA_MINE_YAW = 0;
export const ALPHA_MINE_BASE_Y = 1;
export const ALPHA_MINE_FLOOR_Y = ALPHA_MINE_ORIGIN[1];

/** WorldQuant's quarry is part of the expanded northwest mainland. */
export const ALPHA_MINE_FOOTPRINT = { minX: -110, maxX: -58, minZ: -109, maxZ: -50 } as const;
const smooth = (a:number,b:number,x:number) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/** Same broad erosion as tools/world/alpha-mine/layout.py. Tests compare the
 * serialized outline, so terrain colouring, the map and the actual rock agree. */
function perimeterMap(x:number,z:number):[number,number] {
  const left=smooth(20,24,-x),right=smooth(20,24,x),back=smooth(44,52,-z);
  return [x+left*(1.8+.9*Math.sin(z*.18)+.5*Math.sin(z*.41)+8.5*smooth(-6,2,z)+4*smooth(38,52,-z))
    -right*(1.6+1.1*Math.sin(z*.19+1.4)+.6*Math.sin(z*.4)+7.5*smooth(-24,2,z)+3*smooth(38,52,-z)),
    z+back*(1.2+2*Math.sin(x*.13+.5)**2+.8*Math.sin(x*.47)+3*(x/24)**2)
    +(left+right)*.8*Math.sin(z*.23)+smooth(-3,2,z)*(1.2+.6*Math.cos(x*.18)-3.5*(x/24)**2)];
}
const boundary:[number,number][]=[];
for(let x=-24;x<=24;x+=4)boundary.push([x,-52]);
for(let z=-48;z<=0;z+=4)boundary.push([24,z]);
boundary.push([24,2]);
for(let x=20;x>=-24;x-=4)boundary.push([x,2]);
for(let z=-2;z>=-50;z-=4)boundary.push([-24,z]);
export const ALPHA_MINE_FOOTPRINT_POINTS:[number,number][] = boundary.map(([x,z])=>{
  const p=perimeterMap(x,z);return [ALPHA_MINE_ORIGIN[0]+Number(p[0].toFixed(5)),ALPHA_MINE_ORIGIN[2]+Number(p[1].toFixed(5))];
});

/** A packed-earth approach from the existing western island road. */
export const ALPHA_MINE_CONNECTOR: Vec3[] = [
  [-54, 1.14, -36],
  [-68, 1.14, -43],
  ALPHA_MINE_ORIGIN,
];
export const ALPHA_MINE_CONNECTOR_WIDTH = 4;

export function mineLocalToWorld(point: Vec3): Vec3 {
  return [ALPHA_MINE_ORIGIN[0] + point[0], ALPHA_MINE_ORIGIN[1] + point[1], ALPHA_MINE_ORIGIN[2] + point[2]];
}

/** Signed distance to the physical quarry outline, negative inside. The AABB is
 * only a cheap rejection/candidate bound; it no longer paints a square biome. */
export function mineEdgeDistance(x:number,z:number) {
  const b=ALPHA_MINE_FOOTPRINT;
  if(x<b.minX-3||x>b.maxX+3||z<b.minZ-3||z>b.maxZ+3)return Infinity;
  let d=Infinity,inside=false;
  for(let i=0,j=ALPHA_MINE_FOOTPRINT_POINTS.length-1;i<ALPHA_MINE_FOOTPRINT_POINTS.length;j=i++){
    const a=ALPHA_MINE_FOOTPRINT_POINTS[j],b=ALPHA_MINE_FOOTPRINT_POINTS[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    d=Math.min(d,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside?-d:d;
}
export const isOnAlphaMineBase=(x:number,z:number)=>mineEdgeDistance(x,z)<=0;
