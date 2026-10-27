import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { IBD_ALL_CLEAR } from './ibd-cases.ts';
import { IBD_SLOTS, IBD_CARGO_HOME, ibdStation, ibdWorld, type IbdSlot } from './ibd-yard-layout.ts';
import { yardCase, yardItemId } from './ibd-yard-game.ts';
import { advanceIbdMotion, ibdCargoPose } from './ibd-yard-motion.ts';
import { finishIbdAction, ibdActor, useIbdYardStore } from './ibd-yard-store.ts';
import { buildIbdCoil, buildIbdPack, buildIbdLid, buildIbdCrane, buildIbdHook, buildIbdCables, buildIbdShutter, buildIbdTools } from './ibd-yard-geometry.ts';
import type { IbdItem } from './ibd-model.ts';

const cargoGeometry = (item: IbdItem) => item.kind === 'coil' ? buildIbdCoil(!!item.defects['quality-rear'], item.id.includes('rear') ? 2 : 1) : buildIbdPack(item.quantity, item.specId);
const movable = { movable: true, solid: true, assetId: 'ibd-yard-cargo' };
/** Four controlled cargo bodies. No per-frame React updates and no free debris simulation. */
export default function WorldIbdMechanisms({ material, active }: { material: MeshStandardMaterial; active: boolean }) {
  const game = useIbdYardStore(s => s.game);
  const bodies = useRef<Partial<Record<IbdSlot, RapierRigidBody | null>>>({});
  const meshes = useRef<Partial<Record<IbdSlot, Mesh | null>>>({});
  const lids = useRef<Partial<Record<IbdSlot, Group | null>>>({});
  const crane = useRef<Mesh>(null), hook = useRef<Mesh>(null), cables = useRef<Mesh>(null), shutterBody = useRef<RapierRigidBody>(null), tools = useRef<Mesh>(null), returnPreview = useRef<Mesh>(null);
  const clock = useRef({ token: -1, elapsed: 0 });
  const resources = useMemo(() => {
    const scenario = yardCase(game);
    const goods = Object.fromEntries(IBD_SLOTS.map(slot => [slot, cargoGeometry(scenario.items.find(i => i.id === yardItemId(game, slot))!)])) as Record<IbdSlot, BufferGeometry>;
    const fresh = Object.fromEntries(IBD_SLOTS.map(slot => [slot, cargoGeometry(IBD_ALL_CLEAR.items.find(i => i.id === slot)!)])) as Record<IbdSlot, BufferGeometry>;
    const returned = game.exchanges.map(e => ({ slot: e.slot, geometry: cargoGeometry(e.original) }));
    return { goods, fresh, returned };
  }, [game.caseIndex, game.exchanges]);
  const fixed = useMemo(() => ({ lid: buildIbdLid(), crane: buildIbdCrane(), hook: buildIbdHook(), cables: buildIbdCables(), shutter: buildIbdShutter(), tools: buildIbdTools(), rotation: new Quaternion(), up: new Vector3(0, 1, 0) }), []);
  useEffect(() => () => { Object.values(resources.goods).forEach(g => g.dispose()); Object.values(resources.fresh).forEach(g => g.dispose()); resources.returned.forEach(r => r.geometry.dispose()); }, [resources]);
  useEffect(() => () => { fixed.lid.dispose(); fixed.crane.dispose(); fixed.hook.dispose(); fixed.cables.dispose(); fixed.shutter.dispose(); fixed.tools.dispose(); }, [fixed]);
  const apply = (progress: number, snap = false) => {
    const exchanging = game.pending?.action.kind === 'replace' ? game.pending.action.slot : undefined;
    if (returnPreview.current) {
      returnPreview.current.visible = !!exchanging && progress >= .5;
      if (exchanging) {
        returnPreview.current.geometry = resources.goods[exchanging];
        const at = exchanging.startsWith('coil') ? [-17, 2.35, 12] : [14, 1.1, -16.3];
        returnPreview.current.position.set(at[0], at[1], at[2]);
      }
    }
    for (const slot of IBD_SLOTS) {
      const pose = ibdCargoPose(game, slot, progress), body = bodies.current[slot], mesh = meshes.current[slot], lid = lids.current[slot];
      const [x, y, z] = ibdWorld(pose.at); fixed.rotation.setFromAxisAngle(fixed.up, pose.yaw);
      if (body) {
        if (snap) { body.setTranslation({ x, y, z }, true); body.setRotation(fixed.rotation, true); }
        else { body.setNextKinematicTranslation({ x, y, z }); body.setNextKinematicRotation(fixed.rotation); }
      }
      if (mesh) mesh.geometry = game.pending?.action.kind === 'replace' && game.pending.action.slot === slot && progress >= .5 ? resources.fresh[slot] : resources.goods[slot];
      if (lid) lid.rotation.x = pose.lid;
    }
    const coil = ibdCargoPose(game, 'coil-front', progress);
    if (crane.current) crane.current.position.set(coil.at[0], 6.7, -4);
    const hookY = coil.at[1] + 2.4;
    if (hook.current) hook.current.position.set(coil.at[0], hookY, -4);
    if (cables.current) { cables.current.position.set(coil.at[0], 6.35, -4); cables.current.scale.y = Math.max(.05, 6.35 - hookY); }
    const releasing = game.pending?.action.kind === 'release' ? progress : game.released ? 1 : 0;
    if (shutterBody.current) {
      const [x, y, z] = ibdWorld([7, 1.65 + releasing * 3.7, 19.3]);
      if (snap) shutterBody.current.setTranslation({ x, y, z }, true);
      else shutterBody.current.setNextKinematicTranslation({ x, y, z });
    }
    if (tools.current) {
      const action = game.pending?.action;
      tools.current.visible = !!action && ['scan', 'rear', 'contents', 'survey'].includes(action.kind);
      if (action) {
        const at = action.slot ? ibdCargoPose(game, action.slot, progress).at : ibdStation(action.station).at;
        tools.current.position.set(at[0] + Math.sin(progress * Math.PI * 2) * .7, at[1] + .45, at[2] + 1.6);
        tools.current.rotation.z = Math.sin(progress * Math.PI) * .25;
      }
    }
  };
  // Rapier creates body refs in child passive effects. Restore after those effects, including lazy remounts.
  useEffect(() => { clock.current = { token: game.pending?.token ?? -1, elapsed: 0 }; apply(0, true); }, [game.core, game.pending, game.round, resources]);
  useFrame((_, delta) => {
    if (!game.pending) return;
    const actor = ibdActor(), running = active && actor.active && !actor.paused && !actor.hidden;
    if (!running) return;
    const pending = game.pending;
    if (clock.current.token !== pending.token) clock.current = { token: pending.token, elapsed: 0 };
    clock.current.elapsed = advanceIbdMotion(clock.current.elapsed, delta, pending.seconds, true);
    apply(clock.current.elapsed / pending.seconds);
    if (clock.current.elapsed >= pending.seconds) finishIbdAction(pending.token);
  });
  return <group name="ibd-mechanisms" dispose={null}>
    {IBD_SLOTS.map(slot => {
      const coil = slot.startsWith('coil');
      return <RigidBody key={slot} ref={b => { bodies.current[slot] = b; }} type="kinematicPosition" colliders={false}
        position={IBD_CARGO_HOME[slot]} name={`ibd-cargo-${slot}`} userData={movable}>
        <CuboidCollider args={coil ? [2, 2, 1.4] : [1.4, .55, 1.3]} position={coil ? [0, 0, 0] : [0, .45, 0]} friction={.8} />
        <mesh ref={m => { meshes.current[slot] = m; }} geometry={resources.goods[slot]} material={material} castShadow receiveShadow userData={movable} />
        {!coil && <group ref={g => { lids.current[slot] = g; }} position={[0, 1.08, -1.25]}>
          <mesh geometry={fixed.lid} material={material} castShadow userData={movable} />
        </group>}
      </RigidBody>;
    })}
    <mesh ref={crane} geometry={fixed.crane} material={material} position={[-12, 6.7, -4]} castShadow userData={movable} />
    <mesh ref={hook} geometry={fixed.hook} material={material} position={[-12, 5, -4]} castShadow userData={movable} />
    <mesh ref={cables} geometry={fixed.cables} material={material} position={[-12, 6.35, -4]} userData={movable} />
    <RigidBody ref={shutterBody} type="kinematicPosition" colliders={false} position={[7, 1.65, 19.3]} rotation={[0, Math.PI / 2, 0]} userData={movable}>
      <CuboidCollider args={[.065, 1.5, 4.4]} />
      <mesh geometry={fixed.shutter} material={material} castShadow userData={movable} />
    </RigidBody>
    <mesh ref={tools} geometry={fixed.tools} material={material} visible={false} userData={movable} />
    <mesh ref={returnPreview} geometry={resources.goods['parts-b']} material={material} visible={false} rotation={[0, Math.PI, 0]} userData={movable} />
    {resources.returned.map(r => <RigidBody key={r.slot} type="fixed" colliders={false} userData={{ solid: true, assetId: 'ibd-quarantine' }}
      position={r.slot.startsWith('coil') ? [-17, 2.35, 12] : [14, 1.1, -16.3]} rotation={[0, Math.PI, 0]}>
      <CuboidCollider args={r.slot.startsWith('coil') ? [2, 2, 1.4] : [1.4, .55, 1.3]} position={r.slot.startsWith('coil') ? [0, 0, 0] : [0, .45, 0]} />
      <mesh geometry={r.geometry} material={material} castShadow receiveShadow />
    </RigidBody>)}
  </group>;
}
