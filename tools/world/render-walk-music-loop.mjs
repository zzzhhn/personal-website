#!/usr/bin/env node
// node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/render-walk-music-loop.mjs --lock-owner OWNER
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { renderWalkLoop, walkLoopScore, WALK_LOOP_FORM, WALK_LOOP_RATE, WALK_LOOP_SECONDS, WALK_LOOP_BPM } from '../../src/components/world/walk-music-loop.ts';

const owner = process.argv[process.argv.indexOf('--lock-owner') + 1];
if (!process.argv.includes('--lock-owner') || !owner || JSON.parse(readFileSync('/tmp/bobby-world-phase2-heavy.lock/owner.json', 'utf8')).owner !== owner) {
  throw new Error('Export requires the existing shared heavy-task lock with this owner');
}
const started = performance.now(), root = new URL('../../', import.meta.url);
const output = new URL('docs/world/phase-2-playground/overhaul-20261028/walk-loop-b/', root);
mkdirSync(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const channels = renderWalkLoop(), frames = WALK_LOOP_RATE * WALK_LOOP_SECONDS;
const wav = Buffer.alloc(44 + frames * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(WALK_LOOP_RATE, 24); wav.writeUInt32LE(WALK_LOOP_RATE * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
let peak = 0, sum = 0, maxStep = 0, clipped = 0;
const seam = [], sections = [], pcm = [new Float32Array(frames), new Float32Array(frames)];
for (let c = 0; c < 2; c++) {
  for (let i = 0; i < frames; i++) {
    const sample = channels[c][i];
    if (!Number.isFinite(sample) || Math.abs(sample) >= .999) throw new Error('Invalid PCM/headroom');
    const value = Math.round(sample * 32767); wav.writeInt16LE(value, 44 + (i * 2 + c) * 2);
    pcm[c][i] = value / 32768; peak = Math.max(peak, Math.abs(pcm[c][i])); sum += pcm[c][i] ** 2;
    if (Math.abs(value) >= 32767) clipped++;
    if (i) maxStep = Math.max(maxStep, Math.abs(pcm[c][i] - pcm[c][i - 1]));
  }
  const last = pcm[c][frames - 1], first = pcm[c][0];
  const leftStep = last - pcm[c][frames - 2], seamStep = first - last, rightStep = pcm[c][1] - first;
  seam.push({ channel: c, last, first, sample_step: seamStep,
    slope_change: Math.max(Math.abs(seamStep - leftStep), Math.abs(rightStep - seamStep)) });
}
if (wav.length > 5 * 1024 ** 2) throw new Error('Export exceeds 5 MiB');
const file = new URL('island-walk-b-loop.wav', output); writeFileSync(file, wav);
for (const section of WALK_LOOP_FORM) {
  const from = (section.startBar - 1) * 3 * WALK_LOOP_RATE, to = from + section.bars * 3 * WALK_LOOP_RATE;
  let energy = 0, activeFrames = 0;
  for (let i = from; i < to; i++) {
    const e = pcm[0][i] ** 2 + pcm[1][i] ** 2;
    energy += e; if (e) activeFrames++;
  }
  sections.push({ ...section, rms_dbfs: 10 * Math.log10(energy / ((to - from) * 2)), active_frames: activeFrames });
}
// One-pass metrics only; no resynthesis or loudness normalization pass.
const measured = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-threads', '1', '-filter_threads', '1', '-i', fileURLToPath(file), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 192 * 1024 });
if (measured.status !== 0) throw new Error(measured.stderr.slice(-1000));
const summary = measured.stderr.split('Summary:').at(-1);
const field = name => Number(summary.match(new RegExp(`${name}\\s*:\\s*(-?[\\d.]+)`))[1]);
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,duration', '-of', 'json', fileURLToPath(file)], { encoding: 'utf8', maxBuffer: 4096 });
if (probe.status !== 0) throw new Error(probe.stderr);
const report = {
  date: '2026-10-28', status: 'rendered and technically measured; not listened or accepted; not integrated',
  source: 'New deterministic composition/synthesis developing the submitted short B motif; no samples, recordings, models or network inputs.',
  file: 'island-walk-b-loop.wav', sha256: hash(wav), bytes: wav.length,
  frames, channels: 2, sample_rate: WALK_LOOP_RATE, seconds: WALK_LOOP_SECONDS, bpm: WALK_LOOP_BPM,
  decoded_bytes: frames * 2 * 4, peak_dbfs: 20 * Math.log10(peak), rms_dbfs: 10 * Math.log10(sum / (frames * 2)),
  clipped_samples: clipped, integrated_lufs: field('\\bI'), true_peak_dbtp: field('Peak'), loudness_range_lu: field('LRA'),
  seam, maximum_interior_sample_step: maxStep, sections, probe: JSON.parse(probe.stdout).streams[0],
  loop_method: 'Sum finite voices modulo exactly 864000 frames; final Cmaj7 pad and C4 answer continue through the boundary. No global fade/crossfade, no normalization or limiter.',
  tools: { ffmpeg: spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', maxBuffer: 16384 }).stdout.split('\n')[0] },
  source_hashes: Object.fromEntries(['src/components/world/walk-music-loop.ts', 'tools/world/render-walk-music-loop.mjs'].map(path => [path, hash(readFileSync(new URL(path, root)))])),
  elapsed_export_ms: Math.round(performance.now() - started),
};
writeFileSync(new URL('score.json', output), JSON.stringify({ bpm: WALK_LOOP_BPM, meter: '4/4', form: WALK_LOOP_FORM, notes: walkLoopScore() }, null, 2) + '\n');
writeFileSync(new URL('analysis.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ bytes: report.bytes, seconds: report.seconds, integrated_lufs: report.integrated_lufs, true_peak_dbtp: report.true_peak_dbtp, seam: report.seam, elapsed_export_ms: report.elapsed_export_ms }));
