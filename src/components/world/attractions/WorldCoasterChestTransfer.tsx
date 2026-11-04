import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';
import { useWorldStore } from '../store';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { createIntentKey } from './coaster-device-geometry';
import { coasterWorld, COASTER_GATE_Z } from './coaster-track';
import { activateIntentTarget, useIntentStore } from './intent-state';
import { WorldIntentReflectiveSurface } from './WorldIntentSurface';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-chest-transfer-20261104/coaster-chest.glb?url';

const OPEN_LID = -1.3;
const OPEN_SHACKLE = -1.12;
const SHACKLE_LIFT = .058;
const indexName = (i: number) => String(i + 1).padStart(2, '0');

function requireNode(root: Object3D, name: string) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Coaster chest asset lacks ${name}`);
  return node;
}

function makeChest(scene: Object3D) {
  const root = scene.clone(true);
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const cloneMaterial = (source: Material) => {
    if (!(source instanceof MeshStandardMaterial)) throw new Error('Coaster chest requires opaque PBR materials');
    let copy = materials.get(source);
    if (!copy) {
      copy = source.clone();
      materials.set(source, copy);
    }
    return copy;
  };
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  const body = requireNode(root, 'ChestBody');
  const lid = requireNode(root, 'ChestLid');
  for (const shell of [body, lid]) shell.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const meshesOf = (node: Object3D) => {
    const meshes: Mesh[] = [];
    node.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    return meshes;
  };
  const locks = Array.from({ length: 6 }, (_, i) => {
    const name = indexName(i);
    const shackle = requireNode(root, `Shackle${name}`);
    const shackleMeshes = meshesOf(shackle);
    return {
      shackle, y: shackle.position.y, meshes: shackleMeshes,
      original: shackleMeshes.map(m => m.material),
      lenses: meshesOf(requireNode(root, `LockLens${name}`)),
    };
  });
  const signals = Array.from({ length: 7 }, (_, i) => {
    const meshes = meshesOf(requireNode(root, `Signal${indexName(i)}`));
    return { meshes, original: meshes.map(m => m.material) };
  });
  const opal = [...materials.values()].find(m => m.name === '07 Neutral opal status lens');
  const steel = [...materials.values()].find(m => m.name === '04 Brushed hardware');
  if (!opal || !steel) throw new Error('Coaster chest lacks its PBR state materials');
  const active = opal.clone();
  active.name = 'Active cyan status lens';
  active.color.set('#75ded9');
  active.emissive.set('#59d8d6');
  active.emissiveIntensity = .68;
  return { root, lid, locks, signals, active, opal, steel, materials: [...materials.values(), active] };
}

function ChestModel({ open, passed }: { open: boolean; passed: readonly string[] }) {
  const { scene } = useGLTF(assetUrl);
  const model = useMemo(() => makeChest(scene), [scene]);
  const environment = useDjcFurnitureEnvironment();
  const previousNight = useRef(NaN);
  const initialOpen = useRef(open).current;
  useLayoutEffect(() => { model.lid.rotation.x = initialOpen ? OPEN_LID : 0; }, [model, initialOpen]);
  useLayoutEffect(() => {
    model.locks.forEach((lock, i) => {
      const unlocked = i < passed.length;
      lock.shackle.rotation.y = unlocked ? OPEN_SHACKLE : 0;
      lock.shackle.position.y = lock.y + (unlocked ? SHACKLE_LIFT : 0);
      lock.meshes.forEach((mesh, j) => { mesh.material = unlocked ? model.steel : lock.original[j]; });
      lock.lenses.forEach(mesh => { mesh.material = unlocked ? model.active : model.opal; });
    });
    model.signals.forEach(({ meshes, original }, i) => {
      meshes.forEach((mesh, j) => { mesh.material = passed.includes(`T${i + 1}`) ? model.active : original[j]; });
    });
  }, [model, passed]);
  useLayoutEffect(() => {
    for (const material of model.materials) {
      material.envMap = environment;
      material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      material.needsUpdate = true;
    }
    previousNight.current = night.value;
  }, [model, environment]);
  useEffect(() => () => { for (const material of model.materials) material.dispose(); }, [model]);
  useFrame((_, dt) => {
    if (previousNight.current !== night.value) {
      for (const material of model.materials) material.envMapIntensity = .85 * (1 - night.value) + .5 * night.value;
      previousNight.current = night.value;
    }
    if (useWorldStore.getState().paused || document.hidden || dt > .25) return;
    const target = open ? OPEN_LID : 0;
    model.lid.rotation.x += (target - model.lid.rotation.x) * (1 - Math.exp(-dt * 7));
  });
  // Geometry and textures belong to the useGLTF cache; only material clones are ours.
  return <primitive object={model.root} dispose={null} />;
}

/** Drop-in for the private IntentChest in WorldIntentDevices. Interaction registration stays there. */
export default function WorldCoasterChestTransfer() {
  const progress = useIntentStore(s => s.progress);
  const key = useMemo(createIntentKey, []);
  useEffect(() => () => key.dispose(), [key]);
  return <>
    <group position={coasterWorld([-8, 0, 59.5])} onClick={e => { e.stopPropagation(); activateIntentTarget('chest'); }}>
      <Suspense fallback={null}><ChestModel open={progress.chestOpen} passed={progress.passed} /></Suspense>
      {progress.chestOpen && !progress.keyTaken && <mesh geometry={key} position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]}><WorldIntentReflectiveSurface metalness={.35} roughness={.4} /></mesh>}
    </group>
    {progress.gateOpen && <mesh geometry={key} position={coasterWorld([5.3, 1.65, COASTER_GATE_Z + .5])}><WorldIntentReflectiveSurface roughness={.4} /></mesh>}
  </>;
}
