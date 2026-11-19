import type { BufferGeometry } from 'three';
import type { Vec3 } from '../types';

/** One authored component in an indexed rail material batch. */
export type CoasterRailPart = {
  name: string; family: string; vertexStart: number; vertexCount: number; indexStart: number; indexCount: number;
};

const CELL = 32;

/** Group complete authored pieces into local Rapier meshes. The colour draw
 * keeps its full original batch and indices. A contact cell is never a box. */
export function coasterRailPartSources(geometry: BufferGeometry, prefix: string, include: (part: CoasterRailPart) => boolean) {
  const parts = (geometry.userData.contactParts ?? geometry.userData.parts) as CoasterRailPart[];
  const positions = geometry.getAttribute('position');
  const cells = new Map<string, { at: Vec3; parts: CoasterRailPart[] }>();
  if (!geometry.index || !parts?.length) throw Error(`Rail source ranges are missing for ${prefix}`);
  let expected = 0;
  const ranges = parts.flatMap(part => {
    if (part.indexStart !== expected || part.indexCount <= 0 || part.indexCount % 3) throw Error(`Invalid rail source range ${part.name}`);
    expected += part.indexCount;
    if (!include(part)) return [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const x = Math.floor((minX + maxX) / (2 * CELL)), z = Math.floor((minZ + maxZ) / (2 * CELL));
    const surfaceId = `${prefix}:${x}:${z}`;
    if (!cells.has(surfaceId)) cells.set(surfaceId, { at: [x * CELL, 0, z * CELL], parts: [] });
    cells.get(surfaceId)!.parts.push(part);
    return [{ id: part.name, collision: 'solid', surfaceId, firstIndex: part.indexStart, indexCount: part.indexCount }] as const;
  });
  if (expected !== geometry.index.count || !ranges.length) throw Error(`Incomplete rail source for ${prefix}`);
  return { ranges, cells };
}

export function coasterRailFootingSources(geometry: BufferGeometry) {
  return coasterRailPartSources(geometry, 'coaster-rail-footing', () => true);
}

export function coasterRailSteelSources(geometry: BufferGeometry) {
  return coasterRailPartSources(geometry, 'coaster-rail-steel', () => true);
}

/** The running rails retain one continuous colour draw per rail. Use ordered
 * triangle ranges to keep the long physics path local to the park. */
export function coasterRailContactParts(geometry: BufferGeometry): CoasterRailPart[] {
  const index = geometry.index!, points = geometry.getAttribute('position');
  const output: CoasterRailPart[] = [];
  for (const part of geometry.userData.parts as CoasterRailPart[]) {
    if (part.family !== 'continuous-sweep' || part.vertexCount < 400) { output.push(part); continue; }
    let cellX = NaN, cellZ = NaN, start = part.indexStart, low = Infinity, high = -Infinity, segment = 0;
    const end = part.indexStart + part.indexCount;
    function close(at: number) {
      output.push({ name: `${part.name}-${++segment}`, family: part.family,
        vertexStart: low, vertexCount: high - low + 1, indexStart: start, indexCount: at - start });
      start = at; low = Infinity; high = -Infinity;
    }
    for (let first = start; first < end; first += 3) {
      const a = index.getX(first), b = index.getX(first + 1), c = index.getX(first + 2);
      const x = Math.floor((points.getX(a) + points.getX(b) + points.getX(c)) / (3 * CELL));
      const z = Math.floor((points.getZ(a) + points.getZ(b) + points.getZ(c)) / (3 * CELL));
      if (first > start && (x !== cellX || z !== cellZ)) close(first);
      cellX = x; cellZ = z; low = Math.min(low, a, b, c); high = Math.max(high, a, b, c);
    }
    close(end);
  }
  return output;
}

export function coasterRunningRailSources(geometry: BufferGeometry) {
  return coasterRailPartSources(geometry, 'coaster-running-rail', () => true);
}

type RailCells = ReturnType<typeof coasterRailPartSources>['cells'];

export function coasterRailContactShapes(geometry: BufferGeometry, cells: RailCells) {
  return mergeRailContactShapes([[geometry, cells]]);
}

/** The two steel finishes share the actual physical cell at each site. */
export function mergeRailContactShapes(sources: [BufferGeometry, RailCells][]) {
  const grouped = new Map<string, { at: Vec3; vertexCount: number; indexCount: number;
    sources: { geometry: BufferGeometry; parts: CoasterRailPart[] }[] }>();
  for (const [geometry,cells] of sources) {
    for (const [id, { at, parts }] of cells) {
      let group = grouped.get(id);
      if (!group) { group = { at, vertexCount: 0, indexCount: 0, sources: [] }; grouped.set(id, group); }
      group.sources.push({ geometry, parts });
      for (const part of parts) {
        group.vertexCount += part.vertexCount;
        group.indexCount += part.indexCount;
      }
    }
  }
  return [...grouped].map(([id,{ at, vertexCount, indexCount, sources: cellSources }]) => {
    const vertices = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount);
    let point = 0, face = 0;
    for (const { geometry, parts } of cellSources) {
      const positions = geometry.getAttribute('position'), index = geometry.index!;
      for (const part of parts) {
        const offset = point / 3;
        for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
          vertices[point++] = positions.getX(i) - at[0];
          vertices[point++] = positions.getY(i);
          vertices[point++] = positions.getZ(i) - at[2];
        }
        for (let i = part.indexStart; i < part.indexStart + part.indexCount; i++) {
          const local = index.getX(i) - part.vertexStart;
          if (local < 0 || local >= part.vertexCount) throw Error(`Rail contact index escaped ${part.name}`);
          indices[face++] = offset + local;
        }
      }
    }
    return { id, at, vertices, indices };
  });
}
