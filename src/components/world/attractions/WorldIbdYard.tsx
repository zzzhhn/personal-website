import { memo, useEffect, useMemo } from 'react';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useInteractable } from '../WorldInteract';
import { IBD_YARD } from './attraction-layout.ts';
import { IBD_STATIONS, ibdStation, ibdWorld, isIbdStockKey, isIbdPackStation, type IbdStationId } from './ibd-yard-layout.ts';
import { yardActions } from './ibd-yard-game.ts';
import { IBD_ACTION_LABEL } from './ibd-yard-copy.ts';
import { cancelIbdAction, dispatchIbdAction, ibdActor, useIbdYardStore } from './ibd-yard-store.ts';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import WorldIbdMechanisms from './WorldIbdMechanisms';
import WorldIbdSigns from './WorldIbdSigns';
import WorldIbdLighting from './WorldIbdLighting';
import { createIbdMaterial } from './ibd-yard-lighting.ts';
import { night } from '../WorldNight';
import WorldIbdGuide from './WorldIbdGuide';
import { ibdGuideStep } from './ibd-yard-guide.ts';
import WorldIbdAudio from './WorldIbdAudio';
import { openIbdPack, requestIbdPackContact, useIbdPackPlay, ibdPackWorkBusy, cancelIbdPack } from './ibd-pack-play';

function Station({ id, active }: { id: IbdStationId; active: boolean }) {
  const game = useIbdYardStore(s => s.game), station = ibdStation(id, game.core.moved);
  const guided = useIbdYardStore(s => s.guideEnabled), guide = ibdGuideStep(game), target = ibdStation(guide.action.station, game.core.moved);
  // E opens the judgement prompt without a verdict. Only an explicit HUD choice signs it.
  const stockChoice=game.stock.requested&&isIbdStockKey(id);
  const action = id==='stock-room'?undefined:guided && id === target.id ? guide.action
    : guided && id === 'manifest' && game.started ? undefined : yardActions(game, id)[0];
  useInteractable(active && action ? {
    id: `ibd-${id}`, kind: 'exhibit', position: ibdWorld(station.at), radius: station.radius,
    label: guided && id === target.id ? guide.title : IBD_ACTION_LABEL[action.kind],
    enabled: () => { const a = ibdActor(); return a.active && !a.paused && !a.hidden && !a.driving && !useIbdYardStore.getState().game.pending
      && !ibdPackWorkBusy() && (!guided || id === target.id || stockChoice); },
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
  const data = useMemo(() => {
    const uniform = { value: night.value };
    return { ...buildIbdStatic(), uniform, material: createIbdMaterial(true, uniform), movingMaterial: createIbdMaterial(false, uniform) };
  }, []);
  useEffect(() => { useIbdYardStore.setState({ active }); return () => { useIbdYardStore.setState({ active: false }); }; }, [active]);
  useEffect(() => () => { cancelIbdPack(true); cancelIbdAction(); data.geometry.dispose(); data.material.dispose(); data.movingMaterial.dispose(); }, [data]);
  return <group name="world-ibd-yard" position={IBD_YARD.center} dispose={null} userData={{noOcclusionFade:true}}>
    <WorldIbdAudio />
    <mesh name="ibd-three-sheds-static" geometry={data.geometry} material={data.material} castShadow receiveShadow
      userData={{ solid: true, assetId: 'ibd-yard-architecture' }} />
    <RigidBody type="fixed" colliders={false} name="ibd-yard-architecture" userData={{ solid: true, assetId: 'ibd-yard-architecture' }}>
      <TrimeshCollider args={[data.walkSurface.vertices, data.walkSurface.indices]} friction={.85} />
      {data.solids.map((s, i) => <CuboidCollider key={i} position={s.at} rotation={s.rotation} friction={.85}
        args={[s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]} />)}
    </RigidBody>
    <WorldIbdMechanisms material={data.movingMaterial} active={active} />
    <WorldIbdLighting active={active} uniform={data.uniform} />
    {active && <WorldIbdSigns />}
    {active && <WorldIbdGuide />}
    {IBD_STATIONS.map(s => <Station key={s.id} id={s.id} active={active} />)}
  </group>;
});
