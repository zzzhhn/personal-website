import type { BufferGeometry } from 'three';

type VertexRange = { firstVertex: number; vertexCount: number };
type IndexRange = { firstIndex: number; indexCount: number };

export type KnockableContactRange = (VertexRange | IndexRange) & {
  id: string;
  collision: 'pushable' | 'none';
  surfaceId?: string;
};

export interface KnockableContactHull {
  id: string;
  points: Float32Array;
  weight?: number;
}

export interface KnockableContact {
  near: readonly KnockableContactRange[];
  far?: readonly KnockableContactRange[];
  hulls: readonly KnockableContactHull[];
}

/** Share the generator's triangle order. Each closed authored member gets its own hull. */
export function railMemberHulls(geometry: BufferGeometry, members: readonly (VertexRange & { id: string })[]): KnockableContactHull[] {
  const position = geometry.getAttribute('position');
  return members.map(({ id, firstVertex, vertexCount }) => {
    const points = new Map<string, number[]>();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = firstVertex; i < firstVertex + vertexCount; i++) {
      const p = [position.getX(i), position.getY(i), position.getZ(i)];
      points.set(p.join(','), p);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], p[axis]);
        max[axis] = Math.max(max[axis], p[axis]);
      }
    }
    // Nominal member dimensions distribute the existing total mass. The hull still uses the tapered vertices.
    const weight = max.reduce((volume, extent, axis) => volume * (extent - min[axis]), 1);
    return { id, points: new Float32Array([...points.values()].flat()), weight };
  });
}
