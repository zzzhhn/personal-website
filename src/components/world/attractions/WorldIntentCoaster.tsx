import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Group } from 'three';
import { useWorldStore } from '../store';
import { parkAudio } from '../WorldParkAudio';
import { attractionRide, updateAttractionRide } from './attraction-ride';
import { advanceCoaster, coasterDistanceAt, coasterFrame, coasterPhase, coasterRidePose, coasterSupports, coasterWorld, COASTER_DURATION, COASTER_LENGTH } from './coaster-track';
import { createCoasterCar, createCoasterStructure } from './coaster-geometry';
import { INTENT_STATIONS } from './intent-stations';
import { activateIntentTarget, intentRideClock, loadIntentProgress, stopIntentRide, useIntentStore } from './intent-state';
import WorldIntentDevices from './WorldIntentDevices';
import WorldIntentSigns from './WorldIntentSigns';

/** World-space scene. The parent owns actor/camera integration and the activation radius. */
function WorldIntentCoaster({ active }: { active: boolean }) {
  const structure = useMemo(() => createCoasterStructure(active), [active]);
  useEffect(() => () => { structure.steel.dispose(); structure.glow.dispose(); }, [structure]);
  useEffect(() => {
    useIntentStore.setState({ active });
    if (!active) { stopIntentRide(); return; }
    loadIntentProgress();
    const releaseAudio = parkAudio.retain();
    return () => { stopIntentRide(); useIntentStore.setState({ active: false }); releaseAudio(); };
  }, [active]);
  return <group name="intent-coaster">
    <mesh geometry={structure.steel} receiveShadow><meshStandardMaterial vertexColors roughness={.82} metalness={.16} /></mesh>
    <mesh geometry={structure.glow}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
    <CoasterTrain active={active} />
    {active && <><WorldIntentDevices /><WorldIntentSigns /><CoasterCollisions /></>}
  </group>;
}
export default memo(WorldIntentCoaster);

function CoasterTrain({ active }: { active: boolean }) {
  const cars = useRef<(Group | null)[]>([]), geometry = useMemo(createCoasterCar, []);
  const lastCue = useRef(-1), lastPhase = useRef('station');
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, dt) => {
    if (!active) return;
    const w = useWorldStore.getState(), s = useIntentStore.getState();
    const next = advanceCoaster(intentRideClock, dt, active, w.paused || w.poolInspect || !!w.shot, document.hidden, attractionRide.active, attractionRide.revision);
    if (intentRideClock.riding && !next.riding) {
      stopIntentRide(); lastCue.current = -1;
      if (next.elapsed >= COASTER_DURATION) useIntentStore.setState({ notice: { zh: '已安全回站，可以再次乘坐。', en: 'Back at the station. Ride again whenever you like.' } });
    } else Object.assign(intentRideClock, next);
    const u = intentRideClock.riding ? coasterDistanceAt(intentRideClock.elapsed) : 0;
    cars.current.forEach((car, i) => {
      if (!car) return; const f = coasterFrame(u - i * 3.55 / COASTER_LENGTH);
      car.position.copy(f.point); car.quaternion.copy(f.rotation);
    });
    if (!intentRideClock.riding) return;
    updateAttractionRide(coasterRidePose(u, s.view));
    const second = Math.floor(intentRideClock.elapsed), phase = coasterPhase(intentRideClock.elapsed);
    if (second !== s.rideSecond) useIntentStore.setState({ rideSecond: second });
    if (phase !== lastPhase.current) { lastPhase.current = phase; if (phase === 'crest') parkAudio.cue('scan', .12); }
    if (phase === 'lift' && second !== lastCue.current) { lastCue.current = second; parkAudio.cue('strike', .035); }
  }, -60);
  return <group name="intent-train" onClick={e => { e.stopPropagation(); activateIntentTarget('board'); }}>
    {[0, 1, 2].map(i => {
      const f = coasterFrame(-i * 3.55 / COASTER_LENGTH);
      return <group key={i} ref={el => { cars.current[i] = el; }} position={f.point} quaternion={f.rotation}>
        <mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={.65} metalness={.12} /></mesh>
      </group>;
    })}
  </group>;
}

function CoasterCollisions() {
  const gateOpen = useIntentStore(s => s.progress.gateOpen);
  const supports = useMemo(() => coasterSupports(true).flatMap(s => [s.a, s.b]), []);
  return <>
    <RigidBody type="fixed" colliders={false} userData={{ surface: true, assetId: 'intent-coaster' }}>
      <CuboidCollider position={coasterWorld([0, .04, 38])} args={[35, .04, 6]} friction={.9} />
      <CuboidCollider position={coasterWorld([-3, .04, 23])} args={[5.5, .04, 8.5]} friction={.9} />
    </RigidBody>
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: 'intent-coaster' }}>
      {[-34, 34].map(x => <CuboidCollider key={x} position={coasterWorld([x, 1.25, -5])} args={[.15, 1.25, 37]} />)}
      <CuboidCollider position={coasterWorld([0, 1.25, -42])} args={[34, 1.25, .15]} />
      {[-19.5, 19.5].map(x => <CuboidCollider key={x} position={coasterWorld([x, 1.25, 32])} args={[14.5, 1.25, .15]} />)}
      {!gateOpen && <CuboidCollider position={coasterWorld([0, 1.6, 32])} args={[5, 1.6, .18]} />}
      {gateOpen && [-1, 1].map(side => <CuboidCollider key={`gate-${side}`} position={coasterWorld([side * (5 - 2.5 * Math.cos(1.45)), 1.6, 32 - 2.5 * Math.sin(1.45)])} rotation={[0, -side * 1.45, 0]} args={[2.5, 1.6, .18]} />)}
      {[-9.6, 2.4].flatMap(x => [16, 29].map(z => <CuboidCollider key={`${x}:${z}`} position={coasterWorld([x, 2.75, z])} args={[.23, 2.75, .23]} />))}
      {[-5, 1].map(x => <CuboidCollider key={`crest-${x}`} position={coasterWorld([x, 15.75, -35])} args={[.32, 15.65, .32]} />)}
      {supports.map((p, i) => <group key={`support-${i}`}>
        <CuboidCollider position={[p.x, (p.y + 1.12) / 2, p.z]} args={[.25, (p.y - 1.12) / 2, .25]} />
        <CuboidCollider position={[p.x, 1.2, p.z]} args={[.675, .15, .675]} />
      </group>)}
    </RigidBody>
    {INTENT_STATIONS.map(s => <RigidBody key={s.id} type="fixed" colliders={false} userData={{ solid: true, interactable: `intent-${s.id}` }}>
      <CuboidCollider position={coasterWorld([s.origin[0], .65, s.origin[2]])} args={[3.5, .65, 1.7]} />
    </RigidBody>)}
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, interactable: 'intent-chest' }}>
      <CuboidCollider position={coasterWorld([-7, .65, 34.3])} args={[1.9, .65, 1.05]} />
    </RigidBody>
  </>;
}
