import { useEffect, useMemo } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { ALPHA_MINE_CONNECTOR } from './alpha-mine-layout';
import { mineFoundationSurface } from './alpha-mine-foundation';
import { terrainHeight } from './WorldLandform';
import { ParkGeo, mergeBatch, parkMaterial } from './WorldParkKit';
import { mineFoundationVisibleSurface, useMineFloorCoverage } from './mine-floor-coverage';
import { useIsClaimed } from './WorldVisualClaims';

/** Continuous low quarry earth and its graded island boundary, plus the approach markers. */
export default function WorldAlphaMineFoundation() {
  const apron=useMemo(()=>mineFoundationSurface(terrainHeight),[]);
  const coverage=useMineFloorCoverage(),claimed=useIsClaimed('alpha-mine-floor');
  const visible=useMemo(()=>mineFoundationVisibleSurface(apron,claimed?coverage:[]),[apron,coverage,claimed]);
  const geometry = useMemo(() => {
    const parts = new ParkGeo();
    parts.raw(Array.from(visible.vertices),'#8B7758');
    for (let i = 1; i < ALPHA_MINE_CONNECTOR.length; i++) {
      const a = ALPHA_MINE_CONNECTOR[i-1], b = ALPHA_MINE_CONNECTOR[i];
      const dx=b[0]-a[0], dz=b[2]-a[2], length=Math.hypot(dx,dz);
      for (let j=1;j<length/4;j++) for(const side of [-1,1]) {
        const t=j*4/length, x=a[0]+dx*t+dz/length*2.4*side, z=a[2]+dz*t-dx/length*2.4*side;
        parts.box([x,1.26,z],[.1,.5,.1],'#766043');
        parts.box([x,1.5,z],[.14,.09,.14],'#c6ad71');
      }
    }
    return mergeBatch(parts.pieces);
  },[visible]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <><mesh name="brain-quarry-approach" geometry={geometry} material={parkMaterial()} userData={{surface:true}} castShadow receiveShadow/>
    <RigidBody type="fixed" colliders={false} userData={{surface:true,assetId:'alpha-mine-entrance'}}>
      <TrimeshCollider args={[apron.vertices,apron.indices]} friction={.9} restitution={0}/>
    </RigidBody></>;
}
