import { memo, useEffect, useMemo, useRef } from 'react';
import { registerIbdActivity } from './ibd-actor-activity';
import { RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import { useInteractable } from '../WorldInteract';
import { IBD_YARD } from './attraction-layout.ts';
import { IBD_STATIONS, ibdStation, ibdWorld, isIbdStockKey, isIbdPackStation, type IbdStationId } from './ibd-yard-layout.ts';
import { yardActions } from './ibd-yard-game.ts';
import { IBD_ACTION_LABEL } from './ibd-yard-copy.ts';
import { cancelIbdAction, dispatchIbdAction, ibdActor, useIbdYardStore } from './ibd-yard-store.ts';
import { applyCoilBayMaterial } from './ibd-coil-bay-material';
import { buildIbdStatic, IBD_STATIC_YARD_CONTACT_ROOT } from './ibd-yard-geometry.ts';
import { IBD_PARKED_TRUCK_ROOT } from './ibd-truck-geometry';
import { ibdCraftOptions } from './ibd-craft-options.ts';
import WorldIbdMechanisms from './WorldIbdMechanisms';
import WorldIbdSigns from './WorldIbdSigns';
import WorldIbdLighting from './WorldIbdLighting';
import { createIbdMaterial } from './ibd-yard-lighting.ts';
import { night } from '../WorldNight';
import { useFrame } from '@react-three/fiber';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import WorldIbdGuide from './WorldIbdGuide';
import { ibdGuideStep } from './ibd-yard-guide.ts';
import WorldIbdAudio from './WorldIbdAudio';
import WorldIbdStaticCraft, { IbdWorkstationColliders } from './WorldIbdStaticCraft';
import { canReachIbdWorkstation } from './ibd-workstation-reach';
import { openIbdPack, requestIbdPackContact, useIbdPackPlay, ibdPackWorkBusy, cancelIbdPack } from './ibd-pack-play';

function Station({ id, active }: { id: IbdStationId; active: boolean }) {
  const game = useIbdYardStore(s => s.game), station = ibdStation(id, game.core.moved);
  const guided = useIbdYardStore(s => s.guideEnabled), guide = ibdGuideStep(game), target = ibdStation(guide.action.station, game.core.moved);
  // E opens the judgement prompt without a verdict. Only an explicit HUD choice signs it.
  const stockChoice=game.stock.requested&&isIbdStockKey(id);
  const action = id==='stock-room'?undefined:guided && id === target.id ? guide.action
    : guided && id === 'manifest' && game.started ? undefined : yardActions(game, id)[0];
  const workstation = action?.kind==='contents' && isIbdPackStation(id) ? id
    : action?.kind==='crane' && id==='crane' ? id : null;
  useInteractable(active && action ? {
    id: `ibd-${id}`, kind: 'exhibit', position: ibdWorld(station.at), radius: station.radius,
    label: guided && id === target.id ? guide.title : IBD_ACTION_LABEL[action.kind],
    enabled: () => { const a = ibdActor(); return a.active && !a.paused && !a.hidden && !a.driving && !useIbdYardStore.getState().game.pending
      && !ibdPackWorkBusy() && (!guided || id === target.id || stockChoice)
      && (!workstation || canReachIbdWorkstation(workstation)); },
    onInteract: () => {
      if(action.kind==='contents'&&isIbdPackStation(action.station)){
        if(useIbdPackPlay.getState().pack===action.station)requestIbdPackContact();else openIbdPack(action.station);
      }else dispatchIbdAction(action);
    },
  } : null);
  return null;
}

/** Mount inside the existing Canvas/Physics. Origin and ground contract come only from IBD_YARD. */
export default memo(function WorldIbdYard({ active = true }: { active?: boolean }) {
  useEffect(() => registerIbdActivity(), []);
  const { rapier } = useRapier();
  const environment = useDjcFurnitureEnvironment();
  const previousNight = useRef(-1);
  const data = useMemo(() => {
    const uniform = { value: night.value };
    const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
    const craft = ibdCraftOptions(query), wood = craft.crateSample === 'grain';
    return { ...buildIbdStatic({ completeSiteContacts: true, ...craft }), uniform,
      material: createIbdMaterial(true, uniform),
      coilMaterial: craft.coilBaySample || craft.shedExpansion || wood ? applyCoilBayMaterial(createIbdMaterial(true, uniform), craft.shedExpansion, wood) : null,
      movingMaterial: createIbdMaterial(false, uniform) };
  }, []);
  // Borrow the renderer's one small PMREM target; never dispose a shared map.
  useEffect(() => {
    for (const material of [data.material, data.coilMaterial, data.movingMaterial]) if (material) {
      material.envMap = environment;
      material.envMapIntensity = .55 - .32 * night.value;
      material.needsUpdate = true;
    }
  }, [data, environment]);
  useFrame(() => {
    if (previousNight.current === night.value) return;
    previousNight.current = night.value;
    for (const material of [data.material, data.coilMaterial, data.movingMaterial])
      if (material) material.envMapIntensity = .55 - .32 * night.value;
  });
  useEffect(() => { useIbdYardStore.setState({ active }); return () => { useIbdYardStore.setState({ active: false }); }; }, [active]);
  useEffect(() => () => { cancelIbdPack(true); cancelIbdAction(); data.geometry.dispose(); data.craftShellGeometry?.dispose(); data.truckGeometry?.dispose(); data.material.dispose(); data.coilMaterial?.dispose(); data.movingMaterial.dispose(); }, [data]);
  return <group name="world-ibd-yard" position={IBD_YARD.center} dispose={null} userData={{noOcclusionFade:true}}>
    <WorldIbdAudio />
    <group name={IBD_STATIC_YARD_CONTACT_ROOT}>
      <mesh name="ibd-three-sheds-static" geometry={data.geometry} material={data.coilMaterial ?? data.material} castShadow receiveShadow
        userData={{ solid: true, assetId: 'ibd-yard-architecture', worldCollisionSources: data.collisionSources }} />
      <RigidBody type="fixed" colliders={false} name="ibd-yard-architecture" userData={{ solid: true, assetId: 'ibd-yard-architecture' }}>
        {data.contactSurfaces.map(s => <TrimeshCollider key={s.id} name={s.id}
          args={[s.vertices, s.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array, Uint32Array]} friction={.85} />)}
      </RigidBody>
    </group>
    <WorldIbdStaticCraft uniform={data.uniform} fallback={<>
      <mesh name="ibd-static-equipment-legacy" geometry={data.craftShellGeometry!} material={data.material} castShadow receiveShadow
        userData={{worldCollisionSources:data.workstationContacts.map(({ id,firstIndex,indexCount })=>({id,firstIndex,indexCount,collision:'solid'}))}} />
      <IbdWorkstationColliders contacts={data.workstationContacts}/>
    </>}/>
    <group name={IBD_PARKED_TRUCK_ROOT}>
      <mesh name="ibd-parked-truck-visible" geometry={data.truckGeometry!} material={data.coilMaterial ?? data.material} castShadow receiveShadow
        userData={{worldCollisionSources:data.truckContacts.map(({ id,firstIndex,indexCount })=>({id,firstIndex,indexCount,collision:'solid'}))}} />
      <RigidBody type="fixed" colliders={false} userData={{ solid:true,assetId:IBD_PARKED_TRUCK_ROOT }}>
        {data.truckContacts.map(({ id,vertices,indices }) => <TrimeshCollider key={id} name={id}
          args={[vertices,indices,rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array,Uint32Array]} friction={.85} />)}
      </RigidBody>
    </group>
    <WorldIbdMechanisms material={data.movingMaterial} active={active} />
    <WorldIbdLighting active={active} uniform={data.uniform} />
    {active && <WorldIbdSigns />}
    {active && <WorldIbdGuide toolsMaterial={data.movingMaterial} />}
    {IBD_STATIONS.map(s => <Station key={s.id} id={s.id} active={active} />)}
  </group>;
});
