/** Original 40-second everyday exploration candidate, offline audition only.
 * Develops our E-G-A-G / D-C question with picked accompaniment and soft wood.
 * No samples, third-party tune, runtime import, normalization or effects service.
 * The accepted 36-second recording remains the runtime asset. */
export const WALK_DAILY_RATE = 24000;
export const WALK_DAILY_BPM = 96;
export const WALK_DAILY_SECONDS = 40;
const beatSeconds = 60 / WALK_DAILY_BPM;
export type DailyPart = 'melody' | 'guitar' | 'bass' | 'wood';
export type DailyNote = { part: DailyPart; bar: number; beat: number; at: number; midi: number; duration: number; velocity: number; pan: number };
export const WALK_DAILY_FORM = [
  { id: 'A', startBar: 1, bars: 4, harmony: ['C6', 'Fmaj7', 'Gsus2', 'C6'] },
  { id: 'B', startBar: 5, bars: 4, harmony: ['Am7', 'Dm7', 'G6', 'C6'] },
  { id: 'C', startBar: 9, bars: 4, harmony: ['Fmaj7', 'C/E', 'Dm7', 'G6'] },
  { id: 'D', startBar: 13, bars: 4, harmony: ['Am7', 'Fmaj7', 'Gsus2', 'C6'] },
] as const;

export function walkDailyScore(): DailyNote[] {
  const notes: DailyNote[] = [];
  const add = (part: DailyPart, bar: number, beat: number, midi: number, duration: number, velocity: number, pan = 0) =>
    notes.push({ part, bar, beat, at: ((bar - 1) * 4 + beat) * beatSeconds, midi, duration, velocity, pan });
  const chords = [
    [48, 55, 57, 64], [41, 52, 57, 60], [43, 55, 57, 62], [48, 55, 57, 64],
    [45, 55, 60, 64], [38, 53, 57, 60], [43, 55, 59, 64], [48, 55, 57, 64],
    [41, 52, 57, 60], [40, 55, 60, 64], [38, 53, 57, 60], [43, 55, 59, 64],
    [45, 55, 60, 64], [41, 52, 57, 60], [43, 55, 57, 62], [48, 55, 57, 64],
  ];
  chords.forEach((chord, index) => {
    const bar = index + 1, lighter = bar >= 9 && bar <= 12;
    // A small fingerpicked pattern carries walking momentum through melody rests.
    const picking = lighter ? [0, 1.5, 2.75] : [0, .75, 1.5, 2.5, 3.25];
    picking.forEach((beat, i) => add('guitar', bar, beat, chord[1 + i % 3], .76 + i % 2 * .12,
      (lighter ? .25 : .32) * (i % 2 ? .87 : 1), i % 2 ? .22 : -.2));
    add('bass', bar, .02, chord[0], .82, lighter ? .28 : .37);
    if (bar % 4 !== 0 && !lighter) add('bass', bar, 2.05, chord[0] + (bar % 2 ? 7 : 12), .58, .23);
    // Damped wood is a sparse hand-played texture, with a rest every fourth bar.
    if (bar % 4 !== 0) {
      add('wood', bar, 1.25, 53, .11, lighter ? .2 : .3, -.27);
      if (!lighter) add('wood', bar, 3.25, 60, .085, .22, .24);
    }
  });
  const phrase = (bar: number, pitches: number[], scale = 1) =>
    [.5, 1.5, 2, 2.5].forEach((beat, i) => add('melody', bar, beat, pitches[i], i === 2 ? .46 : .8,
      [.62, .44, .53, .4][i] * scale, -.05));
  phrase(1, [64, 67, 69, 67]);
  add('melody', 2, .5, 62, .86, .49); add('melody', 2, 1.75, 60, 1.04, .38);
  phrase(4, [60, 64, 67, 64], .78);
  phrase(5, [64, 67, 71, 69], .88);
  add('melody', 6, .5, 65, .86, .45); add('melody', 6, 1.75, 62, .93, .36);
  add('melody', 7, .75, 64, .78, .39); add('melody', 7, 2.25, 62, .85, .31);
  add('melody', 8, 1.5, 60, 1.08, .34);
  // The middle answers lower and lighter, while picked harmony stays present.
  add('melody', 9, .75, 57, .86, .35); add('melody', 9, 2.25, 60, .92, .3);
  add('melody', 10, 1.25, 55, 1.02, .31);
  add('melody', 11, .75, 57, .84, .34); add('melody', 12, 2, 59, .94, .29);
  phrase(13, [64, 67, 69, 67], .9);
  add('melody', 14, .5, 65, .85, .44); add('melody', 14, 1.75, 64, .95, .35);
  add('melody', 15, .75, 62, .87, .38); add('melody', 15, 2.25, 67, .87, .3);
  add('melody', 16, .5, 64, .9, .38); add('melody', 16, 2.75, 60, 1.35, .33);
  // The final C tail crosses the boundary into C6, with no fade-to-silence gap.
  add('guitar', 16, 3.5, 55, 1.15, .19, .17);
  return notes.sort((a, b) => a.at - b.at || a.part.localeCompare(b.part) || a.midi - b.midi);
}

/** A finite original patch, exported separately for small numerical tests. */
export function renderDailyVoice(note: DailyNote, sampleRate = WALK_DAILY_RATE) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new RangeError('Unsupported sample rate');
  if (!['melody', 'guitar', 'bass', 'wood'].includes(note.part) || !Number.isFinite(note.duration) || note.duration <= 0 || note.duration > 2
    || !Number.isFinite(note.midi) || note.midi < 24 || note.midi > 84 || !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1)
    throw new RangeError('Unsupported voice');
  const pcm = new Float32Array(Math.ceil(note.duration * sampleRate));
  const hz = 440 * 2 ** ((note.midi - 69) / 12);
  const attack = note.part === 'wood' ? .0025 : .009;
  const release = note.part === 'wood' ? .018 : .12;
  let seed = 7249 + note.midi * 113 + Math.round(note.at * 100), low = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate, phase = 2 * Math.PI * hz * t;
    const envelope = Math.sin(Math.min(1, t / attack) * Math.PI / 2) ** 2
      * Math.sin(Math.min(1, (pcm.length - 1 - i) / (sampleRate * release)) * Math.PI / 2) ** 2;
    let body: number;
    if (note.part === 'wood') {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      low += (seed / 2147483648 - 1 - low) * (1 - Math.exp(-2 * Math.PI * 1150 / sampleRate));
      body = .10 * (Math.sin(phase * .72) * Math.exp(-t / .022)
        + .28 * Math.sin(phase * 1.67) * Math.exp(-t / .011) + .18 * low * Math.exp(-t / .013));
    } else if (note.part === 'bass') {
      body = .18 * (Math.sin(phase) + .18 * Math.sin(phase * 2) * Math.exp(-t / .13)) * Math.exp(-t / .29);
    } else {
      // Harmonic picked strings with a soft second partial, no bell-like inharmonics.
      const lead = note.part === 'melody';
      body = (lead ? .24 : .18) * (Math.sin(phase) + .30 * Math.sin(phase * 2) * Math.exp(-t / .14)
        + .10 * Math.sin(phase * 3) * Math.exp(-t / .075) + .025 * Math.sin(phase * 4) * Math.exp(-t / .04))
        * Math.exp(-t / (lead ? .31 : .25));
    }
    pcm[i] = body * envelope * note.velocity;
  }
  return pcm;
}

export function renderWalkDaily(sampleRate = WALK_DAILY_RATE) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new RangeError('Unsupported sample rate');
  const frames = sampleRate * WALK_DAILY_SECONDS;
  const channels = [new Float32Array(frames), new Float32Array(frames)] as const;
  for (const note of walkDailyScore()) {
    const pcm = renderDailyVoice(note, sampleRate), start = Math.round(note.at * sampleRate);
    const left = Math.cos((note.pan + 1) * Math.PI / 4), right = Math.sin((note.pan + 1) * Math.PI / 4);
    for (let i = 0; i < pcm.length; i++) {
      const frame = (start + i) % frames;
      channels[0][frame] += pcm[i] * left; channels[1][frame] += pcm[i] * right;
    }
  }
  return channels;
}
