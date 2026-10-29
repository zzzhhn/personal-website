import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderWalkMusic, WALK_RATE } from './walk-music-candidate.ts';

const directory = new URL('../../../docs/world/phase-2-playground/overhaul-20261028/audio-calibration/', import.meta.url);
const report = JSON.parse(readFileSync(new URL('analysis.json', directory), 'utf8'));

test('delivered PCM has verified identity, duration, silence, headroom and bounded size', () => {
  assert.equal(report.files.length, 8); assert.ok(report.total_file_bytes < 3 * 1024 ** 2);
  for (const file of report.files) {
    const wav = readFileSync(new URL(file.file, directory));
    assert.equal(createHash('sha256').update(wav).digest('hex'), file.sha256);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(24), WALK_RATE); assert.equal(wav.readUInt16LE(22), file.channels);
    assert.equal(wav.length, 44 + file.frames * file.channels * 2);
    assert.equal(file.decoded_bytes, file.frames * file.channels * 4); assert.ok(file.true_peak_dbtp < -2);
    assert.equal(wav.readInt16LE(44), 0); assert.equal(wav.readInt16LE(wav.length - 2), 0);
    if (file.file.startsWith('music')) {
      assert.equal(file.seconds, 12);
      assert.ok(wav.subarray(wav.length - WALK_RATE * file.channels * 2).every(v => v === 0), 'last second is actual silence');
    }
  }
});

test('A/B matches measured music loudness and cue RMS; B really withdraws in bar 3', () => {
  const find = name => report.files.find(file => file.file === name);
  assert.ok(Math.abs(find('music-a.wav').integrated_lufs - find('music-b.wav').integrated_lufs) <= .2);
  for (const cue of ['intake', 'bell', 'success']) assert.ok(Math.abs(find(`${cue}-a.wav`).rms_dbfs - find(`${cue}-b.wav`).rms_dbfs) < .05);
  assert.equal(find('intake-a.wav').integrated_lufs, null, 'a 240 ms event has no full 400 ms R128 window');
  const [a] = renderWalkMusic('a'), [b] = renderWalkMusic('b');
  const energy = pcm => pcm.subarray(WALK_RATE * 6, WALK_RATE * 8).reduce((sum, sample) => sum + sample ** 2, 0);
  assert.ok(energy(a) > 0); assert.equal(energy(b), 0);
  assert.throws(() => renderWalkMusic('a', 1000000000), RangeError);
});
