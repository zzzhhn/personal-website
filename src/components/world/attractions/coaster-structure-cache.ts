import type { createCoasterStructure } from './coaster-geometry';
type Structure = ReturnType<typeof createCoasterStructure>;
/** Per-mounted-park ownership, at most two CPU variants. GPU buffers of the old
 * variant are released by the component on every switch; Three reuploads them
 * when revisited. No extra meshes, lights, colliders or frame callbacks. */
export class CoasterStructureCache {
  private variants = new Map<boolean, Structure>();
  constructor(private build: (near: boolean) => Structure) {}
  get(near: boolean) {
    let value = this.variants.get(near);
    if (!value) { value = this.build(near); this.variants.set(near, value); }
    return value;
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
  dispose() { for (const near of this.variants.keys()) this.releaseGpu(near); this.variants.clear(); }
}
/** Primitive-only QA readout. Never holds a scene, geometry or cache alive. */
export const coasterStructureMemory = { variants: 0, attributeBytes: 0 };
