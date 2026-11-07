import { useEffect, useMemo, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import {
  Euler, Group, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type Material, type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { applyCampSurfaceBalance } from './camp-surface-balance';
import { createCampFlagWind } from './camp-flag-wind';
import { applyTentWind, markTentCloth, windUniforms, type TentWindParams } from './WorldWind';
import type { Vec3 } from './types';

const BASE = '/assets/world/camp-shelter-craft';
type Asset = 'C04' | 'C10';
type Placement = { position: Vec3; yaw: number; scale?: number };

function applyNight(material: MeshStandardMaterial, asset: Asset, amount: number) {
  const intensity = material.metalness >= .35 ? 1.10 : asset === 'C04' ? .71 : .76;
  material.envMapIntensity = intensity * (1 - .79 * amount);
  if (material.name === 'camp_canvas_orange') material.emissiveIntensity = .15 * amount;
}

function createResources(asset: Asset, environment: Texture | null, anisotropy: number) {
  const textures = new Map<Texture, Texture>();
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const depths: Material[] = [];
  const geometry: BufferGeometry[] = [];
  function filtered(source: Texture | null) {
    if (!source) return null;
    let copy = textures.get(source);
    if (!copy) {
      copy = source.clone();
      copy.magFilter = LinearFilter;
      copy.minFilter = LinearMipmapLinearFilter;
      copy.generateMipmaps = true;
      copy.anisotropy = anisotropy;
      copy.needsUpdate = true;
      textures.set(source, copy);
    }
    return copy;
  }
  function one(source: Material) {
    if (!(source instanceof MeshStandardMaterial)) throw new Error('Camp shelter requires standard glTF PBR');
    const known = materials.get(source);
    if (known) return known;
    const copy = source.clone();
    // Build the final material before camera occlusion can clone it.
    copy.envMap = environment;
    applyCampSurfaceBalance(copy, night);
    if (copy.name === 'camp_canvas_orange') copy.emissive.set('#FF9A4A');
    applyNight(copy, asset, night.value);
    copy.map = filtered(source.map);
    copy.normalMap = filtered(source.normalMap);
    copy.roughnessMap = filtered(source.roughnessMap);
    copy.metalnessMap = filtered(source.metalnessMap);
    materials.set(source, copy);
    return copy;
  }
  return {
    materials, depths, geometry, users: 0, lastNight: Number.NaN,
    material: (m: Material | Material[]) => Array.isArray(m) ? m.map(one) : one(m),
    dispose() {
      geometry.forEach(g => g.dispose());
      depths.forEach(m => m.dispose());
      materials.forEach(m => m.dispose());
      // The renderer's PMREM and GLTFLoader image Sources remain shared.
      textures.forEach(t => t.dispose());
    },
  };
}

type Resources = ReturnType<typeof createResources>;
function useShelterGLTF(asset: Asset) {
  return useLoader(GLTFLoader, `${BASE}/${asset}.glb`) as GLTF;
}

function useShelterMaterials(resources: Resources, asset: Asset) {
  useEffect(() => {
    resources.users++;
    return () => {
      resources.users--;
      queueMicrotask(() => { if (resources.users === 0) resources.dispose(); });
    };
  }, [resources]);
  useFrame(() => {
    if (Math.abs(resources.lastNight - night.value) < .001) return;
    resources.lastNight = night.value;
    resources.materials.forEach(m => applyNight(m, asset, night.value));
  });
}

// The shared environment hook acquires its renderer target in an effect.
// Wait for that effect (even if PMREM fails) before publishing the scene
// graph: interaction feedback caches the flag objects themselves.
function useShelterEnvironment() {
  const environment = useDjcFurnitureEnvironment();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return { environment, ready };
}

/** Material batches are instanced over both placements. Physics stays in WorldCamp. */
export function SmallTents({ placements }: { placements: readonly Placement[] }) {
  const gltf = useShelterGLTF('C04');
  const { environment, ready } = useShelterEnvironment();
  return ready ? <SmallTentInstances gltf={gltf} environment={environment} placements={placements} /> : null;
}

function SmallTentInstances({ gltf, environment, placements }: {
  gltf: GLTF; environment: Texture | null; placements: readonly Placement[];
}) {
  const anisotropy = useThree(s => Math.max(1, Math.min(4, s.gl.capabilities.getMaxAnisotropy())));
  const visual = useMemo(() => {
    const source = gltf.scene.getObjectByName('C04');
    if (!source) throw new Error('C04 craft is missing its root');
    const raw = source.userData.tentParams;
    const params = (typeof raw === 'string' ? JSON.parse(raw) : raw) as TentWindParams;
    if (!params?.L || !params.W) throw new Error('C04 craft is missing its frozen wind dimensions');
    source.updateWorldMatrix(true, true);
    const resources = createResources('C04', environment, anisotropy);
    const parts: { geometry: BufferGeometry; material: Material | Material[]; name: string; matrix: Matrix4; depth?: Material }[] = [];
    source.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      let geometry = mesh.geometry, matrix = mesh.matrixWorld.clone();
      const material = resources.material(mesh.material);
      let depth: Material | undefined;
      const canvas = [material].flat().find(m => m.name === 'camp_canvas_orange');
      if (canvas) {
        geometry = geometry.clone();
        geometry.applyMatrix4(matrix);
        matrix = new Matrix4();
        // Roof and curtain subdivisions are authored. This only writes the wind mask.
        markTentCloth(geometry, params);
        geometry.computeBoundingBox(); geometry.boundingBox?.expandByScalar(.04);
        geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += .04;
        resources.geometry.push(geometry);
        depth = applyTentWind(canvas, 'C04-shelter-craft', params);
        resources.depths.push(depth);
      }
      parts.push({ geometry, material, name: mesh.name, matrix, depth });
    });
    return { resources, parts };
  }, [gltf, environment, anisotropy]);
  useShelterMaterials(visual.resources, 'C04');
  const matrices = useMemo(() => placements.map(p => new Matrix4().compose(
    new Vector3(...p.position), new Quaternion().setFromEuler(new Euler(0, p.yaw, 0)), new Vector3().setScalar(p.scale ?? 1),
  )), [placements]);
  const root = useMemo(() => {
    const group = new Group();
    group.name = 'camp-C04-shelter-craft';
    const matrix = new Matrix4();
    for (const part of visual.parts) {
      const mesh = new InstancedMesh(part.geometry, part.material, matrices.length);
      mesh.name = part.name;
      mesh.userData = { assetId: 'C04', solid: true, craft: 'camp-shelter-v1' };
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.customDepthMaterial = part.depth;
      matrices.forEach((m, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(m, part.matrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return { group, users: 0 };
  }, [visual, matrices]);
  useEffect(() => {
    root.users++;
    return () => {
      root.users--;
      queueMicrotask(() => { if (!root.users) root.group.children.forEach(m => (m as InstancedMesh).dispose()); });
    };
  }, [root]);
  return <primitive object={root.group} dispose={null} />;
}

export function FlagVisual({ placement }: { placement: Placement }) {
  const gltf = useShelterGLTF('C10');
  const { environment, ready } = useShelterEnvironment();
  return ready ? <FlagScene gltf={gltf} environment={environment} placement={placement} /> : null;
}

function FlagScene({ gltf, environment, placement }: {
  gltf: GLTF; environment: Texture | null; placement: Placement;
}) {
  const anisotropy = useThree(s => Math.max(1, Math.min(4, s.gl.capabilities.getMaxAnisotropy())));
  const visual = useMemo(() => {
    const root = gltf.scene.clone(true);
    const resources = createResources('C10', environment, anisotropy);
    root.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = resources.material(mesh.material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { ...mesh.userData, assetId: 'C10', solid: true, craft: 'camp-shelter-v1' };
    });
    const wind = createCampFlagWind(windUniforms);
    resources.depths.push(wind.depth);
    ['flag_01', 'flag_02', 'flag_03', 'flag_04'].forEach((name, slot) => {
      const flag = root.getObjectByName(name) as Mesh | undefined;
      if (!flag?.isMesh || !(flag.material instanceof MeshStandardMaterial) || flag.material.name !== 'mast_yarn_dyed_cloth') {
        throw new Error(`C10 craft is missing its cloth mesh ${name}`);
      }
      resources.geometry.push(wind.attach(flag, flag.material, slot));
    });
    return { root, resources };
  }, [gltf, environment, anisotropy]);
  useShelterMaterials(visual.resources, 'C10');
  return <group position={placement.position} rotation={[0, placement.yaw, 0]} scale={placement.scale ?? 1} dispose={null}>
    <primitive object={visual.root} dispose={null} />
  </group>;
}
