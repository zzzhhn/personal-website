import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { Matrix4, Quaternion, PointLight, Vector3 } from 'three';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { WORKSHOP_CARRIER_Y, WORKSHOP_INTAKE, WORKSHOP_TARGETS, WORKSHOP_TOOLS, workshopTarget, workshopColliders, type WorkshopTarget } from './intent-workshop-layout';
import { advanceWorkshop, operateWorkshop, resetWorkshop, useWorkshopStore, workshopAvailable, workshopClock, workshopCarrierProgress, workshopOutputComplete, WORKSHOP_LEVER_SECONDS } from './intent-workshop-runtime';
import { useIntentStore } from './intent-state';
import { createWorkshopGeometry } from './intent-workshop-geometry';
import { coasterWorld } from './coaster-track';
import WorldWorkshopSigns from './WorldWorkshopSigns';
import type { IntentClass } from './intent-tasks';
import { createWorkshopCraftRuntime } from './coaster-workshop-craft-runtime';
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
  // The frozen geometry factory is intentionally retained as contact / glow
  // authority. Its old body is never submitted by this candidate renderer.
  const geometry = useMemo(createWorkshopGeometry, []);
  const solids = useMemo(workshopColliders, []);
  const leverFrame = useMemo(() => ({ matrix: new Matrix4(), rotation: new Quaternion(), axis: new Vector3(1,0,0), scale: new Vector3(1,1,1), at: new Vector3(), value: NaN, intakeValue: NaN, tool: '' }), []);
  const lamp = useRef<PointLight>(null);
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
    if (lamp.current) lamp.current.intensity = 48 * night.value;
    const capsule = model.capsule;
    const s = useWorkshopStore.getState();
    const lever = s.phase === 'processing' ? Math.sin(Math.min(1, workshopClock.elapsed / WORKSHOP_LEVER_SECONDS) * Math.PI) * .85 : 0;
    const intakeLever = Math.sin(workshopClock.intakeElapsed / WORKSHOP_LEVER_SECONDS * Math.PI) * .85;
    if (leverFrame.value !== lever || leverFrame.intakeValue !== intakeLever || leverFrame.tool !== (s.tool ?? '')) {
      [WORKSHOP_INTAKE, ...WORKSHOP_TOOLS.map(tool => tool.at)].forEach((at, i) => {
        const id = i ? WORKSHOP_TOOLS[i - 1].id : null;
        leverFrame.at.set(...coasterWorld([at[0] + .96, 1.3, at[2] + .75]));
        leverFrame.rotation.setFromAxisAngle(leverFrame.axis, i === 0 ? intakeLever : id === s.tool ? lever : 0);
        model.setLeverAt(i, leverFrame.matrix.compose(leverFrame.at, leverFrame.rotation, leverFrame.scale));
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
  return <group name="intent-workshop">
    <primitive object={model.root} dispose={null} />
    <mesh geometry={geometry.glow}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
    {WORKSHOP_TOOLS.map(tool => <WorkshopMotion key={tool.id} tool={tool.id} model={model} />)}
    {WORKSHOP_TARGETS.map(id => <WorkshopInteraction key={id} id={id} />)}
    <WorldWorkshopSigns />
    <pointLight ref={lamp} position={coasterWorld([-16, 4.1, 67])} color="#ffd6a3" intensity={0} distance={16} decay={2} />
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: 'intent-workshop' }}>
      <TrimeshCollider args={[geometry.contactSurface.vertices, geometry.contactSurface.indices]} />
      {solids.map((solid, i) => <CuboidCollider key={i} position={solid.position} args={solid.half} rotation={solid.rotation} />)}
    </RigidBody>
  </group>;
}

/** Alternative renderer. The coordinator owns choosing the production/review entry. */
export default function WorldIntentWorkshopCraft() {
  return <Suspense fallback={null}><WorkshopCraftInner /></Suspense>;
}
