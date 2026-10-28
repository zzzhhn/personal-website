import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WALK_LOOP_SECONDS, WALK_LOOP_RATE, WALK_LOOP_FORM, walkLoopScore, renderWalkLoop } from './walk-music-loop.ts';

const root = new URL('../../../', import.meta.url);
const output = new URL('docs/world/phase-2-playground/overhaul-20261028/walk-loop-b/', root);
const analysis = JSON.parse(readFileSync(new URL('analysis.json', output), 'utf8'));
const wav = readFileSync(new URL('island-walk-b-loop.wav', output));
const sha = value => createHash('sha256').update(value).digest('hex');
const sample = (frame, channel) => wav.readInt16LE(44 + (frame * 2 + channel) * 2) / 32768;

test('delivered loop has the recorded identity, exact bar length, format, source hashes and bounded size', () => {
  assert.equal(sha(wav), analysis.sha256); assert.equal(wav.length, 3456044); assert.ok(wav.length < 5 * 1024 ** 2);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 2); assert.equal(wav.readUInt32LE(24), WALK_LOOP_RATE);
  assert.equal(wav.readUInt16LE(34), 16); assert.equal(analysis.frames, WALK_LOOP_RATE * WALK_LOOP_SECONDS);
  assert.equal(analysis.frames, 864000); assert.equal(analysis.decoded_bytes, 6912000);
  assert.equal(WALK_LOOP_FORM.reduce((sum, section) => sum + section.bars, 0) * 4 * 60 / 80, 36);
  for (const [path, hash] of Object.entries(analysis.source_hashes)) assert.equal(sha(readFileSync(new URL(path, root))), hash);
});

test('PCM itself has headroom and a continuous non-silent loop seam across three concatenated cycles', () => {
  const count = analysis.frames;
  let peak = 0, clipped = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < count; i++) {
      const value = sample(i, c); peak = Math.max(peak, Math.abs(value));
      if (Math.abs(value) >= 32767 / 32768) clipped++;
    }
    // Read the conceptual triple concatenation around both joins without writing another audio file.
    const repeated = index => sample(index % count, c);
    for (const boundary of [count, count * 2]) {
      const before = repeated(boundary - 1), after = repeated(boundary);
      const step = after - before;
      const left = before - repeated(boundary - 2), right = repeated(boundary + 1) - after;
      assert.ok(Math.abs(step) < .001, 'seam step is below -60 dBFS');
      assert.ok(Math.max(Math.abs(step - left), Math.abs(right - step)) < .0002, 'no new slope spike at the join');
      assert.ok(Math.abs(before) > .005 && Math.abs(after) > .005, 'tail really continues, without fading to digital zero');
    }
  }
  assert.equal(clipped, 0); assert.ok(20 * Math.log10(peak) < -2);
  assert.ok(analysis.true_peak_dbtp < -2); assert.ok(analysis.integrated_lufs > -30 && analysis.integrated_lufs < -20);
});

test('the development retains the B question, removes melody/bass in C and carries finite C tails across the join', () => {
  const notes = walkLoopScore();
  assert.deepEqual(notes.filter(n => n.part === 'felt' && n.bar === 1).map(n => n.midi), [64, 67, 69, 67]);
  assert.deepEqual(notes.filter(n => n.part === 'felt' && n.bar === 5).map(n => n.midi), [64, 67, 71, 69]);
  assert.ok(notes.some(n => n.bar === 7 && n.midi === 56), 'Fm borrowed colour is present in sounding notes');
  assert.ok(notes.filter(n => n.bar >= 9 && n.bar <= 10).every(n => n.part === 'pad' || n.part === 'pluck'));
  assert.ok(notes.filter(n => n.part === 'bass').every(n => n.bar < 9));
  assert.ok(notes.some(n => n.part === 'pad' && n.at + n.duration > 36));
  assert.ok(notes.some(n => n.part === 'felt' && n.midi === 60 && n.at + n.duration > 36));
  for (const note of notes) {
    assert.ok(Number.isFinite(note.at) && note.at >= 0 && note.at < 36);
    assert.ok(note.duration > 0 && note.duration < 5); assert.ok(note.velocity > 0 && note.velocity <= 1);
  }
  const sections = Object.fromEntries(analysis.sections.map(section => [section.id, section]));
  assert.ok(sections.B.rms_dbfs - sections.C.rms_dbfs >= 8, 'subtraction survives the actual exported mix');
});

test('bounded synthesis is deterministic and rejects invalid resource sizes', () => {
  const a = renderWalkLoop(8000), b = renderWalkLoop(8000);
  assert.deepEqual(a, b); assert.equal(a[0].length, 288000);
  assert.throws(() => renderWalkLoop(1000000000), RangeError);
  assert.throws(() => renderWalkLoop(NaN), RangeError);
});
