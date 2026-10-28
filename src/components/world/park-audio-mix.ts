/** Source trims, independent of the user's channel preferences.
 * The accepted WAV is -29.69 dBFS RMS / -12.51 dBFS peak; the .16 master
 * previously left it at -41.52 dBFS RMS. +6.02 dB restores presence while
 * keeping its un-ducked pre-compressor peak below -18 dBFS. Foley gets +4.61 dB.
 * Keep the shared master/QA music trim unchanged; this is no auto-normalizer. */
export const PARK_AUDIO_MIX = {
  master: .16,
  roaming: 3.2,
  sfx: 1.7,
  // A quiet material cue should leave a musical bed, not hollow out the scene.
  roamingCueDuck: .62,
} as const;
