import { BoxGeometry, BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { coasterWorld } from './coaster-track.ts';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import type { Vec3 } from '../types';

export interface LookoutSolid {
  id: string;
  role: 'rock' | 'foundation' | 'coping' | 'rail' | 'post' | 'seat';
  position: Vec3;
  size: Vec3;
  rotation: Vec3;
  colour: string;
  /** Architectural boxes retain their bounded face subdivisions. Rocks use hull faces. */
  segments: Vec3;
  /** Canonical closed convex surface, in this solid's local coordinates. Render and physics share it. */
  hull?: Float32Array;
}
const identity: Vec3 = [0,0,0];
const segments = (size: Vec3, spacing: number, cap: number): Vec3 => size.map(v=>Math.min(cap,Math.max(1,Math.ceil(v/spacing)))) as Vec3;

/** Irregular geological beds and fractures use actual convex hulls. Half-size is only an envelope.
 * Architectural members retain exact box surfaces. Both share their transforms with physics.
 * Keep all dimensions local to the coaster. The public deck and ramp are owned by the caller. */
export function coasterLookoutSolids(): LookoutSolid[] {
  const out: LookoutSolid[] = [];
  const box = (id: string, role: LookoutSolid['role'], position: Vec3, size: Vec3, colour: string, rotation: Vec3 = identity) => {
    out.push({id,role,position,size,rotation,colour,segments:segments(size,4,4)});
  };
  const rock=(id:string,origin:Vec3,points:Vector3[])=>{
    const geometry=new ConvexGeometry(points);geometry.computeBoundingBox();
    const center=geometry.boundingBox!.getCenter(new Vector3());geometry.translate(-center.x,-center.y,-center.z);
    geometry.computeBoundingBox();
    const min=geometry.boundingBox!.min,max=geometry.boundingBox!.max;
    const size:Vec3=[0,1,2].map(k=>2*Math.max(Math.abs(min.getComponent(k)),Math.abs(max.getComponent(k)))) as Vec3;
    const hull=new Float32Array(geometry.attributes.position.array);geometry.dispose();
    out.push({id,role:'rock',position:[origin[0]+center.x,origin[1]+center.y,origin[2]+center.z],size,rotation:identity,
      colour:'#989c91',segments:[1,1,1],hull});
  };
  // Three distinct fractured outlines, with staggered shoulders and sloping bedding. No box
  // corners or uniform ring radii: the middle shoulder and upper rim change by metres.
  const bed=(id:string,origin:Vec3,outline:number[][],low:number,high:number,seed:number,ledge:Vec3[]=[])=>{
    const points:Vector3[]=[];
    for(let ring=0;ring<3;ring++)outline.forEach(([x,z],i)=>{
      const radius=ring===0?.82+(i%3)*.055:ring===1?1:.65+((i+seed)%4)*.065;
      const offsetX=ring===0?-.35:ring===1?.15:.55,offsetZ=ring===0?.25:ring===1?-.15:-.45;
      const y=(ring===0?low:ring===1?low+(high-low)*.56:high)+x*.055-z*.035+Math.sin(i*1.9+seed)*.13;
      points.push(new Vector3(x*radius+offsetX,y,z*radius+offsetZ));
    });
    ledge.forEach(p=>points.push(new Vector3(p[0]-origin[0],p[1]-origin[1],p[2]-origin[2])));
    rock(id,origin,points);
  };
  bed('basal-stratum',[55,-2.1,13.5],[[-7.6,-3.4],[-5.8,-6.3],[-1.4,-7.6],[3.4,-6.7],[7.2,-3.2],[7.5,1.6],[5.7,5.8],[1.4,7],[-3.9,6.4],[-7.4,2.8]],-2.7,3.0,2);
  bed('middle-stratum',[54.7,2.15,13.7],[[-6.8,-3],[-4.8,-6.3],[.8,-6.7],[5.8,-4.5],[6.8,.3],[4.9,5.4],[.2,6.4],[-4.8,4.9],[-6.9,.5]],-2.8,2.45,5);
  bed('crown-stratum',[55.2,5.85,13.5],[[-6.2,-3.5],[-3.7,-6],[1.9,-6],[5.7,-3.6],[6.1,1.1],[3.8,5.6],[-1.4,5.9],[-5.7,3.4]],-2.9,1.17,8,
    [[49,7.55,9],[60.8,7.54,9.8],[60.8,7.5,17.3],[49,7.5,17],[54.7,7.56,8]]);
  // Radial, asymmetric fracture wedges: broad roots, broken shoulders and offset truncated
  // crests. Their points are not perturbations of a cuboid and their hulls are the actual solids.
  const shard=(id:string,origin:Vec3,extent:Vec3,seed:number)=>{
    const outline=[[-.91,-.27],[-.47,-.93],[.35,-.86],[1,.08],[.41,.94],[-.65,.73]],points:Vector3[]=[];
    for(let ring=0;ring<3;ring++)outline.forEach(([x,z],i)=>{
      const r=ring===0?.71:ring===1?1:.38+((i+seed)%3)*.12;
      const y=ring===0?-.5:ring===1?-.08+Math.sin(i*1.7+seed)*.12:.35+Math.cos(i*1.3+seed)*.15;
      points.push(new Vector3((x*r+(ring===2?.22:-.08))*extent[0]/2,y*extent[1],(z*r+(ring===2?-.18:.06))*extent[2]/2));
    });
    rock(id,origin,points);
  };
  shard('west-fracture',[49.2,2.2,12.4],[4.8,8.4,5.3],1);
  shard('east-fracture',[61,2.4,13.4],[4.5,9.4,4.4],3);
  shard('southwest-fan',[50.8,2.8,18.7],[5.5,7,4.1],5);
  shard('southeast-fan',[58.8,2.5,18.6],[5.8,7.4,4.3],7);
  shard('north-fracture',[56.1,3.4,7.8],[6,7.7,3.8],4);
  shard('west-toe',[48.2,.3,17.2],[3.6,2.5,3.2],2);
  shard('south-toe',[60.1,.2,19.3],[4.1,2.3,3],6);
  shard('east-toe',[62.1,.3,11.3],[3,2.8,3.5],8);
  shard('north-toe',[51.5,0,7.6],[4,2.4,3.4],9);
  // U-shaped stepped foundation: no transverse member crosses the south ramp connection.
  for (const [id,x,z,w,d] of [['north',55,7.95,12.8,.7],['west',48.95,14.1,.7,11.6],['east',61.05,14.1,.7,11.6]] as const) {
    box(`footing-${id}`,'foundation',[x,7.27,z],[w,.42,d],'#667a7b');
    box(`cornice-${id}`,'coping',[x,7.63,z],[w+.12,.24,d+.12],'#b5ac94');
    box(`edge-${id}`,'coping',[x,7.97,z],[id==='north'?12.4:.32,.18,id==='north'?.32:11.6],'#c1b49a');
  }
  // Three open guardrail sides occupy the original boundary, with a 1.2 m finished height.
  const sides = [[49,8,61,8],[49,8,49,20],[61,8,61,20]];
  const posts = new Set<string>();
  sides.forEach(([ax,az,bx,bz],side)=>{
    const length = Math.hypot(bx-ax,bz-az), yaw = -Math.atan2(bz-az,bx-ax), bays = Math.round(length/2);
    box(`curb-${side}`,'coping',[(ax+bx)/2,8.16,(az+bz)/2],[length,.16,.28],'#9d9d88',[0,yaw,0]);
    // A slim lower and mid rail keep the person-sized capsule behind the perimeter.
    for (const [rail,y,h,d,c] of [[0,8.47,.10,.10,'#5d7477'],[1,8.87,.10,.10,'#5d7477'],[2,9.23,.10,.20,'#b19a70']] as const)
      box(`rail-${side}-${rail}`,'rail',[(ax+bx)/2,y,(az+bz)/2],[length,h,d],c,[0,yaw,0]);
    for (let k=0;k<=bays;k++) {
      const x=ax+(bx-ax)*k/bays,z=az+(bz-az)*k/bays,key=`${x},${z}`;
      if(posts.has(key))continue;posts.add(key);
      box(`post-${key}`,'post',[x,8.65,z],[.18,1.14,.18],'#4f696d');
      // Corner anchors carry the heavier shoes/caps. Intermediate posts meet the continuous
      // coping and handrail directly, avoiding 30 unnecessary visual/collision decorations.
      if(z===8||z===20) if(x===49||x===61) {
        box(`shoe-${key}`,'post',[x,8.18,z],[.34,.20,.34],'#899589');
        box(`post-cap-${key}`,'post',[x,9.22,z],[.27,.12,.27],'#b8ab8d');
      }
    }
  });
  // Low built-in seats give human scale without entering the centre walk/arrival corridor.
  for (const [side,x] of [['west',50.1],['east',59.9]] as const) {
    box(`seat-plinth-${side}`,'seat',[x,8.29,12.1],[.72,.42,2.8],'#899487');
    box(`seat-top-${side}`,'seat',[x,8.57,12.1],[.96,.14,3.1],'#b8a68a');
  }
  return out;
}

export function lookoutSolidMatrix(s: LookoutSolid) {
  return new Matrix4().compose(new Vector3(...coasterWorld(s.position)),new Quaternion().setFromEuler(new Euler(...s.rotation)),new Vector3(1,1,1));
}
export function lookoutSolidCollider(s: LookoutSolid): CoasterCollider & { hull?: Float32Array } {
  return { position:coasterWorld(s.position),half:s.size.map(v=>v/2) as Vec3,rotation:[...s.rotation],...(s.hull?{hull:s.hull}:{}) };
}
/** Copy the canonical surface, never reconstruct an approximate box or a separate visual hull. */
export function createLookoutRockGeometry(s: LookoutSolid) {
  if(!s.hull)throw new Error(`Missing canonical rock hull: ${s.id}`);
  const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(s.hull),3));
  geometry.computeVertexNormals();return geometry;
}
const BED_LEVELS=[-Infinity,.3,1.35,1.6,3.4,3.68,5.35,5.65,Infinity];
export const LOOKOUT_BED_COLOURS=['#707c7c','#92958d','#b0ad9c','#9b9e94','#7e8580','#a4a497','#b5af9d','#9ea293','#939b80'];
const beddingOrigin=coasterWorld([55,0,14]);
const bedHeight=(p:Vec3)=>p[1]-beddingOrigin[1]-.08*(p[0]-beddingOrigin[0])+.045*(p[2]-beddingOrigin[2]);
function clipBed(polygon:Vec3[],height:number,above:boolean):Vec3[] {
  if(!Number.isFinite(height))return polygon;
  const out:Vec3[]=[];
  polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length],da=bedHeight(a)-height,db=bedHeight(b)-height;
    const insideA=above?da>=0:da<=0,insideB=above?db>=0:db<=0;
    if(insideA)out.push(a);
    if(insideA!==insideB){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t) as Vec3);}
  });return out;
}
/** Clip the existing flat surface by shared geological planes. These vertices remain exactly
 * on the canonical convex faces, while narrow mineral seams align across adjacent stones. */
export function lookoutRockSurfaceParts(s:LookoutSolid) {
  const g=createLookoutRockGeometry(s).applyMatrix4(lookoutSolidMatrix(s)),p=g.attributes.position,n=g.attributes.normal;
  const faces=LOOKOUT_BED_COLOURS.map(()=>[] as number[]);
  for(let i=0;i<p.count;i+=3) {
    const triangle:Vec3[]=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)]);
    for(let layer=0;layer<BED_LEVELS.length-1;layer++) {
      const polygon=clipBed(clipBed(triangle,BED_LEVELS[layer],true),BED_LEVELS[layer+1],false);
      const colour=layer===7&&n.getY(i)>.55?8:layer;
      for(let j=1;j<polygon.length-1;j++)faces[colour].push(...polygon[0],...polygon[j],...polygon[j+1]);
    }
  }
  g.dispose();
  return faces.map((positions,i)=>{
    const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.computeVertexNormals();
    return {geometry,colour:LOOKOUT_BED_COLOURS[i]};
  });
}
/** Exact local counts; never builds or bakes the full scene. */
export function lookoutSampleBudget(solids = coasterLookoutSolids()) {
  const triangles = solids.reduce((sum,s)=>{
    if(s.role==='rock'){const parts=lookoutRockSurfaceParts(s),n=parts.reduce((a,p)=>a+p.geometry.attributes.position.count/3,0);parts.forEach(p=>p.geometry.dispose());return sum+n;}
    const [x,y,z]=s.segments;return sum+4*(x*y+y*z+x*z);
  },0);
  const glowTriangles=84; // three slim BoxGeometry inserts, each with 3 x 1 x 1 face subdivisions
  return { solidCount:solids.length, rockSolids:solids.filter(s=>s.role==='rock').length, triangles,
    glowTriangles,totalTriangles:triangles+glowTriangles,colliders:solids.length,vertexAttributeBytes:(triangles+glowTriangles)*3*12*4 };
}

/** Add only the replacement rock/edge sample, never the public top slab or slope surfaces. */
export function addCoasterLookoutSample(steel: CoasterBatch,glow: CoasterBatch,colliders: CoasterCollider[]) {
  const solids=coasterLookoutSolids();
  for(const s of solids) {
    if(s.role==='rock') {
      for(const {geometry,colour} of lookoutRockSurfaceParts(s)) {
        if(geometry.attributes.position.count)steel.add(geometry,colour);else geometry.dispose();
      }
    } else {
      const source=new BoxGeometry(...s.size,...s.segments),geometry=source.toNonIndexed();source.dispose();
      steel.add(geometry,s.colour,lookoutSolidMatrix(s));
    }
    colliders.push(lookoutSolidCollider(s));
  }
  // Three short soffit inserts read as fixtures; existing baked spill lights the stone below.
  for(const [x,z,w,d] of [[55,7.56,10.8,.045],[48.56,13.7,.045,10.4],[61.44,13.7,.045,10.4]])
    glow.box(coasterWorld([x,7.55,z]),[w,.055,d],'#ffd087');
}
