import { memo, useEffect, useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { MeshStandardMaterial } from 'three';
import { useInteractable } from '../WorldInteract';
import { IBD_YARD } from './attraction-layout.ts';
import { IBD_STATIONS, ibdStation, ibdWorld, type IbdStationId } from './ibd-yard-layout.ts';
import { yardActions } from './ibd-yard-game.ts';
import { IBD_ACTION_LABEL } from './ibd-yard-copy.ts';
import { cancelIbdAction, dispatchIbdAction, ibdActor, useIbdYardStore } from './ibd-yard-store.ts';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import WorldIbdMechanisms from './WorldIbdMechanisms';
import WorldIbdSigns from './WorldIbdSigns';

function Station({ id, active }: { id: IbdStationId; active: boolean }) {
  const game = useIbdYardStore(s => s.game), station = ibdStation(id, game.core.moved);
  const action = yardActions(game, id)[0];
  useInteractable(active && action ? {
    id: `ibd-${id}`, kind: 'exhibit', position: ibdWorld(station.at), radius: station.radius,
    label: IBD_ACTION_LABEL[action.kind],
    enabled: () => { const a = ibdActor(); return a.active && !a.paused && !a.hidden && !a.driving && !useIbdYardStore.getState().game.pending; },
    onInteract: () => dispatchIbdAction(action),
  } : null);
  return null;
}

/** Mount inside the existing Canvas/Physics. Origin and ground contract come only from IBD_YARD. */
export default memo(function WorldIbdYard({ active = true }: { active?: boolean }) {
  const data = useMemo(() => ({ ...buildIbdStatic(), material: new MeshStandardMaterial({ vertexColors: true, roughness: .76, metalness: .18 }) }), []);
  useEffect(() => { useIbdYardStore.setState({ active }); return () => { useIbdYardStore.setState({ active: false }); }; }, [active]);
  useEffect(() => () => { cancelIbdAction(); data.geometry.dispose(); data.material.dispose(); }, [data]);
  return <group name="world-ibd-yard" position={IBD_YARD.center} dispose={null} userData={{noOcclusionFade:true}}>
    <mesh name="ibd-three-sheds-static" geometry={data.geometry} material={data.material} castShadow receiveShadow
      userData={{ solid: true, assetId: 'ibd-yard-architecture' }} />
    <RigidBody type="fixed" colliders={false} name="ibd-yard-architecture" userData={{ solid: true, assetId: 'ibd-yard-architecture' }}>
      {data.solids.map((s, i) => <CuboidCollider key={i} position={s.at} rotation={s.rotation} friction={.85}
        args={[s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]} />)}
    </RigidBody>
    <WorldIbdMechanisms material={data.material} active={active} />
    {active && <WorldIbdSigns />}
    {IBD_STATIONS.map(s => <Station key={s.id} id={s.id} active={active} />)}
  </group>;
});
