import { Euler, ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import { coasterWorld } from './coaster-track.ts';
import { addCoasterLookoutSample } from './coaster-lookout-sample.ts';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import type { Vec3 } from '../types';

/** Actual walkable surfaces: start on the retained forecourt and reach an eight-metre lookout. */
// Reach deck height at its south edge (z=20), before entering the horizontal slab.
// Ending the incline inside the deck left its 44 cm front face across the route.
export const COASTER_CLIFF_WALK: Vec3[] = [[16,.08,54],[45,.08,48],[60,5,32],[55,8.08,20],[55,8.08,14]];
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
      glow.beam(a.clone().addScaledVector(side,sign*2.48).addScaledVector(up,.16).toArray() as Vec3,b.clone().addScaledVector(side,sign*2.48).addScaledVector(up,.16).toArray() as Vec3,.045,'#ffd087',4);
      // The final horizontal leg is already inside the guarded deck. Preserve its floor/light
      // guide while removing the duplicate opaque corridor walls inside the lookout.
      if(i<COASTER_CLIFF_WALK.length-1){
        const edge=mid.clone().addScaledVector(side,sign*2.55);
        addBox(edge.clone().addScaledVector(up,.55),[length,1.1,.12],q,'#50666d');
        for(let at=1;at<length;at+=4){
          const point=a.clone().lerp(b,at/length).addScaledVector(side,sign*2.5);
          steel.beam(point.toArray() as Vec3,point.clone().addScaledVector(up,1.15).toArray() as Vec3,.075,'#a8895d');
        }
      }
    }
    // Piers anchor the slope slabs instead of presenting a floating path.
    if(i>1)for(const t of [.2,.75]){
      const p=a.clone().lerp(b,t),top=p.y-.6;steel.housing([p.x,(top+1)/2,p.z],[1.2,top-1,1.2],'#89918d');
      colliders.push({position:[p.x,(top+1)/2,p.z],half:[.6,(top-1)/2,.6]});
    }
  }
  addBox(new Vector3(...coasterWorld(COASTER_LOOKOUT.center)),COASTER_LOOKOUT.size,new Quaternion(),'#a9a18c',true);
  addCoasterLookoutSample(steel,glow,colliders);
  for(const [x,y,z] of COASTER_CLIFF_LAMPS){
    steel.beam(coasterWorld([x,8.08,z]),coasterWorld([x,y+.35,z]),.1,'#62737a');
    steel.housing(coasterWorld([x,y,z]),[.5,.8,.5],'#3d5660');
    glow.box(coasterWorld([x,y,z]),[.3,.55,.53],'#ffd087');
    glow.box(coasterWorld([x,y,z]),[.53,.55,.3],'#ffd087');
  }
}
