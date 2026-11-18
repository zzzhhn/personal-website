import { useMemo } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual';
import { alphaMaterial } from './alpha-materials';
import { createAlphaPathFence } from './alpha-path-fence';

export default function AlphaPathFence() {
  const visual = useMemo(() => {
    const parts = createAlphaPathFence().parts.map(part => ({ ...part, material: alphaMaterial(part.finish) }));
    return { parts, dispose() {
      for (const p of parts) { p.geometry.dispose(); p.material.dispose(); }
    } };
  }, []);
  useOwnedWorldVisual(visual);
  return <RigidBody name="alpha-path-fence" type="fixed" colliders={false} userData={{ solid: true }}>
    {visual.parts.map(part => <group key={part.id} dispose={null}>
      <mesh name={part.id} geometry={part.geometry} material={part.material} castShadow receiveShadow
        userData={{ surfaceId: part.id, collision: part.collision, surfaceRole: part.role, collisionReason: part.reason }} />
      <TrimeshCollider name={part.id} args={[part.buffers.vertices, part.buffers.indices]} />
    </group>)}
  </RigidBody>;
}
