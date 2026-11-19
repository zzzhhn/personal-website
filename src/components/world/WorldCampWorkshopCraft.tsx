import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import type { Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { applyCampSurfaceBalance } from './camp-surface-balance';
import { campBookShapes, CampColliders, campColliderKey } from './WorldCampPhysics';

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
      applyCampSurfaceBalance(copy, night);
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
    mesh.userData = { ...mesh.userData, assetId: node === 'C08' ? 'C08' : 'C11', solid: true,
      ...(node === 'C08' ? {worldCollision:'solid',surfaceId:campColliderKey('C08','pad1',0,'body'),worldCollisionSharedSurface:true} : {}) };
  });
  return { root, materials: [...copies.values()], users: 0, previousNight: NaN };
}

function WorkshopVisual({ node, placement }: { node: 'C08' | ToolWallNode; placement?: Matrix4 }) {
  const gltf = useLoader(GLTFLoader, URL);
  const environment = useDjcFurnitureEnvironment();
  const visual = useMemo(() => {
    const source = gltf.scene.getObjectByName(node);
    if (!source) throw new Error(`Camp workshop pack missing ${node}`);
    return cloneVisual(source, node, environment);
  }, [gltf, node, environment]);
  const shapes = useMemo(() => node === 'C08' ? campBookShapes(visual.root) : null,[node,visual]);
  const matrices = useMemo(() => placement ? [placement] : [],[placement]);
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
  if (node !== 'C08') return <primitive object={visual.root} dispose={null} />;
  if (!shapes || !placement) throw new Error('Camp workbench is missing its book-stack placement');
  return <><group matrix={placement} matrixAutoUpdate={false}><primitive object={visual.root} dispose={null} /></group>
    <CampColliders id="C08" label="pad1" shapes={shapes} matrices={matrices}/></>;
}

class WorkshopBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[camp-workshop] keeping original prop', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function WorkshopAsset({ node, fallback, placement }: { node: 'C08' | ToolWallNode; fallback: ReactNode; placement?: Matrix4 }) {
  return <WorkshopBoundary fallback={fallback}>
    <Suspense fallback={fallback}><WorkshopVisual node={node} placement={placement} /></Suspense>
  </WorkshopBoundary>;
}

export function BookStackVisual({ fallback, placement }: { fallback: ReactNode; placement: Matrix4 }) {
  return <WorkshopAsset node="C08" fallback={fallback} placement={placement} />;
}

export function ToolWallVisual({ node, fallback }: { node: ToolWallNode; fallback: ReactNode }) {
  return <WorkshopAsset node={node} fallback={fallback} />;
}
