import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { BoxGeometry, Color, Group, InstancedMesh, Mesh, Object3D, Vector3, type MeshStandardMaterial } from 'three';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import type { Vec3 } from '../../types';
import { alphaWorld } from '../alpha-layout';
import { alphaMaterial } from '../alpha-materials';
import type { AlphaFinish } from '../alpha-art';
import { useAlphaStore } from '../alpha-state';
import { ALPHA_WATERWHEEL } from '../alpha-batch2-layout';
import { SLUICE_X, WATERWHEEL_CENTER, WATERWHEEL_ROOT, WATERWHEEL_FRAME_BODY, WATERWHEEL_FLOOR_BODY, WATERWHEEL_FLOOR_POSITION, WATERWHEEL_FLOOR_SCALE, WATERWHEEL_ROTOR_SURFACE, WATERWHEEL_SLUICE_Z, waterwheelSluiceHeight, waterwheelSluiceSurface } from './waterwheel-layout';
import { requireWaterwheelArtifact, type WaterwheelPart } from './waterwheel-artifact';
import { surfaceColliderBuffers } from '../../static-surface-asset';
import { waterwheelArticulatedSurface } from './waterwheel-contact';
import { cycleWaterwheelGate, getWaterwheelSnapshot, subscribeWaterwheel, createWaterwheelIrrigation, stepWaterwheelIrrigation, completeWaterwheelIrrigation, type WaterwheelSnapshot } from './waterwheel-state';

type CraftParts = WaterwheelPart[];
const WATER_EFFECT_DATA = {worldCollision:'none',collisionReason:'Animated liquid and foam are nonblocking visual effects'};
function Craft({ parts, materials, name, sharedSurface }: { parts: CraftParts; materials: Map<AlphaFinish, MeshStandardMaterial>; name: string; sharedSurface?: string }) {
  return <group name={name}>{parts.map(p => <mesh key={p.id} name={p.id} geometry={p.geometry} material={materials.get(p.finish)} userData={{
    worldCollision:p.collision, collisionReason:p.reason, assetPart:p.id, space:p.space,
    ...(p.sources ? {worldCollisionSources:p.sources} : p.collision === 'solid'
      ? {surfaceId:sharedSurface ?? p.id, worldCollisionSharedSurface:!!sharedSurface} : {}),
  }} castShadow={p.role!=='floor'} receiveShadow />)}</group>;
}
function FixedCraft({parts,materials,name,position,scale}:{parts:CraftParts;materials:Map<AlphaFinish,MeshStandardMaterial>;name:string;position?:Vec3;scale?:Vec3}) {
  const colliders=useMemo(()=>parts.map(p=>({id:p.id,buffers:surfaceColliderBuffers(p)!})),[parts]);
  return <RigidBody type="fixed" colliders={false} name={name} position={position} scale={scale} userData={{solid:parts.some(p=>p.role==='enclosure'),surface:parts.some(p=>p.role==='floor')}}>
    <Craft parts={parts} materials={materials} name={`${name}-visible`}/>
    {colliders.map(p=><TrimeshCollider key={p.id} name={p.id} args={[p.buffers.vertices,p.buffers.indices]} friction={.92} restitution={0} />)}
  </RigidBody>;
}
const openingZh = ['关闭', '半开', '全开'], openingEn = ['closed', 'half open', 'open'];
const gateNameZh = ['左', '中', '右'], gateNameEn = ['Left', 'Middle', 'Right'];
const atStation = (p: Vec3): Vec3 => [ALPHA_WATERWHEEL.center[0] + p[0], ALPHA_WATERWHEEL.center[1] + p[1], ALPHA_WATERWHEEL.center[2] + p[2]];
const stationWorld = alphaWorld(ALPHA_WATERWHEEL.center);
const flowMessages = {
  still: { zh: '水流停下了。再开一点，让轮斗接住水。', en: 'The flow stops. Open a sluice a little to fill the buckets.' },
  low: { zh: '水流太小，轮斗还接不满。', en: 'A trickle turns the wheel, but cannot fill the buckets.' },
  balanced: { zh: '水流稳下来了，等轮斗把水提上去。', en: 'The flow settles. Watch the buckets lift the water.' },
  spill: { zh: '水太急，轮斗把水甩出去了。试着关小一道闸门。', en: 'The wheel races and spills its water. Try reducing one sluice.' },
};
function SluiceInteraction({ index, snapshot, onChange }: { index: 0 | 1 | 2; snapshot: WaterwheelSnapshot; onChange: () => void }) {
  const opening = snapshot.gates[index];
  useInteractable({ id: `alpha-waterwheel-sluice-${index}`, kind: 'exhibit', radius: 1.65,
    position: alphaWorld(atStation([SLUICE_X[index], 1.6, 2.72])),
    label: { zh: `${gateNameZh[index]}闸门：${openingZh[opening]} · 转动把手`, en: `${gateNameEn[index]} sluice: ${openingEn[opening]} · turn handle` },
    enabled: () => { const a = useAlphaStore.getState(), w = useWorldStore.getState(); return !a.action && !a.carried && !w.paused && !w.shot; },
    onInteract: () => {
      const next = cycleWaterwheelGate(index);
      const message = flowMessages[next.flow.mode];
      useWorldStore.setState({ toast: { ...message, at: performance.now() } });
      onChange();
    },
  });
  return null;
}

/** Mount once inside ALPHA_ORIGIN. The fixed passage stays open at every gate
 * setting; balanced flow reveals its entrance without changing its colliders. */
export default function AlphaWaterwheel({ onVisit, onBalanced }: { onVisit?: () => void; onBalanced?: () => void } = {}) {
  const snapshot = useSyncExternalStore(subscribeWaterwheel, getWaterwheelSnapshot, getWaterwheelSnapshot);
  const rotor = useRef<RapierRigidBody>(null), gates = useRef<(RapierRigidBody | null)[]>([]);
  const cranks = useRef<(Group | null)[]>([]), bucketWater = useRef<InstancedMesh>(null), spray = useRef<InstancedMesh>(null), streams = useRef<(Mesh | null)[]>([]), curtain = useRef<(Mesh | null)[]>([]), flowers = useRef<Group>(null), irrigation = useRef<Group>(null);
  const camera = useThree(s => s.camera), initialGates = useRef(snapshot.gates).current;
  const irrigationProgress = useRef(createWaterwheelIrrigation(snapshot.everBalanced));
  const animation = useRef({ time: 0, speed: snapshot.flow.radiansPerSecond, fill: snapshot.flow.bucketFill,
    flower: 0, reveal: 0, angle: 0, gates: [...initialGates] as number[] });
  const built = useMemo(() => {
    const art = requireWaterwheelArtifact(), {frame,wheel,panel,crank,floor,drain}=art, flower={stems:art.stems,petals:art.petals};
    const all = Object.values(art);
    const materials = new Map<AlphaFinish, MeshStandardMaterial>();
    all.flat().forEach(p => { if (!materials.has(p.finish)) materials.set(p.finish, alphaMaterial(p.finish)); });
    const water = alphaMaterial('glass'); water.name = 'alpha-waterwheel-water'; water.color.set('#72c1cc'); water.emissive.set('#4e8d9d'); water.emissiveIntensity = .025; water.transparent = true; water.opacity = .76; water.depthWrite = false; water.roughness = .21;
    const foam = alphaMaterial('paper'); foam.color.set('#e0f5ed'); foam.emissiveIntensity = .035;
    const petal = alphaMaterial('paper'); petal.color.set('#b990bc'); petal.emissiveIntensity = .025;
    const wet = alphaMaterial('stone'); wet.color.set('#596f69'); wet.roughness = .42;
    return { frame, wheel, panel, crank, flower, floor, drain, all, materials, water, foam, petal, wet,
      rotorSurface: waterwheelArticulatedSurface(wheel), panelSurface: waterwheelArticulatedSurface(panel),
      cube: new BoxGeometry(1, 1, 1), dummy: new Object3D(), station: new Vector3(...stationWorld), bloomColor: new Color('#e1b4d8'), dryColor: new Color('#8b8871') };
  }, []);
  useEffect(() => () => { built.all.flat().forEach(p => p.geometry.dispose()); built.materials.forEach(m => m.dispose()); built.water.dispose(); built.foam.dispose(); built.petal.dispose(); built.wet.dispose(); built.cube.dispose(); }, [built]);

  const animating = () => {
    const w = useWorldStore.getState();
    return !w.paused && !w.shot && !document.hidden && camera.position.distanceToSquared(built.station) <= 105 ** 2;
  };
  useBeforePhysicsStep(world => {
    if (!animating()) return;
    const dt = Math.min(world.timestep, .06), a = animation.current, { flow, gates: targetGates } = getWaterwheelSnapshot();
    a.time += dt; const ease = 1 - Math.exp(-dt * 3.8);
    a.speed += (flow.radiansPerSecond - a.speed) * ease;
    a.fill += (flow.bucketFill - a.fill) * ease;
    a.angle = (a.angle - a.speed * dt) % (Math.PI * 2);
    rotor.current?.setNextKinematicRotation({x:0,y:0,z:Math.sin(a.angle/2),w:Math.cos(a.angle/2)});
    for (const [i,x] of SLUICE_X.entries()) {
      a.gates[i] += (targetGates[i] - a.gates[i]) * ease;
      gates.current[i]?.setNextKinematicTranslation({x:stationWorld[0]+x,y:stationWorld[1]+waterwheelSluiceHeight(a.gates[i]),z:stationWorld[2]+WATERWHEEL_SLUICE_Z});
    }
  });
  useFrame((_, delta) => {
    if (!animating()) return;
    const w = useWorldStore.getState(), dt = Math.min(delta, .06), a = animation.current, flow = getWaterwheelSnapshot().flow;
    const nearPlayer = Math.hypot(w.position[0] - stationWorld[0], w.position[1] - stationWorld[1], w.position[2] - stationWorld[2]) < 28;
    const canWater = nearPlayer && !w.card && !w.poolInspect && !w.activeVehicle && !w.seat;
    const completed = stepWaterwheelIrrigation(irrigationProgress.current, flow, a.fill, a.speed, dt, canWater);
    a.flower = irrigationProgress.current.bloom;
    a.reveal = irrigationProgress.current.reveal;
    if (completed && completeWaterwheelIrrigation()) {
      useWorldStore.setState({ toast: { zh: '提上来的水浇开了崖花，瀑布后的小路露出来了。', en: 'The lifted water opens the cliff flowers and reveals the waterfall path.', at: performance.now() } });
      onBalanced?.();
    }
    for (let i = 0; i < 3; i++) {
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
    if (irrigation.current) irrigation.current.visible = flow.mode === 'balanced' && irrigationProgress.current.water > 0;
  });
  const onChange = () => { onVisit?.(); };
  const petals = useMemo(() => new Map(built.materials).set('paper', built.petal), [built]);
  const wetFloor = useMemo(() => new Map(built.materials).set('stone', built.wet), [built]);
  return <group name={WATERWHEEL_ROOT} position={ALPHA_WATERWHEEL.center}>
    <FixedCraft parts={built.frame} materials={built.materials} name={WATERWHEEL_FRAME_BODY} />
    <Craft parts={built.drain} materials={built.materials} name="alpha-waterwheel-thin-drain-stone-trim" />
    <RigidBody ref={rotor} type="kinematicPosition" colliders={false} position={WATERWHEEL_CENTER} name="alpha-hollow-bucket-waterwheel-rotor" userData={{solid:true}}>
      <Craft parts={built.wheel} materials={built.materials} name="alpha-wheel-rims-spokes-bucket-construction" sharedSurface={WATERWHEEL_ROTOR_SURFACE} />
      <TrimeshCollider name={WATERWHEEL_ROTOR_SURFACE} args={built.rotorSurface} friction={0} restitution={0}/>
    </RigidBody>
    <instancedMesh ref={bucketWater} userData={WATER_EFFECT_DATA} visible={false} position={WATERWHEEL_CENTER} args={[built.cube, built.water, 18]} frustumCulled={false} name="alpha-horizontal-water-retained-in-buckets" />
    <instancedMesh ref={spray} userData={WATER_EFFECT_DATA} count={0} args={[built.cube, built.foam, 30]} frustumCulled={false} name="alpha-wheel-bounded-spill-spray" />
    {SLUICE_X.map((x, i) => <group key={i}>
      <RigidBody ref={el => { gates.current[i] = el; }} type="kinematicPosition" colliders={false} position={[x, waterwheelSluiceHeight(initialGates[i]), WATERWHEEL_SLUICE_Z]} userData={{solid:true}} name={`alpha-sluice-${i}-leaf`}>
        <Craft parts={built.panel} materials={built.materials} name={`alpha-sluice-${i}-lift-panel`} sharedSurface={waterwheelSluiceSurface(i)} />
        <TrimeshCollider name={waterwheelSluiceSurface(i)} args={built.panelSurface} friction={0} restitution={0}/>
      </RigidBody>
      <group ref={el => { cranks.current[i] = el; }} position={[x, 1.6, 2.75]}><Craft parts={built.crank} materials={built.materials} name={`alpha-sluice-${i}-three-stop-crank`} /></group>
      <mesh ref={el => { streams.current[i] = el; }} position={[x, .39, 2.75]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} scale={[.8, .8, .55]} name={`alpha-sluice-${i}-independent-stream`} />
      <SluiceInteraction index={i as 0 | 1 | 2} snapshot={snapshot} onChange={onChange} />
    </group>)}
    {/* Water carried along the timber flume and visibly dropping into the bucket rim. */}
    <mesh visible={snapshot.flow.amount > 0} position={[-5.15, 6.35, -1.5]} scale={[4.55, .08 + snapshot.flow.amount * .08, 1.25]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} />
    <mesh visible={snapshot.flow.amount > 0} position={[-3.88, 5.65, -1.5]} scale={[.23 + snapshot.flow.amount * .48, 1.4, 1.13]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} name="alpha-water-falls-into-wheel-buckets" />
    <mesh visible={snapshot.flow.amount > 0} position={[1.9, 6.36, -2.31]} rotation={[0, 0, .032]} scale={[9.3, .08, .96]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} />
    <mesh position={[.4, .11, 1.88]} scale={[12.6, .07, 1.98]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} name="alpha-waterwheel-discharge-race" />
    {[0, 1].map(i => <mesh key={i} ref={el => { curtain.current[i] = el; }} position={[3.4 + (i ? .975 : -.975), 2.93, -2.66]} scale={[1.95, 5.65, .09]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} name={`alpha-waterfall-parting-curtain-${i}`} />)}
    <mesh position={[3.4, .09, -2.66]} scale={[4.5, .06, .65]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.foam} name="alpha-waterfall-foam-and-wet-threshold" />
    <FixedCraft parts={built.floor} materials={wetFloor} name={WATERWHEEL_FLOOR_BODY} position={WATERWHEEL_FLOOR_POSITION} scale={WATERWHEEL_FLOOR_SCALE} />
    <group ref={irrigation} visible={false} name="alpha-waterwheel-flower-irrigation"><mesh position={[3.1, 5.89, -4.55]} scale={[7.6, .065, .13]} userData={WATER_EFFECT_DATA} geometry={built.cube} material={built.water} /></group>
    <Craft parts={built.flower.stems} materials={built.materials} name="alpha-waterwheel-cliff-flower-stems" />
    <group ref={flowers}><Craft parts={built.flower.petals} materials={petals} name="alpha-waterwheel-watered-blossoms" /></group>
  </group>;
}
