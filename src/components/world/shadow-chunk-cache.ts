import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { ShadowChunkBuilder, type ShadowChunkBucket } from './shadow-chunk-builder';

export type ShadowChunkSource = { id: string; version: string };
export type CachedShadowChunk = {
  geometry: BufferGeometry; side: number; cascade: 0 | 1 | 2;
  zones: Map<string, number>; lightBounds: [number, number, number, number];
};
export type ShadowChunkUpdate = {
  mode: 'none' | 'append' | 'rebuild'; added: number; removed: number; changed: number;
  builtSources: number; reusedSources: number; rebuiltChunks: number; reusedChunks: number;
};

/** Owns only final chunk geometry and small membership/bucket metadata. No saved
 * source geometry, per-source triangles or transformed-vertex cache. */
export class ShadowChunkCache {
  private versions = new Map<string, string>();
  chunks = new Map<string, CachedShadowChunk>();
  constructor(private cells: readonly [number, number, number], private right: Vector3, private up: Vector3) {}
  hasSource(id: string) { return this.versions.has(id); }

  update(sources: readonly ShadowChunkSource[], build: (id: string, builder: ShadowChunkBuilder) => void): ShadowChunkUpdate {
    const next = new Map(sources.map(s => [s.id, s.version]));
    const added = sources.filter(s => !this.versions.has(s.id));
    const removed = [...this.versions.keys()].filter(id => !next.has(id)).length;
    const changed = sources.filter(s => this.versions.has(s.id) && this.versions.get(s.id) !== s.version).length;
    const mode = !added.length && !removed && !changed ? 'none'
      : this.versions.size && !removed && !changed ? 'append' : 'rebuild';
    if (mode === 'none') return { mode, added: 0, removed: 0, changed: 0, builtSources: 0, reusedSources: sources.length, rebuiltChunks: 0, reusedChunks: this.chunks.size };

    const selected = mode === 'append' ? added : sources;
    const builder = new ShadowChunkBuilder(this.cells, this.right, this.up);
    for (const source of selected) build(source.id, builder);
    const result = mode === 'append' ? new Map(this.chunks) : new Map<string, CachedShadowChunk>();
    const created: BufferGeometry[] = [];
    try {
      for (const [key, bucket] of builder.buckets) {
        const chunk = this.makeChunk(bucket, mode === 'append' ? this.chunks.get(key) : undefined);
        created.push(chunk.geometry); result.set(key, chunk);
      }
    } catch (error) {
      created.forEach(g => g.dispose()); throw error;
    }
    let reusedChunks = 0;
    for (const [key, chunk] of this.chunks) {
      if (result.get(key) === chunk) reusedChunks++;
      else chunk.geometry.dispose();
    }
    this.chunks = result; this.versions = next;
    return { mode, added: added.length, removed, changed, builtSources: selected.length,
      reusedSources: mode === 'append' ? sources.length - selected.length : 0,
      rebuiltChunks: builder.buckets.size, reusedChunks };
  }

  private makeChunk(bucket: ShadowChunkBucket, previous?: CachedShadowChunk): CachedShadowChunk {
    const oldPosition = previous?.geometry.getAttribute('position'), oldIndex = previous?.geometry.index;
    const offset = oldPosition?.count ?? 0, [points, indices] = bucket.data;
    const positions = new Float32Array(offset * 3 + points.length);
    if (oldPosition) positions.set(oldPosition.array);
    positions.set(points, offset * 3);
    const oldCount = oldIndex?.count ?? 0;
    // Builder chunks use sequential indices. Match Three's primitive-restart
    // boundary, including exactly 65535, when an appended bucket outgrows u16.
    const index = positions.length / 3 > 65535 ? new Uint32Array(oldCount + indices.length) : new Uint16Array(oldCount + indices.length);
    if (oldIndex) index.set(oldIndex.array);
    for (let i = 0; i < indices.length; i++) index[oldCount + i] = offset + indices[i];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(index, 1)); geometry.computeBoundingSphere();
    const zones = new Map(previous?.zones);
    for (const [zone, count] of bucket.zones) zones.set(zone, (zones.get(zone) ?? 0) + count);
    const bounds: CachedShadowChunk['lightBounds'] = previous ? [...previous.lightBounds] : [Infinity, -Infinity, Infinity, -Infinity];
    const p = new Vector3();
    for (let i = offset * 3; i < positions.length; i += 3) {
      p.fromArray(positions, i);
      const r = p.dot(this.right), u = p.dot(this.up);
      bounds[0] = Math.min(bounds[0], r); bounds[1] = Math.max(bounds[1], r);
      bounds[2] = Math.min(bounds[2], u); bounds[3] = Math.max(bounds[3], u);
    }
    return { geometry, side: bucket.side, cascade: bucket.cascade, zones, lightBounds: bounds };
  }

  dispose() {
    for (const chunk of this.chunks.values()) chunk.geometry.dispose();
    this.chunks.clear(); this.versions.clear();
  }
}
