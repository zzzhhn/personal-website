import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh,MeshStandardMaterial } from 'three';
import { buildIbdCraneLever } from './ibd-craft-geometry';
import { CRANE_PIVOTS,craneControl } from './ibd-crane-control';

export default function WorldIbdCraneLevers({material}:{material:MeshStandardMaterial}){
  const geometry=useMemo(buildIbdCraneLever,[]),left=useRef<Mesh>(null),right=useRef<Mesh>(null);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(()=>{
    if(left.current&&left.current.rotation.x!==craneControl.leftAngle)left.current.rotation.x=craneControl.leftAngle;
    if(right.current&&right.current.rotation.z!==craneControl.rightAngle)right.current.rotation.z=craneControl.rightAngle;
  });
  return <group name="ibd-crane-levers">
    <mesh ref={left} geometry={geometry} material={material} position={CRANE_PIVOTS[0]} castShadow/>
    <mesh ref={right} geometry={geometry} material={material} position={CRANE_PIVOTS[1]} castShadow/>
  </group>;
}
