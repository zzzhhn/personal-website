import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXIT_POSTS } from './WorldCampContentLayout';
import { useInteractable } from './WorldInteract';
import { night } from './WorldNight';
import { craftMaterial } from './WorldCraftMaterials';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import type { Vec3 } from './types';

// Beside the existing walking exit, 3.5 m inside its lamps. The road starts at the lamps;
// even the eastmost stone stays 3 m west of that road. No layout, collider or greybox claim.
export const ENTRY_POSITION: Vec3 = [EXIT_POSTS[0][0] - 3.5, EXIT_POSTS[0][1], (EXIT_POSTS[0][2] + EXIT_POSTS[1][2]) / 2];
let draco: DRACOLoader | undefined;
const withDraco = (loader: GLTFLoader) => {
  draco ??= new DRACOLoader().setDecoderPath('/assets/world/draco/');
  loader.setDRACOLoader(draco);
};
const canOpen = () => {
  const s = useWorldStore.getState();
  return !s.paused && !s.card && !s.seat && !s.activeVehicle && !s.shot;
};

/** G28 keeps the inventory's non-blocking entrance-trigger exception. It is not a teleporter. */
export default function WorldEntry() {
  const gltf = useLoader(GLTFLoader, '/assets/world/entry/G28.glb', withDraco);
  const near = useRef<Group>(null), far = useRef<Group>(null), root = useRef<Group>(null);
  const built = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const groups = new Map<string, { material: MeshStandardMaterial; high: BufferGeometry[]; low: BufferGeometry[] }>();
    gltf.scene.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const material = o.material as MeshStandardMaterial;
      if (!groups.has(material.name)) {
        const copy = material.name.startsWith('G28_stone') ? craftMaterial(material, 'stone') : material.clone();
        if (material.name === 'G28_light_cyan') { copy.emissive.set('#4FD1C5'); copy.emissiveIntensity = .12; }
        groups.set(material.name, { material: copy, high: [], low: [] });
      }
      const batch = groups.get(material.name)!;
      // Author GLB and its original nodes stay untouched. Batch complete transformed geometries.
      const high = o.geometry.clone().applyMatrix4(o.matrixWorld);
      batch.high.push(high);
      // >60 m only: per-stone envelopes retain the segmented arch/open centre, 360 triangles.
      // No low-detail collision is created and near detail is never replaced inside 60 m.
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox!, size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
      const low = new BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z).applyMatrix4(o.matrixWorld);
      batch.low.push(low);
    });
    return [...groups].map(([name, batch]) => {
      const high = mergeGeometries(batch.high)!, low = mergeGeometries(batch.low)!;
      [...batch.high, ...batch.low].forEach(g => g.dispose());
      return { name, material: batch.material, high, low };
    });
  }, [gltf]);
  useEffect(() => () => built.forEach(b => { b.high.dispose(); b.low.dispose(); b.material.dispose(); }), [built]);
  useInteractable({ id: 'G28-menu', kind: 'portal', position: [ENTRY_POSITION[0], ENTRY_POSITION[1] + .8, ENTRY_POSITION[2]], radius: 2,
    label: { en: worldText.en.entryMenu, zh: worldText.zh.entryMenu }, enabled: canOpen,
    onInteract: () => { if (canOpen()) useWorldStore.setState({ paused: true }); },
  });
  const center = useMemo(() => new Vector3(...ENTRY_POSITION), []);
  useFrame(({ camera }) => {
    const distance = camera.position.distanceTo(center);
    if (near.current) near.current.visible = distance < 60;
    if (far.current) far.current.visible = distance >= 60 && distance < 140;
    const player = useWorldStore.getState().position;
    const focus = canOpen() ? 1 - Math.min(1, Math.max(0, Math.hypot(player[0] - center.x, player[2] - center.z) - 1.1) / 1.2) : 0;
    for (const b of built) if (b.name === 'G28_light_cyan') b.material.emissiveIntensity = .12 + 1.08 * night.value + .28 * focus;
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get('qa') !== '1') return;
    Object.assign(window, { __worldEntry: {
      facts: () => ({ position: ENTRY_POSITION, highTriangles: built.reduce((n, b) => n + (b.high.index?.count ?? b.high.attributes.position.count) / 3, 0),
        lowTriangles: built.reduce((n, b) => n + (b.low.index?.count ?? b.low.attributes.position.count) / 3, 0), materials: built.length,
        sourceArcRadiiM: [gltf.scene.getObjectByName('G28')?.userData.arcOuterRadiusM, gltf.scene.getObjectByName('G28')?.userData.arcInnerRadiusM], instanceScale: root.current?.scale.toArray(),
        nearVisible: near.current?.visible, farVisible: far.current?.visible, colliderCount: 0, shadowCasters: 2 }),
      visible: (value: boolean) => { if (root.current) root.current.visible = value; },
    } });
    return () => { delete (window as Window & { __worldEntry?: unknown }).__worldEntry; };
  }, [built]);
  const meshes = (level: 'high' | 'low') => built.map(b => <mesh key={b.name} name={`G28-${level}-${b.name}`} geometry={b[level]} material={b.material}
    castShadow={level === 'high' && b.name !== 'G28_light_cyan'} receiveShadow userData={{ assetId: 'G28', kind: 'entrance-trigger', occluder: true }} />);
  return <group name="G28-entry" ref={root} position={ENTRY_POSITION} userData={{ budgetZone: 'camp' }}>
    <group ref={near}>{meshes('high')}</group><group ref={far} visible={false}>{meshes('low')}</group>
  </group>;
}
