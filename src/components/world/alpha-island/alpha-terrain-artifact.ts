import type { AlphaTerrainData } from './alpha-terrain';

const MAGIC = 0x31415442; // BTA1, little endian
const align = (n: number) => Math.ceil(n / 4) * 4;
const constructors = [Float32Array, Uint32Array, Uint32Array, Uint32Array] as const;
/** The surveyed local grid and triangle order are part of the surface-query contract. */
export function encodeAlphaTerrain(data: AlphaTerrainData): ArrayBuffer {
  const arrays = [data.positions, data.indices, data.surface, data.solid];
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, region: 'alpha', nx: data.nx, nz: data.nz, lengths: arrays.map(a => a.length) }));
  const buffer = new ArrayBuffer(align(8 + header.length) + arrays.reduce((n, a) => n + a.byteLength, 0));
  const view = new DataView(buffer); view.setUint32(0, MAGIC, true); view.setUint32(4, header.length, true);
  new Uint8Array(buffer, 8, header.length).set(header);
  let offset = align(8 + header.length);
  for (const a of arrays) { new Uint8Array(buffer, offset, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); offset += a.byteLength; }
  return buffer;
}

export function decodeAlphaTerrain(buffer: ArrayBuffer): AlphaTerrainData {
  const fail = () => { throw new Error('Invalid Alpha terrain artifact'); };
  if (buffer.byteLength < 12 || buffer.byteLength > 16 * 1024 * 1024) fail();
  const view = new DataView(buffer), size = view.getUint32(4, true);
  if (view.getUint32(0, true) !== MAGIC || size > 4096 || size + 8 > buffer.byteLength) fail();
  const h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 8, size)));
  if (h.version !== 1 || h.region !== 'alpha' || h.nx !== Math.ceil(196 / 1.5) || h.nz !== Math.ceil(228 / 1.5) || !Array.isArray(h.lengths) || h.lengths.length !== 4) fail();
  let offset = align(8 + size);
  const arrays = constructors.map((Ctor, i) => {
    const length = h.lengths[i];
    if (!Number.isSafeInteger(length) || length < 0 || offset + length * 4 > buffer.byteLength) fail();
    const array = new Ctor(buffer, offset, length); offset += array.byteLength; return array;
  });
  const [positions, indices, surface, solid] = arrays, nodes = (h.nx + 1) * (h.nz + 1);
  if (offset !== buffer.byteLength || positions.length !== nodes * 3 || indices.length !== h.nx * h.nz * 6 || surface.length % 3 || solid.length % 3 || surface.length + solid.length !== indices.length) fail();
  for (const n of positions) if (!Number.isFinite(n)) fail();
  for (let j = 0; j <= h.nz; j++) for (let i = 0; i <= h.nx; i++) {
    const k = (j * (h.nx + 1) + i) * 3;
    if (positions[k] !== Math.fround(-98 + i * 196 / h.nx) || positions[k + 2] !== Math.fround(-114 + j * 228 / h.nz)) fail();
  }
  for (const array of [surface, solid]) for (const n of array) if (n >= nodes) fail();
  for (let j = 0; j < h.nz; j++) for (let i = 0; i < h.nx; i++) {
    const a = j * (h.nx + 1) + i, k = (j * h.nx + i) * 6;
    const expected = [a, a + h.nx + 1, a + 1, a + 1, a + h.nx + 1, a + h.nx + 2];
    if (expected.some((value, n) => indices[k + n] !== value)) fail();
  }
  return { positions, indices, surface, solid, nx: h.nx, nz: h.nz } as AlphaTerrainData;
}

let installed: AlphaTerrainData | null = null;
export function installAlphaTerrain(data: AlphaTerrainData) { installed = data; }
export function requireAlphaTerrain(): AlphaTerrainData {
  if (!installed) throw new Error('Built Alpha terrain must be loaded before the world runtime');
  return installed;
}
