import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useFactoryStore } from './factory-store';
import { buildFactoryCompanion } from './factory-companion';

/** One completed companion stays parked beside dispatch when a new batch starts.
 * Older records stay in the archive without spawning more actors or frame loops. */
export default function WorldFactoryArchive(){
  const configuration=useFactoryStore(s=>s.game.archives.at(-1)?.configuration?.kind??null);
  const model=useMemo(()=>configuration?buildFactoryCompanion({configuration,shell:true}):null,[configuration]);
  useEffect(()=>()=>model?.dispose(),[model]);
  if(!model)return null;
  return <group name="factory-completed-companion" position={[33,0,24]}>
    <primitive object={model.group} position={[0,.24,0]} dispose={null}/>
    <mesh position={[0,.18,0]} receiveShadow>
      <boxGeometry args={[1.5,.12,1.5]}/><meshStandardMaterial color="#416B6A" roughness={.65} metalness={.2}/>
    </mesh>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider position={[0,.7,0]} args={[.55,.58,.55]}/>
      <CuboidCollider position={[0,.18,0]} args={[.75,.06,.75]}/>
    </RigidBody>
  </group>;
}
