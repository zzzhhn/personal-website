import { useRef } from 'react';
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import type { MeshStandardMaterial } from 'three';
import type { Vec3 } from './types';
import { LAYOUT_V4, OBSTACLES_V4 } from './layout-v4-flag.ts';
const BODY_DATA = { obstacle: true };
/** v4 moves only the (10, 20) roadblock, which falls inside the new SDIC footprint. */
const LOCATIONS: Vec3[] = LAYOUT_V4 ? OBSTACLES_V4 : [[-3, 1.64, 28], [10, 1.64, 20], [24, 1.64, -18], [45, 1.64, -39]];

function Obstacle({ position }: { position: Vec3 }) {
  const body = useRef<RapierRigidBody>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const elapsed = useRef(0);
  useBeforePhysicsStep(world => {
    if (!body.current) return;
    const p = body.current.translation(), q = body.current.rotation();
    if (elapsed.current === 0 && (Math.hypot(p.x - position[0], p.z - position[2]) > .4 || Math.abs(q.x) + Math.abs(q.z) > .2)) elapsed.current = world.timestep;
    if (elapsed.current > 0) elapsed.current += world.timestep;
    if (material.current) material.current.opacity = elapsed.current > 29.5 ? Math.max(0, (30 - elapsed.current) * 2) : 1;
    if (elapsed.current >= 30) {
      body.current.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      body.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      elapsed.current = 0;
      if (material.current) material.current.opacity = 1;
    }
  });
  return <RigidBody name="greybox-roadblock" ref={body} position={position} colliders={false} ccd userData={BODY_DATA}>
    <CuboidCollider args={[.65, .5, .35]} mass={28} restitution={.2} friction={.8} />
    <mesh castShadow><boxGeometry args={[1.3, 1, .7]} /><meshStandardMaterial ref={material} color="#E8803A" roughness={1} transparent /></mesh>
  </RigidBody>;
}
export default function WorldObstacles() { return <>{LOCATIONS.map((position, i) => <Obstacle key={i} position={position} />)}</>; }
