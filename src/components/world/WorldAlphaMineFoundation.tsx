import { useEffect, useMemo } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALPHA_MINE_CONNECTOR } from './alpha-mine-layout';
import { mineFoundationSurface } from './alpha-mine-foundation';
import { requireMeshHeight } from './WorldLandform';
import { ParkGeo, parkMaterial } from './WorldParkKit';
import { mineFoundationVisibleSurface, useMineFloorCoverage } from './mine-floor-coverage';
import { useIsClaimed } from './WorldVisualClaims';
import type { Vec3 } from './types';

const FLOOR = 'brain-quarry-exposed-earth';
type MarkerPart = {id:string; position:Vec3; size:Vec3; color:string};

export function mineApproachMarkers(supportHeight: (x:number,z:number)=>number) {
  const parts: MarkerPart[] = [];
  for (let segment = 1; segment < ALPHA_MINE_CONNECTOR.length; segment++) {
    const a = ALPHA_MINE_CONNECTOR[segment - 1], b = ALPHA_MINE_CONNECTOR[segment];
    const dx = b[0]-a[0], dz = b[2]-a[2], length = Math.hypot(dx,dz);
    for (let distance = 4; distance < length; distance += 4) for (const side of [-1,1]) {
      const x = a[0]+(dx*distance+dz*2.4*side)/length;
      const z = a[2]+(dz*distance-dx*2.4*side)/length;
      const ground = supportHeight(x,z);
      const id = `brain-quarry-marker-${segment}-${distance}-${side}`;
      // Drive the foot 3 cm into the real soil and retain the original exposed height.
      parts.push({id:id+'-post',position:[x,ground+.24,z],size:[.1,.54,.1],color:'#766043'},
        {id:id+'-cap',position:[x,ground+.5,z],size:[.14,.09,.14],color:'#c6ad71'});
    }
  }
  return parts;
}

const STAKES = 'brain-quarry-marker-sides';
export function mineMarkerGeometry(markers: MarkerPart[]) {
  const parts = new ParkGeo();
  const ranges = markers.map(marker=>{
    const firstVertex = parts.triangles*3;
    parts.box(marker.position,marker.size,marker.color);
    return {id:marker.id,firstVertex,vertexCount:parts.triangles*3-firstVertex,collision:'solid' as const,surfaceId:STAKES};
  });
  const geometry = parts.build();
  const vertices = geometry.getAttribute('position').array as Float32Array;
  const indices = Uint32Array.from({length:vertices.length/3},(_,i)=>i);
  return {geometry,ranges,vertices,indices};
}

export function mineApproachBatch(floor: ReturnType<typeof mineFoundationVisibleSurface>, markers: ReturnType<typeof mineMarkerGeometry>) {
  const parts = new ParkGeo();
  parts.raw(Array.from(floor.vertices),'#8B7758');
  const earth = parts.build(), count = earth.getAttribute('position').count;
  const geometry = mergeGeometries([earth,markers.geometry]);
  earth.dispose();
  if (!geometry) throw new Error('Quarry approach floor and marker geometry cannot be combined');
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const sources = [{id:FLOOR,firstVertex:0,vertexCount:count,collision:'solid' as const},
    ...markers.ranges.map(range=>({...range,firstVertex:range.firstVertex+count}))];
  return {geometry,sources};
}

export default function WorldAlphaMineFoundation() {
  const apron = useMemo(()=>mineFoundationSurface(requireMeshHeight),[]);
  const markers = useMemo(()=>mineMarkerGeometry(mineApproachMarkers(requireMeshHeight)),[]);
  const coverage = useMineFloorCoverage(), claimed = useIsClaimed('alpha-mine-floor');
  const visible = useMemo(()=>mineFoundationVisibleSurface(apron,claimed?coverage:[]),[apron,coverage,claimed]);
  const batch = useMemo(()=>mineApproachBatch(visible,markers),[visible,markers]);
  useEffect(()=>()=>batch.geometry.dispose(),[batch]);
  useEffect(()=>()=>markers.geometry.dispose(),[markers]);
  return <group name="brain-quarry-approach-contact">
    <mesh name="brain-quarry-approach" geometry={batch.geometry} material={parkMaterial()}
      userData={{surface:true,worldCollisionSources:batch.sources}} castShadow receiveShadow/>
    <RigidBody type="fixed" colliders={false} userData={{surface:true,assetId:'alpha-mine-entrance'}}>
      <TrimeshCollider name={FLOOR} args={[visible.vertices,visible.indices]} friction={.9} restitution={0}/>
    </RigidBody>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'alpha-mine-approach-markers'}}>
      <TrimeshCollider name={STAKES} args={[markers.vertices,markers.indices]} friction={.65} restitution={0}/>
    </RigidBody>
  </group>;
}
