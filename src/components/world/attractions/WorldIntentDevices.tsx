import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Color, Group, InstancedMesh, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { COASTER_PALETTE as P, CoasterBatch, createIntentMicroBase } from './coaster-geometry';
import { coasterWorld } from './coaster-track';
import { INTENT_STATIONS, INTENT_TARGETS, INTENT_TOOL_ACTIONS, intentReachRadius, type IntentStation, type IntentTarget } from './intent-stations';
import { activateIntentTarget, clarifyIntent, currentIntentTask, intentAvailable, nextIntentTask, operateIntent, selectIntentTool, useIntentStore } from './intent-state';
import type { IntentClass, IntentText } from './intent-tasks';

export function IntentInteraction({ target }: { target: IntentTarget }) {
  const state = useIntentStore();
  const labels: Record<IntentTarget, IntentText> = {
    route: INTENT_TOOL_ACTIONS[state.tools.route], press: INTENT_TOOL_ACTIONS[state.tools.press],
    visitor: state.progress.clarified.includes('T7') ? INTENT_TOOL_ACTIONS[state.tools.visitor] : { zh: '摇铃问清目标', en: 'Ring to clarify' },
    chest: state.progress.keyTaken ? { zh: '钥匙已取出', en: 'Key collected' } : state.progress.chestOpen ? { zh: '拿起实体钥匙', en: 'Take the key' } : { zh: '掀开宝箱', en: 'Open the chest' },
    gate: state.progress.gateOpen ? { zh: '大门已打开', en: 'Gate is open' } : { zh: '用钥匙开门', en: 'Unlock the gate' },
    board: { zh: '坐进列车 · 94 秒', en: 'Board the train · 94 seconds' },
  };
  useInteractable({ id: `intent-${target}`, kind: target === 'gate' ? 'door' : 'exhibit', position: INTENT_TARGETS[target],
    radius: intentReachRadius(target), label: labels[target], enabled: () => intentAvailable(target), onInteract: () => activateIntentTarget(target) });
  return null;
}
function Device({ spec }: { spec: IntentStation }) {
  const effect = useIntentStore(s => s.effect), tool = useIntentStore(s => s.tools[spec.id]);
  const moving = useRef<Group>(null), switches = useRef<InstancedMesh>(null), elapsed = useRef(3);
  const switchGeometry = useMemo(() => {
    const b = new CoasterBatch(); b.box([0, 0, 0], [.55, .12, .38], '#ffffff');
    b.beam([0, .06, 0], [0, .32, -.15], .045, '#ffffff'); b.box([0, .33, -.15], [.3, .08, .12], '#ffffff'); return b.finish();
  }, []);
  const movingGeometry = useMemo(() => {
    const b = new CoasterBatch();
    if (spec.id === 'route') {
      b.box([0, 0, 0], [.6, .22, .4], P.copper); b.box([-.1, .2, 0], [.15, .3, .4], P.dark);
      b.beam([.12, .15, -.2], [.12, .15, .2], .03, P.rail);
    } else if (spec.id === 'press') {
      b.box([0, 0, 0], [1.1, .04, .75], P.white);
      for (let i = 0; i < 3; i++) b.box([-.35 + i * .35, .025, 0], [.24, .015, .5], P.copper);
    } else {
      b.beam([0, -.3, 0], [0, 0, 0], .2, P.gold, 6); b.beam([0, -.42, 0], [0, -.3, 0], .055, P.dark);
    }
    return b.finish();
  }, [spec.id]);
  useEffect(() => () => { switchGeometry.dispose(); movingGeometry.dispose(); }, [switchGeometry, movingGeometry]);
  useEffect(() => { if (effect?.station === spec.id) elapsed.current = 0; }, [effect, spec.id]);
  useEffect(() => {
    if (!switches.current) return;
    spec.tools.forEach((id, i) => {
      switches.current!.setMatrixAt(i, new Matrix4().makeTranslation((i - (spec.tools.length - 1) / 2) * 1.25, 1.4, 1.35));
      switches.current!.setColorAt(i, new Color(id === tool ? P.gold : P.rail));
    });
    switches.current.instanceMatrix.needsUpdate = true;
    if (switches.current.instanceColor) switches.current.instanceColor.needsUpdate = true;
  }, [spec, tool]);
  useFrame((_, dt) => {
    if (!moving.current || !intentAvailable(spec.id) || dt > .25) return;
    elapsed.current += dt;
    const t = elapsed.current, playing = t < 2, task = currentIntentTask(spec.id);
    if (spec.id === 'route') {
      const fixed = useIntentStore.getState().progress.passed.includes('T5');
      const travel = playing ? Math.min(1, t / 1.4) : task.id === 'T5' && !fixed ? (t % 1) * .3 : 0;
      moving.current.position.set(-2.2 + travel * 4.4, 1.58, effect?.tool === 'act' && playing ? .2 : -.5);
    } else if (spec.id === 'press') {
      const extract = effect?.station === 'press' && effect.tool === 'extract';
      moving.current.position.set(extract ? 1.55 : -1.55, 1.75 + (playing ? Math.sin(Math.min(1, t / 2) * Math.PI) * .7 : 0), .6);
      moving.current.rotation.x = playing && !extract ? Math.sin(t * Math.PI) * .4 : 0;
    } else {
      const ringing = playing && effect?.tool === 'bell';
      moving.current.position.set(1, 2.4, .25); moving.current.rotation.z = ringing ? Math.sin(t * 16) * .35 * (1 - t / 2) : 0;
    }
  });
  return <group position={coasterWorld(spec.origin)}>
    <instancedMesh ref={switches} args={[switchGeometry, undefined, spec.tools.length]} onClick={(e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation(); if (e.instanceId === undefined) return;
      const chosen = spec.tools[e.instanceId]; selectIntentTool(spec.id, chosen); operateIntent(spec.id, chosen);
    }}><meshStandardMaterial vertexColors roughness={.7} /></instancedMesh>
    <group ref={moving} position={spec.id === 'route' ? [-2.2, 1.58, -.5] : spec.id === 'press' ? [-1.55, 1.75, .6] : [1, 2.4, .25]}>
      <mesh geometry={movingGeometry} onClick={e => { e.stopPropagation(); if (spec.id === 'visitor') clarifyIntent(); else activateIntentTarget(spec.id); }}><meshStandardMaterial vertexColors roughness={.65} /></mesh>
    </group>
    <IntentInteraction target={spec.id} />
    {spec.tools.map((id, i) => <ToolInteraction key={id} spec={spec} tool={id} index={i} />)}
    <RequestInteraction spec={spec} />
  </group>;
}

function ToolInteraction({ spec, tool, index }: { spec: IntentStation; tool: IntentClass; index: number }) {
  const x = (index - (spec.tools.length - 1) / 2) * 1.25;
  useInteractable({ id: `intent-${spec.id}-${tool}`, kind: 'exhibit', radius: 1.55,
    position: coasterWorld([spec.origin[0] + x, 1.45, spec.origin[2] + 1.95]), label: INTENT_TOOL_ACTIONS[tool],
    enabled: () => intentAvailable(spec.id), onInteract: () => { selectIntentTool(spec.id, tool); operateIntent(spec.id, tool); } });
  return null;
}
function RequestInteraction({ spec }: { spec: IntentStation }) {
  useInteractable({ id: `intent-${spec.id}-request`, kind: 'exhibit', radius: 1.55,
    position: coasterWorld([spec.origin[0] + (spec.id === 'visitor' ? 1 : -2.9), 1.45, spec.origin[2] + 1.95]),
    label: spec.id === 'visitor' ? { zh: '摇铃，问清目标', en: 'Ring the clarification bell' } : { zh: '转动请求筒，换个请求', en: 'Turn the request drum' },
    enabled: () => intentAvailable(spec.id), onInteract: () => spec.id === 'visitor' ? clarifyIntent() : nextIntentTask(spec.id) });
  return null;
}

export default function WorldIntentDevices() {
  const passed = useIntentStore(s => s.progress.passed);
  const base = useMemo(() => {
    const parts = INTENT_STATIONS.map(spec => createIntentMicroBase(spec.id, passed).applyMatrix4(new Matrix4().makeTranslation(...coasterWorld(spec.origin))));
    const merged = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return merged;
  }, [passed]);
  useEffect(() => () => base.dispose(), [base]);
  return <><mesh geometry={base}><meshStandardMaterial vertexColors roughness={.85} /></mesh>
    {INTENT_STATIONS.map(spec => <Device key={spec.id} spec={spec} />)}<IntentChest /><IntentGate />
    <IntentInteraction target="chest" /><IntentInteraction target="gate" /><IntentInteraction target="board" /></>;
}

function IntentChest() {
  const progress = useIntentStore(s => s.progress), lid = useRef<Group>(null);
  const initiallyOpen = useRef(progress.chestOpen).current;
  const body = useMemo(() => {
    const b = new CoasterBatch(); b.box([0, .65, 0], [3.8, 1.15, 2.1], P.dark);
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
    <group position={coasterWorld([-7, 0, 34.3])} onClick={e => { e.stopPropagation(); activateIntentTarget('chest'); }}>
      <mesh geometry={body}><meshStandardMaterial vertexColors roughness={.7} /></mesh>
      <group ref={lid} position={[0, 1.23, -1]} rotation={[initiallyOpen ? -1.3 : 0, 0, 0]}>
        <mesh position={[0, .07, 1]}><boxGeometry args={[3.9, .2, 2.2]} /><meshStandardMaterial color={P.copper} roughness={.7} /></mesh>
      </group>
      {progress.chestOpen && !progress.keyTaken && <mesh geometry={key} position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]}><meshStandardMaterial vertexColors metalness={.35} roughness={.4} /></mesh>}
    </group>
    {progress.gateOpen && <mesh geometry={key} position={coasterWorld([5.3, 1.65, 32.5])}><meshStandardMaterial vertexColors roughness={.4} /></mesh>}
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
    <group ref={left} position={coasterWorld([-5, 0, 32])}><mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={.8} /></mesh></group>
    <group ref={right} position={coasterWorld([5, 0, 32])}><mesh geometry={geometry} scale={[-1, 1, 1]}><meshStandardMaterial vertexColors roughness={.8} /></mesh></group>
  </group>;
}
