/** 36-second development of the B motif, for offline audition only.
 * Original deterministic score and synthesis, no recordings, model, dependencies or runtime import.
 * Finite tails wrap around the bar-12/bar-1 boundary; this is a circular mix, not a fade-to-silence loop. */
export const WALK_LOOP_RATE = 24000;
export const WALK_LOOP_BPM = 80;
export const WALK_LOOP_SECONDS = 36;
export type WalkLoopPart = 'felt' | 'pluck' | 'pad' | 'bass';
export type WalkLoopNote = {
  part: WalkLoopPart; bar: number; beat: number; at: number; midi: number;
  duration: number; velocity: number; pan: number;
};
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const WALK_LOOP_FORM = [
  { id: 'A', startBar: 1, bars: 4, development: 'repeat', harmony: ['Cmaj7', 'Fmaj7', 'rest', 'Cmaj7'] },
  { id: 'B', startBar: 5, bars: 4, development: 'vary', harmony: ['Am7', 'Dm7', 'Fm', 'G7'] },
  { id: 'C', startBar: 9, bars: 2, development: 'fragment', harmony: ['Cmaj7', 'Cmaj7'] },
  { id: 'D', startBar: 11, bars: 2, development: 'contract', harmony: ['Dm7', 'G7 Cmaj7'] },
] as const;

export function walkLoopScore(): WalkLoopNote[] {
  const notes: WalkLoopNote[] = [];
  const add = (part: WalkLoopPart, bar: number, beat: number, midi: number, duration: number, velocity: number, pan = 0) =>
    notes.push({ part, bar, beat, at: (bar - 1) * 3 + beat * .75, midi, duration, velocity, pan });
  const phrase = (bar: number, pitches: number[], dynamics: number[]) => {
    [0.5, 1.5, 2, 2.5].forEach((beat, i) => add('felt', bar, beat, pitches[i], i === 2 ? .7 : 1.1, dynamics[i], -.14));
  };
  // A: recognize the original B question, leave a whole bar, answer without repeating the question.
  phrase(1, [64, 67, 69, 67], [.74, .5, .62, .45]);
  add('felt', 2, .5, 62, 1.2, .57, -.1); add('felt', 2, 1.5, 60, 1.55, .42, -.1);
  add('felt', 4, .5, 62, 1.2, .46, -.08); add('felt', 4, 1.75, 60, 1.65, .36, -.08);
  // B: change the answer and chord colour while preserving the opening rhythm/ascending contour.
  phrase(5, [64, 67, 71, 69], [.64, .45, .58, .48]);
  add('felt', 6, .5, 65, 1.2, .54, -.1); add('felt', 6, 1.75, 62, 1.4, .4, -.1);
  phrase(7, [65, 67, 68, 67], [.49, .38, .46, .34]);
  add('felt', 8, .5, 65, 1, .45, -.1); add('felt', 8, 1.5, 62, 1.1, .38, -.1);
  add('felt', 8, 2.75, 59, .95, .32, -.1);
  // C: melody and bass disappear; one quiet lower-register fragment answers on a different patch.
  add('pluck', 9, .75, 52, 1.5, .36, .16); add('pluck', 9, 2.25, 55, 1.65, .28, .16);
  // D: contraction, then G7-to-C resolution. The C tail crosses the loop boundary into the same C harmony.
  add('felt', 11, .5, 64, 1.15, .5, -.1); add('felt', 11, 1.75, 67, 1.25, .4, -.1);
  add('felt', 12, .5, 62, 1.1, .43, -.08); add('felt', 12, 2.5, 60, 1.8, .35, -.08);

  const chords: [number, number[], number, number][] = [
    [1, [52, 55, 59, 60], .32, 2.6], [2, [53, 57, 60], .31, 2.2],
    [4, [52, 55, 59, 60], .28, 2.4], [5, [52, 55, 57, 60], .34, 2.3],
    [6, [53, 57, 60, 62], .32, 2.3], [7, [53, 56, 60], .30, 2.2],
    [8, [53, 55, 59, 62], .29, 2.25], [9, [52, 55, 59], .18, 2.7],
    [11, [53, 57, 60, 62], .27, 2.1],
  ];
  for (const [bar, chord, velocity, duration] of chords) {
    chord.forEach((midi, i) => add('pad', bar, .15 + i * .18, midi, duration, velocity - i * .014, (i - 1.5) * .19));
  }
  [53, 55, 59].forEach((midi, i) => add('pad', 12, .05 + i * .12, midi, 1.35, .23 - i * .01, (i - 1) * .2));
  [52, 55, 59, 60].forEach((midi, i) => add('pad', 12, 2.45 + i * .10, midi, 4.8, .26 - i * .01, (i - 1.5) * .19));
  // Short bass on selected answers, never a constant root metronome; it exits before C.
  for (const [bar, midi] of [[2, 41], [5, 40], [6, 38], [7, 41], [8, 43]]) {
    add('bass', bar, .1, midi, 1.1, bar < 5 ? .42 : .48);
  }
  // Finite plucked replies occupy the gaps, not every melody attack or every bar.
  for (const [bar, beat, midi, velocity] of [[2, 2.8, 55, .28], [4, 2.9, 52, .23], [5, 3.35, 60, .3], [6, 2.85, 57, .25], [8, 3.45, 55, .22]]) {
    add('pluck', bar, beat, midi, 1.15, velocity, .2);
  }
  return notes.sort((a, b) => a.at - b.at || a.part.localeCompare(b.part) || a.midi - b.midi);
}

/** Four patches with distinct envelopes; partials roll off rather than a bright UI-style oscillator.
 * Voices are calculated independently, then their finite releases are summed modulo the loop length. */
export function renderWalkLoop(sampleRate = WALK_LOOP_RATE) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new RangeError('Unsupported sample rate');
  const frames = sampleRate * WALK_LOOP_SECONDS;
  const channels = [new Float32Array(frames), new Float32Array(frames)] as const;
  for (const note of walkLoopScore()) {
    const start = Math.round(note.at * sampleRate), count = Math.ceil(note.duration * sampleRate), f = frequency(note.midi);
    const left = Math.cos((note.pan + 1) * Math.PI / 4), right = Math.sin((note.pan + 1) * Math.PI / 4);
    const attack = { felt: .012, pluck: .008, pad: .3, bass: .014 }[note.part];
    const release = { felt: .2, pluck: .22, pad: .6, bass: .25 }[note.part];
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate, phase = 2 * Math.PI * f * t;
      const envelope = Math.sin(Math.min(1, t / attack) * Math.PI / 2) ** 2
        * Math.sin(Math.min(1, (count - 1 - i) / (sampleRate * release)) * Math.PI / 2) ** 2;
      let wave: number;
      if (note.part === 'felt') {
        wave = .25 * (Math.sin(phase) * Math.exp(-t / .38)
          + .105 * Math.sin(phase * 2.003) * Math.exp(-t / .18)
          + .035 * Math.sin(phase * 3.98) * Math.exp(-t / .065));
      } else if (note.part === 'pluck') {
        wave = .17 * (Math.sin(phase) + .24 * Math.sin(phase * 2) * Math.exp(-t / .15)
          + .07 * Math.sin(phase * 3) * Math.exp(-t / .07)) * Math.exp(-t / .34);
      } else if (note.part === 'pad') {
        const breath = .025 * Math.sin(2 * Math.PI * .27 * t);
        wave = .075 * (Math.sin(phase + breath) + .06 * Math.sin(phase * 2 + breath)) * Math.exp(-t / 1.7);
      } else {
        wave = .21 * (Math.sin(phase) + .26 * Math.sin(phase * 2) + .045 * Math.sin(phase * 3)) * Math.exp(-t / .31);
      }
      const sample = wave * envelope * note.velocity * 1.35;
      const index = (start + i) % frames;
      channels[0][index] += sample * left; channels[1][index] += sample * right;
    }
  }
  return channels;
}
