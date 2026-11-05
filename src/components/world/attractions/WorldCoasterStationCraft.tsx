import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { coasterWorld } from './coaster-track';
import { createCoasterStationCraft } from './coaster-station-craft-runtime';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-station-craft-20261105/station.glb?url';

function StationAsset({ detailed }: { detailed: boolean }) {
  const { scene } = useGLTF(assetUrl);
  const pack = useMemo(() => createCoasterStationCraft(scene), [scene]);
  const bounds = useMemo(() => new Box3().setFromObject(pack.near)
    .translate(new Vector3(...coasterWorld([0, 0, 0]))), [pack]);
  const near = useRef(detailed);
  const environment = useDjcFurnitureEnvironment(), lastNight = useRef(NaN);
  useLayoutEffect(() => {
    if (!detailed) { near.current = false; pack.setDetailed(false); }
  }, [pack, detailed]);
  useLayoutEffect(() => {
    for (const material of pack.materials) {
      material.envMap = environment;
      material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      material.needsUpdate = true;
    }
    lastNight.current = night.value;
  }, [pack, environment]);
  useEffect(() => pack.retain(), [pack]);
  useFrame(({ camera }) => {
    // Distance to the actual building envelope, not the whole park bounds.
    // Hysteresis prevents cycling at the threshold; no timer/React update.
    const useNear = detailed && bounds.distanceToPoint(camera.position) < (near.current ? 36 : 30);
    if (useNear !== near.current) { near.current = useNear; pack.setDetailed(useNear); }
    if (lastNight.current === night.value) return;
    lastNight.current = night.value;
    for (const material of pack.materials) material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
  });
  return <primitive object={pack.root} dispose={null} />;
}

/** Park detail caps the visual tier; camera distance chooses within that cap.
 * Keep physics and all existing
 * luminous surfaces/dynamic text in their original consumers.
 */
export default function WorldCoasterStationCraft({ detailed = true }: { detailed?: boolean }) {
  return <group position={coasterWorld([0, 0, 0])} dispose={null}>
    <Suspense fallback={null}><StationAsset detailed={detailed} /></Suspense>
  </group>;
}
