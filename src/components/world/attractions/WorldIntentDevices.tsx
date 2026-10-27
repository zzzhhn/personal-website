import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { COASTER_PALETTE as P, CoasterBatch } from './coaster-geometry';
import WorldIntentSurface from './WorldIntentSurface';
import { coasterWorld, COASTER_DURATION, COASTER_GATE_Z } from './coaster-track';
import { INTENT_TARGETS, INTENT_TOOL_ACTIONS, intentReachRadius, type IntentTarget } from './intent-stations';
import { activateIntentTarget, intentAvailable, useIntentStore } from './intent-state';
import type { IntentText } from './intent-tasks';
import WorldIntentWorkshop from './WorldIntentWorkshop';

export function IntentInteraction({ target }: { target: IntentTarget }) {
  const state = useIntentStore();
  const labels: Record<IntentTarget, IntentText> = {
    route: INTENT_TOOL_ACTIONS[state.tools.route], press: INTENT_TOOL_ACTIONS[state.tools.press],
    visitor: state.progress.clarified.includes('T7') ? INTENT_TOOL_ACTIONS[state.tools.visitor] : { zh: '摇铃问清目标', en: 'Ring to clarify' },
    chest: state.progress.keyTaken ? { zh: '钥匙已取出', en: 'Key collected' } : state.progress.chestOpen ? { zh: '拿起实体钥匙', en: 'Take the key' } : { zh: '掀开宝箱', en: 'Open the chest' },
    gate: state.progress.gateOpen ? { zh: '大门已打开', en: 'Gate is open' } : { zh: '用钥匙开门', en: 'Unlock the gate' },
    board: { zh: `坐进列车 · ${COASTER_DURATION} 秒`, en: `Board the train · ${COASTER_DURATION} seconds` },
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
  const body = useMemo(() => {
    const b = new CoasterBatch(coasterWorld([-8, 0, 59.5])); b.box([0, .65, 0], [3.8, 1.15, 2.1], P.dark);
    for (const x of [-1.6, 1.6]) b.box([x, .65, 0], [.14, 1.25, 2.17], P.copper);
    for (let i = 0; i < 6; i++) {
      const x = -1.38 + i * .55, opened = i < progress.passed.length;
      b.box([x, .55, 1.1], [.34, .36, .15], opened ? P.cyan : P.gold);
      b.beam([x - .12, .72, 1.12], [x - .12, .92, 1.12], .035, opened ? P.cyan : P.gold);
      b.beam([x - .12, .92, 1.12], [x + .12, .92, opened ? 1.32 : 1.12], .035, opened ? P.cyan : P.gold);
      if (!opened) b.beam([x + .12, .92, 1.12], [x + .12, .72, 1.12], .035, P.gold);
    }
    for (let i = 0; i < 7; i++) b.box([-1.5 + i * .5, 1.04, 1.07], [.18, .1, .05], progress.passed.includes(`T${i + 1}`) ? P.cyan : P.steel);
    return b.finish();
  }, [progress.passed]);
  const key = useMemo(() => {
    const b = new CoasterBatch();
    b.beam([0, 0, 0], [.65, 0, 0], .06, P.gold);
    b.beam([.5, 0, 0], [.5, -.17, 0], .045, P.gold);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, c = (i + 1) / 6 * Math.PI * 2;
      b.beam([Math.cos(a) * .18 - .18, Math.sin(a) * .18, 0], [Math.cos(c) * .18 - .18, Math.sin(c) * .18, 0], .045, P.gold);
    }
    return b.finish();
  }, []);
  useEffect(() => () => body.dispose(), [body]); useEffect(() => () => key.dispose(), [key]);
  useFrame((_, dt) => {
    if (!lid.current || useWorldStore.getState().paused || document.hidden || dt > .25) return;
    const target = progress.chestOpen ? -1.3 : 0;
    lid.current.rotation.x += (target - lid.current.rotation.x) * (1 - Math.exp(-dt * 7));
  });
  return <>
    <group position={coasterWorld([-8, 0, 59.5])} onClick={e => { e.stopPropagation(); activateIntentTarget('chest'); }}>
      <mesh geometry={body}><WorldIntentSurface roughness={.7} /></mesh>
      <group ref={lid} position={[0, 1.23, -1]} rotation={[initiallyOpen ? -1.3 : 0, 0, 0]}>
        <mesh position={[0, .07, 1]}><boxGeometry args={[3.9, .2, 2.2]} /><meshStandardMaterial color={P.copper} roughness={.7} /></mesh>
      </group>
      {progress.chestOpen && !progress.keyTaken && <mesh geometry={key} position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]}><WorldIntentSurface metalness={.35} roughness={.4} /></mesh>}
    </group>
    {progress.gateOpen && <mesh geometry={key} position={coasterWorld([5.3, 1.65, COASTER_GATE_Z + .5])}><WorldIntentSurface roughness={.4} /></mesh>}
  </>;
}
function IntentGate() {
  const open = useIntentStore(s => s.progress.gateOpen), left = useRef<Group>(null), right = useRef<Group>(null);
  const geometry = useMemo(() => {
    const b = new CoasterBatch(); b.box([2.5, .5, 0], [5, .8, .25], P.dark);
    for (let x = 0; x <= 5; x += .5) b.box([x, 1.6, 0], [.1, 3.1, .16], P.steel);
    b.box([2.5, 3.1, 0], [5.15, .18, .3], P.copper);
    b.beam([0, .4, 0], [5, 2.9, 0], .08, P.steel); return b.finish();
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, dt) => {
    if (useWorldStore.getState().paused || document.hidden || dt > .25) return;
    if (left.current) left.current.rotation.y += ((open ? 1.45 : 0) - left.current.rotation.y) * (1 - Math.exp(-dt * 4));
    if (right.current) right.current.rotation.y += ((open ? -1.45 : 0) - right.current.rotation.y) * (1 - Math.exp(-dt * 4));
  });
  return <group onClick={e => { e.stopPropagation(); activateIntentTarget('gate'); }}>
    <group ref={left} position={coasterWorld([-5, 0, COASTER_GATE_Z])}><mesh geometry={geometry}><WorldIntentSurface roughness={.8} /></mesh></group>
    <group ref={right} position={coasterWorld([5, 0, COASTER_GATE_Z])}><mesh geometry={geometry} scale={[-1, 1, 1]}><WorldIntentSurface roughness={.8} /></mesh></group>
  </group>;
}
