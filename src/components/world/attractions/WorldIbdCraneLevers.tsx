import { useEffect,useMemo,useRef } from 'react';
import { RigidBody,TrimeshCollider,useBeforePhysicsStep,type RapierRigidBody } from '@react-three/rapier';
import { Quaternion,Vector3,type MeshStandardMaterial } from 'three';
import { buildIbdCraneLever } from './ibd-craft-geometry';
import { CRANE_PIVOTS,craneControl } from './ibd-crane-control';
import { ibdGeometryContact } from './ibd-static-contact';

const leverIds=['ibd-hoist-lever-left','ibd-hoist-lever-right'] as const;

export default function WorldIbdCraneLevers({material}:{material:MeshStandardMaterial}){
  const resources=useMemo(()=>{
    const geometry=buildIbdCraneLever();
    return {geometry,contact:ibdGeometryContact(geometry,leverIds[0],0,geometry.index!.count),
      axes:[new Vector3(1,0,0),new Vector3(0,0,1)],rotation:new Quaternion()};
  },[]);
  const bodies=useRef<(RapierRigidBody|null)[]>([]), previous=useRef([NaN,NaN]);
  useEffect(()=>()=>resources.geometry.dispose(),[resources]);
  useBeforePhysicsStep(()=>{
    const angles=[craneControl.leftAngle,craneControl.rightAngle];
    for(const [index,angle] of angles.entries()){
      const body=bodies.current[index];
      if(!body||angle===previous.current[index])continue;
      body.setNextKinematicRotation(resources.rotation.setFromAxisAngle(resources.axes[index],angle));
      previous.current[index]=angle;
    }
  });
  return <group name="ibd-crane-levers">
    {leverIds.map((id,index)=><RigidBody key={id} type="kinematicPosition" colliders={false}
      ref={body=>{bodies.current[index]=body;}}
      position={CRANE_PIVOTS[index]} userData={{solid:true,assetId:'ibd-crane-levers'}}>
      <TrimeshCollider name={id} args={[resources.contact.vertices,resources.contact.indices]}/>
      <mesh geometry={resources.geometry} material={material} castShadow userData={{worldCollision:'solid',surfaceId:id}}/>
    </RigidBody>)}
  </group>;
}
