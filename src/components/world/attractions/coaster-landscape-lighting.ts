import { Color, type BufferGeometry } from 'three';
import { coasterWorld } from './coaster-track.ts';
import { COASTER_CLIFF_WALK, COASTER_CLIFF_LAMPS } from './coaster-landscape-cliffs.ts';
import type { Vec3 } from '../types';
import { lightsTouchingPart } from './intent-lighting-cull';

const warm=new Color('#ffd092'),cool=new Color('#57bdcb');
const sources=[
  ...COASTER_CLIFF_LAMPS.map(p=>({p:coasterWorld(p),radius:12,power:2.5,color:warm})),
  ...COASTER_CLIFF_WALK.map(([x,y,z])=>({p:coasterWorld([x,y+2,z]),radius:15,power:3,color:warm})),
  ...[12,36,60,83].map(y=>({p:coasterWorld([-44,y+2,-148.8]),radius:23,power:3.2,color:warm})),
  // Static floodlight spill on the tall steelwork; no extra runtime light or shadow pass.
  ...[8,30,54,78].flatMap(y=>[-1,1].map(side=>({p:coasterWorld([-44+side*12,y,-143]),radius:29,power:1.8,color:cool}))),
  {p:coasterWorld([60,8,-75]),radius:30,power:1.1,color:cool},
];
/** Supplemental local diffuse fill for the north tower and cliff walk; no runtime lights. */
export function lightCoasterCliffs(g:BufferGeometry,origin:Vec3=[0,0,0]){
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color'),fill=g.getAttribute('nightRadiance');
  const localSources=lightsTouchingPart(g,origin,sources);
  for(let i=0;i<p.count;i++)for(const s of localSources){
    const dx=s.p[0]-p.getX(i)-origin[0],dy=s.p[1]-p.getY(i)-origin[1],dz=s.p[2]-p.getZ(i)-origin[2];
    if(Math.abs(dx)>=s.radius||Math.abs(dy)>=s.radius||Math.abs(dz)>=s.radius)continue;
    const d=Math.hypot(dx,dy,dz);
    if(d>=s.radius)continue;
    const amount=(1-d/s.radius)**2*Math.max(.05,(dx*n.getX(i)+dy*n.getY(i)+dz*n.getZ(i))/Math.max(.01,d))*s.power;
    fill.setXYZ(i,fill.getX(i)+c.getX(i)*s.color.r*amount,fill.getY(i)+c.getY(i)*s.color.g*amount,fill.getZ(i)+c.getZ(i)*s.color.b*amount);
  }
}
