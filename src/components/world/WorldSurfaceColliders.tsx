import {useMemo} from 'react';
import {RigidBody,TrimeshCollider} from '@react-three/rapier';
import {BoxGeometry} from 'three';
import type {Vec3} from './types';

const NO_ROTATION: Vec3 = [0, 0, 0];
const slabKey = (item: {position:Vec3;size:Vec3;rotation?:Vec3}) =>
  `${item.position.join(',')}|${item.size.join(',')}|${(item.rotation ?? NO_ROTATION).join(',')}`;

/** A drivable slab has a support-only top and solid sides. Keeping separate
 * colliders lets wheel side guards ignore suspension surfaces without ignoring
 * curbs, bridge edges or the sides of pads. Visual coordinates stay identical. */
export default function WorldSurfaceColliders({items,name}:{items:{position:Vec3;size:Vec3;rotation?:Vec3}[];name:string}){
  const meshes=useMemo(()=>items.map(item=>{
    const [x,y,z]=item.size.map(v=>v/2);
    const top=new Float32Array([-x,y,-z,x,y,-z,x,y,z,-x,y,z]);
    const box=new BoxGeometry(...item.size);
    const sides=new Float32Array(box.getAttribute('position').array);
    // BoxGeometry's third face (+Y) is the support top, indices 12..17.
    const indices=new Uint32Array(Array.from(box.index!.array).filter((_,i)=>i<12||i>=18));
    box.dispose();
    return{top,sides,indices};
  }),[items]);
  return <>
    <RigidBody name={`${name}-support`} type="fixed" colliders={false} userData={{surface:true}}>
      {/* Claims remove greybox slabs asynchronously. Keep each collider tied to its slab, rather than
          reusing the previous array index with different immutable geometry or rotation props. */}
      {items.map((item,i)=><TrimeshCollider key={slabKey(item)} name={`${name}-${i}-top`} position={item.position} rotation={item.rotation ?? NO_ROTATION}
        args={[meshes[i].top,new Uint32Array([0,2,1,0,3,2])]} friction={.95} restitution={0}/>) }
    </RigidBody>
    <RigidBody name={`${name}-sides`} type="fixed" colliders={false} userData={{solid:true}}>
      {items.map((item,i)=><TrimeshCollider key={slabKey(item)} name={`${name}-${i}-sides`} position={item.position} rotation={item.rotation ?? NO_ROTATION}
        args={[meshes[i].sides,meshes[i].indices]} friction={.65} restitution={0}/>) }
    </RigidBody>
  </>;
}
