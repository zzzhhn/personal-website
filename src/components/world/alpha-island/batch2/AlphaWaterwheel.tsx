import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, Color, Group, InstancedMesh, Mesh, Object3D, Vector3, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import type { Vec3 } from '../../types';
import { alphaWorld } from '../alpha-layout';
import { alphaMaterial } from '../alpha-materials';
import type { AlphaFinish } from '../alpha-art';
import { useAlphaStore } from '../alpha-state';
import { ALPHA_WATERWHEEL } from '../alpha-batch2-layout';
import { buildSluiceCrank, buildSluicePanel, buildWaterwheelFlowers, buildWaterwheelFrame, buildWaterwheelRotor, SLUICE_X, WATERWHEEL_CENTER } from './waterwheel-art';
import { cycleWaterwheelGate, getWaterwheelSnapshot, subscribeWaterwheel, type WaterwheelSnapshot } from './waterwheel-state';

type CraftParts = { finish: AlphaFinish; geometry: BufferGeometry }[];
function Craft({ parts, materials, name }: { parts: CraftParts; materials: Map<AlphaFinish, MeshStandardMaterial>; name: string }) {
  return <group name={name}>{parts.map(p => <mesh key={p.finish} geometry={p.geometry} material={materials.get(p.finish)} castShadow receiveShadow />)}</group>;
}
const openingZh = ['关闭', '半开', '全开'], openingEn = ['closed', 'half open', 'open'];
const gateNameZh = ['左', '中', '右'], gateNameEn = ['Left', 'Middle', 'Right'];
const atStation = (p: Vec3): Vec3 => [ALPHA_WATERWHEEL.center[0] + p[0], ALPHA_WATERWHEEL.center[1] + p[1], ALPHA_WATERWHEEL.center[2] + p[2]];
const stationWorld = alphaWorld(ALPHA_WATERWHEEL.center);
const flowMessages = {
  still: { zh: '水流停下了。再开一点，让轮斗接住水。', en: 'The flow stops. Open a sluice a little to fill the buckets.' },
  low: { zh: '水流太小，轮斗还接不满。', en: 'A trickle turns the wheel, but cannot fill the buckets.' },
  balanced: { zh: '轮斗稳稳接住水，花带得到了灌溉。瀑布后露出了一条小路。', en: 'The buckets fill steadily and water the flowers. A path appears behind the waterfall.' },
  spill: { zh: '水太急，轮斗把水甩出去了。试着关小一道闸门。', en: 'The wheel races and spills its water. Try reducing one sluice.' },
};
function SluiceInteraction({ index, snapshot, onChange }: { index: 0 | 1 | 2; snapshot: WaterwheelSnapshot; onChange: (next: WaterwheelSnapshot, firstBalanced: boolean) => void }) {
  const opening = snapshot.gates[index];
  useInteractable({ id: `alpha-waterwheel-sluice-${index}`, kind: 'exhibit', radius: 1.65,
    position: alphaWorld(atStation([SLUICE_X[index], 1.6, 2.72])),
    label: { zh: `${gateNameZh[index]}闸门：${openingZh[opening]} · 转动把手`, en: `${gateNameEn[index]} sluice: ${openingEn[opening]} · turn handle` },
    enabled: () => { const a = useAlphaStore.getState(), w = useWorldStore.getState(); return !a.action && !a.carried && !w.paused && !w.shot; },
    onInteract: () => {
      const previous = getWaterwheelSnapshot(), next = cycleWaterwheelGate(index);
      const message = flowMessages[next.flow.mode];
      useWorldStore.setState({ toast: { ...message, at: performance.now() } });
      onChange(next, !previous.everBalanced && next.everBalanced);
    },
  });
  return null;
}

/** Mount once inside ALPHA_ORIGIN. No moving collider, lights, new render pass,
 * per-frame store writes or shared character-hand ownership. The fixed passage
 * is always physically open; the balanced water reveals its southern entrance. */
export default function AlphaWaterwheel({ onVisit, onBalanced }: { onVisit?: () => void; onBalanced?: () => void } = {}) {
  const snapshot = useSyncExternalStore(subscribeWaterwheel, getWaterwheelSnapshot, getWaterwheelSnapshot);
  const rotor = useRef<Group>(null), gates = useRef<(Group | null)[]>([]), cranks = useRef<(Group | null)[]>([]), bucketWater = useRef<InstancedMesh>(null), spray = useRef<InstancedMesh>(null), streams = useRef<(Mesh | null)[]>([]), curtain = useRef<(Mesh | null)[]>([]), flowers = useRef<Group>(null), irrigation = useRef<Group>(null);
  const animation = useRef({ time: 0, speed: 2.25, fill: .18, flower: 0, reveal: 0, angle: 0, gates: [2, 2, 2] });
  const built = useMemo(() => {
    const frame = buildWaterwheelFrame(), wheel = buildWaterwheelRotor(), panel = buildSluicePanel(), crank = buildSluiceCrank(), flower = buildWaterwheelFlowers();
    const all = [frame, wheel, panel, crank, flower.stems, flower.petals];
    const materials = new Map<AlphaFinish, MeshStandardMaterial>();
    all.flat().forEach(p => { if (!materials.has(p.finish)) materials.set(p.finish, alphaMaterial(p.finish)); });
    const water = alphaMaterial('glass'); water.name = 'alpha-waterwheel-water'; water.color.set('#72c1cc'); water.emissive.set('#4e8d9d'); water.emissiveIntensity = .025; water.transparent = true; water.opacity = .76; water.depthWrite = false; water.roughness = .21;
    const foam = alphaMaterial('paper'); foam.color.set('#e0f5ed'); foam.emissiveIntensity = .035;
    const petal = alphaMaterial('paper'); petal.color.set('#b990bc'); petal.emissiveIntensity = .025;
    const wet = alphaMaterial('stone'); wet.color.set('#596f69'); wet.roughness = .42;
    return { frame, wheel, panel, crank, flower, all, materials, water, foam, petal, wet, cube: new BoxGeometry(1, 1, 1), dummy: new Object3D(), station: new Vector3(...stationWorld), bloomColor: new Color('#e1b4d8'), dryColor: new Color('#8b8871') };
  }, []);
  useEffect(() => () => { built.all.flat().forEach(p => p.geometry.dispose()); built.materials.forEach(m => m.dispose()); built.water.dispose(); built.foam.dispose(); built.petal.dispose(); built.wet.dispose(); built.cube.dispose(); }, [built]);

  useFrame((frame, delta) => {
    const w = useWorldStore.getState();
    if (w.paused || w.shot || document.hidden || frame.camera.position.distanceToSquared(built.station) > 105 ** 2) return;
    const dt = Math.min(delta, .06), a = animation.current, flow = getWaterwheelSnapshot().flow;
    a.time += dt; const ease = 1 - Math.exp(-dt * 3.8);
    a.speed += (flow.radiansPerSecond - a.speed) * ease;
    a.fill += (flow.bucketFill - a.fill) * ease;
    a.flower += ((flow.irrigating ? 1 : 0) - a.flower) * Math.min(dt * .55, 1);
    a.reveal += ((flow.passageRevealed ? 1 : 0) - a.reveal) * ease;
    a.angle = (a.angle - a.speed * dt) % (Math.PI * 2);
    if (rotor.current) rotor.current.rotation.z = a.angle;
    for (let i = 0; i < 3; i++) {
      a.gates[i] += (getWaterwheelSnapshot().gates[i] - a.gates[i]) * ease;
      if (gates.current[i]) gates.current[i]!.position.y = .69 + a.gates[i] * .38;
      if (cranks.current[i]) cranks.current[i]!.rotation.y = a.gates[i] * Math.PI;
      const stream = streams.current[i];
      if (stream) { stream.visible = a.gates[i] > .015; stream.scale.x = .12 + a.gates[i] * .35; stream.scale.y = .8 + Math.sin(a.time * 6 + i) * .035; }
    }
    // Keep liquid horizontal in world space even while its timber bucket rotates.
    if (bucketWater.current) {
      bucketWater.current.visible = true;
      for (let i = 0; i < 18; i++) {
        const theta = i / 18 * Math.PI * 2 + a.angle, x = Math.cos(theta) * 2.62, y = Math.sin(theta) * 2.62;
        const retained = Math.max(0, Math.min(1, (Math.sin(theta) + .6) * 1.3));
        built.dummy.position.set(x, y - .04, 0); built.dummy.rotation.set(0, 0, 0); built.dummy.scale.set(.35, Math.max(.001, .12 * a.fill * retained), 1.14); built.dummy.updateMatrix(); bucketWater.current.setMatrixAt(i, built.dummy.matrix);
      }
      bucketWater.current.instanceMatrix.needsUpdate = true;
    }
    // Two outer water curtains part to expose a 2.2m clear central opening.
    for (let i = 0; i < 2; i++) if (curtain.current[i]) {
      const m = curtain.current[i]!, side = i ? 1 : -1, width = 1.95 - a.reveal * 1.08;
      m.visible = flow.amount > 0; m.scale.set(width, 5.65, .09);
      m.position.x = 3.4 + side * (1.95 - width / 2); m.position.y = 2.93;
    }
    if (spray.current) {
      const spilling = flow.mode === 'spill', count = flow.amount ? (spilling ? 30 : 12) : 0;
      spray.current.count = count;
      for (let i = 0; i < count; i++) {
        const t = (a.time * (spilling ? 1.5 : .8) + i * .173) % 1;
        built.dummy.position.set(-5.3 + (spilling ? 2.6 : 1.25) * Math.sin(i * 7.7) * t, .24 + Math.sin(t * Math.PI) * (spilling ? 2 : .55), -.1 + t * (spilling ? 2.7 : .9));
        built.dummy.rotation.set(i, t * 3, i * .3); built.dummy.scale.setScalar((1 - t) * .08 + .02); built.dummy.updateMatrix(); spray.current.setMatrixAt(i, built.dummy.matrix);
      }
      spray.current.instanceMatrix.needsUpdate = true;
    }
    built.petal.color.copy(built.dryColor).lerp(built.bloomColor, a.flower);
    if (flowers.current) { flowers.current.scale.y = .87 + a.flower * .13; flowers.current.position.y = 5.88 * (1 - flowers.current.scale.y); }
    if (irrigation.current) irrigation.current.visible = a.flower > .07;
  });
  const onChange = (_next: WaterwheelSnapshot, firstBalanced: boolean) => { onVisit?.(); if (firstBalanced) onBalanced?.(); };
  const petals = useMemo(() => new Map(built.materials).set('paper', built.petal), [built]);
  return <group name="alpha-station5-three-sluices-waterwheel" position={ALPHA_WATERWHEEL.center}>
    <Craft parts={built.frame} materials={built.materials} name="alpha-wheel-footings-axle-headrace-and-stone-arch" />
    <group ref={rotor} position={WATERWHEEL_CENTER} name="alpha-hollow-bucket-waterwheel-rotor"><Craft parts={built.wheel} materials={built.materials} name="alpha-wheel-rims-spokes-bucket-construction" /></group>
    <instancedMesh ref={bucketWater} visible={false} position={WATERWHEEL_CENTER} args={[built.cube, built.water, 18]} frustumCulled={false} name="alpha-horizontal-water-retained-in-buckets" />
    <instancedMesh ref={spray} count={0} args={[built.cube, built.foam, 30]} frustumCulled={false} name="alpha-wheel-bounded-spill-spray" />
    {SLUICE_X.map((x, i) => <group key={i}>
      <group ref={el => { gates.current[i] = el; }} position={[x, 1.45, 2.3]}><Craft parts={built.panel} materials={built.materials} name={`alpha-sluice-${i}-lift-panel`} /></group>
      <group ref={el => { cranks.current[i] = el; }} position={[x, 1.6, 2.75]}><Craft parts={built.crank} materials={built.materials} name={`alpha-sluice-${i}-three-stop-crank`} /></group>
      <mesh ref={el => { streams.current[i] = el; }} position={[x, .39, 2.75]} geometry={built.cube} material={built.water} scale={[.8, .8, .55]} name={`alpha-sluice-${i}-independent-stream`} />
      <SluiceInteraction index={i as 0 | 1 | 2} snapshot={snapshot} onChange={onChange} />
    </group>)}
    {/* Water carried along the timber flume and visibly dropping into the bucket rim. */}
    <mesh visible={snapshot.flow.amount > 0} position={[-5.15, 6.35, -1.5]} scale={[4.55, .08 + snapshot.flow.amount * .08, 1.25]} geometry={built.cube} material={built.water} />
    <mesh visible={snapshot.flow.amount > 0} position={[-3.88, 5.65, -1.5]} scale={[.23 + snapshot.flow.amount * .48, 1.4, 1.13]} geometry={built.cube} material={built.water} name="alpha-water-falls-into-wheel-buckets" />
    <mesh visible={snapshot.flow.amount > 0} position={[1.9, 6.36, -2.31]} rotation={[0, 0, .032]} scale={[9.3, .08, .96]} geometry={built.cube} material={built.water} />
    <mesh position={[.4, .11, 1.88]} scale={[12.6, .07, 1.98]} geometry={built.cube} material={built.water} name="alpha-waterwheel-discharge-race" />
    {[0, 1].map(i => <mesh key={i} ref={el => { curtain.current[i] = el; }} position={[3.4 + (i ? .975 : -.975), 2.93, -2.66]} scale={[1.95, 5.65, .09]} geometry={built.cube} material={built.water} name={`alpha-waterfall-parting-curtain-${i}`} />)}
    <mesh position={[3.4, .09, -2.66]} scale={[4.5, .06, .65]} geometry={built.cube} material={built.foam} name="alpha-waterfall-foam-and-wet-threshold" />
    <mesh position={[3.2, .005, -4.1]} scale={[12, .05, 2.6]} geometry={built.cube} material={built.wet} receiveShadow name="alpha-waterfall-passage-wet-rock-floor" />
    <group ref={irrigation} visible={false} name="alpha-waterwheel-flower-irrigation"><mesh position={[3.1, 5.89, -4.55]} scale={[7.6, .065, .13]} geometry={built.cube} material={built.water} /></group>
    <Craft parts={built.flower.stems} materials={built.materials} name="alpha-waterwheel-cliff-flower-stems" />
    <group ref={flowers}><Craft parts={built.flower.petals} materials={petals} name="alpha-waterwheel-watered-blossoms" /></group>
    <RigidBody type="fixed" colliders={false} userData={{ solid: true }} name="alpha-waterwheel-static-safety-proxies">
      {/* The rotor remains cosmetic; an immovable envelope prevents moving-mesh contacts. */}
      <CuboidCollider position={[-5.3, 3.25, -1.5]} args={[3.15, 3.25, 1.85]} />
      {SLUICE_X.map(x => <CuboidCollider key={x} position={[x, 1.15, 2.3]} args={[.82, 1.15, .6]} />)}
      {[-1.65, 8.05].flatMap(x => [-6, -2.6].map(z => <CuboidCollider key={`${x}-${z}`} position={[x, 2.6, z]} args={[.82, 2.6, .3]} />))}
      <CuboidCollider position={[3.05, 5.36, -4.3]} args={[4.8, .46, 2.1]} />
    </RigidBody>
    <RigidBody type="fixed" colliders={false} userData={{ surface: true }} name="alpha-waterwheel-always-traversable-passage-floor"><CuboidCollider position={[3.2, -.06, -4.1]} args={[6, .1, 1.3]} friction={.92} /></RigidBody>
  </group>;
}
