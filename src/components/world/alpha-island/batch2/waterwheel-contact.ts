import { surfaceColliderBuffers } from '../../static-surface-asset';
import type { WaterwheelPart } from './waterwheel-artifact';

/** Draw the original materials and share one collider at their common pivot. */
export function waterwheelArticulatedSurface(parts: readonly WaterwheelPart[]): [Float32Array, Uint32Array] {
  const buffers = parts.map(part => {
    const buffer = surfaceColliderBuffers(part);
    if (!buffer) throw new Error(`Missing solid waterwheel part: ${part.id}`);
    return buffer;
  });
  const vertices = new Float32Array(buffers.reduce((n, p) => n + p.vertices.length, 0));
  const indices = new Uint32Array(buffers.reduce((n, p) => n + p.indices.length, 0));
  let vertexOffset = 0, indexOffset = 0;
  for (const part of buffers) {
    vertices.set(part.vertices, vertexOffset);
    for (const index of part.indices) indices[indexOffset++] = index + vertexOffset / 3;
    vertexOffset += part.vertices.length;
  }
  return [vertices, indices];
}
