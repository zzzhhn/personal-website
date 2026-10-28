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
  const {mesh,vertex,face,connect}=builder('rock'),n=edge.length*2,rise=top-floor;
  const boundary=Array.from({length:n},(_,i)=>{
    const j=Math.floor(i/2),next=(j+1)%edge.length,t=i%2*.5;
    return {px:edge[j][0]+(edge[next][0]-edge[j][0])*t,pz:edge[j][1]+(edge[next][1]-edge[j][1])*t,
      relief:Math.sin(j*1.7+seed)*.15*(1-t)+Math.sin(next*1.7+seed)*.15*t,
      // Retain only the west-facing rooted shelf, not a terrace around the entire rock.
      shelf:i<=2||i>=12};
  });
  for(let layer=0;layer<4;layer++)boundary.forEach(({px,pz,relief,shelf},i)=>{
    const joint=.5+.5*Math.sin(i*1.91+seed*.83),odd=i%2;
    let scale=1,y=floor,shiftX=0,shiftZ=0;
    if(layer===1){
      scale=shelf?.91:.67+joint*.27;
      y=shelf?top-.85+relief:floor+rise*(.33+joint*.35);
      if(!shelf){shiftX=w*.035*(joint-.5);shiftZ=d*.035*(.5-joint);}
    }else if(layer===2){
      scale=shelf?.72:.57+joint*.23;
      y=shelf?top-.72+relief:top-Math.min(rise*.48,.55+joint*.9);
      if(!shelf){shiftX=-w*.035;shiftZ=d*.025*(odd?1:-1);}
    }else if(layer===3){
      // Recessed edge wedges fracture the rim without lifting it into the ride envelope.
      const cleft=!shelf&&odd&&(i+seed)%3!==0;
      scale=cleft?.46:.66;shiftX=.2;
      y=top+relief-(cleft?Math.min(.8,rise*.16):0);
    }
    vertex([x+(px-x)*scale+shiftX,y,z+(pz-z)*scale+shiftZ]);
  });
  // Large inclined fracture faces and narrow inset seams replace the continuous colour bands.
  for(let layer=0;layer<3;layer++)for(let i=0;i<n;i++){
    const j=(i+1)%n,a=layer*n+i,b=layer*n+j,c=(layer+1)*n+j,e=(layer+1)*n+i;
    const tint=layer===1&&boundary[i].shelf?mineral:broken.clone().lerp(mineral,.2+.12*((i+seed)%3));
    if((i+layer+seed)%2){face(a,e,b,tint);face(b,e,c,tint);}else{face(a,e,c,tint);face(a,c,b,tint);}
  }
  const roof=vertex([x,top-.03,z]),bottom=vertex([x,floor,z]);
  for(let i=0;i<n;i++){face(roof,n*3+(i+1)%n,n*3+i,mineral.clone().lerp(earth,.18));face(bottom,i,(i+1)%n,broken);}
  // A few detached, tilted flakes fall towards the low end of the same bed.
  // Keep the planted west shelf clear and reject any flake whose whole footprint lacks ground/clearance.
  const toes=[2,3,4,5].sort((a,b)=>feet[a]-feet[b]).slice(0,3);
  for(const [rank,corner] of toes.entries()){
    const cx=x+(edge[corner][0]-x)*1.04,cz=z+(edge[corner][1]-z)*1.04;
    const size=Math.min(1.35,w*.19)*(1-rank*.16),h=Math.min(.65,size*.48);
    const outline=[[-.65,-.3],[.2,-.48],[.66,-.06],[.3,.4],[-.5,.31]].map(([dx,dz])=>[cx+dx*size,cz+dz*size] as const);
    const support=outline.map(([px,pz])=>ground(px,pz));
    if(!support.every(Number.isFinite)||Math.max(...support)-Math.min(...support)>.65)continue;
    const base=Math.max(...support),low=Math.min(...support)-.16;
    if(outline.some(([px,pz])=>base+h+.2>=ceiling(px,pz)))continue;
    const start=mesh.points.length;
    outline.forEach(([px,pz])=>vertex([px,low,pz]));
    outline.forEach(([px,pz],i)=>vertex([px+size*.09,base+h*(.45+(i%3)*.21),pz-size*.06]));
    connect(start,start+5,5,broken);
    for(let i=1;i<4;i++){face(start,start+i,start+i+1,broken);face(start+5,start+5+i+1,start+5+i,mineral);}
  }
  return mesh;
}
