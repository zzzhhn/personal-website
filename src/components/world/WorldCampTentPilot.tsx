import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, Vector2, type BufferGeometry, type Material, type MeshDepthMaterial, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { applyTentWind, markTentCloth, type TentWindParams } from './WorldWind';
import { night } from './WorldNight';
import type { Vec3 } from './types';

export const CAMP_TENT_PILOT_URL = '/assets/world/scenario-craft-pilot/C03-tent-v1.glb';
export type TentPilotPlacement = { position: Vec3; yaw: number; scale?: number };

/** Visual only. The original camp C03 owns collision and interaction anchors. */
function TentVisual({ placement }: { placement: TentPilotPlacement }) {
  const gltf = useLoader(GLTFLoader, CAMP_TENT_PILOT_URL);
  const environment = useDjcFurnitureEnvironment();
  const anisotropy = useThree(s => Math.min(4, Math.max(1, s.gl.capabilities.getMaxAnisotropy())));
  const lastNight = useRef(-1);
  const visual = useMemo(() => {
    const source = gltf.scene.getObjectByName('C03');
    if (!source) throw new Error('C03 pilot asset has no root');
    const raw = source.userData.tentParams;
    const params = (typeof raw === 'string' ? JSON.parse(raw) : raw) as TentWindParams;
    if (!params?.L || !params.W) throw new Error('C03 pilot has no frozen tent parameters');
    const root = new Group(); root.name = 'camp-C03-scenario-pilot';
    const geometries: BufferGeometry[] = [], materials: Material[] = [], depths: MeshDepthMaterial[] = [];
    const filteredTextures = new Map<Texture, Texture>();
    const filtered = (original: Texture | null) => {
      if (!original) return null;
      let copy = filteredTextures.get(original);
      if (!copy) {
        // The GLB already requests trilinear mipmaps. Add directional samples
        // for its 7.8 mm weave at grazing player views. Own the sampler wrapper;
        // borrow the GLTF image/Source without mutating its cached textures.
        copy = original.clone();
        copy.magFilter = LinearFilter; copy.minFilter = LinearMipmapLinearFilter;
        copy.generateMipmaps = true; copy.anisotropy = anisotropy; copy.needsUpdate = true;
        filteredTextures.set(original, copy);
      }
      return copy;
    };
    const canvas: MeshStandardMaterial[] = [], physical: MeshStandardMaterial[] = [];
    source.updateWorldMatrix(true, true);
    source.traverse(object => {
      const original = object as Mesh;
      if (!original.isMesh) return;
      const geometry = original.geometry.clone();
      // Source GLB Y-up is already final. Baking node transforms keeps the
      // inherited cloth classifier/shader in the same local coordinates.
      geometry.applyMatrix4(original.matrixWorld);
      const one = (m: Material) => {
        if (!(m instanceof MeshStandardMaterial)) throw new Error('C03 pilot needs supported PBR material');
        const copy = m.clone();
        if (m.name === 'camp_canvas_orange' || m.name === 'pilot_canvas_binding' || m.name === 'pilot_canvas_cream') {
          copy.map = filtered(m.map);
          copy.normalMap = filtered(m.normalMap);
          copy.roughnessMap = filtered(m.roughnessMap);
          // glTF packs metalness and roughness into the same data image.
          copy.metalnessMap = filtered(m.metalnessMap);
        }
        copy.envMap = environment; copy.envMapIntensity = 1.1 * (1 - .8 * night.value);
        copy.normalScale = new Vector2(.38, .38);
        materials.push(copy); physical.push(copy);
        return copy;
      };
      const material = Array.isArray(original.material) ? original.material.map(one) : one(original.material);
      const mesh = new Mesh(geometry, material);
      mesh.name = `camp-C03-pilot-${original.name}`;
      mesh.userData = { assetId: 'C03', solid: true, pilot: 'scenario-v1', semantic: original.name };
      mesh.castShadow = true; mesh.receiveShadow = true;
      const cloth = [material].flat().find(m => m.name === 'camp_canvas_orange') as MeshStandardMaterial | undefined;
      if (cloth) {
        markTentCloth(geometry, params);
        const depth = applyTentWind(cloth, 'C03-scenario-pilot', params);
        mesh.customDepthMaterial = depth; depths.push(depth);
        cloth.emissive.set('#FF9A4A'); cloth.emissiveIntensity = night.value * .15;
        canvas.push(cloth);
        geometry.computeBoundingBox(); geometry.boundingBox?.expandByScalar(.04);
        geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += .04;
      }
      geometries.push(geometry); root.add(mesh);
    });
    return { root, geometries, materials, depths, physical, canvas, filteredTextures, users: 0 };
  }, [gltf, environment, anisotropy]);
  useEffect(() => {
    visual.users++;
    return () => {
      visual.users--;
      queueMicrotask(() => {
        if (visual.users) return;
        visual.geometries.forEach(g => g.dispose());
        visual.materials.forEach(m => m.dispose());
        visual.depths.forEach(m => m.dispose());
        visual.filteredTextures.forEach(t => t.dispose());
        // GLTF image/Source data, original textures and renderer environment are borrowed.
      });
    };
  }, [visual]);
  useFrame(() => {
    if (Math.abs(lastNight.current - night.value) < .001) return;
    lastNight.current = night.value;
    for (const m of visual.physical) m.envMapIntensity = 1.1 * (1 - .8 * night.value);
    for (const m of visual.canvas) m.emissiveIntensity = night.value * .15;
  });
  return <group position={placement.position} rotation={[0, placement.yaw, 0]} scale={placement.scale ?? 1} dispose={null}>
    <primitive object={visual.root} dispose={null} />
  </group>;
}

export default function WorldCampTentPilot({ placement }: { placement: TentPilotPlacement }) {
  return <TentVisual placement={placement} />;
}
