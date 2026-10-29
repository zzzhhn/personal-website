import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { night } from './WorldNight';
import { craftMaterial } from './WorldCraftMaterials';
import { useWorldStore } from './store';
import { ENTRY_POSITION, PORTAL_THRESHOLD, WORLD_PORTALS } from './world-portals';
import { createPortalSurface, createPortalThreshold, PORTAL_FRAME_YAW, PORTAL_PARTICLE_COUNT } from './WorldPortalSurface';

export { ENTRY_POSITION } from './world-portals';
let draco: DRACOLoader | undefined;
const withDraco = (loader: GLTFLoader) => {
  draco ??= new DRACOLoader().setDecoderPath('/assets/world/draco/');
  loader.setDRACOLoader(draco);
};
/** The unscaled circular G28 at each walking portal. WorldActors owns crossing. */
export default function WorldEntry() {
  const gltf = useLoader(GLTFLoader, '/assets/world/entry/G28.glb', withDraco);
  const roots = useRef<(Group | null)[]>([]), near = useRef<(Group | null)[]>([]);
  const far = useRef<(Group | null)[]>([]), effects = useRef<(Group | null)[]>([]);
  const surface = useMemo(createPortalSurface, []), threshold = useMemo(createPortalThreshold, []);
  useEffect(() => () => { surface.dispose(); threshold.dispose(); }, [surface, threshold]);
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
  useFrame(({ camera }) => {
    const player = useWorldStore.getState().position;
    let focus = 0;
    WORLD_PORTALS.forEach((site, i) => {
      const p = site.position;
      const distance = Math.hypot(camera.position.x - p[0], camera.position.y - p[1], camera.position.z - p[2]);
      if (near.current[i]) near.current[i]!.visible = distance < 60;
      if (far.current[i]) far.current[i]!.visible = distance >= 60 && distance < 140;
      if (effects.current[i]) effects.current[i]!.visible = distance < 45;
      focus = Math.max(focus, 1 - Math.min(1, Math.max(0, Math.hypot(player[0] - p[0], player[2] - p[2]) - 1.1) / 1.2));
    });
    for (const b of built) if (b.name === 'G28_light_cyan') b.material.emissiveIntensity = .12 + 1.08 * night.value + .28 * focus;
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get('qa') !== '1') return;
    Object.assign(window, { __worldEntry: {
      facts: () => ({ position: ENTRY_POSITION, highTriangles: built.reduce((n, b) => n + (b.high.index?.count ?? b.high.attributes.position.count) / 3, 0),
        lowTriangles: built.reduce((n, b) => n + (b.low.index?.count ?? b.low.attributes.position.count) / 3, 0), materials: built.length,
        sourceArcRadiiM: [gltf.scene.getObjectByName('G28')?.userData.arcOuterRadiusM, gltf.scene.getObjectByName('G28')?.userData.arcInnerRadiusM], instanceScale: roots.current[0]?.scale.toArray(),
        sourceFrontAxis: gltf.scene.getObjectByName('G28')?.userData.frontAxis, frameYaw: PORTAL_FRAME_YAW, localOpeningNormal: [0, 0, 1],
        nearVisible: near.current[0]?.visible, farVisible: far.current[0]?.visible, colliderCount: WORLD_PORTALS.length, shadowCasters: 3,
        sites: WORLD_PORTALS, particlesPerSite: PORTAL_PARTICLE_COUNT, thresholdTriangles: threshold.indices.length / 3,
        sharedMembraneTriangles: surface.curtainGeometry.index!.count / 3,
        threshold: PORTAL_THRESHOLD,
        visibility: WORLD_PORTALS.map((site, i) => ({ id: site.id, near: near.current[i]?.visible, far: far.current[i]?.visible, surface: effects.current[i]?.visible })) }),
      visible: (value: boolean) => { roots.current.forEach(root => { if (root) root.visible = value; }); },
    } });
    return () => { delete (window as Window & { __worldEntry?: unknown }).__worldEntry; };
  }, [built, surface, threshold]);
  const meshes = (level: 'high' | 'low') => built.map(b => <mesh key={b.name} name={`G28-${level}-${b.name}`} geometry={b[level]} material={b.material}
    rotation={[0, PORTAL_FRAME_YAW, 0]}
    castShadow={level === 'high' && b.name !== 'G28_light_cyan'} receiveShadow userData={{ assetId: 'G28', kind: 'entrance-trigger', occluder: true }} />);
  return <>{WORLD_PORTALS.map((site, i) => <group key={site.id} name={i === 0 ? 'G28-entry' : `G28-entry-${site.id}`}
    ref={g => { roots.current[i] = g; }} position={site.position} rotation={[0, site.yaw, 0]} userData={{ budgetZone: site.id }}>
    <group ref={g => { near.current[i] = g; }}>{meshes('high')}
      <mesh name={`G28-${site.id}-threshold`} geometry={threshold.geometry} material={threshold.material} castShadow receiveShadow userData={{ surface: true }} />
    </group>
    <group ref={g => { far.current[i] = g; }} visible={false}>{meshes('low')}
      <mesh geometry={threshold.geometry} material={threshold.material} receiveShadow userData={{ surface: true }} />
    </group>
    <group ref={g => { effects.current[i] = g; }} userData={{ noOcclusionFade: true }}>
      <mesh name={`G28-${site.id}-membrane`} geometry={surface.curtainGeometry} material={surface.curtainMaterial} renderOrder={2} userData={{ noOcclusionFade: true }} />
      <points name={`G28-${site.id}-motes`} geometry={surface.particleGeometry} material={surface.particleMaterial} renderOrder={3} userData={{ noOcclusionFade: true }} />
    </group>
    <RigidBody name={`G28-${site.id}-threshold-body`} type="fixed" colliders={false} userData={{ surface: true, assetId: 'G28-threshold' }}>
      <TrimeshCollider args={[threshold.vertices, threshold.indices]} friction={.95} restitution={0} />
    </RigidBody>
  </group>)}</>;
}
