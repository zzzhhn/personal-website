import type { BufferGeometry } from 'three';

/** Material primitives already carry the world placement used to merge the visual batches. */
export function townSurfaceCollision(parts: readonly BufferGeometry[]) {
  const vertexCount = parts.reduce((n, part) => n + part.attributes.position.count, 0);
  const indexCount = parts.reduce((n, part) => n + (part.index?.count ?? part.attributes.position.count), 0);
  const vertices = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount);
  let firstVertex = 0, firstIndex = 0;
  for (const part of parts) {
    const positions = part.attributes.position, source = part.index;
    vertices.set(positions.array, firstVertex * 3);
    const count = source?.count ?? positions.count;
    for (let i = 0; i < count; i++) indices[firstIndex + i] = (source?.getX(i) ?? i) + firstVertex;
    firstVertex += positions.count;
    firstIndex += count;
  }
  return { vertices, indices };
}

/** Flexible palm fronds and kiosk cloth keep their visible motion and do not stop actors. */
export function townMaterialContact(material: string) {
  if (material === 'palm_leaf' || material === 'palm_leaf_dark' || material.startsWith('town_canvas')) return 'soft';
  return 'solid';
}
