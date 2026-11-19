import { useMemo, useRef } from 'react';
import { ConvexHullCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import { alphaWorld } from './alpha-layout';
import { alphaMotion, useAlphaStore } from './alpha-state';
import { buildTumblingSign, tumblingSignPose } from './alpha-tumbling-sign';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual';

export default function AlphaTumblingSign() {
  const body = useRef<RapierRigidBody>(null);
  const model = useMemo(buildTumblingSign, []);
  useOwnedWorldVisual(model);
  const frame = useMemo(() => {
    const strength = useAlphaStore.getState().wind, start = alphaMotion.windAt;
    const age = Math.min(9, Math.max(0, alphaMotion.time - start));
    return { start, strength, age, initial: tumblingSignPose(model.corners, strength, age),
      axis: new Vector3(0, 0, 1), rotation: new Quaternion(), translation: new Vector3() };
  }, [model]);
  useBeforePhysicsStep(() => {
    if (!body.current) return;
    const strength = useAlphaStore.getState().wind, start = alphaMotion.windAt;
    const age = Math.min(9, Math.max(0, alphaMotion.time - start));
    if (age === frame.age && strength === frame.strength && start === frame.start) return;
    const pose = tumblingSignPose(model.corners, strength, age);
    frame.translation.set(...alphaWorld(pose.position));
    frame.rotation.setFromAxisAngle(frame.axis, pose.angle);
    if (start !== frame.start || strength !== frame.strength) {
      // Re-racking the sign is a discontinuity. Never sweep the 28 m return path through players.
      body.current.setTranslation(frame.translation, true);
      body.current.setRotation(frame.rotation, true);
    }
    body.current.setNextKinematicTranslation(frame.translation);
    body.current.setNextKinematicRotation(frame.rotation);
    Object.assign(frame, {age, start, strength});
  });
  return <RigidBody name="alpha-tumbling-wind-sign" ref={body} type="kinematicPosition" colliders={false}
    position={frame.initial.position} rotation={[0, 0, frame.initial.angle]} userData={{solid:true, assetId:'alpha-tumbling-wind-sign'}}>
    {model.parts.map(part => <group key={part.id}>
      <mesh name={part.id} geometry={part.geometry} userData={{worldCollision:'solid',surfaceId:part.id}}>
        <meshStandardMaterial color={part.color} roughness={part.roughness}/>
      </mesh>
      <ConvexHullCollider name={part.id} args={[part.geometry.attributes.position.array as Float32Array]}/>
    </group>)}
  </RigidBody>;
}
