import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ConvexHullCollider, RigidBody, TrimeshCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { WORKSHOP_CARRIER_Y, WORKSHOP_TARGETS, WORKSHOP_TOOLS, workshopTarget, type WorkshopTarget } from './intent-workshop-layout';
import { advanceWorkshop, operateWorkshop, resetWorkshop, useWorkshopStore, workshopAvailable, workshopClock, workshopCarrierProgress, workshopOutputComplete, WORKSHOP_LEVER_SECONDS } from './intent-workshop-runtime';
import { useIntentStore } from './intent-state';
import { createWorkshopGeometry } from './intent-workshop-geometry';
import { coasterWorld } from './coaster-track';
import WorldWorkshopSigns from './WorldWorkshopSigns';
import type { IntentClass } from './intent-tasks';
import { createWorkshopCraftRuntime, WORKSHOP_CONTACT_ID, WORKSHOP_LEVERS } from './coaster-workshop-craft-runtime';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-workshop-craft-20261105/coaster-workshop.glb?url';

function WorkshopInteraction({ id }: { id: WorkshopTarget }) {
  const phase = useWorkshopStore(s => s.phase);
  const tool = WORKSHOP_TOOLS.find(t => t.id === id);
  useInteractable({ id: `intent-workshop-${id}`, kind: 'exhibit', position: workshopTarget(id), radius: 2.6,
    label: id === 'intake' ? { zh: phase === 'result' ? '拉动接件杆，取下一件' : '拉动接件杆，接收请求', en: 'Pull the intake lever to receive a request' }
      : id === 'bell' ? { zh: '摇铃，问清想要什么', en: 'Ring to clarify the request' }
      : { zh: `拉杆送入${tool!.label.zh}`, en: `Route to ${tool!.label.en}` },
    enabled: () => workshopAvailable(id), onInteract: () => operateWorkshop(id) });
  return null;
}
type CraftModel = ReturnType<typeof createWorkshopCraftRuntime>;
function WorkshopMotion({ tool, model }: { tool: IntentClass; model: CraftModel }) {
  const completed = useIntentStore(s => workshopOutputComplete(tool, s.progress.passed));
  const at = useMemo(() => coasterWorld(WORKSHOP_TOOLS.find(t => t.id === tool)!.at), [tool]);
  useFrame(() => {
    const group = model.motion[tool];
    const s = useWorkshopStore.getState(), elapsed = workshopClock.elapsed;
    const operating = s.tool === tool && s.phase === 'processing';
    const f = operating ? Math.max(0, Math.min(1, (elapsed - 1.5) / 1.3)) : completed ? 1 : 0;
    group.visible = operating || completed;
    const [x, y, z] = at;
    group.position.set(x, y + 1.53, z);
    if (tool === 'lookup') group.position.set(x - .7 + f * 1.15, y + 2.05, z - .2);
    if (tool === 'act') group.position.y = y + 2.03 - f * .4;
    if (tool === 'plan') group.position.set(x - .85 + f * 1.3, y + 1.65, z + .25 - Math.sin(f * Math.PI) * .75);
    if (tool === 'debug') group.position.set(x - .8 + f * 1.4, y + 1.65, z);
    if (tool === 'rewrite') group.position.z = z + .6 - Math.sin(f * Math.PI) * 1.2;
    if (tool === 'extract') { group.position.z = z + f * .5; group.scale.x = .2 + f * .8; }
  });
  return null;
}

function WorkshopCraftInner() {
  const { scene } = useGLTF(assetUrl);
  const model = useMemo(() => createWorkshopCraftRuntime(scene), [scene]);
  const environment = useDjcFurnitureEnvironment();
  const previousNight = useRef(NaN);
  useEffect(() => model.retain(), [model]);
  useLayoutEffect(() => {
    for (const material of model.materials) {
      material.envMap = environment;
      material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      material.needsUpdate = true;
    }
    previousNight.current = night.value;
  }, [model, environment]);
  // Retain the original emissive overlay on the authored machine faces.
  const geometry = useMemo(createWorkshopGeometry, []);
  const leverFrame = useMemo(() => ({ matrix: new Matrix4(), axis: new Vector3(1,0,0), scale: new Vector3(1,1,1), at: new Vector3(), value: NaN, intakeValue: NaN, tool: '' }), []);
  const leverBodies = useRef<(RapierRigidBody|null)[]>([]);
  const leverRotations = useMemo(()=>WORKSHOP_LEVERS.map(()=>new Quaternion()),[]);
  useBeforePhysicsStep(()=>leverBodies.current.forEach((body,i)=>{
    if(!body)return;
    const target=leverRotations[i], current=body.rotation();
    if(Math.abs(target.x-current.x)>1e-6||Math.abs(target.w-current.w)>1e-6)body.setNextKinematicRotation(target);
  }));
  const positions = useMemo(() => ({ a: new Vector3(...coasterWorld([-16, 1.66, 73])), b: new Vector3(), p: new Vector3() }), []);
  const paths = useMemo(() => Object.fromEntries(WORKSHOP_TOOLS.map(({ id, at }) => [id,
    [coasterWorld([-16, 1.66, 73]), coasterWorld([-16, WORKSHOP_CARRIER_Y, 72.15]), coasterWorld([-16, WORKSHOP_CARRIER_Y, 67]),
      coasterWorld([at[0], WORKSHOP_CARRIER_Y, at[2] - .85]), coasterWorld([at[0], 1.6, at[2]])]])), []);
  useEffect(() => () => { geometry.body.dispose(); geometry.glow.dispose(); resetWorkshop(); }, [geometry]);
  useFrame((_, dt) => {
    if (previousNight.current !== night.value) {
      for (const material of model.materials) material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      previousNight.current = night.value;
    }
    const w = useWorldStore.getState();
    advanceWorkshop(dt, w.paused || w.poolInspect || !!w.card || !!w.shot, document.hidden);
    const capsule = model.capsule;
    const s = useWorkshopStore.getState();
    const lever = s.phase === 'processing' ? Math.sin(Math.min(1, workshopClock.elapsed / WORKSHOP_LEVER_SECONDS) * Math.PI) * .85 : 0;
    const intakeLever = Math.sin(workshopClock.intakeElapsed / WORKSHOP_LEVER_SECONDS * Math.PI) * .85;
    if (leverFrame.value !== lever || leverFrame.intakeValue !== intakeLever || leverFrame.tool !== (s.tool ?? '')) {
      WORKSHOP_LEVERS.forEach(({position}, i) => {
        const id = i ? WORKSHOP_TOOLS[i - 1].id : null;
        leverFrame.at.set(...position);
        const rotation=leverRotations[i].setFromAxisAngle(leverFrame.axis, i === 0 ? intakeLever : id === s.tool ? lever : 0);
        model.setLeverAt(i, leverFrame.matrix.compose(leverFrame.at, rotation, leverFrame.scale));
      });
      model.updateLevers(); leverFrame.value = lever; leverFrame.intakeValue = intakeLever; leverFrame.tool = s.tool ?? '';
    }
    capsule.visible = s.phase === 'ready' || s.phase === 'processing' || s.phase === 'returning';
    if ((s.phase === 'processing' || s.phase === 'returning') && s.tool) {
      const f = workshopCarrierProgress(s.phase, workshopClock.elapsed), path = paths[s.tool];
      const step = Math.min(3, Math.floor(f * 4)), blend = Math.min(1, f * 4 - step);
      positions.p.fromArray(path[step]); positions.b.fromArray(path[step + 1]); positions.p.lerp(positions.b, blend);
      capsule.position.copy(positions.p); capsule.rotation.y = 0;
      // Visible short-stroke mechanism: stow the intake support feet before
      // crossing any apparatus. The parent carrier path/time is unchanged.
      model.saddles.position.y = .295 * Math.min(1, f * 16);
    } else { capsule.position.copy(positions.a); capsule.rotation.y = 0; model.saddles.position.y = 0; }
  });
  return <group name="intent-workshop"><group name="coaster-workshop-installed-contact">
    <primitive object={model.root} dispose={null} />
    <mesh name="coaster-workshop-glow" geometry={geometry.glow} userData={{worldCollision:'none',worldCollisionReason:'Emissive inlay on the named machinery'}}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
    {WORKSHOP_TOOLS.map(tool => <WorkshopMotion key={tool.id} tool={tool.id} model={model} />)}
    {WORKSHOP_TARGETS.map(id => <WorkshopInteraction key={id} id={id} />)}
    <WorldWorkshopSigns />
    <RigidBody type="fixed" colliders={false} position={coasterWorld([0,0,0])} userData={{ solid: true, assetId: 'intent-workshop' }}>
      <TrimeshCollider name={WORKSHOP_CONTACT_ID} args={[model.contact.vertices, model.contact.indices]} />
    </RigidBody>
    {WORKSHOP_LEVERS.map(({id,position},i)=><RigidBody key={id} ref={body=>{leverBodies.current[i]=body;}} position={position}
      type="kinematicPosition" colliders={false} userData={{solid:true,assetId:'intent-workshop'}}>
      <ConvexHullCollider name={id} args={[model.leverContact]}/>
    </RigidBody>)}
  </group></group>;
}

/** Alternative renderer. The coordinator owns choosing the production/review entry. */
export default function WorldIntentWorkshopCraft() {
  return <Suspense fallback={null}><WorkshopCraftInner /></Suspense>;
}
