import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { ReactNode } from 'react';
import { Box3, Vector3 } from 'three';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { coasterWorld } from './coaster-track';
import { createCoasterStationCraft } from './coaster-station-craft-runtime';
import { coasterContactSources, coasterModelContact } from './coaster-model-contact';
import { coasterStationContact, COASTER_STATION_WALLS } from './coaster-station-contact';
import { COASTER_TREAD_COLLIDER } from './coaster-transition';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-station-craft-20261105/station.glb?url';

function StationAsset({ detailed, contactActive }: { detailed: boolean; contactActive: boolean }) {
  const { scene } = useGLTF(assetUrl);
  const pack = useMemo(() => createCoasterStationCraft(scene), [scene]);
  const sources = useMemo(() => {
    const near = coasterContactSources(pack.near, COASTER_STATION_WALLS, coasterStationContact);
    coasterContactSources(pack.far, COASTER_STATION_WALLS, coasterStationContact);
    return near;
  }, [pack]);
  const contact = useMemo(() => contactActive ? {
    stairs: coasterModelContact(pack.near, COASTER_TREAD_COLLIDER, 1, sources),
    building: coasterModelContact(pack.near, COASTER_STATION_WALLS, 1, sources),
  } : null, [sources, pack, contactActive]);
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
  return <>
    <primitive object={pack.root} dispose={null} />
    {contact && <>
      <RigidBody type="fixed" colliders={false} userData={{ surface: true, assetId: COASTER_TREAD_COLLIDER }}>
        <TrimeshCollider name={COASTER_TREAD_COLLIDER} args={[contact.stairs.vertices, contact.stairs.indices]} friction={.9} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: COASTER_STATION_WALLS }}>
        <TrimeshCollider name={COASTER_STATION_WALLS} args={[contact.building.vertices, contact.building.indices]} friction={.9} />
      </RigidBody>
    </>}
  </>;
}

/** Camera distance selects the visual tier. Contact stays on the near source
 * at walkable distances. Luminous surfaces and dynamic text keep their owners. */
export default function WorldCoasterStationCraft({ detailed = true, contactActive = false, fallback = null }: {
  detailed?: boolean; contactActive?: boolean; fallback?: ReactNode;
}) {
  return <group name="coaster-station-architecture-contact" position={coasterWorld([0, 0, 0])} dispose={null}>
    <Suspense fallback={fallback}><StationAsset detailed={detailed} contactActive={contactActive} /></Suspense>
  </group>;
}
