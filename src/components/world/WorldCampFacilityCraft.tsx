import { Component, Suspense, useContext, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { FrontSide, type Mesh, type MeshStandardMaterial, type Material, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { CampSuitcaseContactContext } from './WorldCampSuitcaseContact';

export type CampFacilityFamily = 'C12' | 'C13' | 'C14' | 'C15' | 'C16';
export const CAMP_FACILITY_URL = '/assets/world/facility-craft/camp/camp-facilities-v1.glb';
export const campFacilityLegacy = (search: string) => new URLSearchParams(search).get('facilityCraft') === 'legacy';

/** Geometry and textures belong to useLoader. Each mounted articulated visual owns only its
 * material copies. This marker prevents Pushable's legacy vertex-colour adaptation from erasing
 * the exported rubber/wood/metal responses; the parent still owns physics and reset fading. */
export function createCampFacilityVisual(scene: Object3D, family: CampFacilityFamily, node: string | undefined, environment: Texture | null) {
    const familyRoot = scene.getObjectByName(family);
    const source = node ? familyRoot?.getObjectByName(node) : familyRoot;
    if (!source) throw new Error(`Camp facility pack missing ${family}/${node ?? ''}`);
    const root = source.clone(true), copies = new Map<Material, MeshStandardMaterial>();
    // A selected articulation is already positioned by the original Animated frame.
    if (node) { root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1); }
    root.name = `camp-facility-${family}-${node ?? 'whole'}`;
    root.traverse(object => {
      object.userData = { ...object.userData, facilityCraft: true };
      if (object.name === 'C12_strings') object.name = 'camp-content-C12-strings';
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const cloneMaterial = (original: Material) => {
        let material = copies.get(original);
        if (!material) {
          material = original.clone() as MeshStandardMaterial;
          // Only the pack's closed binding/inlay and brass fitting shells. Main surfaces,
          // glass and cookware retain their exported sidedness (topology checked in runtime.test).
          if (material.name === 'camp_craft_paper' || material.name === 'camp_craft_brass') material.side = FrontSide;
          material.envMap = environment; material.envMapIntensity = 1.5;
          material.userData = { ...material.userData, facilityCraft: true, restEmissive: material.emissiveIntensity };
          copies.set(original, material);
        }
        return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
      // Tiny strings and the transparent/emissive lantern inserts add no useful shadow shape.
      const nonCaster = object.name === 'camp-content-C12-strings' ||
        (Array.isArray(mesh.material) ? mesh.material.every(m => m.name === 'camp_craft_glass' || m.name === 'camp_craft_wick') :
          mesh.material.name === 'camp_craft_glass' || mesh.material.name === 'camp_craft_wick');
      mesh.castShadow = !nonCaster; mesh.receiveShadow = true;
      mesh.userData = { ...mesh.userData, assetId: family, facilityCraft: true };
    });
    return { root, materials: [...copies.values()], users: 0, nightAmount: NaN };
}

export function updateCampFacilityNight(visual: { materials: MeshStandardMaterial[]; nightAmount: number }, value: number) {
  const amount = Math.max(0, Math.min(1, value));
  if (visual.nightAmount === amount) return;
  visual.nightAmount = amount;
  for (const material of visual.materials) {
    material.envMapIntensity = 1.5 - amount;
    if (material.name === 'camp_craft_wick') material.emissiveIntensity = 0.12 + amount * 2.1;
  }
}

function CraftVisual({ family, node }: { family: CampFacilityFamily; node?: string }) {
  const gltf = useLoader(GLTFLoader, CAMP_FACILITY_URL);
  const environment = useDjcFurnitureEnvironment();
  const visual = useMemo(() => createCampFacilityVisual(gltf.scene, family, node, environment), [gltf, family, node, environment]);
  const registerContact = useContext(CampSuitcaseContactContext);
  useLayoutEffect(() => family === 'C15' ? registerContact?.(visual.root) : undefined, [family, registerContact, visual]);
  useEffect(() => {
    visual.users++;
    return () => { visual.users--; queueMicrotask(() => { if (!visual.users) visual.materials.forEach(material => material.dispose()); }); };
  }, [visual]);
  useFrame(() => updateCampFacilityNight(visual, night.value));
  return <primitive object={visual.root} dispose={null} />;
}
class CraftBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[camp-facility] keeping original prop', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Original GLBs always supply the collider and articulation frame. Missing candidate art falls
 * back locally. facilityCraft=legacy reproduces the batch-4 visual without loading this pack. */
export default function WorldCampFacilityCraft({ family, node, fallback }: { family: CampFacilityFamily; node?: string; fallback: ReactNode }) {
  const legacy = useMemo(() => typeof window !== 'undefined' && campFacilityLegacy(window.location.search), []);
  return legacy ? fallback : <CraftBoundary fallback={fallback}><Suspense fallback={fallback}><CraftVisual family={family} node={node} /></Suspense></CraftBoundary>;
}
