import { useMemo, useRef } from 'react';
import { RigidBody, TrimeshCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import { alphaMaterial } from './alpha-materials';
import { alphaMotion, useAlphaStore } from './alpha-state';
import { buildStationControl, stationControlAngle, stationControlPivots, type StationControl } from './alpha-station-control';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual';

export default function AlphaStationControl({kind}:{kind:StationControl}) {
  const body = useRef<RapierRigidBody>(null);
  const angle = useRef(0);
  const model = useMemo(()=>{
    const parts = buildStationControl(kind).map(part=>({...part,material:alphaMaterial(part.finish)}));
    return {parts,axis:kind==='wind'?new Vector3(0,1,0):new Vector3(0,0,1),rotation:new Quaternion(),
      dispose(){for(const part of parts){part.geometry.dispose();part.material.dispose();}}};
  },[kind]);
  useOwnedWorldVisual(model);
  useBeforePhysicsStep(world=>{
    const next = stationControlAngle(kind,angle.current,world.timestep,alphaMotion.time-alphaMotion.bellAt,useAlphaStore.getState().wind);
    if (!body.current || next===angle.current) return;
    angle.current=next;
    body.current.setNextKinematicRotation(model.rotation.setFromAxisAngle(model.axis,next));
  });
  return <RigidBody ref={body} type="kinematicPosition" name={'alpha-'+kind+'-control'} colliders={false}
    position={stationControlPivots[kind]} userData={{solid:true,assetId:'alpha-'+kind+'-control'}}>
    {model.parts.map(p=><group key={p.id}>
      <mesh name={p.id} material={p.material} geometry={p.geometry} castShadow receiveShadow dispose={null}
        userData={p.contact?{worldCollision:'solid',surfaceId:p.id}:{worldCollision:'none',collisionReason:'Free-hanging bell cord yields when brushed'}}/>
      {p.contact&&<TrimeshCollider name={p.id} args={[p.contact.vertices,p.contact.indices]}/>}
    </group>)}
  </RigidBody>;
}
