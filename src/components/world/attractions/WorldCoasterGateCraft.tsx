import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-gate-craft-20261105/coaster-gate.glb?url';

export type CoasterGateCraftPart = 'static' | 'leaf' | 'key';
const ROOTS: Record<CoasterGateCraftPart, string> = { static: 'GateStatic', leaf: 'GateLeaf', key: 'GateKey' };

/** Visual-only. The caller keeps the original placements, rigid bodies, hinges,
 * mirror scale, key visibility and live sign atlas. No input or state is owned here.
 * Do not mount alongside the old steel surfaces: remove those specific originals.
 */
export default function WorldCoasterGateCraft({ part }: { part: CoasterGateCraftPart }) {
  const { scene } = useGLTF(assetUrl);
  const environment = useDjcFurnitureEnvironment();
  const model = useMemo(() => {
    const source = scene.getObjectByName(ROOTS[part]);
    if (!source) throw Error(`Coaster gate asset lacks ${ROOTS[part]}`);
    const root = source.clone(true);
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    const clone = (sourceMaterial: Material) => {
      if (!(sourceMaterial instanceof MeshStandardMaterial)) throw Error('Coaster gate requires opaque PBR materials');
      let material = materials.get(sourceMaterial);
      if (!material) { material = sourceMaterial.clone(); materials.set(sourceMaterial, material); }
      return material;
    };
    // All three asset roots are identity. Assert this contract instead of silently
    // applying a second world/axis transform after the caller's hinge transform.
    if (!source.matrix.equals(new Matrix4())) throw Error(`Non-identity coaster gate root: ${ROOTS[part]}`);
    root.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
      object.castShadow = part !== 'leaf';
      object.receiveShadow = true;
    });
    let shadow: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
    if (part === 'leaf') {
      const shadowSource = scene.getObjectByName('GateLeafShadow');
      if (!shadowSource || !shadowSource.matrix.equals(new Matrix4()))
        throw Error('Gate asset lacks identity GateLeafShadow');
      shadowSource.updateWorldMatrix(true, true);
      const inverse = shadowSource.matrixWorld.clone().invert(), transform = new Matrix4();
      const parts: BufferGeometry[] = [];
      let geometry: BufferGeometry | null;
      try {
        shadowSource.traverse(object => {
          if (!(object instanceof Mesh)) return;
          const visible = Array.isArray(object.material) ? object.material : [object.material];
          if (visible.some(m => m.transparent || m.opacity !== 1 || m.alphaTest !== 0))
            throw Error('Gate shadow carrier requires fully opaque leaves');
          transform.multiplyMatrices(inverse, object.matrixWorld);
          // Copy only the independent low-detail assembly's position/topology.
          // The visible PBR meshes keep all original borrowed channels.
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', object.geometry.getAttribute('position').clone());
          if (object.geometry.index) geometry.setIndex(object.geometry.index.clone());
          parts.push(geometry.applyMatrix4(transform));
        });
        geometry = mergeGeometries(parts, false);
      } finally { parts.forEach(part => part.dispose()); }
      if (!geometry) throw Error('Cannot merge gate leaf shadow geometry');
      const depth = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
      depth.name = 'Gate leaf shared opaque silhouette';
      depth.shadowSide = DoubleSide;
      shadow = new Mesh(geometry, depth);
      shadow.name = 'GateLeafShadowCarrier';
      shadow.castShadow = true;
      shadow.receiveShadow = false;
      // Child of the same hinged root, so mirrored/open leaves keep exact poses.
      root.add(shadow);
    }
    const owned = [...materials.values()];
    let users = 0, disposed = false;
    const retain = () => {
      if (disposed) throw Error('Cannot retain disposed gate craft');
      users++;
      let released = false;
      return () => {
        if (released) return;
        released = true; users--;
        // StrictMode immediately replays this effect with the same model.
        // Let that replay reacquire it before releasing the owned materials.
        queueMicrotask(() => {
          if (users !== 0 || disposed) return;
          disposed = true;
          for (const material of owned) material.dispose();
          shadow?.geometry.dispose();
          shadow?.material.dispose();
        });
      };
    };
    return { root, materials: owned, retain, shadow };
  }, [scene, part]);
  const previousNight = useRef(NaN);
  useEffect(() => {
    for (const material of model.materials) {
      material.envMap = environment;
      material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      material.needsUpdate = true;
    }
    previousNight.current = night.value;
  }, [model, environment]);
  useEffect(() => model.retain(), [model]);
  // Same existing renderer-scoped night adapter as the approved carriage/chest.
  // No timer, polling, React update or per-frame allocation. Geometry stays fixed.
  useFrame(() => {
    if (previousNight.current === night.value) return;
    previousNight.current = night.value;
    for (const material of model.materials) material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
  });
  // Source geometry/maps belong to useGLTF's cache. The leaf carrier's derived
  // geometry/depth material and all cloned PBR materials have owned lifetimes.
  return <group name={`coaster-gate-craft-${part}`} dispose={null}>
    <primitive object={model.root} dispose={null} />
  </group>;
}
