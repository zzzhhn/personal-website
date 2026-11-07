/** Fixed source trims, independent of the user's channel preferences.
 * Boardwalk v2 measures -22.50 dBFS RMS. Its trim with the .16 master
 * keeps the full-volume roaming bed near the previous -35.5 dBFS RMS. */
export const PARK_AUDIO_MIX = {
  master: .16,
  roaming: 1.4,
  sfx: 1.7,
  // A quiet material cue should leave a musical bed, not hollow out the scene.
  roamingCueDuck: .62,
} as const;
