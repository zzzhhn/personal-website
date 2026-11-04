import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Mesh, type MeshStandardMaterial } from 'three';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-car-astra-pilot-20261104/coaster-car.glb?url';

/** Isolated visual pilot: review config mounts it, production stays unchanged.
 * Borrow loader geometry/textures and the renderer's existing environment.
 * Each instance owns only its cloned materials and releases exactly those.
 */
export default function WorldCoasterCarPilot() {
  const { scene } = useGLTF(assetUrl);
  const environment = useDjcFurnitureEnvironment();
  const parts = useMemo(() => {
    const result: { mesh: Mesh; material: MeshStandardMaterial }[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const material = (object.material as MeshStandardMaterial).clone();
      result.push({ mesh: object, material });
    });
    return result;
  }, [scene]);
  const previousNight = useRef(NaN);
  useEffect(() => {
    for (const { material } of parts) { material.envMap = environment; material.needsUpdate = true; }
  }, [parts, environment]);
  useEffect(() => () => { for (const { material } of parts) material.dispose(); }, [parts]);
  useFrame(() => {
    if (previousNight.current === night.value) return;
    previousNight.current = night.value;
    // Match the accepted furniture adapter's .5 night environment floor.
    // The station's existing local lights still supply directional illumination.
    for (const { material } of parts) material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
  });
  return <group name="coaster-car-astra-pilot" dispose={null}>
    {parts.map(({ mesh, material }) => <mesh key={mesh.uuid} name={mesh.name}
      matrix={mesh.matrixWorld} matrixAutoUpdate={false} geometry={mesh.geometry}
      material={material} castShadow receiveShadow />)}
  </group>;
}
