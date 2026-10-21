import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Matrix4, Quaternion, Vector2, Vector3, type Object3D, type Mesh, type InstancedMesh } from 'three';
import { useWorldStore } from './store';

/** Drawing-buffer quality is based on the canvas size, with a bounded pixel budget.
 * A small high-quality canvas is supersampled to 1080 lines where the 2x cap allows it.
 * The debug API reports the actual result, never a marketing resolution label. */
export function useWorldResolution() {
  const { size, setDpr } = useThree();
  const quality = useWorldStore(s => s.quality);
  useEffect(() => {
    if (!size.width || !size.height) return;
    const high = quality === 'high';
    const budget = high ? 2560 * 1440 : 1920 * 1080;
    const desired = high ? Math.max(window.devicePixelRatio, 1080 / size.height) : window.devicePixelRatio;
    setDpr(Math.min(high ? 2 : 1.5, desired, Math.sqrt(budget / (size.width * size.height))));
  }, [size.width, size.height, quality, setDpr]);
}

export function objectIdentity(object?: Object3D, bodyData?: unknown) {
  let name: string | null = null, assetId: string | null = null;
  const data = { ...(bodyData as Record<string, unknown> | undefined) };
  for (let o = object; o; o = o.parent ?? undefined) {
    name ??= o.name || null;
    assetId ??= o.userData.assetId ?? null;
    Object.assign(data, o.userData);
  }
  return { name, assetId, kind: data.surface ? 'surface' : (data.vehicleId || data.vehicle) ? 'vehicle' : data.obstacle ? 'obstacle' : data.solid ? 'solid' : 'unknown' };
}
const aabb = (box: Box3) => ({ min: box.min.toArray(), max: box.max.toArray() });

/** Read-only QA geometry listing. This lists source visual primitives individually; it does
 * not claim their whole AABB is solid (tents have openings; trees collide only at the trunk). */
export function visualInventory(scene: Object3D) {
  const entries: unknown[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const meta = objectIdentity(mesh);
    if (meta.kind !== 'solid') return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return;
    const instanced = mesh as InstancedMesh;
    const instances: { aabb: ReturnType<typeof aabb> }[] = [];
    if (instanced.isInstancedMesh) {
      const matrix = new Matrix4();
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
        instances.push({ aabb: aabb(box.clone().applyMatrix4(matrix)) });
      }
    }
    entries.push({ ...meta, name: mesh.name || meta.name, solid: true, semantic: mesh.userData.semantic ?? null,
      aabb: aabb(box.clone().applyMatrix4(mesh.matrixWorld)), ...(instances.length ? { instances } : {}) });
  });
  return entries;
}

/** Shape-specific bounds for QA only. Indexed geometry uses referenced vertices, excluding
 * unused tent ropes/stakes that happen to share the GLB source vertex buffer. */
export function colliderBounds(shape: { vertices?: Float32Array; indices?: Uint32Array | null; halfExtents?: { x: number; y: number; z: number }; radius?: number; halfHeight?: number; type: number }, translation: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number; w: number }, capsule = false) {
  const box = new Box3(), p = new Vector3();
  const matrix = new Matrix4().compose(new Vector3(translation.x, translation.y, translation.z), new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), new Vector3(1, 1, 1));
  if (shape.vertices) {
    const vertices = shape.vertices;
    const indices = shape.indices ?? Array.from({ length: vertices.length / 3 }, (_, i) => i);
    for (const i of indices) box.expandByPoint(p.fromArray(vertices, i * 3).applyMatrix4(matrix));
  } else {
    const r = shape.radius ?? 0;
    const h = shape.halfExtents ?? { x: r, y: (shape.halfHeight ?? 0) + (capsule || !shape.halfHeight ? r : 0), z: r };
    for (let i = 0; i < 8; i++) box.expandByPoint(p.set((i & 1 ? 1 : -1) * h.x, (i & 2 ? 1 : -1) * h.y, (i & 4 ? 1 : -1) * h.z).applyMatrix4(matrix));
  }
  return aabb(box);
}
export const renderSize = new Vector2();
