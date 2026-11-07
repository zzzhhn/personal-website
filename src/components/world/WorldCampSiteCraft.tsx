import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Group, InstancedMesh, Matrix4, type Mesh, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { placementMatrix } from './WorldCampContentAssets';
import { PAD_TOP } from './WorldCampContentLayout';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { applyCampSurfaceBalance } from './camp-surface-balance';
import type { Vec3 } from './types';

export const CAMP_SITE_CRAFT_URL = '/assets/world/camp-site-craft/camp-site-v1.glb';
export const campSiteLegacy = (search: string) => new URLSearchParams(search).get('campSiteCraft') === 'legacy';

type Family = 'C02' | 'L01';
type VisualProps = { family: Family; matrices: readonly Matrix4[] };

function SiteVisual({ family, matrices }: VisualProps) {
  const { scene } = useLoader(GLTFLoader, CAMP_SITE_CRAFT_URL);
  const environment = useDjcFurnitureEnvironment();
  const visual = useMemo(() => {
    const source = scene.getObjectByName(family);
    if (!source) throw new Error(`Camp site pack missing ${family}`);
    scene.updateMatrixWorld(true);
    const root = new Group(), meshes: InstancedMesh[] = [], materials: MeshStandardMaterial[] = [];
    const frame = new Matrix4();
    root.name = family === 'C02' ? 'camp-C02-flagstones' : 'camp-L01-exit-posts';
    let lens: MeshStandardMaterial | undefined;
    source.traverse(object => {
      const part = object as Mesh;
      if (!part.isMesh) return;
      if (Array.isArray(part.material)) throw new Error(`Unbatched camp site material: ${part.name}`);
      const material = part.material.clone() as MeshStandardMaterial;
      material.envMap = environment;
      applyCampSurfaceBalance(material, night);
      const isLens = material.name === 'camp_exit_diffuser';
      if (isLens) lens = material;
      const mesh = new InstancedMesh(part.geometry, material, matrices.length);
      mesh.name = part.name;
      mesh.receiveShadow = !isLens;
      mesh.castShadow = family === 'L01' && !isLens;
      mesh.userData = { assetId: family, noOcclusionFade: isLens || family === 'C02', solid: mesh.castShadow };
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, frame.multiplyMatrices(matrix, part.matrixWorld)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
      meshes.push(mesh);
      materials.push(material);
    });
    if (!meshes.length || (family === 'L01' && !lens)) throw new Error(`Incomplete camp site family: ${family}`);
    return { root, meshes, materials, lens, users: 0, nightAmount: NaN };
  }, [environment, family, matrices, scene]);

  useEffect(() => {
    // The shared loader owns the GLB geometries/maps and the renderer cache owns PMREM.
    visual.users++;
    return () => {
      visual.users--;
      queueMicrotask(() => {
        if (visual.users) return;
        visual.meshes.forEach(mesh => mesh.dispose());
        visual.materials.forEach(material => material.dispose());
      });
    };
  }, [visual]);

  useFrame(() => {
    const amount = night.value;
    if (visual.nightAmount === amount) return;
    visual.nightAmount = amount;
    for (const material of visual.materials) material.envMapIntensity = 1.0 - amount * 0.7;
    if (visual.lens) visual.lens.emissiveIntensity = 0.18 + amount * 1.25;
  });

  return <primitive object={visual.root} dispose={null} />;
}

class SiteBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[camp-site] keeping original visual', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function SiteCraft({ family, matrices, fallback }: VisualProps & { fallback: ReactNode }) {
  const legacy = useMemo(() => typeof window !== 'undefined' && campSiteLegacy(window.location.search), []);
  if (legacy || !matrices.length) return fallback;
  return <SiteBoundary fallback={fallback}><Suspense fallback={fallback}><SiteVisual family={family} matrices={matrices} /></Suspense></SiteBoundary>;
}

export function CampPadVisual({ pads, fallback }: {
  pads: readonly { position: Vec3; rotation?: Vec3 }[];
  fallback: ReactNode;
}) {
  const matrices = useMemo(() => pads.map(({ position, rotation }) =>
    placementMatrix([position[0], PAD_TOP, position[2]], rotation?.[1] ?? 0)), [pads]);
  return <SiteCraft family="C02" matrices={matrices} fallback={fallback} />;
}

export function ExitPostVisual({ matrices, fallback }: { matrices: readonly Matrix4[]; fallback: ReactNode }) {
  return <SiteCraft family="L01" matrices={matrices} fallback={fallback} />;
}
