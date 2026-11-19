import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Group, InstancedMesh, Matrix4, type BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { placementMatrix } from './WorldCampContentAssets';
import { PAD_TOP } from './WorldCampContentLayout';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { applyCampSurfaceBalance } from './camp-surface-balance';
import type { Vec3 } from './types';
import { CampStoneColliders, campGradedFlagstones, campStoneShapes, campStoneInstances } from './WorldCampPhysics';

export const CAMP_SITE_CRAFT_URL = '/assets/world/camp-site-craft/camp-site-v1.glb';
export const campSiteLegacy = (search: string) => new URLSearchParams(search).get('campSiteCraft') === 'legacy';

type Family = 'C02' | 'L01';
type VisualProps = { family: Family; matrices: readonly Matrix4[] };

function SiteVisual({ family, matrices }: VisualProps) {
  const gltf = useLoader(GLTFLoader, CAMP_SITE_CRAFT_URL);
  const { scene } = gltf;
  const environment = useDjcFurnitureEnvironment();
  const visual = useMemo(() => {
    const source = scene.getObjectByName(family);
    if (!source) throw new Error(`Camp site pack missing ${family}`);
    scene.updateMatrixWorld(true);
    const root = new Group(), meshes: InstancedMesh[] = [], materials: MeshStandardMaterial[] = [];
    root.name = family === 'C02' ? 'camp-C02-flagstones' : 'camp-L01-exit-posts';
    let lens: MeshStandardMaterial | undefined;
    const ownedGeometry: BufferGeometry[] = [];
    source.traverse(object => {
      const part = object as Mesh;
      if (!part.isMesh) return;
      if (Array.isArray(part.material)) throw new Error(`Unbatched camp site material: ${part.name}`);
      const material = part.material.clone() as MeshStandardMaterial;
      material.envMap = environment;
      applyCampSurfaceBalance(material, night);
      const isLens = material.name === 'camp_exit_diffuser';
      if (isLens) lens = material;
      const paving = family === 'C02' ? campGradedFlagstones(part.geometry,part.matrixWorld) : null;
      if (paving) ownedGeometry.push(paving);
      const mesh = new InstancedMesh(paving ?? part.geometry, material, matrices.length);
      mesh.name = part.name;
      mesh.receiveShadow = !isLens;
      mesh.castShadow = family === 'L01' && !isLens;
      const displayed = paving ? matrices : matrices.map(matrix => new Matrix4().multiplyMatrices(matrix,part.matrixWorld));
      mesh.userData = { assetId: family, noOcclusionFade: isLens || family === 'C02', solid: mesh.castShadow,
        ...(family === 'C02' ? campStoneInstances('laid',displayed) : {}) };
      displayed.forEach((matrix,index) => mesh.setMatrixAt(index,matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
      meshes.push(mesh);
      materials.push(material);
    });
    if (!meshes.length || (family === 'L01' && !lens)) throw new Error(`Incomplete camp site family: ${family}`);
    if (family === 'C02' && ownedGeometry.length !== 1) throw new Error('Expected one laid flagstone batch');
    const shapes = ownedGeometry.length ? campStoneShapes(ownedGeometry[0]) : null;
    return { root, meshes, materials, lens, ownedGeometry, shapes, users: 0, nightAmount: NaN };
  }, [environment, family, matrices, scene]);

  useEffect(() => {
    // The shared loader owns the GLB geometries/maps and the renderer cache owns PMREM.
    visual.users++;
    return () => {
      visual.users--;
      queueMicrotask(() => {
        if (visual.users) return;
        visual.meshes.forEach(mesh => mesh.dispose());
        visual.ownedGeometry.forEach(geometry => geometry.dispose());
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

  if (family === 'C02' && !visual.shapes) throw new Error('Camp site pack is missing flagstone support');
  return <><primitive object={visual.root} dispose={null} />
    {visual.shapes && <CampStoneColliders label="laid" shapes={visual.shapes} matrices={matrices}/>}</>;
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
