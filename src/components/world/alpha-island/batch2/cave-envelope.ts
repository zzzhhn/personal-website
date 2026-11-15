import { BufferGeometry, Float32BufferAttribute } from 'three';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END, batch2Segment } from '../alpha-batch2-layout.ts';
import { ALPHA_MAIN_PATH } from '../alpha-layout.ts';

type Point = [number, number];
type Ground = (x:number,z:number)=>number;
const routes=[ALPHA_CAVE_PATH,ALPHA_CAVE_DEAD_END];
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const mouthHalfWidth=5.32;
const outerArch=[[-5.3,-.6],[-5.25,3.85],[-4,6.65],[-1.65,8],[1.65,8],[4,6.65],[5.25,3.85],[5.3,-.6]];
export const CAVE_MOUNTAINSIDE_MOUTHS=[0,1].map(end=>{
  const p=end?ALPHA_CAVE_PATH.at(-1)!:ALPHA_CAVE_PATH[0],q=end?ALPHA_CAVE_PATH.at(-2)!:ALPHA_CAVE_PATH[1];
  const length=Math.hypot(p[0]-q[0],p[2]-q[2]),dx=(p[0]-q[0])/length,dz=(p[2]-q[2])/length;
  return {p,dx,dz,across:(x:number,z:number)=>-(x-p[0])*dz+(z-p[2])*dx,outward:(x:number,z:number)=>(x-p[0])*dx+(z-p[2])*dz};
});

/** One rounded landform covers the fork as well as the through passage. It
 * meets the sampled island mesh at its foothills; it never replaces the terrain
 * height/collider below the passage with a solid height-field mountain. */
export function caveMountainHeight(x:number,z:number,ground:number) {
  let height=ground-.09;
  const trailClearance=Math.min(batch2Segment(x,z,ALPHA_MAIN_PATH).distance,batch2Segment(x,z,[[-45,12,-56],[-27,12,-56]]).distance);
  const shoulder=smooth(2.5,6,trailClearance);
  for(const route of routes){
    const p=batch2Segment(x,z,route),weight=(1-smooth(4.8,16,p.distance))*shoulder;
    const crown=p.y+11.5+.65*Math.sin(x*.29+z*.13)+.4*Math.cos(z*.31-x*.12);
    height=Math.max(height,ground+(Math.max(ground,crown)-ground)*weight-.09);
  }
  return height;
}

function clip(polygon:Point[],distance:(p:Point)=>number,inside:boolean):Point[] {
  const out:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b),ia=inside?da>=0:da<=0,ib=inside?db>=0:db<=0;
    if(ia)out.push(a);
    if(ia!==ib){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return out;
}

/** Subtract an open approach, preserving exact straight portal edges instead
 * of deleting raster cells and leaving a sawtooth opening. */
function subtractRegion(polygon:Point[],planes:((p:Point)=>number)[]) {
  const kept:Point[][]=[];let remaining=polygon;
  for(const plane of planes){const outside=clip(remaining,plane,false);if(outside.length>=3)kept.push(outside);remaining=clip(remaining,plane,true);if(remaining.length<3)break;}
  return kept;
}

function cutApproach(polygon:Point[],mouth:typeof CAVE_MOUNTAINSIDE_MOUTHS[number]) {
  return subtractRegion(polygon,[(p:Point)=>mouth.outward(...p),(p:Point)=>mouthHalfWidth-mouth.across(...p),(p:Point)=>mouthHalfWidth+mouth.across(...p)]);
}

export function createCaveEnvelopeGeometry(groundAt:Ground) {
  const points=routes.flat(),minX=Math.min(...points.map(p=>p[0]))-17,maxX=Math.max(...points.map(p=>p[0]))+17;
  const minZ=Math.min(...points.map(p=>p[2]))-17,maxZ=Math.max(...points.map(p=>p[2]))+17,step=1.75;
  const nx=Math.ceil((maxX-minX)/step),nz=Math.ceil((maxZ-minZ)/step),positions:number[]=[],indices:number[]=[],lookup=new Map<string,number>();
  // Clip actual triangles outside the outdoor walking corridor. A height fade
  // alone cannot prevent a coarse triangle bridging across a concave path.
  const trailCuts=[ALPHA_MAIN_PATH,[[-45,12,-56],[-27,12,-56]]].flatMap(path=>path.slice(1).map((b,i)=>{
    const a=path[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]),dx=(b[0]-a[0])/length,dz=(b[2]-a[2])/length,width=3.2;
    const along=(p:Point)=>(p[0]-a[0])*dx+(p[1]-a[2])*dz,across=(p:Point)=>-(p[0]-a[0])*dz+(p[1]-a[2])*dx;
    return [(p:Point)=>along(p)+width,(p:Point)=>length+width-along(p),(p:Point)=>width-across(p),(p:Point)=>width+across(p)];
  }));
  const vertex=(p:Point)=>{
    const key=p.map(v=>v.toFixed(7)).join(','),known=lookup.get(key);if(known!==undefined)return known;
    const id=positions.length/3;positions.push(p[0],caveMountainHeight(p[0],p[1],groundAt(...p)),p[1]);lookup.set(key,id);return id;
  };
  const triangle=(polygon:Point[])=>{
    let pieces=[polygon];for(const mouth of CAVE_MOUNTAINSIDE_MOUTHS)pieces=pieces.flatMap(p=>cutApproach(p,mouth));
    for(const cut of trailCuts)pieces=pieces.flatMap(p=>subtractRegion(p,cut));
    for(const piece of pieces)for(let k=1;k<piece.length-1;k++){
      // Do not lay a second, differently triangulated copy of the island over
      // protected paths or inactive foothills. Even samples below the ground
      // can interpolate above a concave terrain cell between those samples.
      if([piece[0],piece[k],piece[k+1]].every(p=>caveMountainHeight(p[0],p[1],groundAt(...p))<=groundAt(...p)))continue;
      const a=vertex(piece[0]),b=vertex(piece[k]),c=vertex(piece[k+1]);
      const area=(positions[b*3]-positions[a*3])*(positions[c*3+2]-positions[a*3+2])-(positions[c*3]-positions[a*3])*(positions[b*3+2]-positions[a*3+2]);
      if(Math.abs(area)>1e-7)indices.push(a,b,c);
    }
  };
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=minX+i*(maxX-minX)/nx,z=minZ+j*(maxZ-minZ)/nz,x1=minX+(i+1)*(maxX-minX)/nx,z1=minZ+(j+1)*(maxZ-minZ)/nz;
    triangle([[x,z],[x,z1],[x1,z]]);triangle([[x1,z],[x,z1],[x1,z1]]);
  }
  // Close only exposed mountain edges. The two front faces stop at the original
  // outer arch, leaving both openings and the full interior clearance intact.
  const edges=new Map<string,{a:number;b:number;count:number}>();
  for(let k=0;k<indices.length;k+=3)for(let e=0;e<3;e++){
    const a=indices[k+e],b=indices[k+(e+1)%3],key=a<b?`${a},${b}`:`${b},${a}`,edge=edges.get(key);
    if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }
  const wall=(a:number,b:number)=>{
    const ax=positions[a*3],az=positions[a*3+2],bx=positions[b*3],bz=positions[b*3+2];
    const mouth=CAVE_MOUNTAINSIDE_MOUTHS.find(m=>Math.abs(m.outward(ax,az))<1e-5&&Math.abs(m.outward(bx,bz))<1e-5);
    const splits=[0,1];
    if(mouth){const sa=mouth.across(ax,az),sb=mouth.across(bx,bz);for(const [s] of outerArch){const t=(s-sa)/(sb-sa);if(t>1e-7&&t<1-1e-7)splits.push(t);}}
    splits.sort((a,b)=>a-b);
    const lower=(x:number,z:number)=>{
      let y=groundAt(x,z)-.18;if(!mouth)return y;
      const s=mouth.across(x,z);for(let i=1;i<outerArch.length;i++){
        const [a,ya]=outerArch[i-1],[b,yb]=outerArch[i];if(s>=a&&s<=b){y=Math.max(y,mouth.p[1]+ya+(yb-ya)*(s-a)/(b-a));break;}
      }
      return y;
    };
    for(let i=1;i<splits.length;i++){
      const ids:number[]=[];
      for(const t of [splits[i-1],splits[i]]){
        const x=ax+(bx-ax)*t,z=az+(bz-az)*t,y=positions[a*3+1]+(positions[b*3+1]-positions[a*3+1])*t;
        const top=positions.length/3;positions.push(x,y,z,x,Math.min(y,lower(x,z)),z);ids.push(top,top+1);
      }
      indices.push(ids[0],ids[1],ids[2],ids[2],ids[1],ids[3]);
    }
  };
  for(const edge of edges.values())if(edge.count===1)wall(edge.a,edge.b);
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** The walking skin stays a single continuous raster. Its closed rock footing
 * buries the exposed raster edge below the recessed terrain rather than leaving
 * a floating, zero-thickness sheet. */
export function createCaveFloorFoundation(floor:BufferGeometry) {
  const p=floor.getAttribute('position'),ids=floor.index!.array,positions:number[]=[],indices:number[]=[],edges=new Map<string,{a:number;b:number;count:number}>();
  for(let i=0;i<p.count;i++)positions.push(p.getX(i),p.getY(i)-.85,p.getZ(i));
  for(let k=0;k<ids.length;k+=3){indices.push(ids[k],ids[k+2],ids[k+1]);for(let e=0;e<3;e++){
    const a=ids[k+e],b=ids[k+(e+1)%3],key=a<b?`${a},${b}`:`${b},${a}`,edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }}
  for(const {a,b,count} of edges.values())if(count===1){const top=positions.length/3;positions.push(p.getX(a),p.getY(a)-.012,p.getZ(a),p.getX(b),p.getY(b)-.012,p.getZ(b));indices.push(top,a,top+1,top+1,a,b);}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
