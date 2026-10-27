import { BufferAttribute, BufferGeometry, Euler, ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import { coasterWorld } from './coaster-track.ts';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import type { Vec3 } from '../types';

/** Actual walkable surfaces: start on the retained forecourt and reach an eight-metre lookout. */
export const COASTER_CLIFF_WALK: Vec3[] = [[16,.08,54],[45,.08,48],[60,5,32],[55,8.08,18],[55,8.08,14]];
export const COASTER_CLIFF_LAMPS: Vec3[] = [[49,10.3,8],[61,10.3,8]];
export const COASTER_LOOKOUT = { center: [55,7.88,14] as Vec3, size: [12,.4,12] as Vec3 };
export function onCoasterCliffWalk(x: number,z: number,margin=3) {
  for(let i=1;i<COASTER_CLIFF_WALK.length;i++){
    const a=COASTER_CLIFF_WALK[i-1],b=COASTER_CLIFF_WALK[i],dx=b[0]-a[0],dz=b[2]-a[2];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)<margin+2.7)return true;
  }
  return Math.abs(x-55)<6+margin&&Math.abs(z-14)<6+margin;
}
export function addCoasterCliffs(steel: CoasterBatch,glow: CoasterBatch,colliders: CoasterCollider[]) {
  // Irregular mineral apron supports the new workshop; its contact positions remain owned by the main session.
  const apron = new Shape();
  [[-34,55],[-3,55],[2,65],[-1,78],[-13,80],[-29,77],[-34,67]].forEach(([x,z],i)=>i?apron.lineTo(x,-z):apron.moveTo(x,-z)); apron.closePath();
  // A four-centimetre lip separates this paving from the retained .08 m forecourt.
  // Coplanar surfaces flickered visibly under the night lighting.
  steel.add(new ExtrudeGeometry(apron,{depth:.12,bevelEnabled:false}), '#aca48e', new Matrix4().makeTranslation(...coasterWorld([0,0,0])).multiply(new Matrix4().makeRotationX(-Math.PI/2)));
  colliders.push({position:coasterWorld([-16,.06,67]),half:[11,.06,10],surface:true});
  const addBox=(p:Vector3,size:Vec3,q:Quaternion,color:string,surface=false)=>{
    steel.box(p.toArray() as Vec3,size,color,q);
    colliders.push({position:p.toArray() as Vec3,half:size.map(v=>v/2) as Vec3,rotation:new Euler().setFromQuaternion(q).toArray().slice(0,3) as Vec3,surface});
  };
  const up=new Vector3(0,1,0);
  for(let i=1;i<COASTER_CLIFF_WALK.length;i++){
    const a=new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i-1])),b=new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i]));
    const forward=b.clone().sub(a).normalize(),side=new Vector3(-forward.z,0,forward.x).normalize(),normal=side.clone().cross(forward).normalize();
    const q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(forward,normal,side)),length=a.distanceTo(b),mid=a.clone().add(b).multiplyScalar(.5);
    addBox(mid.clone().addScaledVector(normal,-.18),[length+.2,.36,5.2],q,'#aaa08b',true);
    for(const sign of [-1,1]){
      const edge=mid.clone().addScaledVector(side,sign*2.55);
      addBox(edge.clone().addScaledVector(up,.55),[length,1.1,.12],q,'#50666d');
      glow.beam(a.clone().addScaledVector(side,sign*2.48).addScaledVector(up,.16).toArray() as Vec3,b.clone().addScaledVector(side,sign*2.48).addScaledVector(up,.16).toArray() as Vec3,.045,'#ffd087',4);
      for(let at=1;at<length;at+=4){
        const point=a.clone().lerp(b,at/length).addScaledVector(side,sign*2.5);
        steel.beam(point.toArray() as Vec3,point.clone().addScaledVector(up,1.15).toArray() as Vec3,.075,'#a8895d');
      }
    }
    // Piers anchor the slope slabs instead of presenting a floating path.
    if(i>1)for(const t of [.2,.75]){
      const p=a.clone().lerp(b,t),top=p.y-.6;steel.housing([p.x,(top+1)/2,p.z],[1.2,top-1,1.2],'#89918d');
      colliders.push({position:[p.x,(top+1)/2,p.z],half:[.6,(top-1)/2,.6]});
    }
  }
  addBox(new Vector3(...coasterWorld(COASTER_LOOKOUT.center)),COASTER_LOOKOUT.size,new Quaternion(),'#a9a18c',true);
  // One representative cliff mass, with distinct upper strata and a battered lower face.
  const edge: [number,number][]=[[47,8],[54,5],[62,9],[64,17],[60,24],[47,24],[44,16]];
  const colors=['#78848a','#92968d','#65757e'];
  for(let ring=0;ring<3;ring++)for(let i=0;i<edge.length;i++){
    const a=edge[i],b=edge[(i+1)%edge.length],low=[-5,2,5.7][ring],high=[2,5.7,7.65][ring];
    const p=(v:[number,number],y:number,scale:number)=>coasterWorld([55+(v[0]-55)*scale,y,14+(v[1]-14)*scale]);
    const verts=[p(a,low,1.1),p(a,high,1),p(b,high,1),p(a,low,1.1),p(b,high,1),p(b,low,1.1)];
    const g=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(verts.flat()),3));g.computeVertexNormals();steel.add(g,colors[(i+ring)%3]);
  }
  colliders.push({position:coasterWorld([55,3.8,14]),half:[5.8,3.8,5.8]});
  for(const [x,y,z] of COASTER_CLIFF_LAMPS){
    steel.beam(coasterWorld([x,8.08,z]),coasterWorld([x,y+.35,z]),.1,'#62737a');
    steel.housing(coasterWorld([x,y,z]),[.5,.8,.5],'#3d5660');
    glow.box(coasterWorld([x,y,z]),[.3,.55,.53],'#ffd087');
    glow.box(coasterWorld([x,y,z]),[.53,.55,.3],'#ffd087');
  }
  // The far and side rails leave the south access open at z=20.
  for(const [a,b] of [[[49,8],[61,8]],[[49,8],[49,20]],[[61,8],[61,20]]] as [number,number][][]){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),q=new Quaternion().setFromAxisAngle(up,-Math.atan2(dz,dx));
    addBox(new Vector3(...coasterWorld([(a[0]+b[0])/2,8.68,(a[1]+b[1])/2])),[len,1.2,.16],q,'#536870');
    glow.beam(coasterWorld([a[0],8.3,a[1]]),coasterWorld([b[0],8.3,b[1]]),.055,'#ffca7e',4);
  }
}
