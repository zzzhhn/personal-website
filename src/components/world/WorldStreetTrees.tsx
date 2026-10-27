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
let draco: DRACOLoader | null = null;
const loader = (l: GLTFLoader) => { draco ??= new DRACOLoader().setDecoderPath('/assets/world/draco/'); l.setDRACOLoader(draco); };
const IDS = ['ST1', 'ST2'];
function merged(gltf: GLTF, prefix: string) {
  const parts: BufferGeometry[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    const m = o as Mesh; if (!m.isMesh) return;
    let branch = m as import('three').Object3D | null, matches = false;
    while (branch) { if (branch.name.startsWith(prefix)) matches = true; branch = branch.parent; }
    if (!matches) return;
    const src = m.geometry, mats = Array.isArray(m.material) ? m.material : [m.material];
    const geo = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(m.matrixWorld);
    const count = geo.getAttribute('position').count, col = new Float32Array(count * 3), color = new Color();
    for (const group of src.groups.length ? src.groups : [{ start: 0, count, materialIndex: 0 }]) {
      color.copy((mats[group.materialIndex ?? 0] as MeshStandardMaterial).color);
      for (let i = group.start; i < Math.min(count, group.start + group.count); i++) col.set(color.toArray(), i * 3);
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    for (const key of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', '_wind'].includes(key)) geo.deleteAttribute(key);
    if (!geo.getAttribute('_wind')) throw new Error('missing authored wind: ' + m.name);
    geo.clearGroups(); parts.push(geo);
  });
  if (!parts.length) throw new Error('missing tree LOD ' + prefix);
  const out = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return out;
}
export default function StreetTrees() {
  const files = useLoader(GLTFLoader, IDS.map(id => `/assets/world/street/${id}.glb`), loader) as GLTF[];
  const built = useMemo(() => {
    const northTrees=[[-17,1,-115],[-3,1,-116],[-24,1,-132],[-39,1,-134],[-52,1,-139],[-70,1,-139],[-104,1,-147],[-118,1,-172],[-114,1,-207],[-83,1,-209],[-62,1,-205],[5,1,-137],[15,1,-132],[32,1,-133],[89,1,-150],[93,1,-180],[77,1,-221],[43,1,-226]];
    const points = [...TREES_V4.filter(p => p[1] < 2), ...solidsV4().filter(s => s.kind === 'trunk').map(s => [s.position[0], s.position[1] - s.size[1] / 2, s.position[2]]),...northTrees];
    const placements = points.map((p, i) => ({ kind: i % 2, matrix: new Matrix4().compose(new Vector3(...p), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 2.399), new Vector3().setScalar(.91 + (i % 4) * .07)), p: new Vector3(...p), tint: new Color().setRGB(.94 + (i % 3) * .025, .95 + (i % 4) * .018, .9 + (i % 2) * .05) }));
    const meshes: InstancedMesh[] = [], clean: (() => void)[] = [];
    files.forEach((g, kind) => {
      for (const lod of [0, 1]) {
        const geo = merged(g, `L${lod}`), mat = new MeshStandardMaterial({ vertexColors: true, roughness: .93, metalness: 0, side: DoubleSide });
        const mesh = new InstancedMesh(geo, mat, placements.filter(p => p.kind === kind).length);
        mesh.name = `street-tree-${IDS[kind]}-L${lod}`; mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        mesh.userData.occluder = true; mesh.userData.streetStats = () => ({ tris: mesh.count * geo.getAttribute('position').count / 3, instances: mesh.count });
        const detach = attachNatureWind(mesh); clean.push(() => { detach(); geo.dispose(); mat.dispose(); mesh.dispose(); }); meshes.push(mesh);
      }
    });
    const colliders = placements.map((p, i) => {
      let trunk: Mesh | null = null; files[p.kind].scene.traverse(o => { if ((o as Mesh).isMesh && o.name.startsWith('L0-trunk')) trunk = o as Mesh; });
      if (!trunk) throw new Error('missing tree collision source');
      const t = trunk as Mesh, geo = t.geometry.clone().applyMatrix4(p.matrix.clone().multiply(t.matrixWorld));
      const pos = new Float32Array(geo.getAttribute('position').array), idx = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: pos.length / 3 }, (_, j) => j); geo.dispose();
      return { pos, idx, key: i };
    });
    return { placements, meshes, clean, colliders };
  }, [files]);
  useEffect(() => () => built.clean.forEach(c => c()), [built]);
  const frustum = useMemo(() => new Frustum(), []), view = useMemo(() => new Matrix4(), []), sphere = useMemo(() => new Sphere(), []);
  useFrame(({ camera }) => {
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (let k = 0; k < 2; k++) {
      const near = built.meshes[k * 2], far = built.meshes[k * 2 + 1]; near.count = 0; far.count = 0;
      for (const p of built.placements) {
        if (p.kind !== k) continue; sphere.center.copy(p.p); sphere.center.y += 3; sphere.radius = 4.5; if (!frustum.intersectsSphere(sphere)) continue; const d = p.p.distanceTo(camera.position); if (d > 140) continue;
        const m = d < 34 ? near : far; m.setMatrixAt(m.count, p.matrix); m.setColorAt(m.count, p.tint); m.count++;
      }
      for (const m of [near, far]) { m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  });
  return <group name="street-trees-group">
    {built.meshes.map(m => <primitive key={m.name} object={m} />)}
    <RigidBody type="fixed" colliders={false} name="street-tree-trunks" userData={{ solid: true, assetId: 'street-tree' }}>
      {built.colliders.map(c => <TrimeshCollider key={c.key} args={[c.pos, c.idx]} friction={.7} restitution={.02} />)}
    </RigidBody>
    <StreetClaim keys={['tree']} />
  </group>;
}
