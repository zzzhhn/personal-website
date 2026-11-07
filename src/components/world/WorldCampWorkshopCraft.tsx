import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import type { Material, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';

type ToolWallNode = 'C11_body' | 'C11_tools';
const URL = '/assets/world/camp-workshop-craft/camp-workshop.glb';

function cloneVisual(source: Object3D, node: 'C08' | ToolWallNode, environment: Texture | null) {
  const root = source.clone(true);
  // The placement/animation parent supplies the original node transform.
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.name = `camp-workshop-${node}`;
  const copies = new Map<Material, MeshStandardMaterial>();
  const cloneMaterial = (original: Material) => {
    let copy = copies.get(original);
    if (!copy) {
      copy = original.clone() as MeshStandardMaterial;
      copy.envMap = environment;
      copy.envMapIntensity = 1.25;
      copies.set(original, copy);
    }
    return copy;
  };
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
    mesh.castShadow = !mesh.userData.noShadow;
    mesh.receiveShadow = true;
    mesh.userData = { ...mesh.userData, assetId: node === 'C08' ? 'C08' : 'C11', solid: true };
  });
  return { root, materials: [...copies.values()], users: 0, previousNight: NaN };
}

function WorkshopVisual({ node }: { node: 'C08' | ToolWallNode }) {
  const gltf = useLoader(GLTFLoader, URL);
  const environment = useDjcFurnitureEnvironment();
  const visual = useMemo(() => {
    const source = gltf.scene.getObjectByName(node);
    if (!source) throw new Error(`Camp workshop pack missing ${node}`);
    return cloneVisual(source, node, environment);
  }, [gltf, node, environment]);
  useEffect(() => {
    visual.users++;
    return () => {
      visual.users--;
      queueMicrotask(() => { if (!visual.users) visual.materials.forEach(material => material.dispose()); });
    };
  }, [visual]);
  useFrame(() => {
    const amount = night.value;
    if (visual.previousNight === amount) return;
    visual.previousNight = amount;
    for (const material of visual.materials) material.envMapIntensity = 1.25 - 0.8 * amount;
  });
  return <primitive object={visual.root} dispose={null} />;
}

class WorkshopBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[camp-workshop] keeping original prop', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function WorkshopAsset({ node, fallback }: { node: 'C08' | ToolWallNode; fallback: ReactNode }) {
  return <WorkshopBoundary fallback={fallback}>
    <Suspense fallback={fallback}><WorkshopVisual node={node} /></Suspense>
  </WorkshopBoundary>;
}

export function BookStackVisual({ fallback }: { fallback: ReactNode }) {
  return <WorkshopAsset node="C08" fallback={fallback} />;
}

export function ToolWallVisual({ node, fallback }: { node: ToolWallNode; fallback: ReactNode }) {
  return <WorkshopAsset node={node} fallback={fallback} />;
}
