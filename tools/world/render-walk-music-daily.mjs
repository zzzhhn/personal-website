#!/usr/bin/env node
// Offline candidate only. Run serially after resource preflight, with the shared heavy-task lock.
// node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/render-walk-music-daily.mjs --lock-owner OWNER
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { renderWalkDaily, walkDailyScore, WALK_DAILY_RATE, WALK_DAILY_SECONDS, WALK_DAILY_BPM, WALK_DAILY_FORM } from '../../src/components/world/walk-music-daily.ts';

const ownerIndex = process.argv.indexOf('--lock-owner'), owner = process.argv[ownerIndex + 1];
if (ownerIndex < 0 || !owner || JSON.parse(readFileSync('/tmp/bobby-world-phase2-heavy.lock/owner.json', 'utf8')).owner !== owner)
  throw new Error('Export requires the existing shared heavy-task lock with this owner');
const root = new URL('../../', import.meta.url), output = new URL('docs/world/phase-2-playground/qa-20261029/walk-daily-candidate-v24/', root);
const file = new URL('walk-daily-candidate.wav', output);
if (['walk-daily-candidate.wav', 'score.json', 'analysis.json'].some(name => existsSync(new URL(name, output))))
  throw new Error('Candidate already exists; preserve the earlier audition and choose a new version');
const started = performance.now(), channels = renderWalkDaily(), frames = WALK_DAILY_RATE * WALK_DAILY_SECONDS;
const wav = Buffer.alloc(44 + frames * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(WALK_DAILY_RATE, 24); wav.writeUInt32LE(WALK_DAILY_RATE * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
let peak = 0, energy = 0, maximumInteriorStep = 0;
const sections = WALK_DAILY_FORM.map(section => ({ ...section, energy: 0, samples: 0 }));
for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
  const value = channels[c][i];
  if (!Number.isFinite(value) || Math.abs(value) >= .9) throw new Error('Candidate lacks required headroom');
  const quantized = Math.round(value * 32767), sample = quantized / 32768;
  wav.writeInt16LE(quantized, 44 + (i * 2 + c) * 2);
  peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2;
  if (i) maximumInteriorStep = Math.max(maximumInteriorStep, Math.abs(sample - wav.readInt16LE(44 + ((i - 1) * 2 + c) * 2) / 32768));
  const section = sections[Math.min(3, Math.floor(i / (frames / 4)))]; section.energy += sample ** 2; section.samples++;
}
const seam = [0, 1].map(channel => {
  const sample = frame => wav.readInt16LE(44 + (frame * 2 + channel) * 2) / 32768;
  const step = sample(0) - sample(frames - 1);
  return { channel, sample_step: step, slope_change: Math.max(Math.abs(step - (sample(frames - 1) - sample(frames - 2))), Math.abs((sample(1) - sample(0)) - step)) };
});
if (wav.length > 5 * 1024 ** 2 || seam.some(join => Math.abs(join.sample_step) >= .001 || join.slope_change >= .0003))
  throw new Error('Candidate failed size or loop-seam QC; no export written');
const sha = value => createHash('sha256').update(value).digest('hex');
const report = {
  date: '2026-10-29', status: 'offline candidate; numerical QC only; not listened, accepted, or integrated',
  source: 'Original E-G-A-G / D-C motif with picked harmonic accompaniment, restrained bass and damped wood. No recordings, samples, external model or third-party melody.',
  file: 'walk-daily-candidate.wav', sha256: sha(wav), seconds: WALK_DAILY_SECONDS, bpm: WALK_DAILY_BPM,
  sample_rate: WALK_DAILY_RATE, channels: 2, frames, bytes: wav.length, decoded_bytes: frames * 8,
  peak_dbfs: 20 * Math.log10(peak), rms_dbfs: 10 * Math.log10(energy / (frames * 2)), clipped_samples: 0,
  seam, maximum_interior_sample_step: maximumInteriorStep,
  sections: sections.map(({ energy, samples, ...section }) => ({ ...section, rms_dbfs: 10 * Math.log10(energy / samples) })),
  source_hashes: Object.fromEntries(['src/components/world/walk-music-daily.ts', 'tools/world/render-walk-music-daily.mjs'].map(path => [path, sha(readFileSync(new URL(path, root)))])),
  elapsed_export_ms: Math.round(performance.now() - started),
};
mkdirSync(output, { recursive: true });
writeFileSync(file, wav, { flag: 'wx' });
writeFileSync(new URL('score.json', output), JSON.stringify({ bpm: WALK_DAILY_BPM, meter: '4/4', form: WALK_DAILY_FORM, notes: walkDailyScore() }, null, 2) + '\n', { flag: 'wx' });
writeFileSync(new URL('analysis.json', output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file: file.pathname, bytes: report.bytes, peak_dbfs: report.peak_dbfs, rms_dbfs: report.rms_dbfs, seam, elapsed_export_ms: report.elapsed_export_ms }));
