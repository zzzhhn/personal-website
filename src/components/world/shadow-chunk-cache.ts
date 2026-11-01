import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { ShadowChunkBuilder, type ShadowChunkBucket } from './shadow-chunk-builder';
import type { ShadowChunkStage } from './shadow-chunk-stages';

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
  private revision = 0;
  chunks = new Map<string, CachedShadowChunk>();
  constructor(private cells: readonly [number, number, number], private right: Vector3, private up: Vector3) {}
  hasSource(id: string) { return this.versions.has(id); }
  matches(sources: readonly ShadowChunkSource[]) {
    const next = new Map(sources.map(s => [s.id, s.version]));
    return [...this.versions].every(([id, version]) => next.get(id) === version);
  }

  update(sources: readonly ShadowChunkSource[], build: (id: string, builder: ShadowChunkBuilder) => void): ShadowChunkUpdate {
    const job = this.updateSteps(sources, function* (id, builder) { build(id, builder); });
    let step = job.next();
    while (!step.done) step = job.next();
    return step.value!;
  }

  /** Transactional: yielding never changes the published cache. return() frees
   * staged geometry; a stale revision or failed validation cannot publish. */
  *updateSteps(sources: readonly ShadowChunkSource[], build: (id: string, builder: ShadowChunkBuilder) => Generator<ShadowChunkStage>, valid = () => true): Generator<ShadowChunkStage, ShadowChunkUpdate | null> {
    const revision = this.revision;
    const next = new Map(sources.map(s => [s.id, s.version]));
    const added = sources.filter(s => !this.versions.has(s.id));
    const removed = [...this.versions.keys()].filter(id => !next.has(id)).length;
    const changed = sources.filter(s => this.versions.has(s.id) && this.versions.get(s.id) !== s.version).length;
    const mode = !added.length && !removed && !changed ? 'none'
      : this.versions.size && !removed && !changed ? 'append' : 'rebuild';
    if (mode === 'none') return { mode, added: 0, removed: 0, changed: 0, builtSources: 0, reusedSources: sources.length, rebuiltChunks: 0, reusedChunks: this.chunks.size };

    const selected = mode === 'append' ? added : sources;
    const builder = new ShadowChunkBuilder(this.cells, this.right, this.up);
    const result = mode === 'append' ? new Map(this.chunks) : new Map<string, CachedShadowChunk>();
    const created: BufferGeometry[] = [];
    let committed = false;
    try {
      for (const source of selected) { yield* build(source.id, builder); yield 'source'; }
      for (const [key, bucket] of builder.buckets) {
        const chunk = yield* this.makeChunk(bucket, mode === 'append' ? this.chunks.get(key) : undefined);
        created.push(chunk.geometry); result.set(key, chunk);
        // Drop numeric scratch as soon as its final typed buffers exist.
        bucket.data[0].length = 0; bucket.data[1].length = 0;
        yield 'buffer';
      }
      if (revision !== this.revision || !valid()) return null;
      let reusedChunks = 0;
      for (const [key, chunk] of this.chunks) {
        if (result.get(key) === chunk) reusedChunks++;
        else chunk.geometry.dispose();
      }
      this.chunks = result; this.versions = next; this.revision++; committed = true;
      return { mode, added: added.length, removed, changed, builtSources: selected.length,
        reusedSources: mode === 'append' ? sources.length - selected.length : 0,
        rebuiltChunks: builder.buckets.size, reusedChunks };
    } finally {
      if (!committed) created.forEach(g => g.dispose());
      builder.buckets.clear();
    }
  }

  private *makeChunk(bucket: ShadowChunkBucket, previous?: CachedShadowChunk): Generator<ShadowChunkStage, CachedShadowChunk> {
    const oldPosition = previous?.geometry.getAttribute('position'), oldIndex = previous?.geometry.index;
    const offset = oldPosition?.count ?? 0, [points, indices] = bucket.data;
    const positions = new Float32Array(offset * 3 + points.length);
    for (let i = 0; i < positions.length; i++) {
      positions[i] = i < offset * 3 ? oldPosition!.array[i] : points[i - offset * 3];
      if ((i + 1) % 4096 === 0) yield 'buffer';
    }
    const oldCount = oldIndex?.count ?? 0;
    // Builder chunks use sequential indices. Match Three's primitive-restart
    // boundary, including exactly 65535, when an appended bucket outgrows u16.
    const index = positions.length / 3 > 65535 ? new Uint32Array(oldCount + indices.length) : new Uint16Array(oldCount + indices.length);
    for (let i = 0; i < index.length; i++) {
      index[i] = i < oldCount ? oldIndex!.array[i] : offset + indices[i - oldCount];
      if ((i + 1) % 4096 === 0) yield 'buffer';
    }
    yield 'buffer';
    const zones = new Map(previous?.zones);
    for (const [zone, count] of bucket.zones) zones.set(zone, (zones.get(zone) ?? 0) + count);
    const bounds: CachedShadowChunk['lightBounds'] = previous ? [...previous.lightBounds] : [Infinity, -Infinity, Infinity, -Infinity];
    const p = new Vector3(), min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < positions.length; i += 3) {
      p.fromArray(positions, i);
      min.min(p); max.max(p);
      if (i >= offset * 3) {
        const r = p.dot(this.right), u = p.dot(this.up);
        bounds[0] = Math.min(bounds[0], r); bounds[1] = Math.max(bounds[1], r);
        bounds[2] = Math.min(bounds[2], u); bounds[3] = Math.max(bounds[3], u);
      }
      if ((i + 3) % 3072 === 0) yield 'bounds';
    }
    const center = min.add(max).multiplyScalar(.5);
    let radiusSq = 0;
    for (let i = 0; i < positions.length; i += 3) {
      radiusSq = Math.max(radiusSq, p.fromArray(positions, i).distanceToSquared(center));
      if ((i + 3) % 3072 === 0) yield 'bounds';
    }
    yield 'bounds';
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.boundingSphere = new Sphere(center, Math.sqrt(radiusSq));
    return { geometry, side: bucket.side, cascade: bucket.cascade, zones, lightBounds: bounds };
  }

  dispose() {
    this.revision++;
    for (const chunk of this.chunks.values()) chunk.geometry.dispose();
    this.chunks.clear(); this.versions.clear();
  }
}
