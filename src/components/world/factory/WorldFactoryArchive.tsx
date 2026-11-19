import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier';
import { useFactoryStore } from './factory-store';
import { buildFactoryCompanion } from './factory-companion';
import { factoryMovingMeshContact } from './factory-live-contact';

/** One completed companion stays parked beside dispatch when a new batch starts.
 * Older records stay in the archive without spawning more actors or frame loops. */
export default function WorldFactoryArchive(){
  const configuration=useFactoryStore(s=>s.game.archives.at(-1)?.configuration?.kind??null);
  const data=useMemo(()=>{
    if(!configuration)return null;
    const model=buildFactoryCompanion({configuration,shell:true});
    const contact=factoryMovingMeshContact(model.group,'factory-archive-body-contact');
    for(const mesh of contact.meshes){
      mesh.userData={...mesh.userData,worldCollision:'solid',surfaceId:contact.id,worldCollisionSharedSurface:true};
    }
    return {model,contact};
  },[configuration]);
  useEffect(()=>()=>data?.model.dispose(),[data]);
  if(!data)return null;
  const {model,contact}=data;
  return <group name="factory-completed-companion" position={[33,0,24]}>
    <primitive object={model.group} position={[0,.24,0]} dispose={null}/>
    <mesh name="factory-archive-plinth" position={[0,.18,0]} receiveShadow
      userData={{worldCollision:'solid',surfaceId:'factory-archive-plinth-contact'}}>
      <boxGeometry args={[1.5,.12,1.5]}/><meshStandardMaterial color="#416B6A" roughness={.65} metalness={.2}/>
    </mesh>
    <RigidBody type="fixed" colliders={false} name="factory-archive-fixed" userData={{solid:true}}>
      <TrimeshCollider name={contact.id} position={[0,.24,0]} args={contact.args} friction={.85}/>
      <CuboidCollider name="factory-archive-plinth-contact" position={[0,.18,0]} args={[.75,.06,.75]}/>
    </RigidBody>
  </group>;
}
