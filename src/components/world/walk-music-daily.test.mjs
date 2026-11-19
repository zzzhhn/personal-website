import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { walkLoopScore } from './walk-music-loop.ts';
import { walkDailyScore, renderDailyVoice, renderWalkDaily, WALK_DAILY_SECONDS, WALK_DAILY_RATE, WALK_DAILY_BPM, WALK_DAILY_FORM } from './walk-music-daily.ts';

test('daily score retains the original question and supports each bar with picked harmony instead of an empty two-bar middle', () => {
  const notes = walkDailyScore();
  assert.deepEqual(notes.filter(n => n.part === 'melody' && n.bar === 1).map(n => n.midi),
    walkLoopScore().filter(n => n.part === 'felt' && n.bar === 1).map(n => n.midi));
  assert.equal(WALK_DAILY_FORM.reduce((sum, section) => sum + section.bars, 0) * 4 * 60 / WALK_DAILY_BPM, WALK_DAILY_SECONDS);
  assert.equal(WALK_DAILY_SECONDS, 40); assert.equal(WALK_DAILY_RATE * WALK_DAILY_SECONDS * 8, 7680000);
  for (let bar = 1; bar <= 16; bar++) {
    assert.ok(notes.filter(n => n.bar === bar && n.part === 'guitar').length >= 3);
    assert.ok(notes.some(n => n.bar === bar && n.part === 'bass'));
  }
  assert.ok(notes.some(n => n.at + n.duration > WALK_DAILY_SECONDS && n.midi === 60));
  assert.ok(notes.filter(n => n.bar % 4 === 0).every(n => n.part !== 'wood'), 'the texture takes musical breaths');
  for (const note of notes) {
    assert.ok(note.at >= 0 && note.at < WALK_DAILY_SECONDS); assert.ok(note.duration > 0 && note.duration <= 2);
    assert.ok(note.velocity > 0 && note.velocity <= 1); assert.ok(Math.abs(note.pan) <= 1);
  }
});

test('small individual picked/wood voices are deterministic, finite and release to zero without a full candidate render', () => {
  const score = walkDailyScore(), signatures = new Set();
  for (const part of ['melody', 'guitar', 'bass', 'wood']) {
    const note = score.find(n => n.part === part), pcm = renderDailyVoice(note, 8000);
    assert.deepEqual(pcm, renderDailyVoice(note, 8000)); assert.equal(pcm.length, Math.ceil(note.duration * 8000));
    assert.equal(Math.abs(pcm[0]), 0); assert.equal(Math.abs(pcm.at(-1)), 0);
    let peak = 0, energy = 0;
    for (const sample of pcm) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2; }
    assert.ok(peak > .005 && peak < .3); assert.ok(energy > .002);
    signatures.add(pcm.slice(20, 40).join(','));
  }
  assert.equal(signatures.size, 4);
  assert.throws(() => renderWalkDaily(NaN), RangeError); assert.throws(() => renderWalkDaily(192000), RangeError);
  assert.throws(() => renderDailyVoice({ ...score[0], duration: Infinity }), RangeError);
});

test('roaming playback excludes offline synthesis and the real exporter protects the previous audition', async t => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const graph = await build({absWorkingDir:root, entryPoints:['src/components/world/park-roaming-music.ts'],
    platform:'browser',bundle:true,write:false,metafile:true});
  assert.ok(!Object.keys(graph.metafile.inputs).some(file=>file.endsWith('/walk-music-daily.ts')));

  const scratch = await mkdtemp(path.join(tmpdir(),'world-audition-'));
  t.after(()=>rm(scratch,{recursive:true,force:true}));
  const output = path.join(scratch,'docs/world/phase-2-playground/qa-20261029/walk-daily-candidate-v24');
  const exporter = path.join(scratch,'tools/world/render-walk-music-daily.mjs');
  await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'score.json'),'earlier audition');
  await build({absWorkingDir:root,entryPoints:['tools/world/render-walk-music-daily.mjs'],
    outfile:exporter,bundle:true,platform:'node',format:'esm'});
  // The isolated exporter gets its own valid lock. Every other filesystem
  // operation is real, including candidate discovery relative to the exporter's URL.
  const lock = path.join(scratch,'lock.mjs');
  await writeFile(lock,`import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const read=fs.readFileSync;
    fs.readFileSync=(p,...args)=>p==='/tmp/bobby-world-phase2-heavy.lock/owner.json'?'{"owner":"test"}':read(p,...args);
    syncBuiltinESMExports();`);
  await assert.rejects(promisify(execFile)(process.execPath,['--import',lock,exporter,'--lock-owner','test'],
    {cwd:scratch}), /Candidate already exists/);
  assert.deepEqual(await readdir(output),['score.json']);
  assert.equal(await readFile(path.join(output,'score.json'),'utf8'),'earlier audition');
  assert.ok(!(await readdir(scratch)).includes('public'));
});

test('finite boundary voices join smoothly without allocating or rendering the full 40-second mix', () => {
  const frames = WALK_DAILY_SECONDS * WALK_DAILY_RATE;
  const boundary = walkDailyScore().filter(note => note.at === 0 || note.at + note.duration > WALK_DAILY_SECONDS)
    .map(note => ({ note, pcm: renderDailyVoice(note), start: Math.round(note.at * WALK_DAILY_RATE) }));
  for (let channel = 0; channel < 2; channel++) {
    const sample = frame => boundary.reduce((sum, { note, pcm, start }) => {
      const local = (frame - start + frames) % frames;
      const panGain = channel ? Math.sin((note.pan + 1) * Math.PI / 4) : Math.cos((note.pan + 1) * Math.PI / 4);
      return sum + (local < pcm.length ? pcm[local] * panGain : 0);
    }, 0);
    const step = sample(0) - sample(frames - 1);
    assert.ok(Math.abs(sample(0)) > .0001, 'the final tail audibly crosses the boundary');
    assert.ok(Math.abs(step) < .001);
    assert.ok(Math.max(Math.abs(step - (sample(frames - 1) - sample(frames - 2))), Math.abs((sample(1) - sample(0)) - step)) < .0003);
  }
});
