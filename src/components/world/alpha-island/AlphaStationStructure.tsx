import { useMemo } from 'react';
import { RigidBody, RoundCuboidCollider } from '@react-three/rapier';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual';
import { alphaMaterial } from './alpha-materials';
import { createAlphaLodge, createAlphaRack } from './alpha-station-structures';
import { ALPHA_STATIONS } from './alpha-layout';
import type { Vec3 } from '../types';

const stations = {
  lodge: { name: 'alpha-dock-lodge', position: ALPHA_STATIONS.lodge, build: createAlphaLodge },
  rack: { name: 'alpha-lantern-rack', position: [-8,83,42] as Vec3, build: createAlphaRack },
};

export default function AlphaStationStructure({ station }: { station: keyof typeof stations }) {
  const { name, position, build } = stations[station];
  const visual = useMemo(() => {
    const parts = build().map(part => ({ ...part, material: alphaMaterial(part.finish) }));
    const pieces = parts.flatMap(part => part.sources);
    return { parts, floors: pieces.filter(p => p.role === 'floor'), walls: pieces.filter(p => p.role === 'enclosure'),
      dispose() { for (const p of parts) { p.geometry.dispose(); p.material.dispose(); } } };
  }, [build]);
  useOwnedWorldVisual(visual);
  return <group name={name} position={position} dispose={null}>
    {visual.parts.map(p => <mesh key={p.finish} name={name + '/' + p.finish} geometry={p.geometry} material={p.material}
      userData={{ sources: p.sources, surfaceSpace: name }} castShadow receiveShadow/>)}
    {[visual.floors, visual.walls].filter(pieces => pieces.length > 0).map(pieces => {
      const role = pieces[0].role;
      return <RigidBody key={role} type="fixed" colliders={false}
        userData={{ surface: role === 'floor', solid: role === 'enclosure', assetId: name }}>
        {pieces.map(p => <RoundCuboidCollider key={p.id} name={p.id} args={p.args!} position={p.position} quaternion={p.quaternion}/>)}
      </RigidBody>;
    })}
  </group>;
}
