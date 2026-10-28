import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useAfterPhysicsStep, useRapier, type RapierRigidBody, type RapierCollider } from '@react-three/rapier';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { IBD_ALL_CLEAR } from './ibd-cases.ts';
import { IBD_SLOTS, IBD_CARGO_HOME, IBD_CRANE_Y, ibdWorld, type IbdSlot } from './ibd-yard-layout.ts';
import { yardCase, yardItemId } from './ibd-yard-game.ts';
import { ibdCargoPose, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import { createIbdMotionClock, createIbdSafety, stepIbdSafeMotion } from './ibd-yard-safety.ts';
import { finishIbdAction, ibdActor, setIbdMotionWait, useIbdYardStore } from './ibd-yard-store.ts';
import { buildIbdCoil, buildIbdPack, buildIbdLid, buildIbdCrane, buildIbdHook, buildIbdCables, buildIbdShutter } from './ibd-yard-geometry.ts';
import type { IbdItem } from './ibd-model.ts';
import { buildIbdPackShell } from './ibd-pack-geometry';
import WorldIbdPackInspection from './WorldIbdPackInspection';
import WorldIbdCoilInspection from './WorldIbdCoilInspection';
import { isIbdCoilCheck } from './ibd-coil-inspection.ts';

const cargoGeometry = (item: IbdItem) => item.kind === 'coil' ? buildIbdCoil(!!item.defects['quality-rear'], item.id.includes('rear') ? 2 : 1) : buildIbdPack(item.quantity, item.specId);
const movable = { movable: true, solid: true, assetId: 'ibd-yard-cargo' };
/** Four controlled cargo bodies. No per-frame React updates and no free debris simulation. */
export default function WorldIbdMechanisms({ material, active }: { material: MeshStandardMaterial; active: boolean }) {
  const game = useIbdYardStore(s => s.game);
  const { world, rapier, colliderStates } = useRapier();
  const safety = useMemo(() => createIbdSafety(rapier, game), [rapier, game.pending, game.core, game.exchanges]);
  const playerCollider = useRef<RapierCollider | null>(null), lookupDelay = useRef(0), completeToken = useRef<number | null>(null);
  const exchanging = game.pending?.action.kind === 'replace' ? game.pending.action.slot : undefined;
  const bodies = useRef<Partial<Record<IbdSlot, RapierRigidBody | null>>>({});
  const meshes = useRef<Partial<Record<IbdSlot, Mesh | null>>>({});
  const lids = useRef<Partial<Record<IbdSlot, Group | null>>>({});
  const crane = useRef<Mesh>(null), hook = useRef<Mesh>(null), cables = useRef<Mesh>(null), shutterBody = useRef<RapierRigidBody>(null);
  const spareBody = useRef<RapierRigidBody | null>(null);
  const mountSpare = useCallback((body: RapierRigidBody | null) => {
    spareBody.current = body;
    body?.setEnabled(false);
  }, []);
  const clock = useRef(createIbdMotionClock());
  const resources = useMemo(() => {
    const scenario = yardCase(game);
    const goods = Object.fromEntries(IBD_SLOTS.map(slot => [slot, slot.startsWith('parts')?buildIbdPackShell():cargoGeometry(scenario.items.find(i => i.id === yardItemId(game, slot))!)])) as Record<IbdSlot, BufferGeometry>;
    const fresh = Object.fromEntries(IBD_SLOTS.map(slot => [slot, cargoGeometry(IBD_ALL_CLEAR.items.find(i => i.id === slot)!)])) as Record<IbdSlot, BufferGeometry>;
    const returned = game.exchanges.map(e => ({ slot: e.slot, geometry: cargoGeometry(e.original) }));
    return { goods, fresh, returned };
  }, [game.caseIndex, game.exchanges]);
  const fixed = useMemo(() => ({ lid: buildIbdLid(), crane: buildIbdCrane(), hook: buildIbdHook(), cables: buildIbdCables(), shutter: buildIbdShutter(), rotation: new Quaternion(), up: new Vector3(0, 1, 0) }), []);
  useEffect(() => () => { Object.values(resources.goods).forEach(g => g.dispose()); Object.values(resources.fresh).forEach(g => g.dispose()); resources.returned.forEach(r => r.geometry.dispose()); }, [resources]);
  useEffect(() => () => { fixed.lid.dispose(); fixed.crane.dispose(); fixed.hook.dispose(); fixed.cables.dispose(); fixed.shutter.dispose(); }, [fixed]);
  const apply = (progress: number, snap = false) => {
    if (exchanging && spareBody.current) {
      const pose = ibdPhysicalCargoPose(game, exchanging, progress, true), [x,y,z] = ibdWorld(pose.at);
      spareBody.current.setEnabled(clock.current.started);
      if (snap) spareBody.current.setTranslation({ x,y,z }, true);
      else spareBody.current.setNextKinematicTranslation({ x,y,z });
    }
    for (const slot of IBD_SLOTS) {
      const pose = ibdPhysicalCargoPose(game, slot, progress), body = bodies.current[slot], mesh = meshes.current[slot], lid = lids.current[slot];
      const [x, y, z] = ibdWorld(pose.at); fixed.rotation.setFromAxisAngle(fixed.up, pose.yaw);
      if (body) {
        if (snap) { body.setTranslation({ x, y, z }, true); body.setRotation(fixed.rotation, true); }
        else { body.setNextKinematicTranslation({ x, y, z }); body.setNextKinematicRotation(fixed.rotation); }
      }
      if (mesh) mesh.geometry = resources.goods[slot];
      if (lid) lid.rotation.x = pose.lid;
    }
    const coil = ibdCargoPose(game, 'coil-front', progress);
    if (crane.current) crane.current.position.set(coil.at[0], IBD_CRANE_Y + .7, -4);
    const hookY = coil.at[1] + 2.4;
    if (hook.current) hook.current.position.set(coil.at[0], hookY, -4);
    if (cables.current) { cables.current.position.set(coil.at[0], IBD_CRANE_Y + .35, -4); cables.current.scale.y = Math.max(.05, IBD_CRANE_Y + .35 - hookY); }
    const releasing = game.pending?.action.kind === 'release' ? progress : game.released ? 1 : 0;
    if (shutterBody.current) {
      const [x, y, z] = ibdWorld([7, 1.65 + releasing * 3.7, 19.3]);
      if (snap) shutterBody.current.setTranslation({ x, y, z }, true);
      else shutterBody.current.setNextKinematicTranslation({ x, y, z });
    }
  };
  // Rapier creates body refs in child passive effects. Restore after those effects, including lazy remounts.
  useEffect(() => { clock.current = createIbdMotionClock(); completeToken.current = null; setIbdMotionWait(null); apply(0, true); }, [game.core, game.pending, game.round, resources]);
  useBeforePhysicsStep(() => {
    if (!game.pending || isIbdCoilCheck(game.pending.action)) return;
    const actor = ibdActor(), running = active && actor.active && !actor.paused && !actor.hidden;
    const pending = game.pending;
    if (!running) { apply(clock.current.elapsed / pending.seconds); return; }
    const dt = world.timestep;
    if (playerCollider.current && !world.getCollider(playerCollider.current.handle)) playerCollider.current = null;
    if (safety.protectedMotion && !playerCollider.current) {
      lookupDelay.current -= dt;
      if (lookupDelay.current <= 0) {
        playerCollider.current = [...colliderStates.values()].find(s => s.object.name === 'player-capsule')?.collider ?? null;
        lookupDelay.current = .25;
      }
    }
    const player = safety.protectedMotion ? playerCollider.current : null, disabled = !!player && !player.isEnabled();
    const snapshot = player && !disabled ? { shape: player.shape, position: player.translation(), rotation: player.rotation(), velocity: player.parent()?.linvel() ?? {x:0,y:0,z:0} } : null;
    const result = stepIbdSafeMotion(clock.current, pending.seconds, dt, safety, snapshot, true, disabled);
    setIbdMotionWait(result.wait);
    // Reissue the held pose too: a pending kinematic target must never keep pushing during a wait.
    apply(result.progress);
    if (result.done) completeToken.current = pending.token;
  });
  useAfterPhysicsStep(() => {
    if (completeToken.current === null) return;
    const token = completeToken.current; completeToken.current = null;
    if (useIbdYardStore.getState().game.pending?.token === token) finishIbdAction(token);
  });
  return <group name="ibd-mechanisms" dispose={null}>
    {IBD_SLOTS.map(slot => {
      const coil = slot.startsWith('coil');
      return <RigidBody key={slot} ref={b => { bodies.current[slot] = b; }} type="kinematicPosition" colliders={false}
        position={IBD_CARGO_HOME[slot]} name={`ibd-cargo-${slot}`} userData={movable}>
        <CuboidCollider args={coil ? [2, 2, 1.4] : [1.4, .55, 1.3]} position={coil ? [0, 0, 0] : [0, .45, 0]} friction={.8} />
        <mesh ref={m => { meshes.current[slot] = m; }} geometry={resources.goods[slot]} material={material} castShadow receiveShadow userData={movable} />
        {!coil&&<WorldIbdPackInspection key={yardItemId(game,slot)} slot={slot} item={yardCase(game).items.find(i=>i.id===yardItemId(game,slot))!} material={material}/>}
        {!coil && <group ref={g => { lids.current[slot] = g; }} position={[0, 1.08, -1.25]}>
          <mesh geometry={fixed.lid} material={material} castShadow userData={movable} />
        </group>}
      </RigidBody>;
    })}
    <mesh ref={crane} geometry={fixed.crane} material={material} position={[-12, IBD_CRANE_Y + .7, -4]} castShadow userData={movable} />
    <mesh ref={hook} geometry={fixed.hook} material={material} position={[-12, 5, -4]} castShadow userData={movable} />
    <mesh ref={cables} geometry={fixed.cables} material={material} position={[-12, IBD_CRANE_Y + .35, -4]} userData={movable} />
    <RigidBody ref={shutterBody} type="kinematicPosition" colliders={false} position={[7, 1.65, 19.3]} rotation={[0, Math.PI / 2, 0]} userData={movable}>
      <CuboidCollider args={[.065, 1.5, 4.4]} />
      <mesh geometry={fixed.shutter} material={material} castShadow userData={movable} />
    </RigidBody>
    <WorldIbdCoilInspection material={material}/>
    {exchanging && <RigidBody ref={mountSpare} type="kinematicPosition" colliders={false}
      position={ibdPhysicalCargoPose(game, exchanging, 0, true).at} userData={movable}>
      <CuboidCollider args={exchanging.startsWith('coil') ? [2,2,1.4] : [1.4,.55,1.3]} position={exchanging.startsWith('coil') ? [0,0,0] : [0,.45,0]} />
      <mesh geometry={resources.fresh[exchanging]} material={material} castShadow receiveShadow userData={movable} />
      {!exchanging.startsWith('coil') && <mesh geometry={fixed.lid} material={material} position={[0,1.08,-1.25]} castShadow />}
    </RigidBody>}
    {resources.returned.map(r => <RigidBody key={r.slot} type="fixed" colliders={false} userData={{ solid: true, assetId: 'ibd-quarantine' }}
      position={r.slot.startsWith('coil') ? [-17, 2.35, 12] : [14, 1.1, -16.3]} rotation={[0, Math.PI, 0]}>
      <CuboidCollider args={r.slot.startsWith('coil') ? [2, 2, 1.4] : [1.4, .55, 1.3]} position={r.slot.startsWith('coil') ? [0, 0, 0] : [0, .45, 0]} />
      <mesh geometry={r.geometry} material={material} castShadow receiveShadow />
    </RigidBody>)}
  </group>;
}
