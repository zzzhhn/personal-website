// node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/render-exchange-sound-preview.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EXCHANGE_SOUND_RATE as rate, EXCHANGE_CONTACT_SOUND, renderExchangeSound } from '../../src/components/world/alpha-exchange-sound.ts';

const root = new URL('../../', import.meta.url);
const output = new URL('docs/world/phase-2-playground/qa-20261029/', root);
mkdirSync(output, { recursive: true });
const cues = Object.entries(EXCHANGE_CONTACT_SOUND).map(([action, {kind, level}]) => {
  const start = performance.now(), pcm = renderExchangeSound(kind, 0);
  return { action, kind, level, pcm, render_ms: performance.now() - start };
});
const gap = Math.round(rate * .65), frames = gap + cues.reduce((n, c) => n + c.pcm.length + gap, 0);
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
let cursor = gap;
const entries = cues.map(({pcm, ...cue}) => {
  let energy = 0, peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i] * cue.level;
    if (!Number.isFinite(sample) || Math.abs(sample) >= 1) throw new Error('Invalid PCM');
    wav.writeInt16LE(Math.round(sample * 32767), 44 + (cursor + i) * 2);
    energy += sample ** 2; peak = Math.max(peak, Math.abs(sample));
  }
  const result = { ...cue, start_seconds: cursor / rate, seconds: pcm.length / rate,
    peak_dbfs: 20 * Math.log10(peak), rms_dbfs: 10 * Math.log10(energy / pcm.length) };
  cursor += pcm.length + gap; return result;
});
const sha = value => createHash('sha256').update(value).digest('hex');
writeFileSync(new URL('exchange-v33-sounds.wav', output), wav);
const report = { source: 'Original deterministic material synthesis. No sampled recordings or network generation.',
  audition: 'Source trims applied; excludes shared master, SFX bus, distance and music ducking. Not a loudness calibration of game output.',
  listening: 'Not human-auditioned or creatively accepted.', rate, seconds: frames / rate, bytes: wav.length, sha256: sha(wav),
  source_sha256: sha(readFileSync(new URL('src/components/world/alpha-exchange-sound.ts', root))), cues: entries };
writeFileSync(new URL('exchange-v33-sounds.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ seconds: report.seconds, bytes: report.bytes, cues: entries.map(({action,render_ms,peak_dbfs}) => ({action,render_ms,peak_dbfs})) }));
