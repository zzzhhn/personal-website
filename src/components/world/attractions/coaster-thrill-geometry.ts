import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Curve, CylinderGeometry, Matrix4, Quaternion, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THRILL_LENGTH } from './coaster-thrill-layout.ts';
import { thrillFrame } from './coaster-thrill-frame.ts';

export interface ThrillSupport { a:Vector3; b:Vector3; radius:number }
export function pointSegmentDistance(p:Vector3,a:Vector3,b:Vector3) {
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/Math.max(1e-9,x*x+y*y+z*z)));
  return Math.hypot(p.x-a.x-x*t,p.y-a.y-y*t,p.z-a.z-z*t);
}
/** Spatial sample geometry only. Island, paths, tower cladding and lights are a later
 * integration step. Retains a measured rider envelope instead of hiding support clashes. */
export function buildThrillTrack() {
  const parts:BufferGeometry[]=[],supportSegments:ThrillSupport[]=[];
  const add=(geometry:BufferGeometry,color:string,matrix?:Matrix4)=>{
    const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();
    g.deleteAttribute('uv');if(matrix)g.applyMatrix4(matrix);
    const rgb=new Color(color),colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=rgb.r;colors[i+1]=rgb.g;colors[i+2]=rgb.b;}
    g.setAttribute('color',new BufferAttribute(colors,3));parts.push(g);
  };
  class Rail extends Curve<Vector3> {
    constructor(readonly side:number,readonly height:number){super();}
    getPoint(t:number,target=new Vector3()){const f=thrillFrame(t);return target.copy(f.point).addScaledVector(f.side,this.side).addScaledVector(f.up,this.height);}
  }
  for(const side of [-.78,.78])add(new TubeGeometry(new Rail(side,0),1800,.11,6,true),'#c5d2d6');
  add(new TubeGeometry(new Rail(0,-.48),1800,.24,4,true),'#254859');
  const ties=Math.ceil(THRILL_LENGTH/2.5);
  for(let i=0;i<ties;i++) {
    const f=thrillFrame(i/ties);
    add(new BoxGeometry(.13,.13,2.1),'#b78d59',new Matrix4().compose(f.point,f.rotation,new Vector3(1,1,1)));
  }
  const corners=[[-1.5,.3,-.95],[-1.5,.3,.95],[1.5,.3,-.95],[1.5,.3,.95],[-.6,1.5,-.95],[-.6,1.5,.95],[1.5,1.5,-.95],[1.5,1.5,.95],[0,2.2,0],[0,.75,0]];
  const samples=Array.from({length:3600},(_,i)=>{
    const f=thrillFrame(i/3600);return corners.map(p=>new Vector3(p[0],p[1],p[2]).applyQuaternion(f.rotation).add(f.point));
  }).flat();
  const beam=(a:Vector3,b:Vector3,radius:number)=>{
    const d=b.clone().sub(a);
    supportSegments.push({a:a.clone(),b:b.clone(),radius});
    add(new CylinderGeometry(radius,radius,d.length(),6),'#526e7c',new Matrix4().compose(a.clone().add(b).multiplyScalar(.5),
      new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1)));
  };
  const n=Math.ceil(THRILL_LENGTH/18);
  for(let i=0;i<n;i++) {
    const f=thrillFrame(i/n);if(f.point.y<7||Math.abs(f.up.y)<.7)continue;
    const top=f.point.clone().addScaledVector(f.up,-.7),side=new Vector3(f.side.x,0,f.side.z).normalize();
    const a=top.clone().addScaledVector(side,-5.5),b=top.clone().addScaledVector(side,5.5);
    const footA=new Vector3(a.x,1,a.z),footB=new Vector3(b.x,1,b.z);
    const segments:[[Vector3,Vector3], [Vector3,Vector3], [Vector3,Vector3]]=[[footA,a],[footB,b],[a,b]];
    if(segments.some(([x,y])=>samples.some(p=>pointSegmentDistance(p,x,y)<.72)))continue;
    segments.forEach(([x,y])=>beam(x,y,.3));
    for(const p of [footA,footB])add(new BoxGeometry(2.2,.8,2.2),'#b0b3a9',new Matrix4().makeTranslation(p.x,1.2,p.z));
  }
  const geometry=mergeGeometries(parts,false)??new BufferGeometry();parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();
  return {geometry,supportSegments};
}
