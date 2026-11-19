import {useMemo,type RefObject} from 'react';
import {ConvexHullCollider,RigidBody} from '@react-three/rapier';
import type {Group} from 'three';
import {alphaLanternGeometry} from './alpha-art';
import {alphaMaterial} from './alpha-materials';
import {shelfLanternPosition} from './alpha-lantern-layout';
import {useOwnedWorldVisual} from '../useOwnedWorldVisual';

export default function AlphaLantern({shelf,hand}:{shelf?:0|1;hand?:RefObject<Group|null>}) {
  const model=useMemo(()=>{
    const parts=alphaLanternGeometry().map(p=>({...p,material:alphaMaterial(p.finish)}));
    const base=parts.find(p=>p.finish==='darkwood')!;
    return {parts,base,dispose(){for(const p of parts){p.geometry.dispose();p.material.dispose();}}};
  },[]);
  useOwnedWorldVisual(model);
  const id='alpha-lantern-base-'+shelf;
  const meshes=model.parts.map(p=><mesh key={p.finish} name={'alpha-paper-lantern-'+p.finish} geometry={p.geometry} material={p.material}
    castShadow receiveShadow dispose={null} userData={shelf===undefined
      ? {worldCollision:'none',collisionReason:'Carried lantern follows its owner’s palm'}
      : p===model.base ? {worldCollision:'solid',surfaceId:id}
      : {worldCollision:'none',collisionReason:'Light paper shade and cord around the wooden base remain traversable'}}/>);
  if(shelf===undefined)return <group ref={hand} name="alpha-carried-paper-lantern">{meshes}</group>;
  return <RigidBody type="fixed" colliders={false} name={'alpha-racked-lantern-'+shelf} position={shelfLanternPosition(shelf)}
    userData={{solid:true,assetId:'alpha-lantern-base'}}>
    {meshes}
    <ConvexHullCollider name={id} args={[model.base.geometry.attributes.position.array as Float32Array]}/>
  </RigidBody>;
}
