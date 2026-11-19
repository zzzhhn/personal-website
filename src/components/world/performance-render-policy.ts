/** Successful WebGL program log reads can stall the GPU. Preserve the renderer default
 * in development or when someone explicitly opens the shader diagnostics view. */
export function configureWorldShaderDiagnostics(debug: {checkShaderErrors: boolean}, development: boolean, search: string) {
  if (!development && !new URLSearchParams(search).has('shaderDebug')) debug.checkShaderErrors = false;
}

/** Frozen evidence views need the same demand rendering as the pause menu.
 * A stationary player is still an active world (weather, rides and NPC motion). */
export function worldRenderMode(visible: boolean, paused: boolean, shot: string | null): 'never' | 'demand' | 'always' {
  return !visible ? 'never' : paused || shot ? 'demand' : 'always';
}

// The normal shadow scan interval is 30 frames. Fitting needs two unchanged scans
// after discovering a caster. A late asset or camera edit must reach all three
// scans before a frozen shot sleeps; vegetation also updates on a time budget.
export const STATIC_SHOT_SETTLE_FRAMES = 90;

/** No timer: an externally requested shot frame starts one finite render burst.
 * Invalidation from NightClock/weather can extend it, but a settled scene cannot
 * wake itself once the final frame has drained from R3F's queue. */
export class StaticShotFrames {
  private remaining = 0;
  private firstScan = 0;
  private elapsed = 0;
  get settled() { return this.remaining === 0; }
  reset() { this.remaining = 0; }
  frame(shot: boolean, scan = 0, delta = 0): boolean {
    if (!shot) { this.reset(); return false; }
    if (!this.remaining) {
      this.remaining = STATIC_SHOT_SETTLE_FRAMES;
      this.firstScan = scan;
      this.elapsed = 0;
    }
    this.elapsed += Math.max(0, Math.min(delta, .5));
    // On a slow GPU three completed scans can span seconds in just a few frames.
    if (scan - this.firstScan >= 3 && this.elapsed >= 1.5) {
      this.remaining = 0;
      return false;
    }
    return --this.remaining > 0;
  }
}
