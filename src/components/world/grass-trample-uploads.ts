import type { DataTexture, Texture } from 'three';

// Call-count / coverage guards, not benchmark-tuned thresholds. Three uploads each range
// with its own texSubImage2D + pixelStore calls; broad edits keep the original one-call path.
export const TRAMPLE_UPLOAD_MAX_ROWS = 32;
export const TRAMPLE_UPLOAD_FULL_FRACTION = .5;

/** Owned RGBA8 texture uploads. CPU writes stay immediate; row bounds live until Three's
 * onUpdate acknowledges an upload, including frames where the grass is not drawn. */
export function createTrampleUploads(texture: DataTexture, data: Uint8Array, width: number, height: number) {
  const first = new Int32Array(height), last = new Int32Array(height), rows = new Set<number>();
  const previousUpdate = texture.onUpdate;
  let initialized = false, changed = false, disposed = true;
  const acknowledge = (uploaded: Texture) => {
    initialized = true; rows.clear(); changed = false;
    previousUpdate?.call(texture, uploaded);
  };

  const reset = () => {
    if (disposed) return;
    // First allocation / context restoration must initialize every texel, even if edits
    // have already happened offscreen. Empty updateRanges tells Three to upload all data.
    initialized = false; rows.clear(); changed = false;
    texture.clearUpdateRanges(); texture.needsUpdate = true;
  };
  const connect = () => {
    if (!disposed) return;
    disposed = false; texture.onUpdate = acknowledge; reset();
  };
  connect();

  return {
    write(component: number, value: number) {
      if (disposed) return;
      const byte = value & 255; // Same Uint8 conversion as the original byte-array writes.
      if (data[component] === byte) return;
      data[component] = byte; changed = true;
      const pixel = Math.floor(component / 4), row = Math.floor(pixel / width), x = pixel % width;
      if (!rows.has(row)) { rows.add(row); first[row] = last[row] = x; }
      else { first[row] = Math.min(first[row], x); last[row] = Math.max(last[row], x); }
    },
    flush() {
      if (disposed || !changed) return;
      // Rebuild from the full unacknowledged union, not just this frame's writes.
      // One range per row keeps pending storage bounded if no draw consumes it.
      texture.clearUpdateRanges();
      if (initialized && rows.size <= TRAMPLE_UPLOAD_MAX_ROWS) {
        let components = 0;
        for (const row of rows) components += (last[row] - first[row] + 1) * 4;
        if (components < data.length * TRAMPLE_UPLOAD_FULL_FRACTION) for (const row of rows) texture.addUpdateRange(
          (row * width + first[row]) * 4, (last[row] - first[row] + 1) * 4,
        );
      }
      texture.needsUpdate = true; changed = false;
    },
    reset,
    connect,
    dispose() {
      disposed = true; rows.clear();
      if (texture.onUpdate === acknowledge) texture.onUpdate = previousUpdate;
    },
  };
}
