import type { BufferGeometry } from 'three';
import type { Vec3 } from '../types';

/** One authored component in an indexed rail material batch. */
export type CoasterRailPart = {
  name: string; family: string; vertexStart: number; vertexCount: number; indexStart: number; indexCount: number;
};

const CELL = 32;
const FOOTING_ID = 'coaster-rail-footing';

/** Group complete authored pieces into local Rapier meshes. The colour draw
 * keeps its full original batch and indices. A contact cell is never a box. */
export function coasterRailFootingSources(geometry: BufferGeometry) {
  const parts = geometry.userData.parts as CoasterRailPart[];
  const positions = geometry.getAttribute('position');
  const cells = new Map<string, { at: Vec3; parts: CoasterRailPart[] }>();
  if (!geometry.index || !parts?.length) throw Error('Rail footing source ranges are missing');
  let expected = 0;
  const ranges = parts.map(part => {
    if (part.indexStart !== expected || part.indexCount <= 0 || part.indexCount % 3 ||
        (part.family !== 'footing' && part.family !== 'base-node')) throw Error(`Invalid footing source range ${part.name}`);
    expected += part.indexCount;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const x = Math.floor((minX + maxX) / (2 * CELL)), z = Math.floor((minZ + maxZ) / (2 * CELL));
    const surfaceId = `${FOOTING_ID}:${x}:${z}`;
    if (!cells.has(surfaceId)) cells.set(surfaceId, { at: [x * CELL, 0, z * CELL], parts: [] });
    cells.get(surfaceId)!.parts.push(part);
    return { id: part.name, collision: 'solid', surfaceId, firstIndex: part.indexStart, indexCount: part.indexCount } as const;
  });
  if (expected !== geometry.index.count) throw Error('Incomplete rail footing source');
  return { ranges, cells };
}

export function coasterRailFootingShapes(geometry: BufferGeometry, cells: ReturnType<typeof coasterRailFootingSources>['cells']) {
  const positions = geometry.getAttribute('position'), index = geometry.index!;
  return [...cells].map(([id, { at, parts }]) => {
    const vertices: number[] = [], indices: number[] = [];
    for (const part of parts) {
      const offset = vertices.length / 3;
      for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
        vertices.push(positions.getX(i) - at[0], positions.getY(i), positions.getZ(i) - at[2]);
      }
      for (let i = part.indexStart; i < part.indexStart + part.indexCount; i++) {
        const local = index.getX(i) - part.vertexStart;
        if (local < 0 || local >= part.vertexCount) throw Error(`Rail footing index escaped ${part.name}`);
        indices.push(offset + local);
      }
    }
    return { id, at, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  });
}
