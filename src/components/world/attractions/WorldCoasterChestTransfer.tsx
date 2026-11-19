import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ConvexHullCollider, RigidBody, TrimeshCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { useWorldStore } from '../store';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { createIntentKey } from './coaster-device-geometry';
import { coasterWorld, COASTER_GATE_Z } from './coaster-track';
import { activateIntentTarget, useIntentStore } from './intent-state';
import { WorldIntentReflectiveSurface } from './WorldIntentSurface';
import { CHEST_BODY_CONTACT, CHEST_LID_CONTACT, CHEST_OPEN_LID, createCoasterChestRuntime } from './coaster-chest-runtime';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-chest-transfer-20261104/coaster-chest.glb?url';

function ChestModel({ open, passed }: { open: boolean; passed: readonly string[] }) {
  const { scene } = useGLTF(assetUrl);
  const model = useMemo(() => createCoasterChestRuntime(scene), [scene]);
  const environment = useDjcFurnitureEnvironment();
  const previousNight = useRef(NaN);
  const initialOpen = useRef(open).current;
  const lidBody = useRef<RapierRigidBody>(null);
  useBeforePhysicsStep(() => {
    const body=lidBody.current;
    if(!body)return;
    const current=body.rotation(),next=model.lid.quaternion;
    if(Math.abs(current.x-next.x)+Math.abs(current.y-next.y)+Math.abs(current.z-next.z)+Math.abs(current.w-next.w)>1e-6)
      body.setNextKinematicRotation(next);
  });
  useLayoutEffect(() => { model.lid.rotation.x = initialOpen ? CHEST_OPEN_LID : 0; }, [model, initialOpen]);
  useLayoutEffect(() => { model.setPassed(passed); }, [model, passed]);
  useLayoutEffect(() => {
    for (const material of model.materials) {
      material.envMap = environment;
      material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      material.needsUpdate = true;
    }
    previousNight.current = night.value;
  }, [model, environment]);
  useEffect(() => model.retain(), [model]);
  useFrame((_, dt) => {
    if (previousNight.current !== night.value) {
      for (const material of model.materials) material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      previousNight.current = night.value;
    }
    if (useWorldStore.getState().paused || document.hidden || dt > .25) return;
    const target = open ? CHEST_OPEN_LID : 0;
    model.lid.rotation.x += (target - model.lid.rotation.x) * (1 - Math.exp(-dt * 7));
  });
  // The helper owns derived buffers and material clones; GLTF cache data stays borrowed.
  const at = model.body.output;
  return <group name="coaster-chest-installed-contact">
    <primitive object={model.root} dispose={null} />
    <RigidBody type="fixed" colliders={false} position={at.position} quaternion={at.quaternion} userData={{solid:true, interactable:'intent-chest'}}>
      <TrimeshCollider name={CHEST_BODY_CONTACT} args={[model.body.contact.vertices,model.body.contact.indices]}/>
    </RigidBody>
    <RigidBody ref={lidBody} type="kinematicPosition" colliders={false} position={model.lid.position} rotation={[initialOpen?CHEST_OPEN_LID:0,0,0]}
      userData={{solid:true, interactable:'intent-chest'}}>
      <ConvexHullCollider name={CHEST_LID_CONTACT} args={[model.lidContact.vertices]}/>
    </RigidBody>
  </group>;
}

/** Drop-in for the private IntentChest in WorldIntentDevices. Interaction registration stays there. */
export default function WorldCoasterChestTransfer({ keyVisual }: { keyVisual?: ReactNode } = {}) {
  const progress = useIntentStore(s => s.progress);
  const key = useMemo(createIntentKey, []);
  useEffect(() => () => key.dispose(), [key]);
  return <>
    <group position={coasterWorld([-8, 0, 59.5])} onClick={e => { e.stopPropagation(); activateIntentTarget('chest'); }}>
      <Suspense fallback={null}><ChestModel open={progress.chestOpen} passed={progress.passed} /></Suspense>
      {progress.chestOpen && !progress.keyTaken && <group position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]} userData={keySource}>{keyVisual ?? <mesh geometry={key}><WorldIntentReflectiveSurface metalness={.35} roughness={.4} /></mesh>}</group>}
    </group>
    {progress.gateOpen && <group position={coasterWorld([5.3, 1.65, COASTER_GATE_Z + .5])} userData={keySource}>{keyVisual ?? <mesh geometry={key}><WorldIntentReflectiveSurface roughness={.4} /></mesh>}</group>}
  </>;
}
const keySource={worldCollision:'none',worldCollisionReason:'Pickup and keyhole prop owned by the chest or lock action'};
