/** Frozen evidence views need the same demand rendering as the pause menu.
 * A stationary player is still an active world (weather, rides and NPC motion). */
export function worldRenderMode(visible: boolean, paused: boolean, shot: string | null): 'never' | 'demand' | 'always' {
  return !visible ? 'never' : paused || shot ? 'demand' : 'always';
}

// WorldShadows scans every 30 rendered frames and needs two unchanged scans
// after discovering a caster. A late asset or camera edit must reach all three
// scans before a frozen shot sleeps; vegetation also updates on a time budget.
export const STATIC_SHOT_SETTLE_FRAMES = 90;

/** No timer: an externally requested shot frame starts one finite render burst.
 * Invalidation from NightClock/weather can extend it, but a settled scene cannot
 * wake itself once the final frame has drained from R3F's queue. */
export class StaticShotFrames {
  private remaining = 0;
  reset() { this.remaining = 0; }
  frame(shot: boolean): boolean {
    if (!shot) { this.reset(); return false; }
    if (!this.remaining) this.remaining = STATIC_SHOT_SETTLE_FRAMES;
    return --this.remaining > 0;
  }
}
