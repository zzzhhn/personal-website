/** Street-owned lowland trees. All GLBs resolve before claiming tree; camp trees remain untouched. */
import { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { Color, DoubleSide, Float32BufferAttribute, Frustum, Sphere, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TREES_V4, solidsV4 } from './layout-v4';
import { attachNatureWind } from './WorldNatureMotion';
import { StreetClaim } from './WorldStreetStatic';
import { collisionInstancePartId, type InstanceCollisionSources } from './world-collision-inventory';
let draco: DRACOLoader | null = null;
const loader = (l: GLTFLoader) => { draco ??= new DRACOLoader().setDecoderPath('/assets/world/draco/'); l.setDRACOLoader(draco); };
const IDS = ['ST1', 'ST2'];
type TreeSourceRange = { id: string; collision: 'soft' | 'solid'; surfaceId?: string;
  source: string; firstVertex: number; vertexCount: number };
function merged(gltf: GLTF, crownPrefix: string, craft: boolean) {
  const parts: BufferGeometry[] = [];
  const ranges: TreeSourceRange[] = [];
  let firstVertex = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    const m = o as Mesh; if (!m.isMesh) return;
    let branch: import('three').Object3D | null = m;
    while (branch && !/^L[01]-/.test(branch.name)) branch = branch.parent;
    if (!branch) return;
    const crown = branch.name.startsWith(crownPrefix + '-crown');
    // Keep the physical trunk silhouette across the LOD change. Foliage still uses its authored LOD.
    if (!crown && !branch.name.startsWith('L0-trunk')) {
      if (!/^L[01]-(crown|trunk)/.test(branch.name)) throw new Error('Unrecognised street tree part: ' + branch.name);
      return;
    }
    const src = m.geometry, mats = Array.isArray(m.material) ? m.material : [m.material];
    const geo = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(m.matrixWorld);
    const count = geo.getAttribute('position').count, col = new Float32Array(count * 3), color = new Color();
    const authored = craft ? geo.getAttribute('color') : undefined;
    for (const group of src.groups.length ? src.groups : [{ start: 0, count, materialIndex: 0 }]) {
      color.copy((mats[group.materialIndex ?? 0] as MeshStandardMaterial).color);
      for (let i = group.start; i < Math.min(count, group.start + group.count); i++) {
        col[i * 3] = color.r * (authored?.getX(i) ?? 1);
        col[i * 3 + 1] = color.g * (authored?.getY(i) ?? 1);
        col[i * 3 + 2] = color.b * (authored?.getZ(i) ?? 1);
      }
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    ranges.push({
      id: (crown ? 'crown-' : 'bark-') + ranges.length, source: m.name,
      collision: crown ? 'soft' : 'solid', surfaceId: crown ? undefined : 'trunk',
      firstVertex, vertexCount: count,
    });
    firstVertex += count;
    if (craft) {
      // One merged material still distinguishes opaque bark from waxier leaf blades.
      // Attribute exists on every merged part, so no material groups/draws are added.
      geo.setAttribute('treeLeaf', new Float32BufferAttribute(new Float32Array(count).fill(crown ? 1 : 0), 1));
    }
    for (const key of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', '_wind', ...(craft ? ['treeLeaf'] : [])].includes(key)) geo.deleteAttribute(key);
    if (!geo.getAttribute('_wind')) throw new Error('missing authored wind: ' + m.name);
    geo.clearGroups(); parts.push(geo);
  });
  if (!parts.length) throw new Error('missing tree LOD ' + crownPrefix);
  const out = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose());
  return {geometry:out, ranges};
}
// This authored list bypasses procedural scatter keepouts. Trunks must clear
// the actual attraction-road samples by 5.3 m, including their paved shoulders.
// Preserve indices so a relocation retains its tree family, scale and tint.
export const northTrees=[[-17,1,-115],[-3,1,-116],[-29,1,-125],[-39,1,-134],[-52,1,-132],[-70,1,-132],[-104,1,-147],[-118,1,-172],[-114,1,-207],[-83,1,-209],[-62,1,-205],[5,1,-137],[15,1,-132],[38,1,-112],[89,1,-150],[93,1,-180],[77,1,-221],[43,1,-226]];
export function buildStreetTrees(files: GLTF[], craft: boolean) {
  const points = [...TREES_V4.filter(p => p[1] < 2), ...solidsV4().filter(s => s.kind === 'trunk').map(s => [s.position[0], s.position[1] - s.size[1] / 2, s.position[2]]),...northTrees];
  const placements = points.map((p, i) => ({ id: `street-tree-${i}`, surfaceIds:[collisionInstancePartId(`street-tree-${i}`, 'trunk')], kind: i % 2, matrix: new Matrix4().compose(new Vector3(...p), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 2.399), new Vector3().setScalar(.91 + (i % 4) * .07)), p: new Vector3(...p), tint: new Color().setRGB(.94 + (i % 3) * .025, .95 + (i % 4) * .018, .9 + (i % 2) * .05) }));
  const families = IDS.map((_, kind) => placements.filter(p => p.kind === kind));
  const meshes: InstancedMesh[] = [], clean: (() => void)[] = [];
  files.forEach((g, kind) => {
    for (const lod of [0, 1]) {
      const {geometry:geo, ranges} = merged(g, `L${lod}`, craft), mat = new MeshStandardMaterial({ vertexColors: true, roughness: .93, metalness: 0, side: DoubleSide });
      const mesh = new InstancedMesh(geo, mat, families[kind].length);
      const sources: InstanceCollisionSources = {placements:families[kind], slots:[]};
      Object.assign(mesh.userData,{worldCollision:'solid', worldCollisionSources:ranges, worldCollisionInstances:sources});
      mesh.name = `street-tree-${IDS[kind]}-L${lod}`; mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.userData.occluder = true; mesh.userData.streetStats = () => ({ tris: mesh.count * geo.getAttribute('position').count / 3, instances: mesh.count });
      const detach = attachNatureWind(mesh);
      if (craft) {
        // attachNatureWind owns the displacement/depth patch. Extend its cloned surface
        // material afterwards, retaining the identical wind and shadow implementation.
        const surface = mesh.material as MeshStandardMaterial, windCompile = surface.onBeforeCompile;
        const windKey = surface.customProgramCacheKey();
        surface.onBeforeCompile = function (shader, renderer) {
          windCompile.call(this, shader, renderer);
          shader.vertexShader = 'attribute float treeLeaf;\nvarying float vTreeLeaf;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeLeaf = treeLeaf;');
          shader.fragmentShader = 'varying float vTreeLeaf;\n' + shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.87, vTreeLeaf);');
        };
        surface.customProgramCacheKey = () => windKey + '-tree-craft-pigment-v1';
        surface.needsUpdate = true;
      }
      clean.push(() => { detach(); geo.dispose(); mat.dispose(); mesh.dispose(); }); meshes.push(mesh);
    }
  });
  const colliders = placements.map(p => {
    let trunk: Mesh | null = null; files[p.kind].scene.traverse(o => { if ((o as Mesh).isMesh && o.name.startsWith('L0-trunk')) trunk = o as Mesh; });
    if (!trunk) throw new Error('missing tree collision source');
    const t = trunk as Mesh, geo = t.geometry.clone().applyMatrix4(p.matrix.clone().multiply(t.matrixWorld));
    const pos = new Float32Array(geo.getAttribute('position').array), idx = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: pos.length / 3 }, (_, j) => j); geo.dispose();
    return { pos, idx, key: p.surfaceIds[0] };
  });
  return { families, meshes, clean, colliders };
}
export default function StreetTrees() {
  const craft = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('natureCraft') !== 'legacy';
  const files = useLoader(GLTFLoader, IDS.map(id => `/assets/world/${craft ? 'nature-craft' : 'street'}/${id}.glb`), loader) as GLTF[];
  const built = useMemo(() => buildStreetTrees(files, craft), [files, craft]);
  useEffect(() => () => built.clean.forEach(c => c()), [built]);
  const frustum = useMemo(() => new Frustum(), []), view = useMemo(() => new Matrix4(), []), sphere = useMemo(() => new Sphere(), []);
  useFrame(({ camera }) => {
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (let k = 0; k < 2; k++) {
      const near = built.meshes[k * 2], far = built.meshes[k * 2 + 1]; near.count = 0; far.count = 0;
      const family = built.families[k];
      for (let i=0;i<family.length;i++) {
        const p = family[i]; sphere.center.copy(p.p); sphere.center.y += 3; sphere.radius = 4.5; if (!frustum.intersectsSphere(sphere)) continue; const d = p.p.distanceTo(camera.position); if (d > 140) continue;
        const m = d < 34 ? near : far; m.setMatrixAt(m.count, p.matrix); m.setColorAt(m.count, p.tint); m.userData.worldCollisionInstances.slots[m.count] = i; m.count++;
      }
      for (const m of [near, far]) { m.userData.worldCollisionInstances.slots.length=m.count; m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  });
  return <group name="street-trees-group">
    {built.meshes.map(m => <primitive key={m.name} object={m} />)}
    <RigidBody type="fixed" colliders={false} name="street-tree-trunks" userData={{ solid: true, assetId: 'street-tree' }}>
      {built.colliders.map(c => <TrimeshCollider key={c.key} name={c.key} args={[c.pos, c.idx]} friction={.7} restitution={.02} />)}
    </RigidBody>
    <StreetClaim keys={['tree']} />
  </group>;
}
