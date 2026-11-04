import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Quaternion } from 'three';
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { WorldIntentReflectiveSurface } from './WorldIntentSurface';
import { createIntentChestBody, createIntentChestLid, createIntentGateLeaf, createIntentKey } from './coaster-device-geometry';
import { coasterWorld, COASTER_DISPLAY_SECONDS, COASTER_GATE_Z } from './coaster-track';
import { INTENT_TARGETS, INTENT_TOOL_ACTIONS, intentReachRadius, type IntentTarget } from './intent-stations';
import { activateIntentTarget, intentAvailable, useIntentStore } from './intent-state';
import type { IntentText } from './intent-tasks';
import WorldIntentWorkshop from './WorldIntentWorkshop';
import { COASTER_GATE_LEAVES, coasterGateAngle } from './coaster-access';

export function IntentInteraction({ target }: { target: IntentTarget }) {
  const state = useIntentStore();
  const labels: Record<IntentTarget, IntentText> = {
    route: INTENT_TOOL_ACTIONS[state.tools.route], press: INTENT_TOOL_ACTIONS[state.tools.press],
    visitor: state.progress.clarified.includes('T7') ? INTENT_TOOL_ACTIONS[state.tools.visitor] : { zh: '摇铃问清目标', en: 'Ring to clarify' },
    chest: state.progress.keyTaken ? { zh: '钥匙已取出', en: 'Key collected' } : state.progress.chestOpen ? { zh: '拿起实体钥匙', en: 'Take the key' } : { zh: '掀开宝箱', en: 'Open the chest' },
    gate: state.progress.gateOpen ? { zh: '大门已打开', en: 'Gate is open' } : { zh: '用钥匙开门', en: 'Unlock the gate' },
    board: { zh: `坐进列车 · ${COASTER_DISPLAY_SECONDS} 秒`, en: `Board the train · ${COASTER_DISPLAY_SECONDS} seconds` },
  };
  useInteractable({ id: `intent-${target}`, kind: target === 'gate' ? 'door' : 'exhibit', position: INTENT_TARGETS[target],
    radius: intentReachRadius(target), label: labels[target], enabled: () => intentAvailable(target), onInteract: () => activateIntentTarget(target) });
  return null;
}
export default function WorldIntentDevices() {
  return <><WorldIntentWorkshop /><IntentChest /><IntentGate />
    <IntentInteraction target="chest" /><IntentInteraction target="gate" /><IntentInteraction target="board" /></>;
}

function IntentChest() {
  const progress = useIntentStore(s => s.progress), lid = useRef<Group>(null);
  const initiallyOpen = useRef(progress.chestOpen).current;
  const body = useMemo(() => createIntentChestBody(progress.passed), [progress.passed]);
  const lidGeometry = useMemo(createIntentChestLid, []);
  const key = useMemo(createIntentKey, []);
  useEffect(() => () => lidGeometry.dispose(), [lidGeometry]);
  useEffect(() => () => body.dispose(), [body]); useEffect(() => () => key.dispose(), [key]);
  useFrame((_, dt) => {
    if (!lid.current || useWorldStore.getState().paused || document.hidden || dt > .25) return;
    const target = progress.chestOpen ? -1.3 : 0;
    lid.current.rotation.x += (target - lid.current.rotation.x) * (1 - Math.exp(-dt * 7));
  });
  return <>
    <group position={coasterWorld([-8, 0, 59.5])} onClick={e => { e.stopPropagation(); activateIntentTarget('chest'); }}>
      <mesh geometry={body}><WorldIntentReflectiveSurface roughness={.7} /></mesh>
      <group ref={lid} position={[0, 1.23, -1]} rotation={[initiallyOpen ? -1.3 : 0, 0, 0]}>
        <mesh geometry={lidGeometry}><WorldIntentReflectiveSurface roughness={.7} /></mesh>
      </group>
      {progress.chestOpen && !progress.keyTaken && <mesh geometry={key} position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]}><WorldIntentReflectiveSurface metalness={.35} roughness={.4} /></mesh>}
    </group>
    {progress.gateOpen && <mesh geometry={key} position={coasterWorld([5.3, 1.65, COASTER_GATE_Z + .5])}><WorldIntentReflectiveSurface roughness={.4} /></mesh>}
  </>;
}
function IntentGate() {
  const open = useIntentStore(s => s.progress.gateOpen);
  const leaves = useRef<(RapierRigidBody | null)[]>([]), progress = useRef(open ? 1 : 0);
  const initial = useRef(open ? 1 : 0).current, rotation = useRef(new Quaternion());
  const { world } = useRapier();
  const geometry = useMemo(createIntentGateLeaf, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useBeforePhysicsStep(() => {
    const target = open ? 1 : 0;
    if (useWorldStore.getState().paused || document.hidden || progress.current === target) return;
    progress.current += (target - progress.current) * (1 - Math.exp(-world.timestep * 4));
    if (Math.abs(target - progress.current) < .0001) progress.current = target;
    COASTER_GATE_LEAVES.forEach((leaf, i) => {
      const angle = coasterGateAngle(leaf.side, progress.current);
      rotation.current.set(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
      leaves.current[i]?.setNextKinematicRotation(rotation.current);
    });
  });
  return <group onClick={e => { e.stopPropagation(); activateIntentTarget('gate'); }}>
    {COASTER_GATE_LEAVES.map((leaf, i) => <RigidBody key={leaf.side} ref={body => { leaves.current[i] = body; }}
      type="kinematicPosition" colliders={false} position={leaf.hinge} rotation={[0, coasterGateAngle(leaf.side, initial), 0]}
      userData={{ solid: true, assetId: 'coaster-gate' }}>
      <CuboidCollider position={leaf.centre} args={leaf.half} />
      <mesh geometry={geometry} scale={[-leaf.side, 1, 1]}><WorldIntentReflectiveSurface roughness={.8} /></mesh>
    </RigidBody>)}
  </group>;
}
