import { BufferAttribute, BufferGeometry } from 'three';

export type CollisionClass = 'solid' | 'pushable' | 'soft' | 'none';
export interface StaticSurface {
  id: string;
  collision: CollisionClass;
  role: 'floor' | 'enclosure' | 'decoration';
  reason: string;
  geometry: BufferGeometry;
}
const MAGIC = 0x31535742; // BWS1; all payload arrays are 32-bit and four-byte aligned.
const align = (n: number) => Math.ceil(n / 4) * 4;
function check(value: unknown): asserts value { if (!value) throw new Error('Invalid static surface asset'); }

/** Bake only supported, explicitly classified geometry. Never silently discard a
 * render attribute or infer a collision policy from a material name. */
export function encodeStaticSurfaces(surfaces: StaticSurface[], metadata: unknown): ArrayBuffer {
  const payload: (Float32Array | Uint32Array)[] = [];
  const records = surfaces.map(s => {
    check(s.geometry.groups.length === 0 && Object.keys(s.geometry.morphAttributes).length === 0);
    check(s.geometry.drawRange.start === 0 && s.geometry.drawRange.count === Infinity);
    const attributes = Object.entries(s.geometry.attributes).map(([name, a]) => {
      check(a instanceof BufferAttribute && a.array instanceof Float32Array && !a.normalized);
      payload.push(a.array);
      return { name, itemSize: a.itemSize, length: a.array.length };
    });
    const index = s.geometry.index ? Uint32Array.from(s.geometry.index.array) : new Uint32Array();
    payload.push(index);
    return { id: s.id, collision: s.collision, role: s.role, reason: s.reason, attributes, indices: index.length };
  });
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, metadata, records }));
  check(header.length <= 65536);
  const buffer = new ArrayBuffer(align(8 + header.length) + payload.reduce((n, a) => n + a.byteLength, 0));
  const view = new DataView(buffer); view.setUint32(0, MAGIC, true); view.setUint32(4, header.length, true);
  new Uint8Array(buffer, 8, header.length).set(header);
  let offset = align(8 + header.length);
  for (const a of payload) { new Uint8Array(buffer, offset, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); offset += a.byteLength; }
  // The exact production decoder is also the authoring gate, including omitted labels.
  const validated = decodeStaticSurfaces(buffer);
  validated.surfaces.forEach(s => s.geometry.dispose());
  return buffer;
}

export function decodeStaticSurfaces(buffer: ArrayBuffer): { surfaces: StaticSurface[]; metadata: unknown } {
  check(buffer.byteLength >= 12 && buffer.byteLength <= 64 * 1024 * 1024);
  const view = new DataView(buffer), size = view.getUint32(4, true);
  check(view.getUint32(0, true) === MAGIC && size <= 65536 && size + 8 <= buffer.byteLength);
  const h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 8, size)));
  check(h.version === 1 && Array.isArray(h.records) && h.records.length > 0 && h.records.length <= 256);
  let offset = align(8 + size);
  const read = (length: number, index = false) => {
    check(Number.isSafeInteger(length) && length >= 0 && offset + length * 4 <= buffer.byteLength);
    const a = index ? new Uint32Array(buffer, offset, length) : new Float32Array(buffer, offset, length);
    offset += a.byteLength; return a;
  };
  const ids = new Set<string>(), surfaces: StaticSurface[] = [];
  try {
    for (const r of h.records) {
      check(typeof r.id === 'string' && r.id.length > 0 && !ids.has(r.id)); ids.add(r.id);
      // Dynamic pushables belong in a dynamic-asset contract, never a static trimesh.
      check(['solid', 'soft', 'none'].includes(r.collision));
      check(['floor', 'enclosure', 'decoration'].includes(r.role));
      check(typeof r.reason === 'string' && r.reason.trim().length > 0);
      check(r.role === 'decoration' || r.collision === 'solid');
      check(Array.isArray(r.attributes) && r.attributes.length > 0 && r.attributes.length <= 16);
      const geometry = new BufferGeometry(), names = new Set<string>();
      surfaces.push({ id: r.id, collision: r.collision, role: r.role, reason: r.reason, geometry });
      for (const a of r.attributes) {
        check(typeof a.name === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(a.name) && !names.has(a.name)); names.add(a.name);
        check(Number.isSafeInteger(a.itemSize) && a.itemSize >= 1 && a.itemSize <= 4 && a.length > 0 && a.length % a.itemSize === 0);
        const values = read(a.length) as Float32Array;
        for (const n of values) check(Number.isFinite(n));
        geometry.setAttribute(a.name, new BufferAttribute(values, a.itemSize));
      }
      const p = geometry.getAttribute('position'); check(p && p.itemSize === 3);
      for (const a of Object.values(geometry.attributes)) check(a.count === p.count);
      const indices = read(r.indices, true) as Uint32Array;
      check((indices.length || p.count) % 3 === 0);
      for (const i of indices) check(i < p.count);
      if (indices.length) geometry.setIndex(new BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
    }
    check(offset === buffer.byteLength);
    return { surfaces, metadata: h.metadata };
  } catch (error) { surfaces.forEach(s => s.geometry.dispose()); throw error; }
}

/** Exact collider buffers from the visible geometry. The caller mounts both
 * under the same rigid body, so no separately authored transform is possible. */
export function surfaceColliderBuffers(surface: StaticSurface) {
  if (surface.collision !== 'solid') return null;
  const geometry = surface.geometry;
  return {
    vertices: geometry.getAttribute('position').array as Float32Array,
    indices: geometry.index ? geometry.index.array as Uint32Array : Uint32Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i),
  };
}

/** Local-space vertical survey. A bounded ray, not a height-field: starting in
 * the cave and casting up finds its ceiling; casting down finds its floor.
 * Return source identity and original triangle for contact-scan provenance. */
export function castStaticSurface(surfaces: StaticSurface[], x: number, y: number, z: number, direction: -1 | 1, distance: number, role?: StaticSurface['role']) {
  if (![x, y, z, distance].every(Number.isFinite) || distance < 0 || (direction !== -1 && direction !== 1)) return null;
  let result: { id: string; role: StaticSurface['role']; triangle: number; height: number; normalY: number; distance: number } | null = null;
  for (const s of surfaces) {
    if (s.collision !== 'solid' || (role && s.role !== role)) continue;
    const p = s.geometry.getAttribute('position'), idx = s.geometry.index, count = idx?.count ?? p.count;
    for (let k = 0; k < count; k += 3) {
      const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, c = idx ? idx.getX(k + 2) : k + 2;
      const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b) - ax, bz = p.getZ(b) - az, cx = p.getX(c) - ax, cz = p.getZ(c) - az;
      const det = bx * cz - bz * cx; if (Math.abs(det) < 1e-12) continue;
      const u = ((x - ax) * cz - (z - az) * cx) / det, v = (bx * (z - az) - bz * (x - ax)) / det;
      if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
      const by = p.getY(b) - p.getY(a), cy = p.getY(c) - p.getY(a), height = p.getY(a) + u * by + v * cy;
      const t = (height - y) * direction;
      if (t < 0 || t > distance || (result && t >= result.distance)) continue;
      const ny = -det, nx = by * cz - bz * cy, nz = bx * cy - by * cx;
      result = { id: s.id, role: s.role, triangle: k / 3, height, normalY: ny / Math.hypot(nx, ny, nz), distance: t };
    }
  }
  return result;
}
