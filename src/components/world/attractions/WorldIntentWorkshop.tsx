import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { Group, InstancedMesh, Matrix4, Quaternion, PointLight, Vector3 } from 'three';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { night } from '../WorldNight';
import { WORKSHOP_CARRIER_Y, WORKSHOP_INTAKE, WORKSHOP_TARGETS, WORKSHOP_TOOLS, workshopTarget, workshopColliders, type WorkshopTarget } from './intent-workshop-layout';
import { advanceWorkshop, operateWorkshop, resetWorkshop, useWorkshopStore, workshopAvailable, workshopClock, WORKSHOP_PROCESS_SECONDS } from './intent-workshop-runtime';
import { createWorkshopCapsule, createWorkshopGeometry, createWorkshopMoving, createWorkshopLever } from './intent-workshop-geometry';
import { coasterWorld } from './coaster-track';
import WorldIntentSurface from './WorldIntentSurface';
import WorldWorkshopSigns from './WorldWorkshopSigns';
import type { IntentClass } from './intent-tasks';

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
function WorkshopMotion({ tool }: { tool: IntentClass }) {
  const geometry = useMemo(() => createWorkshopMoving(tool), [tool]), group = useRef<Group>(null);
  const at = useMemo(() => coasterWorld(WORKSHOP_TOOLS.find(t => t.id === tool)!.at), [tool]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (!group.current) return;
    const s = useWorkshopStore.getState(), elapsed = workshopClock.elapsed;
    const operating = s.tool === tool && s.phase === 'processing';
    const f = operating ? Math.max(0, Math.min(1, (elapsed - 1.5) / 1.3)) : s.outputs[tool] ? 1 : 0;
    group.current.visible = operating || !!s.outputs[tool];
    const [x, y, z] = at;
    group.current.position.set(x, y + 1.53, z);
    if (tool === 'lookup') group.current.position.set(x - .7 + f * 1.15, y + 2.05, z - .2);
    if (tool === 'act') group.current.position.y = y + 2.03 - f * .4;
    if (tool === 'plan') group.current.position.set(x - .85 + f * 1.3, y + 1.65, z + .25 - Math.sin(f * Math.PI) * .75);
    if (tool === 'debug') group.current.position.set(x - .8 + f * 1.4, y + 1.65, z);
    if (tool === 'rewrite') group.current.position.z = z + .6 - Math.sin(f * Math.PI) * 1.2;
    if (tool === 'extract') { group.current.position.z = z + f * .5; group.current.scale.x = .2 + f * .8; }
  });
  return <group ref={group}><mesh geometry={geometry}><WorldIntentSurface roughness={.55} /></mesh></group>;
}
export default function WorldIntentWorkshop() {
  const geometry = useMemo(createWorkshopGeometry, []), capsuleGeometry = useMemo(createWorkshopCapsule, []);
  const solids = useMemo(workshopColliders, []);
  const leverGeometry = useMemo(createWorkshopLever, []), levers = useRef<InstancedMesh>(null);
  const leverFrame = useMemo(() => ({ matrix: new Matrix4(), rotation: new Quaternion(), axis: new Vector3(1,0,0), scale: new Vector3(1,1,1), at: new Vector3(), value: NaN, tool: '' }), []);
  const capsule = useRef<Group>(null), lamp = useRef<PointLight>(null);
  const positions = useMemo(() => ({ a: new Vector3(...coasterWorld([-16, 1.66, 73])), b: new Vector3(), p: new Vector3() }), []);
  const paths = useMemo(() => Object.fromEntries(WORKSHOP_TOOLS.map(({ id, at }) => [id,
    [coasterWorld([-16, 1.66, 73]), coasterWorld([-16, WORKSHOP_CARRIER_Y, 72.15]), coasterWorld([-16, WORKSHOP_CARRIER_Y, 67]),
      coasterWorld([at[0], WORKSHOP_CARRIER_Y, at[2] - .85]), coasterWorld([at[0], 1.6, at[2]])]])), []);
  useEffect(() => () => { geometry.body.dispose(); geometry.glow.dispose(); capsuleGeometry.dispose(); leverGeometry.dispose(); resetWorkshop(); }, [geometry, capsuleGeometry, leverGeometry]);
  useFrame((_, dt) => {
    const w = useWorldStore.getState();
    advanceWorkshop(dt, w.paused || w.poolInspect || !!w.card || !!w.shot, document.hidden);
    if (lamp.current) lamp.current.intensity = 48 * night.value;
    if (!capsule.current) return;
    const s = useWorkshopStore.getState();
    const lever = s.phase === 'processing' ? Math.sin(Math.min(1, workshopClock.elapsed / .7) * Math.PI) * .85 : 0;
    if (levers.current && (leverFrame.value !== lever || leverFrame.tool !== (s.tool ?? ''))) {
      [WORKSHOP_INTAKE, ...WORKSHOP_TOOLS.map(tool => tool.at)].forEach((at, i) => {
        const id = i ? WORKSHOP_TOOLS[i - 1].id : null;
        leverFrame.at.set(...coasterWorld([at[0] + .96, 1.3, at[2] + .75]));
        leverFrame.rotation.setFromAxisAngle(leverFrame.axis, id === s.tool ? lever : 0);
        levers.current!.setMatrixAt(i, leverFrame.matrix.compose(leverFrame.at, leverFrame.rotation, leverFrame.scale));
      });
      levers.current.instanceMatrix.needsUpdate = true; leverFrame.value = lever; leverFrame.tool = s.tool ?? '';
    }
    capsule.current.visible = s.phase === 'ready' || s.phase === 'processing' || (s.phase === 'result' && !s.correct);
    if (s.phase === 'processing' && s.tool) {
      const f = workshopClock.elapsed / WORKSHOP_PROCESS_SECONDS, path = paths[s.tool];
      const step = Math.min(3, Math.floor(f * 4)), blend = Math.min(1, f * 4 - step);
      positions.p.fromArray(path[step]); positions.b.fromArray(path[step + 1]); positions.p.lerp(positions.b, blend);
      capsule.current.position.copy(positions.p);
      capsule.current.rotation.y = 0;
    } else { capsule.current.position.copy(positions.a); capsule.current.rotation.y = 0; }
  });
  return <group name="intent-workshop">
    <mesh geometry={geometry.body} receiveShadow castShadow><WorldIntentSurface roughness={.65} metalness={.2} /></mesh>
    <mesh geometry={geometry.glow}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
    <instancedMesh ref={levers} args={[leverGeometry, undefined, 7]} frustumCulled={false}><meshStandardMaterial vertexColors roughness={.55} metalness={.25} /></instancedMesh>
    <group ref={capsule}><mesh geometry={capsuleGeometry}><WorldIntentSurface roughness={.5} /></mesh></group>
    {WORKSHOP_TOOLS.map(tool => <WorkshopMotion key={tool.id} tool={tool.id} />)}
    {WORKSHOP_TARGETS.map(id => <WorkshopInteraction key={id} id={id} />)}
    <WorldWorkshopSigns />
    <pointLight ref={lamp} position={coasterWorld([-16, 4.1, 67])} color="#ffd6a3" intensity={0} distance={16} decay={2} />
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: 'intent-workshop' }}>
      <TrimeshCollider args={[geometry.contactSurface.vertices, geometry.contactSurface.indices]} />
      {solids.map((solid, i) => <CuboidCollider key={i}
        position={solid.position} args={solid.half} rotation={solid.rotation} />)}
    </RigidBody>
  </group>;
}
