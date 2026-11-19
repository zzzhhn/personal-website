import { useEffect, useMemo } from 'react';
import { RigidBody, RoundCuboidCollider } from '@react-three/rapier';
import { alphaMaterial } from './alpha-materials';
import { AlphaSign } from './AlphaScenery';
import { alphaMainlandPierStructure } from './alpha-mainland-pier';
export { alphaPierDecks, alphaMainlandPierStructure } from './alpha-mainland-pier';

export default function AlphaMainlandPier() {
  const { parts, pieces } = useMemo(alphaMainlandPierStructure, []);
  const materials = useMemo(() => new Map(parts.map(p => [p.finish, alphaMaterial(p.finish, undefined, true)])), [parts]);
  useEffect(() => () => {
    parts.forEach(p => p.geometry.dispose());
    materials.forEach(m => m.dispose());
  }, [parts, materials]);
  return <group name="alpha-mainland-pier-r4-candidate">
    {parts.map(p => <mesh key={p.finish} geometry={p.geometry} material={materials.get(p.finish)} castShadow receiveShadow
      userData={{ worldCollision:'solid', surfaceSpace:'world', worldCollisionSources:p.sources }}/>)}
    {(['floor','enclosure'] as const).map(role => <RigidBody key={role} type="fixed" colliders={false}
      userData={{ surface:role==='floor', solid:role==='enclosure', assetId:'mainland-pier' }}>
      {pieces.filter(p=>p.role===role).map(p => <RoundCuboidCollider key={p.id} name={p.id}
        position={p.position} quaternion={p.quaternion} args={p.args}/>)}
    </RigidBody>)}
    <AlphaSign position={[-7,1,69]} text="山岛渡口 · Mountain ferry"/>
  </group>;
}
