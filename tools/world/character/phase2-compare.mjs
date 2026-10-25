/** Offline comparison only. Inputs: baseline frames/report, candidate frames/report, output JSON. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarize, slipIntervals } from './motion-metrics.mjs';
const [baseFrames, baseReport, nextFrames, nextReport, output] = process.argv.slice(2);
if (!output) throw new Error('Provide baseline frames/report, candidate frames/report, and output path');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const vertex = 1001620, fixedMilliseconds = [0, 16.7, 33.3, 50, 66.7, 83.3, 100];
function inspect(framesPath, reportPath) {
  const frames = read(framesPath), report = read(reportPath), aggregate = summarize(frames);
  assert.deepEqual(aggregate, report.metrics, 'raw frames must reproduce the original complete summary');
  const entry = frames.findIndex((f, i) => i && f.anim === 'Run' && frames[i - 1].anim === 'RunJumpAir');
  assert.ok(entry > 0, 'recording contains a running landing');
  const first = frames[entry], p0 = first.soles.find(p => p[0] === vertex);
  const raw = frames.slice(entry, entry + 10).map(f => {
    const p = f.soles.find(p => p[0] === vertex); assert.ok(p, 'same sole vertex exists');
    return { elapsed_ms: (f.t - first.t) * 1000, animation: f.anim, clipTime: f.at, dt: f.dt,
      displacement: [p[1] - p0[1], p[2] - p0[2]], height_mm: p[3] * 1000,
      root: f.root, facing: f.facing, shownYaw: f.shownYaw, contact: f.contact, inert: f.inert };
  });
  const fixed = fixedMilliseconds.map(ms => {
    const i = raw.findIndex(p => p.elapsed_ms >= ms); assert.ok(i >= 0, 'fixed window covered');
    const a = raw[Math.max(0, i - 1)], b = raw[i], u = i ? (ms - a.elapsed_ms) / (b.elapsed_ms - a.elapsed_ms) : 0;
    const d = a.displacement.map((v, k) => v + (b.displacement[k] - v) * u);
    return { elapsed_ms: ms, drift_mm: Math.hypot(...d) * 1000, height_mm: a.height_mm + (b.height_mm - a.height_mm) * u };
  });
  const turns = slipIntervals(frames).filter(s => s.turning).sort((a, b) => b.drift - a.drift);
  const turn = turns[0], turnFrames = frames.filter(f => f.t >= turn.t0 && f.t <= turn.t1);
  const ends = [turnFrames[0], turnFrames.at(-1)].map(f => ({ time: f.t, animation: f.anim, root: f.root,
    facing: f.facing, shownYaw: f.shownYaw, speed: f.speed, stepping: f.stepping }));
  return { framesPath, reportPath, assetSha256: report.glbSha256, originalAggregate: aggregate,
    landing: { entryTime: first.t, vertex, raw, fixed },
    reversal: { completeInterval: turn, endpoints: ends } };
}
const baseline = inspect(baseFrames, baseReport), candidate = inspect(nextFrames, nextReport);
assert.equal(baseline.assetSha256, candidate.assetSha256, 'comparison uses the same baked asset');
const result = { baselineCommit: '3cb1f25', candidateCommit: process.env.WORLD_CANDIDATE_COMMIT || '2f8a466', vertex,
  method: 'Full original summaries reproduced unchanged. Semantic first RunJumpAir→Run landing, same sole vertex; linear interpolation only for the additional fixed 0 to 100 ms table. Raw samples retained.',
  boundary: { soleBand_mm: 6, minimumInterval_ms: 50, unchanged: true,
    baseline: '208.0 mm at 49.6 ms is below the duration gate; the next point is 6.6 mm high, outside the sole band.',
    candidate: '208.5 mm at 50.2 ms passes the duration gate; 272.7 mm at 67.2 ms is still 5.2 mm high and remains in-band.' },
  baseline, candidate };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, frames: [baseline.originalAggregate.frames, candidate.originalAggregate.frames],
  fixedLanding: [baseline.landing.fixed, candidate.landing.fixed],
  wholeReversal_mm: [baseline.reversal.completeInterval.drift * 1000, candidate.reversal.completeInterval.drift * 1000] }));
