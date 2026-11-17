import type { Terrain } from './WorldLandform';

export type TerrainVariant = 'v3' | 'v4';
export interface TerrainGrid { minX: number; minZ: number; nx: number; nz: number }
export interface TerrainArtifact { terrain: Terrain; grid: TerrainGrid; cell: number; variant: TerrainVariant }
const MAGIC = 0x31545742; // BWT1, little endian
const fields = ['positions', 'indices', 'surface', 'solid', 'nodeHeight', 'cellDiag', 'vertexOf', 'kind', 'start', 'count', 'corners'] as const;
const constructors = [Float32Array, Uint32Array, Uint32Array, Uint32Array, Float32Array, Uint8Array, Int32Array, Uint8Array, Int32Array, Int32Array, Int32Array] as const;
const align = (n: number) => Math.ceil(n / 4) * 4;

/** Preserve float bits, NaN lattice holes and signed sentinel indices without JSON conversion. */
export function encodeTerrainArtifact(artifact: TerrainArtifact): ArrayBuffer {
  const { terrain: t, grid, cell, variant } = artifact;
  const arrays = [t.positions, t.indices, t.surface, t.solid, t.nodeHeight, t.cellDiag, t.vertexOf, t.blocks.kind, t.blocks.start, t.blocks.count, t.blocks.corners];
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, variant, grid, cell,
    seawall: t.seawall, NB: t.blocks.NB, MB: t.blocks.MB, stats: { ...t.stats, buildMs: 0 }, lengths: arrays.map(a => a.length) }));
  const buffer = new ArrayBuffer(align(8 + header.length) + arrays.reduce((n, a) => n + align(a.byteLength), 0));
  const view = new DataView(buffer); view.setUint32(0, MAGIC, true); view.setUint32(4, header.length, true);
  new Uint8Array(buffer, 8, header.length).set(header);
  let offset = align(8 + header.length);
  for (const a of arrays) { new Uint8Array(buffer, offset, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); offset += align(a.byteLength); }
  return buffer;
}

export function decodeTerrainArtifact(buffer: ArrayBuffer, variant: TerrainVariant): TerrainArtifact {
  const fail = () => { throw new Error('Invalid built terrain artifact'); };
  if (buffer.byteLength < 12 || buffer.byteLength > 128 * 1024 * 1024) fail();
  const view = new DataView(buffer), headerLength = view.getUint32(4, true);
  if (view.getUint32(0, true) !== MAGIC || headerLength > 16384 || headerLength + 8 > buffer.byteLength) fail();
  const h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 8, headerLength)));
  if (h.version !== 1 || h.variant !== variant || h.cell !== .5 || !h.grid ||
    !Number.isFinite(h.grid.minX) || !Number.isFinite(h.grid.minZ) ||
    !Number.isInteger(h.grid.nx) || !Number.isInteger(h.grid.nz) || h.grid.nx <= 0 || h.grid.nz <= 0 ||
    h.NB !== h.grid.nx / 4 || h.MB !== h.grid.nz / 4 ||
    !Array.isArray(h.lengths) || h.lengths.length !== fields.length) fail();
  let offset = align(8 + headerLength);
  const arrays = constructors.map((Ctor, i) => {
    const length = h.lengths[i];
    if (!Number.isSafeInteger(length) || length < 0 || offset + length * Ctor.BYTES_PER_ELEMENT > buffer.byteLength) fail();
    const a = new Ctor(buffer, offset, length); offset += align(a.byteLength); return a;
  });
  if (offset !== buffer.byteLength) fail();
  const [positions, indices, surface, solid, nodeHeight, cellDiag, vertexOf, kind, start, count, corners] = arrays;
  const vertices = positions.length / 3, nodes = (h.grid.nx + 1) * (h.grid.nz + 1), blocks = h.NB * h.MB;
  if (!Number.isInteger(vertices) || !vertices || indices.length % 3 || surface.length % 3 || solid.length % 3 ||
    surface.length + solid.length !== indices.length || nodeHeight.length !== nodes || vertexOf.length !== nodes ||
    cellDiag.length !== h.grid.nx * h.grid.nz || kind.length !== blocks || start.length !== blocks || count.length !== blocks || corners.length !== blocks * 4) fail();
  for (const n of positions) if (!Number.isFinite(n)) fail();
  for (const a of [indices, surface, solid]) for (const n of a) if (n >= vertices) fail();
  for (const n of vertexOf) if (n < -1 || n >= vertices) fail();
  for (const n of corners) if (n < -1 || n >= vertices) fail();
  for (const n of cellDiag) if (n > 3) fail();
  for (let i = 0; i < blocks; i++) if (kind[i] > 3 || start[i] < 0 || count[i] < 0 || start[i] % 3 || count[i] % 3 || start[i] + count[i] > indices.length) fail();
  if (!h.seawall || ![h.seawall.start, h.seawall.end].every(a => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite)) ||
    h.stats?.triangles !== indices.length / 3 || h.stats?.surfaceTriangles !== surface.length / 3 || h.stats?.solidTriangles !== solid.length / 3) fail();
  return { variant, grid: h.grid, cell: h.cell, terrain: {
    positions, indices, surface, solid, nodeHeight, cellDiag, vertexOf,
    blocks: { NB: h.NB, MB: h.MB, kind, start, count, corners }, seawall: h.seawall, stats: h.stats,
  } as Terrain };
}

let installed: TerrainArtifact | null = null;
export function installTerrainArtifact(artifact: TerrainArtifact) { installed = artifact; }
export function requireTerrainArtifact(variant: TerrainVariant, grid: TerrainGrid, cell: number): Terrain {
  if (!installed || installed.variant !== variant || installed.cell !== cell ||
    (['minX', 'minZ', 'nx', 'nz'] as const).some(k => installed!.grid[k] !== grid[k])) {
    throw new Error('Built terrain must be loaded before the world runtime');
  }
  return installed.terrain;
}
