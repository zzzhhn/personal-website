import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { ALPHA_MINE_CONNECTOR, ALPHA_MINE_CONNECTOR_WIDTH, ALPHA_MINE_FOOTPRINT } from './alpha-mine-layout';
import { ParkGeo, mergeBatch, parkMaterial, plankDeck } from './WorldParkKit';
import WorldSurfaceColliders from './WorldSurfaceColliders';
import { craftMaterial } from './WorldCraftMaterials';
import type { Vec3 } from './types';

/** Independent foundation: the main island and the bridge water channel stay untouched. */
export default function WorldAlphaMineFoundation() {
  const built = useMemo(() => {
    const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = ALPHA_MINE_FOOTPRINT;
    const ring = [[x0,z0],[x1,z0],[x1,z1],[x0,z1]], vertices: number[] = [], indices: number[] = [];
    for (const y of [-4, -.45, 1]) for (let side = 0; side < 4; side++) {
      const a = ring[side], b = ring[(side + 1) % 4];
      for (let j = 0; j < 12; j++) {
        const t = j / 12, inset = y < 0 ? .3 * Math.sin((side * 12 + j) * 1.7) : 0;
        vertices.push(a[0] + (b[0] - a[0]) * t + inset, y, a[1] + (b[1] - a[1]) * t + inset);
      }
    }
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 48; i++) {
      const a = layer * 48 + i, b = layer * 48 + (i + 1) % 48, c = a + 48, d = b + 48;
      indices.push(a,c,b,b,c,d);
    }
    const rock = new BufferGeometry(); rock.setAttribute('position', new Float32BufferAttribute(vertices, 3)); rock.setIndex(indices); rock.computeVertexNormals();
    const source = new MeshStandardMaterial({ color: '#746c5e', roughness: .96 });
    const material = craftMaterial(source, 'stone'); source.dispose();
    const deck = new ParkGeo(), rails = new ParkGeo();
    const surfaces: { position: Vec3; size: Vec3; rotation?: Vec3 }[] = [{ position: [60,.85,-73], size: [34,.3,38] }];
    for (let i = 1; i < ALPHA_MINE_CONNECTOR.length; i++) {
      const a = ALPHA_MINE_CONNECTOR[i - 1], b = ALPHA_MINE_CONNECTOR[i], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx,dz), yaw = Math.atan2(dx,dz);
      plankDeck(deck, a, b, ALPHA_MINE_CONNECTOR_WIDTH, 401 + i);
      surfaces.push({ position: [(a[0]+b[0])/2,.99,(a[2]+b[2])/2], size: [3,.3,length+.1], rotation: [0,yaw,0] });
      for (const side of [-1,1]) {
        const ox = dz / length * 1.45 * side, oz = -dx / length * 1.45 * side;
        for (let j = 0; j <= Math.ceil(length/2); j++) {
          const t = j / Math.ceil(length/2), x = a[0]+dx*t+ox, z = a[2]+dz*t+oz;
          rails.box([x,1.63,z],[.12,1,.12],'#735438');
          if (j % 2 === 0) rails.box([x,-.6,z],[.18,3.4,.18],'#554333');
        }
        rails.box([(a[0]+b[0])/2+ox,2.09,(a[2]+b[2])/2+oz],[.1,.12,length],'#9b784d',{yaw});
        surfaces.push({ position:[(a[0]+b[0])/2+ox,1.63,(a[2]+b[2])/2+oz],size:[.12,1,length],rotation:[0,yaw,0] });
      }
    }
    return { rock, material, deck: mergeBatch(deck.pieces), rails: mergeBatch(rails.pieces), surfaces, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  }, []);
  useEffect(() => () => { built.rock.dispose(); built.material.dispose(); built.deck.dispose(); built.rails.dispose(); }, [built]);
  return <group name="alpha-mine-foundation">
    <mesh geometry={built.rock} material={built.material} receiveShadow castShadow userData={{ solid: true, assetId: 'alpha-mine-base' }} />
    <mesh position={[60,.94,-73]} material={built.material} receiveShadow userData={{ surface: true }}><boxGeometry args={[34,.12,38]} /></mesh>
    <mesh geometry={built.deck} material={parkMaterial()} receiveShadow userData={{ surface: true, assetId: 'alpha-mine-connector' }} />
    <mesh geometry={built.rails} material={parkMaterial()} castShadow receiveShadow userData={{ solid: true }} />
    <WorldSurfaceColliders name="alpha-mine-foundation" items={built.surfaces} />
    <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: 'alpha-mine-base' }}>
      <TrimeshCollider args={[built.vertices,built.indices]} />
    </RigidBody>
  </group>;
}
