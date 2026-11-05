import type { BufferGeometry } from 'three';

/** Preserve the original caster for raw shadows and chunk extraction, while
 * avoiding its duplicate triangles in the main colour pass. Three invokes
 * onBeforeShadow separately from onBeforeRender. No attributes are mutated. */
export function shadowOnlyRange(geometry: BufferGeometry) {
  let suppressed = false, start = 0, count = 0;
  const restore = () => {
    if (!suppressed) return;
    geometry.setDrawRange(start, count);
    suppressed = false;
  };
  return {
    beforeColour() {
      if (!suppressed) { start = geometry.drawRange.start; count = geometry.drawRange.count; suppressed = true; }
      geometry.setDrawRange(0, 0);
    },
    restore,
  };
}
