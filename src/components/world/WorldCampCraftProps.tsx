import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Group, Matrix4 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAMP_CENTER } from './layout';
import { CAMP_CRAFT_ASSET, campCraftLegacy, createCampCraftVisual, type CampCraftFamily } from './camp-craft-visual';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';

function CraftAsset({ family, matrices }: { family: CampCraftFamily; matrices: Matrix4[] }) {
  // One URL for all families retains shared image/geometry identities.
  const gltf = useLoader(GLTFLoader, CAMP_CRAFT_ASSET);
  const environment = useDjcFurnitureEnvironment();
  const visual = useMemo(() => createCampCraftVisual(gltf.scene, family, matrices, environment), [gltf, family, matrices, environment]);
  const lifetime = useMemo(() => ({ users: 0 }), [visual]);
  useEffect(() => {
    lifetime.users++;
    return () => { lifetime.users--; queueMicrotask(() => { if (!lifetime.users) visual.dispose(); }); };
  }, [visual, lifetime]);
  useFrame(() => visual.setNight(night.value));
  return <primitive object={visual.root} dispose={null} />;
}
class CraftBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[camp-craft] keeping original camp prop after asset error', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Art can stream, fail or switch for QA while original physics stays mounted. */
export default function WorldCampCraftProps({ family, matrices, fallback }: { family: CampCraftFamily; matrices: Matrix4[]; fallback: ReactNode }) {
  const camera = useThree(s => s.camera), group = useRef<Group>(null);
  const distance = () => Math.hypot(camera.position.x - CAMP_CENTER[0], camera.position.z - CAMP_CENTER[2]);
  const [active, setActive] = useState(() => distance() < 95), activated = useRef(active);
  const legacy = useMemo(() => typeof window !== 'undefined' && campCraftLegacy(window.location.search), []);
  useFrame(() => {
    const d = distance();
    if (!legacy && !activated.current && d < 95) { activated.current = true; setActive(true); }
    if (group.current) group.current.visible = d < 180;
  });
  return <group ref={group} name={`camp-craft-stream-${family}`} dispose={null}>
    {legacy || !active ? fallback : <CraftBoundary fallback={fallback}><Suspense fallback={fallback}><CraftAsset family={family} matrices={matrices} /></Suspense></CraftBoundary>}
  </group>;
}
