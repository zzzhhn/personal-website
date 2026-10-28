/** Original short arrangement experiment; no samples, model, network or third-party melody.
 * A and B share the patch, tempo and harmony. B tests phrasing/subtraction, not a louder mix.
 * This finite 4-bar calibration is deliberately not the unapproved 48-second candidate. */
export type AudioCandidate = 'a' | 'b';
export const WALK_RATE = 24000;
export const WALK_SECONDS = 12;
export type WalkPart = 'mallet' | 'pad' | 'bass';
export type WalkNote = { part: WalkPart; at: number; midi: number; duration: number; velocity: number; pan: number };
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function walkScore(variant: AudioCandidate): WalkNote[] {
  const notes: WalkNote[] = [];
  const add = (part: WalkPart, beat: number, midi: number, duration: number, velocity: number, pan = 0) =>
    notes.push({ part, at: beat * .75, midi, duration, velocity, pan });
  const motif = [64, 67, 69, 67, 62, 60];
  const beats = [0, 1, 1.5, 2, 4, 5];
  for (const phrase of [0, 8]) {
    (phrase ? [65, 67, 68, 67, 62, 60] : motif).forEach((midi, i) => {
      // B contracts the second statement into the D-C answer; no arbitrary timing jitter.
      if (variant === 'b' && phrase === 8 && i < 4) return;
      const dynamics = variant === 'a' ? .68 : [.74, .52, .63, .47, .58, .43][i] * (phrase ? .85 : 1);
      add('mallet', phrase + beats[i], midi, i === 2 ? .42 : .85, dynamics, -.12);
    });
  }
  const chords = [[52, 55, 59, 60], [53, 57, 60, 64], [53, 56, 60], [52, 55, 60]];
  chords.forEach((chord, bar) => {
    // B removes the bed in bar 3, then answers with an arpeggiated C chord instead of another slab.
    if (variant === 'b' && bar === 2) return;
    chord.forEach((midi, i) => add('pad', bar * 4 + .35 + (variant === 'b' ? i * .16 : 0), midi,
      bar === 3 ? (variant === 'b' ? 1.25 : 1.6) : 1.8, variant === 'b' ? .39 - i * .025 : .36, (i - 1.5) * .16));
  });
  for (const bar of variant === 'a' ? [0, 1, 2, 3] : [1]) {
    add('bass', bar * 4 + .2, [36, 41, 41, 36][bar], .7, .48);
  }
  return notes.sort((a, b) => a.at - b.at);
}

/** Two 12-second float channels, 2,304,000 bytes, only allocated on explicit preview. */
export function renderWalkMusic(variant: AudioCandidate, sampleRate = WALK_RATE) {
  if (variant !== 'a' && variant !== 'b') throw new RangeError('Unknown music candidate');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new RangeError('Unsupported sample rate');
  const channels = [new Float32Array(sampleRate * WALK_SECONDS), new Float32Array(sampleRate * WALK_SECONDS)] as const;
  for (const note of walkScore(variant)) {
    const start = Math.round(note.at * sampleRate), count = Math.ceil(note.duration * sampleRate), f = hz(note.midi);
    for (let i = 0; i < count && start + i < channels[0].length; i++) {
      const t = i / sampleRate, phase = 2 * Math.PI * f * t;
      const envelope = Math.min(1, t / (note.part === 'pad' ? .14 : .006), (count - 1 - i) / (sampleRate * .08));
      const body = note.part === 'mallet'
        ? (Math.sin(phase) * Math.exp(-t / .26) + .13 * Math.sin(phase * 3.98) * Math.exp(-t / .055)) * .27
        : note.part === 'pad'
          ? (Math.sin(phase) + .08 * Math.sin(phase * 2)) * .055 * Math.exp(-t / .8)
          : (Math.sin(phase) + .3 * Math.sin(phase * 2) + .07 * Math.sin(phase * 3)) * .16 * Math.exp(-t / .22);
      const sample = body * envelope * note.velocity;
      channels[0][start + i] += sample * Math.cos((note.pan + 1) * Math.PI / 4);
      channels[1][start + i] += sample * Math.sin((note.pan + 1) * Math.PI / 4);
    }
  }
  // Fixed gains measured with EBU R128 on the exported PCM, no runtime normalizer/limiter.
  const gain = variant === 'a' ? 1 : 10 ** (2.4 / 20);
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= gain;
  return channels;
}

/** Three finite B sketches: damped wood latch, one metal bell, softer two-note result.
 * Separate from the composition library's musical patches; deterministic original synthesis. */
export function renderWorkshopCandidate(kind: 'intake' | 'bell' | 'success', sampleRate = WALK_RATE) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new RangeError('Unsupported sample rate');
  const duration = { intake: .24, bell: .7, success: .48 }[kind];
  const pcm = new Float32Array(Math.ceil(duration * sampleRate));
  const hits = kind === 'intake' ? [[0, 175, .25, .045], [.115, 310, .1, .025]]
    : kind === 'bell' ? [[0, 587.33, .19, .16]] : [[0, 392, .18, .065], [.155, 523.25, .16, .095]];
  for (const [at, f, gain, decay] of hits) {
    for (let i = Math.round(at * sampleRate); i < pcm.length; i++) {
      const t = i / sampleRate - at;
      const modes = Math.sin(2 * Math.PI * f * t) + (kind === 'bell' ? .22 : .08) * Math.sin(2 * Math.PI * f * (kind === 'bell' ? 2.71 : 2.76) * t);
      pcm[i] += gain * modes * Math.min(1, Math.max(0, t / .003)) * Math.exp(-t / decay);
    }
  }
  // Match each A cue's full-duration RMS, as a 240 ms latch is too short for gated LUFS.
  const matchDb = { intake: -.715, bell: .653, success: .77 }[kind];
  for (let i = 0; i < pcm.length; i++) pcm[i] *= 10 ** (matchDb / 20)
    * Math.min(1, i / (sampleRate * .003), (pcm.length - 1 - i) / (sampleRate * .025));
  return pcm;
}
