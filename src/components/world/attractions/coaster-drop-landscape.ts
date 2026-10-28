import { Color } from 'three';
import { beddedRockColour } from './coaster-rock-bedding.ts';
import type { Vec3 } from '../types';

type Sampler = (x: number, z: number) => number;
export type DropDetail = { points: Vec3[]; faces: [number, number, number][]; colours: Color[]; kind: 'rock' | 'tree' | 'shrub' };
const mineral = new Color('#aaa48e'), broken = new Color('#878b7c'), earth = new Color('#92906a'), grass = new Color('#7c8957');
const leaves = ['#526b3d', '#73864c', '#8b9857', '#657b43'].map(c => new Color(c));

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

// Groves sit behind the scarp; low scrub follows its foot and the safe loop shoulder.
export const DROP_PLANTS = [
  [-48,-179,1],[-35,-179,1],[-23.5,-178.5,1],[-2.5,-171.5,1],[8,-169.5,1],[23.5,-166,1],
  [-51,-174.5,0],[-44.5,-178,0],[-35.5,-176.5,0],[-29,-171.5,0],[-24,-172.5,0],[-22.5,-174,0],
  [7.5,-166,0],[8,-165.5,0],[19,-162,0],[23.5,-160,0],
  [-18,-134,0],[-16,-132,0],[-8,-135,0],[-6.5,-130,0],[0,-134.5,0],
] as const;

export function createDropPlant(x:number,z:number,tree:boolean,seed:number,ground:Sampler,ceiling:Sampler):DropDetail|null {
  const radius=tree?1.8:1.05,height=tree?4.4:1.2,y=ground(x,z);
  if(!Number.isFinite(y)||y<0)return null;
  if(tree&&[[.2,0],[-.2,0],[0,.2],[0,-.2]].some(([dx,dz])=>Math.abs(ground(x+dx,z+dz)-y)>.3))return null;
  const envelope=radius+(tree?.65:.3);
  for(let dx=-envelope;dx<=envelope+.01;dx+=envelope/2)for(let dz=-envelope;dz<=envelope+.01;dz+=envelope/2){
    const g=ground(x+dx,z+dz);
    // A rooted crown may overhang a lower ledge. Uphill terrain must stay below its branches.
    if((tree?g>y+1.3:!Number.isFinite(g)||Math.abs(g-y)>.65)||y+height+.3>=ceiling(x+dx,z+dz))return null;
  }
  const {mesh,vertex,face,connect}=builder(tree?'tree':'shrub'),n=5;
  if(tree){
    for(const level of [y-.2,y+2.5])for(let i=0;i<n;i++){const angle=i*Math.PI*2/n;vertex([x+Math.cos(angle)*.16,level,z+Math.sin(angle)*.16]);}
    connect(0,n,n,new Color('#695e44'));
    for(let i=1;i<n-1;i++){face(0,i,i+1,new Color('#695e44'));face(n,n+i+1,n+i,new Color('#695e44'));}
  }
  for(let lobe=0;lobe<(tree?2:1);lobe++){
    const start=mesh.points.length,cx=x+(lobe?-.6:.25),cz=z+(lobe?.25:-.1),base=y+(tree?(lobe?2.2:1.4):-.12),r=radius*(lobe?.78:1);
    for(const [scale,h] of [[.6,0],[1,tree?.9:.5]] as const)for(let i=0;i<n;i++){
      const angle=i*Math.PI*2/n+seed*.4;vertex([cx+Math.cos(angle)*r*scale,base+h,cz+Math.sin(angle)*r*scale]);
    }
    const top=vertex([cx+.15,base+(tree?2.2:1.2),cz]),bottom=vertex([cx,base-.05,cz]);
    for(let i=0;i<n;i++){const j=(i+1)%n,colour=leaves[(i+seed+lobe)%leaves.length];face(start+i,start+n+i,start+j,colour);face(start+j,start+n+i,start+n+j,colour);face(top,start+n+j,start+n+i,colour);face(bottom,start+i,start+j,leaves[0]);}
  }
  return mesh;
}
