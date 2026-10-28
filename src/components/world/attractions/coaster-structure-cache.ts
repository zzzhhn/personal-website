import type { createCoasterStructure } from './coaster-geometry';
type Structure = ReturnType<typeof createCoasterStructure>;
/** Per-mounted-park ownership, at most two CPU variants. GPU buffers of the old
 * variant are released by the component on every switch; Three reuploads them
 * when revisited. No extra meshes, lights, colliders or frame callbacks. */
export class CoasterStructureCache {
  private variants = new Map<boolean, Structure>();
  private pending = new Map<boolean, { controller: AbortController; promise: Promise<Structure> }>();
  private disposed = false;
  constructor(private build: (near: boolean) => Structure,
    private buildAsync?: (near: boolean, signal: AbortSignal) => Promise<Structure>) {}
  peek(near: boolean) { return this.variants.get(near); }
  /** Initial construction only. Later missing variants use load() off-thread. */
  get(near: boolean) {
    if (this.disposed) throw new Error('Coaster cache already disposed');
    let value = this.variants.get(near);
    if (!value) { value = this.build(near); this.variants.set(near, value); }
    return value;
  }
  load(near: boolean): Promise<Structure> {
    if (this.disposed) return Promise.reject(new Error('Coaster cache already disposed'));
    const cached = this.peek(near); if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(near); if (pending) return pending.promise;
    if (!this.buildAsync) return Promise.reject(new Error('No asynchronous coaster builder'));
    const controller = new AbortController();
    const promise = this.buildAsync(near, controller.signal).then(value => {
      if (this.disposed) { value.steel.dispose(); value.glow.dispose(); throw new Error('Coaster cache disposed during generation'); }
      this.variants.set(near, value); return value;
    }).finally(() => this.pending.delete(near));
    this.pending.set(near, { controller, promise });
    return promise;
  }
  releaseGpu(near: boolean) {
    const value = this.variants.get(near);
    if (value) { value.steel.dispose(); value.glow.dispose(); }
  }
  snapshot() {
    let attributeBytes = 0;
    for (const data of this.variants.values()) for (const g of [data.steel, data.glow]) {
      for (const a of Object.values(g.attributes)) attributeBytes += a.array.byteLength;
      attributeBytes += g.index?.array.byteLength ?? 0;
    }
    return { variants: this.variants.size, attributeBytes };
  }
  dispose() {
    this.disposed = true;
    for (const pending of this.pending.values()) pending.controller.abort();
    this.pending.clear();
    for (const near of this.variants.keys()) this.releaseGpu(near);
    this.variants.clear();
  }
}
/** Primitive-only QA readout. Never holds a scene, geometry or cache alive. */
export const coasterStructureMemory = { variants: 0, attributeBytes: 0 };
