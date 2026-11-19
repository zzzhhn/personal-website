import type { BufferGeometry } from 'three';

/** The plaque's five material primitives have already received the same world
 * placement as the visual batch. Copy positions and indices for its one collider. */
export function townPlaqueCollision(parts: readonly BufferGeometry[]) {
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
