import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Group, PointLight } from 'three';
import { useWorldStore } from '../store';
import { parkAudio } from '../WorldParkAudio';
import { attractionRide, updateAttractionRide } from './attraction-ride';
import { advanceCoaster, coasterDistanceAt, coasterFrame, coasterPhase, coasterRidePose, coasterWorld, COASTER_GATE_Z, COASTER_DURATION, COASTER_LENGTH } from './coaster-track';
import { createCoasterCar, createCoasterStructure, type CoasterCollider } from './coaster-geometry';
import { INTENT_STATIONS } from './intent-stations';
import { activateIntentTarget, intentRideClock, loadIntentProgress, clearIntentRide, useIntentStore } from './intent-state';
import { advanceCoasterTransition, returnCoasterToStation } from './coaster-transition';
import WorldIntentDevices from './WorldIntentDevices';
import WorldIntentSigns from './WorldIntentSigns';
import WorldIntentSurface from './WorldIntentSurface';
import { night } from '../WorldNight';

/** World-space scene. The parent owns actor/camera integration and the activation radius. */
function WorldIntentCoaster({ active }: { active: boolean }) {
  const occupied = useIntentStore(s => s.riding), enabled = active || occupied;
  const structure = useMemo(() => createCoasterStructure(enabled), [enabled]);
  useEffect(() => () => { structure.steel.dispose(); structure.glow.dispose(); }, [structure]);
  useEffect(() => {
    useIntentStore.setState({ active: enabled });
    if (!enabled) { clearIntentRide(); return; }
    loadIntentProgress();
    const releaseAudio = parkAudio.retain();
    return () => { clearIntentRide(true); useIntentStore.setState({ active: false }); releaseAudio(); };
  }, [enabled]);
  return <group name="intent-coaster" userData={{noOcclusionFade:true}}>
    <mesh geometry={structure.steel} receiveShadow><WorldIntentSurface roughness={.82} metalness={.16} /></mesh>
    <mesh geometry={structure.glow}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
    <CoasterTrain active={enabled} />
    {enabled && <><WorldIntentDevices /><WorldIntentSigns /><CoasterCollisions colliders={structure.colliders} /><IntentMovingLight /></>}
  </group>;
}
export default memo(WorldIntentCoaster);

function CoasterTrain({ active }: { active: boolean }) {
  const cars = useRef<(Group | null)[]>([]), geometry = useMemo(createCoasterCar, []);
  const lastCue = useRef(-1), lastPhase = useRef('station');
  const presented = useRef({ u: NaN, view: '' });
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, dt) => {
    if (!active) return;
    const w = useWorldStore.getState(), s = useIntentStore.getState();
    const transition = attractionRide.transition;
    const owned = s.riding && attractionRide.active && intentRideClock.revision === attractionRide.revision && !!transition;
    const frozen = w.paused || w.poolInspect || !!w.shot || document.hidden;
    if (s.riding && !owned) { clearIntentRide(); lastCue.current = -1; }
    if (owned && transition.phase === 'riding') {
      const next = advanceCoaster(intentRideClock, dt, active, frozen, document.hidden, true, attractionRide.revision);
      Object.assign(intentRideClock, next);
      if (!next.riding && next.elapsed >= COASTER_DURATION) {
        returnCoasterToStation(transition);
        useIntentStore.setState({ rideSecond: COASTER_DURATION });
      }
    }
    const u = owned && transition.phase === 'riding' ? coasterDistanceAt(intentRideClock.elapsed) : 0;
    if (owned) {
      const wasRiding = transition.phase === 'riding';
      const pose = coasterRidePose(u, wasRiding ? s.view : 'chase');
      advanceCoasterTransition(transition, dt, frozen, pose);
      if (!wasRiding && transition.phase === 'riding') Object.assign(intentRideClock, { elapsed: 0, riding: true });
      if (transition.phase !== 'riding') {
        // Boarding remains visible even when the selected on-track view is first person.
        pose.cameraTarget = [transition.frame.root[0], transition.frame.root[1] + .9, transition.frame.root[2]];
      }
      updateAttractionRide(pose);
      if (s.ridePhase !== transition.phase || s.exitRequested !== transition.exitRequested)
        useIntentStore.setState({ ridePhase: transition.phase, exitRequested: transition.exitRequested });
    }
    const moved = presented.current.u !== u;
    if (moved) cars.current.forEach((car, i) => {
      if (!car) return; const f = coasterFrame(u - i * 3.55 / COASTER_LENGTH);
      car.position.copy(f.point); car.quaternion.copy(f.rotation);
    });
    presented.current.u = u; presented.current.view = s.view;
    if (!intentRideClock.riding) return;
    const second = Math.floor(intentRideClock.elapsed), phase = coasterPhase(intentRideClock.elapsed);
    if (second !== s.rideSecond) useIntentStore.setState({ rideSecond: second });
    if (phase !== lastPhase.current) { lastPhase.current = phase; if (phase === 'crest') parkAudio.cue('scan', .12); }
    if (phase === 'lift' && second !== lastCue.current) { lastCue.current = second; parkAudio.cue('strike', .035); }
  }, -60);
  return <group name="intent-train" onClick={e => { e.stopPropagation(); activateIntentTarget('board'); }}>
    {[0, 1, 2].map(i => {
      const f = coasterFrame(-i * 3.55 / COASTER_LENGTH);
      return <group key={i} ref={el => { cars.current[i] = el; }} position={f.point} quaternion={f.rotation}>
        <mesh geometry={geometry}><WorldIntentSurface roughness={.65} metalness={.12} /></mesh>
      </group>;
    })}
  </group>;
}

function CoasterCollisions({ colliders }: { colliders: CoasterCollider[] }) {
  const gateOpen = useIntentStore(s => s.progress.gateOpen);
  return <>
    {[true, false].map(surface => <RigidBody key={String(surface)} type="fixed" colliders={false} userData={surface ? { surface: true, assetId: 'intent-coaster' } : { solid: true, assetId: 'intent-coaster' }}>
      {colliders.filter(c => !!c.surface === surface).map((c, i) => <CuboidCollider key={i} position={c.position} rotation={c.rotation} args={c.half} friction={.9} />)}
    </RigidBody>)}
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: 'intent-coaster' }}>
      {!gateOpen && <CuboidCollider position={coasterWorld([0, 1.6, COASTER_GATE_Z])} args={[5, 1.6, .18]} />}
      {gateOpen && [-1, 1].map(side => <CuboidCollider key={side} position={coasterWorld([side * (5 - 2.5 * Math.cos(1.45)), 1.6, COASTER_GATE_Z - 2.5 * Math.sin(1.45)])} rotation={[0, -side * 1.45, 0]} args={[2.5, 1.6, .18]} />)}
    </RigidBody>
    {INTENT_STATIONS.map(s => <RigidBody key={s.id} type="fixed" colliders={false} userData={{ solid: true, interactable: `intent-${s.id}` }}>
      <CuboidCollider position={coasterWorld([s.origin[0], .65, s.origin[2]])} args={[3.5, .65, 1.7]} />
    </RigidBody>)}
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, interactable: 'intent-chest' }}>
      <CuboidCollider position={coasterWorld([-8, .65, 59.5])} args={[1.9, .65, 1.05]} />
    </RigidBody>
  </>;
}

/** Two bounded, shadowless fills illuminate moving actors; architecture uses baked radiance. */
function IntentMovingLight() {
  const moving = useRef<PointLight>(null), station = useRef<PointLight>(null);
  const previous = useRef({ elapsed: NaN, riding: false, x: NaN, y: NaN, z: NaN, night: NaN });
  useFrame(() => {
    const last = previous.current, intensityChanged = last.night !== night.value;
    if (intensityChanged) {
      if (moving.current) moving.current.intensity = 32 * night.value;
      if (station.current) station.current.intensity = 38 * night.value;
    }
    const becameVisible = last.night <= 0 && night.value > 0;
    last.night = night.value;
    if (!moving.current || night.value <= 0) return;
    if (intentRideClock.riding) {
      if (!becameVisible && last.riding && last.elapsed === intentRideClock.elapsed) return;
      const p = coasterFrame(coasterDistanceAt(intentRideClock.elapsed)).point;
      moving.current.position.set(p.x - 2, p.y + 3.5, p.z + 2);
    } else {
      const [x, y, z] = useWorldStore.getState().position;
      if (!becameVisible && !last.riding && last.x === x && last.y === y && last.z === z) return;
      moving.current.position.set(x - 2, y + 3.5, z + 2);
      last.x = x; last.y = y; last.z = z;
    }
    last.elapsed = intentRideClock.elapsed; last.riding = intentRideClock.riding;
  });
  return <><pointLight ref={moving} color="#ffd6a3" distance={14} decay={2} intensity={0} />
    <pointLight ref={station} position={coasterWorld([-3, 5.2, 43])} color="#ffe0b4" distance={18} decay={2} intensity={0} /></>;
}
