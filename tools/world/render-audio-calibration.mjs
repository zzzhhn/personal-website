#!/usr/bin/env node
// node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/render-audio-calibration.mjs
// Bounded short sample export, not the full 48-second/stem rendering workflow.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderWalkMusic, renderWorkshopCandidate, walkScore, WALK_RATE } from '../../src/components/world/walk-music-candidate.ts';
import { renderWorkshopSound } from '../../src/components/world/WorldParkAudio.ts';

const root = new URL('../../', import.meta.url);
const output = new URL('docs/world/phase-2-playground/overhaul-20261028/audio-calibration/', root);
mkdirSync(output, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const files = [];
function exportWav(name, channels) {
  const frames = channels[0].length, count = channels.length;
  const data = Buffer.alloc(44 + frames * count * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(count, 22);
  data.writeUInt32LE(WALK_RATE, 24); data.writeUInt32LE(WALK_RATE * count * 2, 28);
  data.writeUInt16LE(count * 2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  let peak = 0, sum = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) {
    const sample = channels[c][i];
    if (!Number.isFinite(sample) || Math.abs(sample) >= .999) throw new Error(`${name}: non-finite or clipping`);
    const pcm = Math.round(sample * 32767);
    data.writeInt16LE(pcm, 44 + (i * count + c) * 2);
    peak = Math.max(peak, Math.abs(pcm / 32768)); sum += (pcm / 32768) ** 2;
  }
  const path = new URL(name, output); writeFileSync(path, data);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-threads', '1', '-filter_threads', '1', '-i', fileURLToPath(path), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 128 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.slice(-1000));
  const summary = result.stderr.split('Summary:').at(-1);
  const field = name => Number(summary.match(new RegExp(`${name}\\s*:\\s*(-?[\\d.]+)`))[1]);
  files.push({ file: name, bytes: data.length, sha256: hash(data), channels: count, frames, sample_rate: WALK_RATE,
    seconds: frames / WALK_RATE, decoded_bytes: frames * count * 4,
    sample_peak_dbfs: 20 * Math.log10(peak), rms_dbfs: 10 * Math.log10(sum / (frames * count)),
    integrated_lufs: frames / WALK_RATE >= .4 ? field('\\bI') : null,
    loudness_note: frames / WALK_RATE < .4 ? 'Below the 400 ms R128 window; pair matched by full-duration RMS.' : '',
    true_peak_dbtp: field('Peak') });
}
for (const variant of ['a', 'b']) {
  exportWav(`music-${variant}.wav`, renderWalkMusic(variant));
  for (const kind of ['intake', 'bell', 'success']) {
    exportWav(`${kind}-${variant}.wav`, [variant === 'a' ? renderWorkshopSound(kind) : renderWorkshopCandidate(kind)]);
  }
}
const sources = ['src/components/world/walk-music-candidate.ts', 'src/components/world/WorldParkAudio.ts', 'tools/world/render-audio-calibration.mjs'];
const report = { version: 1, date: '2026-10-28', status: 'rendered; not listened or accepted',
  source: 'Original deterministic synthesis, no recordings, samples, model or network input.',
  third_party_audio_used: false, tool: spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', maxBuffer: 16384 }).stdout.split('\n')[0],
  source_hashes: Object.fromEntries(sources.map(path => [path, hash(readFileSync(new URL(path, root)))])),
  scores: { a: walkScore('a'), b: walkScore('b') }, files,
  total_file_bytes: files.reduce((n, f) => n + f.bytes, 0) };
writeFileSync(new URL('analysis.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ total_bytes: report.total_file_bytes, files: files.map(({ file, integrated_lufs, true_peak_dbtp }) => ({ file, integrated_lufs, true_peak_dbtp })) }));
