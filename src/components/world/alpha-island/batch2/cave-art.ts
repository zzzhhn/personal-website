import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, LatheGeometry, Quaternion, TorusGeometry, Vector2, Vector3 } from 'three';
import { AlphaBuilder } from '../alpha-art';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END, batch2Segment } from '../alpha-batch2-layout';
import { CAVE_CHIME_ANCHOR, CAVE_CHIME_YAW } from './cave-state';
import { alphaGroundHeight } from '../alpha-terrain';
import { createCaveEnvelopeGeometry, createCaveFloorFoundation } from './cave-envelope';
import type { Vec3 } from '../../types';
import { classifyCaveParts, requireCaveArtifact, type CaveArt } from './cave-artifact';

const ROUTES = [ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END];
// Inner portal is 7.3 m wide; even the shoulders begin 5.6 m above grade.
const INNER = [[-3.65,-.35],[-3.65,3.4],[-2.8,5.6],[-1.2,6.65],[1.2,6.65],[2.8,5.6],[3.65,3.4],[3.65,-.35]];
const OUTER = [[-5.3,-.6],[-5.25,3.85],[-4,6.65],[-1.65,8],[1.65,8],[4,6.65],[5.25,3.85],[5.3,-.6]];
const FACES = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
/** A single height field owns both branches. Every raster vertex has exactly one
 * height, including the fork; independent route strips must never overlap here. */
export function createCaveFloorGeometry() {
  const step=.5,minX=-24,minZ=-61,nx=78,nz=62,positions:number[]=[],indices:number[]=[],vertices=new Map<number,number>();
  const sample=(x:number,z:number)=>ROUTES.map(path=>batch2Segment(x,z,path));
  const height=(x:number,z:number)=>{
    const values=sample(x,z),exact=values.find(p=>p.distance<1e-7);
    if(exact)return exact.y+.12;
    const weights=values.map(p=>1/Math.pow(p.distance+.001,4)),sum=weights.reduce((a,b)=>a+b,0);
    return values.reduce((sum,p,i)=>sum+p.y*weights[i],0)/sum+.12;
  };
  const covered=(x:number,z:number)=>ROUTES.some(path=>{
    const a=path[0],b=path[1],c=path.at(-2)!,d=path.at(-1)!;
    const before=((x-a[0])*(b[0]-a[0])+(z-a[2])*(b[2]-a[2]))/Math.hypot(b[0]-a[0],b[2]-a[2]);
    const after=((x-d[0])*(d[0]-c[0])+(z-d[2])*(d[2]-c[2]))/Math.hypot(d[0]-c[0],d[2]-c[2]);
    // Butt ends keep the approach/exit grade, rather than creating flat round pads.
    // The raster's half-diagonal is included so 7.3m clear width is never eroded.
    return before>=-.1&&after<=.1&&batch2Segment(x,z,path).distance<4.01;
  });
  const vertex=(i:number,j:number)=>{
    const key=j*(nx+1)+i,existing=vertices.get(key);if(existing!==undefined)return existing;
    const x=minX+i*step,z=minZ+j*step,index=positions.length/3;
    positions.push(x,height(x,z),z);vertices.set(key,index);return index;
  };
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)if(covered(minX+(i+.5)*step,minZ+(j+.5)*step)){
    const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1),d=vertex(i+1,j+1);
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function prism(points: Vec3[]) {
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(points.flat(),3));
  g.setIndex(FACES.flatMap((_,i)=>i%3===0?[FACES[i],FACES[i+2],FACES[i+1]]:[])); g.computeVertexNormals(); return g;
}
export function createCaveArt(): CaveArt {
  if (import.meta.env?.SSR === false) return requireCaveArtifact();
  const solid = new AlphaBuilder(), detail = new AlphaBuilder(), seams = new AlphaBuilder(), floor = new AlphaBuilder();
  const walkingFloor=createCaveFloorGeometry();
  solid.add(createCaveEnvelopeGeometry(alphaGroundHeight),'stone');
  solid.add(createCaveFloorFoundation(walkingFloor),'stone');
  floor.add(walkingFloor,'stone');
  for (const [routeIndex, path] of ROUTES.entries()) for (let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len,n=Math.ceil(len/1.9);
    for(let j=0;j<n;j++) {
      const u=j/n,v=(j+1)/n, mid=(u+v)/2;
      const point=(cross:number[],t:number):Vec3=>[a[0]+dx*t+nx*cross[0],a[1]+(b[1]-a[1])*t+cross[1],a[2]+dz*t+nz*cross[0]];
      for(let k=0;k<INNER.length-1;k++) {
        const innerA=INNER[k],innerB=INNER[k+1];
        // Remove only low side pieces when another corridor/alcove needs this space.
        // The roof stays continuous above the branching visitor clearance envelope.
        if(k<=1||k>=5) {
          const probes=[u,mid,v].map(t=>point([Math.sign(innerA[0]+innerB[0])*3.65,0],t));
          if(probes.some(p=>ROUTES.some(r=>batch2Segment(p[0],p[2],r).distance<3.4)
            ||Math.hypot(p[0]-CAVE_CHIME_ANCHOR[0],p[2]-CAVE_CHIME_ANCHOR[2])<2.2))continue;
        }
        const p=[point(innerA,u-.003),point(innerB,u-.003),point(OUTER[k+1],u-.003),point(OUTER[k],u-.003),
          point(innerA,v+.003),point(innerB,v+.003),point(OUTER[k+1],v+.003),point(OUTER[k],v+.003)];
        solid.add(prism(p),'stone');
        // Dark mineral bedding breaks the masonry rhythm without closing the path.
        if((j+i+routeIndex)%3===0 && k>0&&k<6) {
          const q=point([innerA[0]*.996,innerA[1]-.018],u+.045),r=point([innerB[0]*.996,innerB[1]-.018],u+.045);
          detail.beam('roof',q,r,.055,.035);
        }
      }
      // Restrained gravel and moss collect outside the central four-metre walk.
      for(const side of [-1,1]) {
        const p=point([side*(2.65+(j%3)*.1),.045],mid);
        detail.add(new IcosahedronGeometry(.16+(j%3)*.025,0),'stone',p,undefined,[1.5,.42,1]);
        if(j%3===0)detail.add(new IcosahedronGeometry(.36,1),'leafplate',point([side*3.42,.13],mid),undefined,[1.8,.28,1]);
      }
      if(j===Math.floor(n/2) && !(routeIndex===1&&i===1)) for(let k=1;k<6;k++) {
        const q=point([INNER[k][0]*.993,INNER[k][1]-.035],mid),r=point([INNER[k+1][0]*.993,INNER[k+1][1]-.035],mid);
        seams.beam('metal',q,r,.065,.045);
      }
    }
  }
  const end=ALPHA_CAVE_DEAD_END.at(-1)!,prev=ALPHA_CAVE_DEAD_END.at(-2)!,yaw=Math.atan2(end[0]-prev[0],end[2]-prev[2]);
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw),cap:Vec3=[end[0]+Math.sin(yaw)*1.05,end[1]+3.2,end[2]+Math.cos(yaw)*1.05];
  solid.box('stone',cap,[7.5,6.4,1.3],.18,q);
  const muralPosition:Vec3=[end[0]+Math.sin(yaw)*.37,end[1],end[2]+Math.cos(yaw)*.37];
  return { solid:classifyCaveParts('solid',solid.finish()),floor:classifyCaveParts('floor',floor.finish()),detail:classifyCaveParts('detail',detail.finish()),seams:classifyCaveParts('seams',seams.finish()),muralPosition,muralYaw:yaw+Math.PI };
}
export function caveScaffold() {
  const b=new AlphaBuilder();
  for(const x of [-1.12,1.12]) {
    b.box('stone',[x,.19,0],[.64,.38,.74],.09);b.beam('wood',[x,.3,0],[x,3.55,0],.23,.29);
    b.beam('darkwood',[x,.35,.16],[x,1.05,-.43],.13);
    b.beam('wood',[x,2.85,0],[x*.55,3.48,0],.14);
    for(const y of [.45,3.4])b.box('metal',[x,y,.165],[.28,.055,.035],.01);
  }
  b.box('wood',[0,3.56,0],[2.65,.26,.35],.035);
  b.box('darkwood',[0,3.43,-.09],[2.4,.12,.24],.02);
  for(const x of [-.65,0,.65]) {
    b.add(new TorusGeometry(.11,.025,6,12),'metal',[x,3.36,.04]);
    b.beam('rope',[x,3.27,.05],[x,3.05,.05],.023);
  }
  return b.finish();
}
export function caveChime(index:number) {
  const b=new AlphaBuilder(),height=.78+index*.07;
  // Profile returns along the inside wall: visible lip, hollow body and solid crown.
  const profile=[[0,0],[.12,0],[.2,-.08],[.23,-.2],[.23,-height],[.25,-height-.035],[.25,-height-.09],
    [.19,-height-.09],[.19,-.2],[.14,-.1],[0,-.1]].map(p=>new Vector2(p[0],p[1]));
  b.add(new LatheGeometry(profile,14),'metal');
  for(const y of [-.22,-height+.14,-height-.04])b.add(new TorusGeometry(.235,.015,5,14),'metal',[0,y,0],new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2));
  b.beam('rope',[0,-.1,0],[0,-1.65,0],.018);b.cyl('darkwood',[0,-1.65,0],.06,.18);
  b.cyl('metal',[0,-height+.08,0],.055,.18);return b.finish();
}
export function caveMinerLamp() {
  const b=new AlphaBuilder();b.cyl('darkwood',[0,.04,0],.2,.08);b.cyl('metal',[0,.1,0],.2,.035);
  b.cyl('glass',[0,.28,0],.135,.33);b.cyl('metal',[0,.47,0],.2,.075,.15);b.cyl('roof',[0,.54,0],.11,.055);
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])b.beam('metal',[Math.cos(angle)*.165,.12,Math.sin(angle)*.165],[Math.cos(angle)*.165,.48,Math.sin(angle)*.165],.025);
  b.add(new TorusGeometry(.17,.025,6,14,Math.PI),'metal',[0,.59,0]);
  return b.finish();
}
export function caveLampRack() {
  const b=new AlphaBuilder();b.box('stone',[0,.18,0],[.82,.36,.75],.09);b.beam('darkwood',[0,.3,0],[0,1.65,0],.16);
  b.beam('wood',[0,1.58,0],[.36,1.58,0],.1);b.beam('wood',[0,1.3,0],[.3,1.58,0],.075);
  b.add(new TorusGeometry(.07,.02,5,10),'metal',[.32,1.48,0]);return b.finish();
}
export function caveMural() {
  const b=new AlphaBuilder();
  // Image-like relief uses the rock face as its backing, rather than a floating sign.
  const lines:Vec3[][]=[[[ -2.4,2.3,.035],[-.9,3.7,.035],[.4,2.3,.035]],[[.2,2.3,.035],[1.1,3.1,.035],[2.4,2.3,.035]]];
  for(let row=0;row<3;row++) lines.push(Array.from({length:13},(_,i)=>[-2.4+i*.4,1.1+row*.3+Math.sin(i*Math.PI/2)*.1,.035] as Vec3));
  for(const line of lines)for(let i=1;i<line.length;i++)b.beam('metal',line[i-1],line[i],.045);
  b.add(new TorusGeometry(.33,.035,5,14),'metal',[1.45,3.9,.035]);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;b.beam('metal',[1.45+Math.cos(a)*.47,3.9+Math.sin(a)*.47,.035],[1.45+Math.cos(a)*.66,3.9+Math.sin(a)*.66,.035],.03);}
  return b.finish();
}
export function caveChimeTarget(index:number):Vec3 {
  const x=(index-1)*.65;
  return [CAVE_CHIME_ANCHOR[0]+Math.cos(CAVE_CHIME_YAW)*x,CAVE_CHIME_ANCHOR[1]+1.4,CAVE_CHIME_ANCHOR[2]-Math.sin(CAVE_CHIME_YAW)*x+.05];
}
