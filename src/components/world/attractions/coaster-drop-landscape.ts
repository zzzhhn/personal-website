import { Color } from 'three';
import { beddedRockColour } from './coaster-rock-bedding.ts';
import type { Vec3 } from '../types';

type Sampler = (x: number, z: number) => number;
export type DropDetail = { points: Vec3[]; faces: [number, number, number][]; colours: Color[]; kind: 'rock' };
const mineral = new Color('#aaa48e'), broken = new Color('#878b7c'), earth = new Color('#92906a'), grass = new Color('#7c8957');

/** Low maintenance aprons become soil/grass; mineral colour follows actual exposed slope. */
export function dropCoastGroundColour(a: Vec3, b: Vec3, c: Vec3) {
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  const slope=Math.hypot(uy*vz-uz*vy,ux*vy-uy*vx)/Math.max(1e-6,Math.abs(uz*vx-ux*vz));
  const x=(a[0]+b[0]+c[0])/3,y=(a[1]+b[1]+c[1])/3,z=(a[2]+b[2]+c[2])/3;
  const patch=.5+.5*Math.sin(x*.09+z*.06)*Math.cos(z*.12-x*.04);
  const cover=grass.clone().lerp(earth,.12+patch*.25);
  const exposed=Math.min(1,Math.max(0,(y-.4)*.16+slope*.8-.15));
  return cover.lerp(beddedRockColour(a,b,c),exposed);
}

/** A broken ridge behind the drop, with smaller debris at the foot of the same beds.
 * Coordinates are local to the original north escarpment, not new island coverage. */
export const DROP_ROCK_BEDS = [
  [-43,-178,13,8,12.4],[-28,-178,12,7,11.6],[-13,-174,11,7,10.8],
  [2,-171,10,6,9.5],[16,-166,8,5,7.5],
  [-21,-163,4.4,3.1,2.7],[-10,-161,3.5,2.8,2.1],[5,-161,4,2.6,2.3],
  [-12,-134,4.3,3,3.2],[-3,-136,3.6,2.6,2.2],[24,-135,3.2,2.6,2.4],
] as const;

function builder(kind: DropDetail['kind']) {
  const mesh: DropDetail={points:[],faces:[],colours:[],kind};
  const vertex=(p:Vec3)=>{mesh.points.push(p);return mesh.points.length-1;};
  const face=(a:number,b:number,c:number,colour:Color)=>{mesh.faces.push([a,b,c]);mesh.colours.push(colour);};
  const connect=(a:number,b:number,n:number,colour:Color)=>{for(let i=0;i<n;i++){const j=(i+1)%n;face(a+i,b+i,a+j,colour);face(a+j,b+i,b+j,colour);}};
  return {mesh,vertex,face,connect};
}

export function createDropRock(bed: readonly number[], seed: number, ground: Sampler, ceiling: Sampler): DropDetail | null {
  const [x,z,w,d,target]=bed,footprint=[[-.5,-.25],[-.33,-.5],[.28,-.46],[.5,-.12],[.41,.35],[.08,.5],[-.4,.35]];
  const edge=footprint.map(([dx,dz])=>[x+dx*w,z+dz*d] as const);
  const feet=edge.map(([px,pz])=>ground(px,pz));
  if(!feet.every(Number.isFinite))return null;
  // Sample the entire footprint, not just its centre or visible corners.
  let limit=Infinity;
  for(let px=x-w/2;px<=x+w/2+.01;px+=Math.min(1,w/4))for(let pz=z-d/2;pz<=z+d/2+.01;pz+=Math.min(1,d/4))limit=Math.min(limit,ceiling(px,pz)-.35);
  const top=Math.min(target,limit),floor=Math.min(...feet)-.35;
  if(top<Math.max(...feet)+.75)return null;
  const {mesh,vertex,face,connect}=builder('rock'),n=edge.length;
  // Offset bedding creates a broad ledge between two short, steep scarps.
  for(const [scale,height] of [[1,floor],[.91,top-.85],[.72,top-.72],[.66,top]] as const)
    edge.forEach(([px,pz],i)=>vertex([x+(px-x)*scale+(height===top?.2:0),height+(height===floor?0:Math.sin(i*1.7+seed)*.15),z+(pz-z)*scale]));
  connect(0,n,n,broken);connect(n,n*2,n,mineral);connect(n*2,n*3,n,broken);
  const roof=vertex([x,top-.03,z]),bottom=vertex([x,floor,z]);
  for(let i=0;i<n;i++){face(roof,n*3+(i+1)%n,n*3+i,mineral.clone().lerp(earth,.18));face(bottom,i,(i+1)%n,broken);}
  return mesh;
}
