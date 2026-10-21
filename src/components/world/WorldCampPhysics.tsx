import { useEffect, useMemo } from 'react';
import { AnyCollider, ConvexHullCollider, CuboidCollider, RigidBody, useRapier } from '@react-three/rapier';
import { Box3, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Vec3 } from './types';

/** Collision for the camp slice, derived from the same GLB geometry and the same placement
 * matrices that drive rendering, so an updated model or placement can never drift from its
 * collider. Every shape is authored in GLB-local space and transformed by the instance matrix. */

type LocalShape =
  | { kind: 'hull'; part: string; points: Float32Array }
  | { kind: 'trimesh'; part: string; vertices: Float32Array; indices: Uint32Array };
export interface CampColliderRecord { id: string; key: string; instance?: number; label?: string; part: string; kind: LocalShape['kind']; aabb: { min: Vec3; max: Vec3 } }

const registry = new Map<string, CampColliderRecord>();
/** QA-only listing (exposed by WorldRuntime behind ?qa=1). */
export const campColliderRecords = () => [...registry.values()];

const ancestors = (object: Object3D, root: Object3D) => {
  const names: string[] = [];
  for (let node: Object3D | null = object; node && node !== root; node = node.parent) if (node.name) names.push(node.name);
  return names;
};

/** Exact static mesh for rigid authored parts. A whole-object convex hull would bridge
 * the empty space below benches, between fire-ring stones and inside shelves. */
function staticMesh(gltf: GLTF, part: string, match: (names: string[], mesh: Mesh) => boolean): LocalShape[] | null {
  const vertices: number[] = [], indices: number[] = [], p = new Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !match(ancestors(mesh, gltf.scene), mesh)) return;
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, offset = vertices.length / 3;
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); vertices.push(p.x, p.y, p.z); }
    for (let i = 0; i < (index?.count ?? pos.count); i++) indices.push(offset + (index ? index.getX(i) : i));
  });
  return indices.length ? [{ kind: 'trimesh', part, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }] : null;
}

/** Recover authored closed foliage cores from their shared geometric edges. GLB material
 * primitives are not clumps: a single green material can span both separated bushes. Leaf
 * blades have nonzero flutter weights and are excluded from the rigid core. */
function foliageCores(gltf: GLTF) {
  const points: number[][] = [], parent: number[] = [], keys = new Map<string, number>();
  const root = (n: number): number => { while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; } return n; };
  const point = new Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position'), wind = mesh.geometry.getAttribute('_wind'), index = mesh.geometry.index;
    if (!wind) return;
    const add = (i: number) => {
      point.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const key = point.toArray().map(v => Math.round(v * 1e4)).join(',');
      let id = keys.get(key);
      if (id === undefined) { id = points.length; keys.set(key, id); parent.push(id); points.push(point.toArray()); }
      return id;
    };
    for (let n = 0; n < (index?.count ?? pos.count); n += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(n + j) : n + j);
      if (ids.some(i => wind.getZ(i) > .001)) continue;
      const v = ids.map(add); parent[root(v[1])] = root(v[0]); parent[root(v[2])] = root(v[0]);
    }
  });
  const groups = new Map<number, number[][]>();
  points.forEach((p, i) => { const r = root(i), list = groups.get(r) ?? []; list.push(p); groups.set(r, list); });
  return [...groups.values()].filter(list => list.length >= 4).map(list => {
    const center = [0, 1, 2].map(k => list.reduce((sum, p) => sum + p[k], 0) / list.length);
    // A 6 cm horizontal rim absorbs the nearest soft leaves. No vertical lift or scaling.
    return new Float32Array(list.flatMap(p => {
      const dx = p[0] - center[0], dz = p[2] - center[2], d = Math.hypot(dx, dz) || 1;
      return [p[0] + dx / d * .06, p[1], p[2] + dz / d * .06];
    }));
  });
}

const all = () => true;

/** Per-asset recipe. Returns null when the GLB lacks the structure a recipe needs, so the caller
 * keeps the conservative greybox collider and logs instead of silently passing. */
export function campShapes(id: string, gltf: GLTF): LocalShape[] | null {
  const hull = (part: string, points: Float32Array): LocalShape | null => points.length >= 12 ? { kind: 'hull', part, points } : null;
  const shapes = (list: (LocalShape | null)[]) => { const ok = list.filter((s): s is LocalShape => !!s); return ok.length === list.length ? ok : null; };
  switch (id) {
    case 'C03': case 'C04': {
      // camp-tent-shell-v2: exact closed canvas shell (walls, roof, gathered curtains) with a
      // real door opening, authored by the shelters generator in the same local frame.
      const root = gltf.scene.getObjectByName(id);
      const data = root?.userData as { collisionSchema?: string; collisionVertices?: number[]; collisionIndices?: number[] } | undefined;
      if (data?.collisionSchema !== 'camp-tent-shell-v2' || !data.collisionVertices?.length || !data.collisionIndices?.length) return null;
      return [{ kind: 'trimesh', part: 'shell', vertices: new Float32Array(data.collisionVertices), indices: new Uint32Array(data.collisionIndices) }];
    }
    case 'C07': return staticMesh(gltf, 'desk-and-stool', all);
    case 'C10': return staticMesh(gltf, 'pole-and-base', n => n.includes('C10_pole'));
    case 'G16': case 'G17': case 'G18':
      return staticMesh(gltf, 'trunk', n => n.includes('trunk'));
    case 'G19': case 'G20': {
      const cores = foliageCores(gltf);
      return cores.length ? shapes(cores.map((points, i) => hull(`foliage-core-${i}`, points))) : null;
    }
    case 'C05': case 'C06': case 'C08': case 'C09': case 'G21': case 'G22': case 'G23':
      return staticMesh(gltf, 'body', all);
    default:
      return null;
  }
}

const transformPoints = (points: Float32Array, matrix: Matrix4) => {
  const out = new Float32Array(points.length), v = new Vector3();
  for (let i = 0; i < points.length; i += 3) { v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(matrix); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
};
const boundsOf = (points: Float32Array) => {
  const box = new Box3();
  for (let i = 0; i < points.length; i += 3) box.expandByPoint(new Vector3(points[i], points[i + 1], points[i + 2]));
  return { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 };
};

/** Fixed body per asset group; collider vertices are pre-transformed to world space by the
 * exact render matrices. userData carries solid + assetId for vehicle impacts and QA contacts. */
export function CampColliders({ id, label, shapes, matrices }: { id: string; label: string; shapes: LocalShape[]; matrices: Matrix4[] }) {
  const { rapier } = useRapier();
  const built = useMemo(() => matrices.flatMap((matrix, instance) => shapes.map((shape, n) => {
    const key = `camp-collider-${id}-${label}-${instance}-${shape.part}-${n}`;
    return shape.kind === 'hull'
      ? { key, instance, part: shape.part, kind: shape.kind, points: transformPoints(shape.points, matrix) }
      : { key, instance, part: shape.part, kind: shape.kind, points: transformPoints(shape.vertices, matrix), indices: shape.indices };
  })), [id, label, shapes, matrices]);
  useEffect(() => {
    built.forEach(b => registry.set(b.key, { id, key: b.key, instance: b.instance, label, part: b.part, kind: b.kind, aabb: boundsOf(b.kind === 'trimesh' && b.indices ? new Float32Array(Array.from(b.indices).flatMap(i => Array.from(b.points.slice(i * 3, i * 3 + 3)))) : b.points) }));
    return () => built.forEach(b => registry.delete(b.key));
  }, [built, id, label]);
  const userData = useMemo(() => ({ solid: true, assetId: id }), [id]);
  return <RigidBody type="fixed" colliders={false} name={`camp-body-${id}-${label}`} userData={userData}>
    {built.map(b => b.kind === 'hull'
      ? <ConvexHullCollider key={b.key} name={b.key} args={[b.points]} friction={0.65} restitution={0.1} />
      // Static trimesh keeps the door opening (a hull would fill it); internal-edge fixing avoids
      // snagging on the shell's interior triangle seams.
      : <AnyCollider key={b.key} name={b.key} shape="trimesh" friction={0.6} restitution={0.05}
        args={[b.points, b.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array, Uint32Array]} />)}
  </RigidBody>;
}

/** Greybox box colliders: used while a GLB loads, when it fails, or when a recipe is missing.
 * Named camp-greybox-collider-* so QA never mistakes them for fitted shapes. */
export function BlockColliders({ id, blocks }: { id: string; blocks: { position: Vec3; size: Vec3; rotation?: Vec3 }[] }) {
  const userData = useMemo(() => ({ solid: true, assetId: id }), [id]);
  useEffect(() => {
    const keys = blocks.map((b, i) => {
      const key = `camp-greybox-collider-${id}-${i}`;
      const h = b.size.map(v => v / 2);
      registry.set(key, { id, key, part: 'greybox', kind: 'hull', aabb: { min: [b.position[0] - h[0], b.position[1] - h[1], b.position[2] - h[2]], max: [b.position[0] + h[0], b.position[1] + h[1], b.position[2] + h[2]] } });
      return key;
    });
    return () => keys.forEach(k => registry.delete(k));
  }, [blocks, id]);
  return <RigidBody type="fixed" colliders={false} name={`camp-greybox-body-${id}`} userData={userData}>
    {blocks.map((b, i) => <CuboidCollider key={i} name={`camp-greybox-collider-${id}-${i}`} position={b.position} rotation={b.rotation}
      args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]} friction={0.65} restitution={0.15} />)}
  </RigidBody>;
}
