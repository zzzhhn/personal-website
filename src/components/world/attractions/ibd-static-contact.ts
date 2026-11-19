import type { Builder } from '../WorldStreetGeometry.ts';

export type IbdContactSurface = {
  id: string; firstIndex: number; indexCount: number;
  vertices: Float32Array; indices: Uint32Array;
};

/** Preserve the source triangle order and exact float32 positions. Intern
 * coincident positions so Rapier can recognise internal edges across faces. */
export function ibdTriangleContact(builder: Builder, id: string, firstIndex: number, endIndex = builder.idx.length): IbdContactSurface {
  const vertices: number[] = [], indices = new Uint32Array(endIndex - firstIndex);
  const seen = new Map<string, number>();
  for (let i = firstIndex; i < endIndex; i++) {
    const source = builder.idx[i] * 3;
    const x = Math.fround(builder.pos[source]), y = Math.fround(builder.pos[source + 1]), z = Math.fround(builder.pos[source + 2]);
    const key = `${x},${y},${z}`;
    let index = seen.get(key);
    if (index === undefined) {
      index = vertices.length / 3;
      seen.set(key, index);
      vertices.push(x, y, z);
    }
    indices[i - firstIndex] = index;
  }
  return { id: `ibd-${id}`, firstIndex, indexCount: indices.length, vertices: new Float32Array(vertices), indices };
}

export type IbdContactSource = (id: string, firstIndex: number) => void;

export function mergeIbdTriangleContacts(parts: readonly Pick<IbdContactSurface, 'vertices' | 'indices'>[]) {
  const vertices = new Float32Array(parts.reduce((length, part) => length + part.vertices.length, 0));
  const indices = new Uint32Array(parts.reduce((length, part) => length + part.indices.length, 0));
  let vertexOffset = 0, indexOffset = 0;
  for (const part of parts) {
    vertices.set(part.vertices, vertexOffset);
    for (const index of part.indices) indices[indexOffset++] = index + vertexOffset / 3;
    vertexOffset += part.vertices.length;
  }
  return { vertices, indices };
}
