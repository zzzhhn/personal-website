import { memo, type RefObject } from 'react';
import type { Group } from 'three';
import type { VehicleId } from './types';

/**
 * Vehicle visuals (owner: vehicles session). Rendered inside the vehicle rigid body, in body space:
 * +X forward, +Y up, origin at the chassis collider centre. Physics, colliders and the raycast
 * suspension stay in WorldActors; this component only draws. `wheels` receives one group per wheel
 * (front-right, front-left, rear-right, rear-left as wheelGeometry().points); WorldActors positions
 * each group at the suspended wheel centre and steers it about +Y every frame, and rotates the
 * group's first child about local Z for rolling, so the wheel mesh must sit in that first child
 * with its axle along local Z. `lights` exposes brake / reverse state for tail lamps.
 *
 * This greybox version reproduces the previous box car exactly.
 */
export interface VehicleVisualProps {
  id: VehicleId;
  size: [number, number, number];
  color: string;
  wheelRadius: number;
  wheelPoints: [number, number, number][];
  wheelRest: number;
  wheels: RefObject<(Group | null)[]>;
  lights: RefObject<{ brake: boolean; reverse: boolean }>;
}

export default memo(function WorldVehicleVisual({ id, size: [length, height, width], color, wheelRadius, wheelPoints, wheelRest, wheels }: VehicleVisualProps) {
  return <>
    <mesh castShadow receiveShadow><boxGeometry args={[length, height * .58, width]} /><meshStandardMaterial color={color} roughness={0.92} /></mesh>
    <mesh position={[-length * .08, height * .42, 0]} castShadow><boxGeometry args={[length * .5, height * .4, width * .86]} /><meshStandardMaterial color={id === 'offroad' ? '#E8803A' : '#4E647D'} roughness={0.96} /></mesh>
    <mesh position={[length / 2 + .015, 0, 0]}><boxGeometry args={[.05, .17, width * .7]} /><meshStandardMaterial color="#E6DCCB" /></mesh>
    <mesh position={[-length / 2 - .015, .05, 0]}><boxGeometry args={[.04, .12, width * .75]} /><meshStandardMaterial color="#63BEB3" emissive="#63BEB3" emissiveIntensity={0.4} /></mesh>
    {wheelPoints.map((point, i) => <group key={i} ref={node => { if (wheels.current) wheels.current[i] = node; }} position={[point[0], point[1] - wheelRest, point[2]]}>
      <group><mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[wheelRadius, wheelRadius, .3, 10]} /><meshStandardMaterial color="#33383C" roughness={1} /></mesh>
        <mesh position={[0, 0, i % 2 === 0 ? .17 : -.17]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[wheelRadius * .46, wheelRadius * .46, .025, 6]} /><meshStandardMaterial color="#E6DCCB" roughness={.9} /></mesh></group>
    </group>)}
  </>;
});
