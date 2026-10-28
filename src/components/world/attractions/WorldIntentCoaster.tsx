import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { Group, PointLight } from 'three';
import { useWorldStore } from '../store';
import { parkAudio } from '../WorldParkAudio';
import { attractionRide, updateAttractionRide } from './attraction-ride';
import { advanceCoaster, coasterDistanceAt, coasterFrame, coasterRidePose, coasterWorld, COASTER_DURATION, COASTER_LENGTH } from './coaster-track';
import { createCoasterCar, createCoasterStructure, type CoasterCollider } from './coaster-geometry';
import { activateIntentTarget, intentRideClock, loadIntentProgress, clearIntentRide, useIntentStore } from './intent-state';
import { advanceCoasterTransition, returnCoasterToStation } from './coaster-transition';
import WorldIntentDevices from './WorldIntentDevices';
import WorldIntentSigns from './WorldIntentSigns';
import WorldIntentSurface from './WorldIntentSurface';
import WorldCoasterVegetation from './WorldCoasterVegetation';
import { night } from '../WorldNight';
import { CoasterMotionAudio } from './coaster-motion-audio';
import { CoasterStructureCache, coasterStructureMemory } from './coaster-structure-cache';
import { buildCoasterInWorker } from './coaster-structure-job';
import { COASTER_CAR_PANELS } from './coaster-access';

/** World-space scene. The parent owns actor/camera integration and the activation radius. */
function WorldIntentCoaster({ active }: { active: boolean }) {
  const occupied = useIntentStore(s => s.riding), enabled = active || occupied;
  const structures = useMemo(() => new CoasterStructureCache(createCoasterStructure, buildCoasterInWorker), []);
  const [presented, setPresented] = useState(() => {
    const result = structures.get(enabled);
    Object.assign(coasterStructureMemory, structures.snapshot());
    return { near: enabled, structure: result };
  });
  const cached = structures.peek(enabled);
  const structure = cached ?? presented.structure, renderedNear = cached ? enabled : presented.near;
  useEffect(() => {
    let current = true;
    if (!structures.peek(enabled)) structures.load(enabled).then(value => {
      Object.assign(coasterStructureMemory, structures.snapshot());
      if (current) setPresented({ near: enabled, structure: value });
    }).catch(error => {
      // Retain the existing model and its matching contacts if a worker cannot run.
      if (current) console.warn('Coaster detail retained:', error);
    });
    return () => { current = false; };
  }, [structures, enabled]);
  useEffect(() => () => structures.releaseGpu(renderedNear), [structures, renderedNear]);
  useEffect(() => () => { structures.dispose(); Object.assign(coasterStructureMemory, structures.snapshot()); }, [structures]);
  useEffect(() => {
    useIntentStore.setState({ active: enabled });
    if (!enabled) { clearIntentRide(); return; }
    loadIntentProgress();
    const releaseAudio = parkAudio.retain();
    return () => { clearIntentRide(true); useIntentStore.setState({ active: false }); releaseAudio(); };
  }, [enabled]);
  return <><group name="intent-coaster" userData={{noOcclusionFade:true}}>
    <mesh geometry={structure.steel} castShadow receiveShadow><WorldIntentSurface roughness={.82} metalness={.16} /></mesh>
    <mesh geometry={structure.glow}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
    <CoasterTrain active={enabled} />
    {enabled && <><WorldIntentDevices /><WorldIntentSigns />
      {/* LODs have different support counts. Never reuse an index-keyed collider
          for a different solid while its Rapier hook still owns the old shape. */}
      <CoasterCollisions key={String(renderedNear)} colliders={structure.colliders} /><IntentMovingLight />
      <RigidBody key={`track-${renderedNear}`} type="fixed" colliders={false} userData={{ solid: true, assetId: 'coaster-track-sample' }}>
        <TrimeshCollider args={[structure.track.vertices, structure.track.indices]} friction={.9} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ surface: true, solid: true, assetId: 'coaster-relief' }}>
        <TrimeshCollider args={[structure.relief.vertices, structure.relief.indices]} friction={.9} />
      </RigidBody>
    </>}
  </group><WorldCoasterVegetation /></>;
}
export default memo(WorldIntentCoaster);

function CoasterTrain({ active }: { active: boolean }) {
  const occupied = useIntentStore(s => s.riding);
  const cars = useRef<(Group | null)[]>([]), geometry = useMemo(createCoasterCar, []);
  const audio = useRef<CoasterMotionAudio | null>(null);
  useEffect(() => {
    if (!active) return;
    const service = new CoasterMotionAudio(); audio.current = service;
    const release = service.mount();
    return () => { audio.current = null; release(); };
  }, [active]);
  const presented = useRef({ u: NaN, view: '' });
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, dt) => {
    if (!active) return;
    const w = useWorldStore.getState(), s = useIntentStore.getState();
    const transition = attractionRide.transition;
    const owned = s.riding && attractionRide.active && intentRideClock.revision === attractionRide.revision && !!transition;
    const frozen = w.paused || w.poolInspect || !!w.shot || document.hidden;
    if (s.riding && !owned) { clearIntentRide(); }
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
    audio.current?.update();
    if (!intentRideClock.riding) return;
    const second = Math.floor(intentRideClock.elapsed);
    if (second !== s.rideSecond) useIntentStore.setState({ rideSecond: second });
  }, -60);
  // Boarding holds the cars still for seconds; they must never enter static shadow chunks.
  return <group name="intent-train" userData={{ shadowDynamic: true }} onClick={e => { e.stopPropagation(); activateIntentTarget('board'); }}>
    {[0, 1, 2].map(i => {
      const f = coasterFrame(-i * 3.55 / COASTER_LENGTH);
      return <group key={i} ref={el => { cars.current[i] = el; }} position={f.point} quaternion={f.rotation}>
        <mesh geometry={geometry} castShadow receiveShadow><WorldIntentSurface roughness={.65} metalness={.12} /></mesh>
        {active && !occupied && <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: 'coaster-parked-car' }}>
          {COASTER_CAR_PANELS.map((p, j) => <CuboidCollider key={j} position={p.at} args={p.size.map(v => v / 2) as [number, number, number]} />)}
        </RigidBody>}
      </group>;
    })}
  </group>;
}

function CoasterCollisions({ colliders }: { colliders: CoasterCollider[] }) {
  return <>
    {[true, false].map(surface => <RigidBody key={String(surface)} type="fixed" colliders={false} userData={surface ? { surface: true, assetId: 'intent-coaster' } : { solid: true, assetId: 'intent-coaster' }}>
      {colliders.filter(c => !!c.surface === surface).map((c, i) => c.hull
        ? <ConvexHullCollider key={i} position={c.position} rotation={c.rotation} args={[c.hull]} friction={.9} />
        : <CuboidCollider key={i} position={c.position} rotation={c.rotation} args={c.half} friction={.9} />)}
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
