import { useEffect, useMemo, useRef, useState } from 'react';
import { CylinderCollider, RigidBody, TrimeshCollider, useBeforePhysicsStep, useAfterPhysicsStep, useRapier, type RapierRigidBody, type RapierCollider } from '@react-three/rapier';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { IBD_ALL_CLEAR, IBD_CASES } from './ibd-cases.ts';
import { IBD_SLOTS, IBD_CARGO_HOME, IBD_STOCK_KEYS, IBD_STOCK_HOME, isIbdStockKey, ibdWorld, type IbdStockKey, type IbdSlot } from './ibd-yard-layout.ts';
import { yardCase, yardItemId } from './ibd-yard-game.ts';
import { ibdCargoPose, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import { createIbdMotionClock, createIbdSafety, stepIbdSafeMotion } from './ibd-yard-safety.ts';
import { finishIbdAction, ibdActor, setIbdMotionWait, useIbdYardStore } from './ibd-yard-store.ts';
import { buildIbdCoil, buildIbdPack, buildIbdLid, buildIbdCrane, buildIbdHook, buildIbdCables } from './ibd-yard-geometry.ts';
import type { IbdItem } from './ibd-model.ts';
import { buildIbdPackShell } from './ibd-pack-geometry';
import WorldIbdPackInspection from './WorldIbdPackInspection';
import WorldIbdCoilInspection from './WorldIbdCoilInspection';
import { isIbdCoilCheck } from './ibd-coil-inspection.ts';
import { craneMayAdvance,craneLanded,craneControl } from './ibd-crane-control';
import WorldIbdCraneLevers from './WorldIbdCraneLevers';
import { ibdStockItem } from './ibd-stock';
import WorldIbdCratePart from './WorldIbdCratePart';
import { IBD_CRATE_LID_PIVOT, ibdCrateLegacy, type IbdCratePart } from './ibd-crate-visual';
import { createIbdDispatchShutter, ibdDispatchShutterAt, IBD_DISPATCH_SHUTTER_FACE, IBD_DISPATCH_SHUTTER_ROOT, IBD_DISPATCH_SHUTTER_YAW } from './ibd-dispatch-shutter';
import { ibdHoistCableSources, ibdHoistPose, IBD_HOIST_CONTACT_ROOT } from './ibd-hoist-contact';
import { ibdGeometryContact } from './ibd-static-contact';
import type { Vec3 } from '../types';

const cargoGeometry = (item: IbdItem,includeShell=true) => item.kind === 'coil' ? buildIbdCoil(!!item.defects['quality-rear'], item.id.includes('rear') ? 2 : 1) : buildIbdPack(item.quantity, item.specId,{includeShell});
const movable = { movable: true, solid: true, assetId: 'ibd-yard-cargo' };
const coilSlots=['coil-front','coil-rear'] as const;
const meshContact=(geometry:BufferGeometry,id:string)=>ibdGeometryContact(geometry,id,0,geometry.index!.count);
const contactSource=(id:string)=>({...movable,worldCollision:'solid',surfaceId:id});
const stagingPreview={worldCollision:'none',collisionReason:'Staged replacement preview while the crew waits for a safe motion start'};
const cartonContents={worldCollision:'none',collisionReason:'Carton contents ride inside the crate and use their hand inspection targets'};
const homeHoist=ibdHoistPose(IBD_CARGO_HOME['coil-front']);

function moveAt(body:RapierRigidBody|null,point:Vec3,snap:boolean) {
  if(!body?.isValid())return;
  const [x,y,z]=ibdWorld(point);
  if(snap) body.setTranslation({x,y,z},true);
  else body.setNextKinematicTranslation({x,y,z});
}
/** Four controlled cargo bodies. No per-frame React updates and no free debris simulation. */
export default function WorldIbdMechanisms({ material, active }: { material: MeshStandardMaterial; active: boolean }) {
  const game = useIbdYardStore(s => s.game);
  const legacyCrates=useMemo(()=>ibdCrateLegacy(typeof window==='undefined'?'':window.location.search),[]);
  const { world, rapier, colliderStates } = useRapier();
  const safety = useMemo(() => createIbdSafety(rapier, game), [rapier, game.pending, game.core, game.exchanges]);
  const playerCollider = useRef<RapierCollider | null>(null), lookupDelay = useRef(0), completeToken = useRef<number | null>(null);
  const exchanging = game.pending?.action.kind === 'replace'&&game.pending.action.slot!=='parts-b' ? game.pending.action.slot : undefined;
  const selecting=game.pending?.action.kind==='select-stock'&&isIbdStockKey(game.pending.action.station)?game.pending.action.station:null;
  const bVisible=!game.stock.requested||!!selecting;
  const itemFor=(slot:IbdSlot)=>slot==='parts-b'&&selecting?ibdStockItem(game.round,game.caseIndex,selecting)
    :yardCase(game).items.find(i=>i.id===yardItemId(game,slot))!;
  const bodies = useRef<Partial<Record<IbdSlot, RapierRigidBody | null>>>({});
  const lids = useRef<Partial<Record<IbdSlot|IbdStockKey, Group|null>>>({});
  const lidColliders=useRef<Partial<Record<IbdSlot|IbdStockKey,RapierCollider|null>>>({});
  const crane = useRef<RapierRigidBody>(null), hook = useRef<RapierRigidBody>(null), cableBody=useRef<RapierRigidBody>(null);
  const cables=useRef<Mesh>(null), cableColliders=useRef<(RapierCollider|null)[]>([]), shutterBody=useRef<RapierRigidBody>(null);
  const spareBody = useRef<RapierRigidBody | null>(null);
  const [activeSpare,setActiveSpare]=useState<typeof game.pending>(null);
  const clock = useRef(createIbdMotionClock());
  const resources = useMemo(() => {
    const scenario = yardCase(game);
    const goods = Object.fromEntries(IBD_SLOTS.map(slot => [slot, slot.startsWith('parts')?buildIbdPackShell():cargoGeometry(scenario.items.find(i => i.id === yardItemId(game, slot))!)])) as Record<IbdSlot, BufferGeometry>;
    const coilContacts=Object.fromEntries(coilSlots.map(slot=>[slot,meshContact(goods[slot],`ibd-cargo-${slot}-surface`)]));
    // Samples remain separate from the replaceable shell, including the spare
    // and quarantine props. Their original quantity/specification stays intact.
    const fresh = Object.fromEntries(IBD_SLOTS.map(slot => [slot, cargoGeometry(IBD_ALL_CLEAR.items.find(i => i.id === slot)!,false)])) as Record<IbdSlot, BufferGeometry>;
    const incomingCoils=Object.fromEntries(coilSlots.map(slot=>[slot,meshContact(fresh[slot],`ibd-incoming-${slot}-surface`)]));
    const quarantined=game.exchanges.map(e=>({slot:e.slot,item:e.original}));
    if(game.stock.originalReturned)quarantined.push({slot:'parts-b',item:IBD_CASES[game.caseIndex].items.find(i=>i.id==='parts-b')!});
    const returned = quarantined.map(({slot,item})=>{
      const geometry=cargoGeometry(item,false);
      return {slot,geometry,contact:item.kind==='coil'?meshContact(geometry,`ibd-quarantine-${slot}-surface`):null};
    });
    return { goods, fresh, returned, coilContacts, incomingCoils };
  }, [game.caseIndex, game.exchanges, game.stock.originalReturned]);
  const fixed = useMemo(() => {
    const crane=buildIbdCrane(),hook=buildIbdHook(),cables=buildIbdCables();
    return {lid:buildIbdLid(),crane,hook,cables,shutter:createIbdDispatchShutter(),rotation:new Quaternion(),up:new Vector3(0,1,0),hinge:new Vector3(1,0,0),
      craneContact:meshContact(crane,'ibd-hoist-trolley'),hookContact:meshContact(hook,'ibd-hoist-hook'),cableSources:ibdHoistCableSources(cables)};
  }, []);
  useEffect(() => () => { Object.values(resources.goods).forEach(g => g.dispose()); Object.values(resources.fresh).forEach(g => g.dispose()); resources.returned.forEach(r => r.geometry.dispose()); }, [resources]);
  useEffect(() => () => { fixed.lid.dispose(); fixed.crane.dispose(); fixed.hook.dispose(); fixed.cables.dispose(); fixed.shutter.geometry.dispose(); }, [fixed]);
  const turnLid=(key:IbdSlot|IbdStockKey,angle:number)=>{
    const lid=lids.current[key];
    if(!lid||lid.rotation.x===angle)return;
    lid.rotation.x=angle;
    const collider=lidColliders.current[key];
    if(collider?.isValid())collider.setRotationWrtParent(fixed.rotation.setFromAxisAngle(fixed.hinge,angle));
  };
  const crate=(owner:string,part:IbdCratePart,geometry:BufferGeometry,key?:IbdSlot|IbdStockKey,physical=true)=><WorldIbdCratePart
    part={part} active={active} legacy={legacyCrates} fallback={<mesh geometry={geometry} material={material} castShadow receiveShadow={part==='Shell'}/>}
    contact={physical?{id:`${owner}-${part.toLowerCase()}`,geometry,colliderRef:key?collider=>{lidColliders.current[key]=collider;}:undefined}:undefined}/>;
  const apply = (progress: number, snap = false) => {
    if (exchanging && spareBody.current) {
      moveAt(spareBody.current,ibdPhysicalCargoPose(game,exchanging,progress,true).at,snap);
      if(clock.current.started&&activeSpare!==game.pending)setActiveSpare(game.pending);
    }
    for (const slot of IBD_SLOTS) {
      const pose = ibdPhysicalCargoPose(game, slot, progress), body = bodies.current[slot];
      const [x, y, z] = ibdWorld(pose.at); fixed.rotation.setFromAxisAngle(fixed.up, pose.yaw);
      if (body?.isValid()) {
        if (snap) { body.setTranslation({ x, y, z }, true); body.setRotation(fixed.rotation, true); }
        else { body.setNextKinematicTranslation({ x, y, z }); body.setNextKinematicRotation(fixed.rotation); }
      }
      turnLid(slot,pose.lid);
    }
    for(const key of IBD_STOCK_KEYS){
      const id=ibdStockItem(game.round,game.caseIndex,key).id;
      turnLid(key,game.pending?.action.station===key&&game.pending.action.kind==='open'
        ?-2*(progress*progress*(3-2*progress)):game.core.opened.includes(id)?-2:0);
    }
    const hoist=ibdHoistPose(ibdCargoPose(game,'coil-front',progress).at);
    moveAt(crane.current,hoist.trolley,snap);
    moveAt(hook.current,hoist.hook,snap);
    moveAt(cableBody.current,hoist.anchor,snap);
    if(cables.current && (snap||cables.current.scale.y!==hoist.cableLength)){
      cables.current.scale.y=hoist.cableLength;
      const half=hoist.cableLength/2;
      for(const [index,{x}] of fixed.cableSources.entries()){
        cableColliders.current[index]?.setHalfHeight(half);
        cableColliders.current[index]?.setTranslationWrtParent({x,y:-half,z:0});
      }
    }
    const releasing = game.pending?.action.kind === 'release' ? progress : game.released ? 1 : 0;
    if (shutterBody.current) {
      const [x, y, z] = ibdWorld(ibdDispatchShutterAt(releasing));
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
    if(pending.action.kind==='crane'&&!craneMayAdvance(game,clock.current.elapsed/pending.seconds)){
      setIbdMotionWait(null);
      apply(clock.current.elapsed/pending.seconds);
      if(craneControl.done)completeToken.current=pending.token;
      return;
    }
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
    if (result.done) {if(pending.action.kind==='crane')craneLanded();completeToken.current = pending.token;}
  });
  useAfterPhysicsStep(() => {
    if (completeToken.current === null) return;
    const token = completeToken.current; completeToken.current = null;
    if (useIbdYardStore.getState().game.pending?.token === token) finishIbdAction(token);
  });
  return <group name="ibd-mechanisms" dispose={null}>
    <WorldIbdCraneLevers material={material}/>
    {IBD_SLOTS.map(slot => {
      const coil = resources.coilContacts[slot];
      const owner=`ibd-cargo-${slot}`;
      return <RigidBody key={slot} ref={b => { bodies.current[slot] = b; }} type="kinematicPosition" colliders={false}
        position={IBD_CARGO_HOME[slot]} name={owner} userData={movable}>
        {(slot!=='parts-b'||bVisible)&&<>
        {coil?<><TrimeshCollider name={coil.id} args={[coil.vertices,coil.indices]} friction={.8}/>
          <mesh geometry={resources.goods[slot]} material={material} castShadow receiveShadow userData={contactSource(coil.id)}/></>
          :crate(owner,'Shell',resources.goods[slot])}
        {!coil&&(slot==='parts-a'||slot==='parts-b')&&<WorldIbdPackInspection key={itemFor(slot).id} slot={slot} item={itemFor(slot)} material={material}/>}
        {!coil && <group ref={g => { lids.current[slot] = g; }} position={IBD_CRATE_LID_PIVOT}>
          {crate(owner,'Lid',fixed.lid,slot)}
        </group>}
        </>}
      </RigidBody>;
    })}
    {IBD_STOCK_KEYS.filter(key=>game.stock.assigned!==key&&selecting!==key).map(key=>{
      const item=ibdStockItem(game.round,game.caseIndex,key),owner=`ibd-cargo-${key}`;
      return <RigidBody key={key} name={owner} type="fixed" colliders={false} position={IBD_STOCK_HOME[key]} userData={movable}>
        {crate(owner,'Shell',resources.goods['parts-b'])}
        <WorldIbdPackInspection slot={key} item={item} material={material}/>
        <group ref={g=>{lids.current[key]=g;}} position={IBD_CRATE_LID_PIVOT} rotation={[game.core.opened.includes(item.id)?-2:0,0,0]}>
          {crate(owner,'Lid',fixed.lid,key)}
        </group>
      </RigidBody>;
    })}
    <group name={IBD_HOIST_CONTACT_ROOT}>
      <RigidBody ref={crane} type="kinematicPosition" colliders={false} position={homeHoist.trolley} userData={movable}>
        <TrimeshCollider name={fixed.craneContact.id} args={[fixed.craneContact.vertices,fixed.craneContact.indices]}/>
        <mesh geometry={fixed.crane} material={material} castShadow userData={contactSource(fixed.craneContact.id)}/>
      </RigidBody>
      <RigidBody ref={hook} type="kinematicPosition" colliders={false} position={homeHoist.hook} userData={movable}>
        <TrimeshCollider name={fixed.hookContact.id} args={[fixed.hookContact.vertices,fixed.hookContact.indices]}/>
        <mesh geometry={fixed.hook} material={material} castShadow userData={contactSource(fixed.hookContact.id)}/>
      </RigidBody>
      <RigidBody ref={cableBody} type="kinematicPosition" colliders={false} position={homeHoist.anchor} userData={movable}>
        {fixed.cableSources.map(({id,x,radius},index)=><CylinderCollider key={id} name={id} ref={c=>{cableColliders.current[index]=c;}}
          args={[homeHoist.cableLength/2,radius]} position={[x,-homeHoist.cableLength/2,0]}/>)}
        <mesh ref={cables} geometry={fixed.cables} material={material} scale={[1,homeHoist.cableLength,1]}
          userData={{...movable,worldCollisionSources:fixed.cableSources}}/>
      </RigidBody>
    </group>
    <group name={IBD_DISPATCH_SHUTTER_ROOT}>
      <RigidBody ref={shutterBody} type="kinematicPosition" colliders={false} name="ibd-dispatch-shutter-body"
        position={ibdDispatchShutterAt(0)} rotation={[0, IBD_DISPATCH_SHUTTER_YAW, 0]} userData={{...movable,assetId:IBD_DISPATCH_SHUTTER_ROOT}}>
        <TrimeshCollider name={IBD_DISPATCH_SHUTTER_FACE} args={[fixed.shutter.contact.vertices,fixed.shutter.contact.indices]} />
        <mesh name="ibd-dispatch-shutter-visible" geometry={fixed.shutter.geometry} material={material} castShadow
          userData={{...movable,worldCollision:'solid',surfaceId:IBD_DISPATCH_SHUTTER_FACE}} />
      </RigidBody>
    </group>
    <WorldIbdCoilInspection material={material}/>
    {exchanging && (()=>{
      const physical=activeSpare===game.pending, owner=`ibd-incoming-${exchanging}`, contact=resources.incomingCoils[exchanging];
      return <RigidBody ref={spareBody} name={owner} type="kinematicPosition" colliders={false}
        position={ibdPhysicalCargoPose(game,exchanging,0,true).at} userData={movable}>
        <group userData={physical?undefined:stagingPreview}>
          {contact&&physical&&<TrimeshCollider name={contact.id} args={[contact.vertices,contact.indices]}/>}
          <mesh geometry={resources.fresh[exchanging]} material={material} castShadow receiveShadow
            userData={contact?(physical?contactSource(contact.id):stagingPreview):cartonContents}/>
          {!contact&&<>{crate(owner,'Shell',resources.goods['parts-b'],undefined,physical)}
            <group position={IBD_CRATE_LID_PIVOT}>{crate(owner,'Lid',fixed.lid,undefined,physical)}</group></>}
        </group>
      </RigidBody>;
    })()}
    {resources.returned.map(r => <RigidBody key={r.slot} type="fixed" colliders={false} userData={{ solid: true, assetId: 'ibd-quarantine' }}
      position={r.slot.startsWith('coil') ? [-17, 2.35, 12] : [14, 1.1, -16.3]} rotation={[0, Math.PI, 0]}>
      {r.contact&&<TrimeshCollider name={r.contact.id} args={[r.contact.vertices,r.contact.indices]}/>}
      <mesh geometry={r.geometry} material={material} castShadow receiveShadow userData={r.contact?contactSource(r.contact.id):cartonContents}/>
      {!r.contact&&crate(`ibd-quarantine-${r.slot}`,'Shell',resources.goods['parts-b'])}
    </RigidBody>)}
  </group>;
}
