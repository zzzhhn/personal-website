import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryGame } from './factory-game.ts';
import { factoryLaneReadings, factoryTrialHasCompletedEvidence, selectFactoryReadings, factoryTrialRound, factoryTrialReason } from './factory-readings.ts';

const configuration = { id: 'readings:config:1', revision: 1, kind: 'nimble', parts: { frame: 'frame:1', wheels: 'wheels:1', shell: 'shell:1' } };
const conditions = { testKind: 'slope', loadKg: 2, courseVersion: 'factory-course-v1', seed: 1, durationLimitS: 60 };
const measurement = (progress, speedMps = 1.4, tiltDeg = 3) => ({ progress, speedMps, tiltDeg, loadKg: 2 });
const sample = (elapsedS, playerProgress, referenceProgress = playerProgress) => ({
  elapsedS, player: measurement(playerProgress), reference: measurement(referenceProgress, 1.1, -6),
});
function trial(number, mode = 'single', override = {}) {
  return {
    id: `readings:action:${number}:trial`, batchId: 'readings:batch:1', configuration: structuredClone(configuration), mode,
    conditions: structuredClone(conditions), reference: mode === 'comparison' ? { id: 'factory-reference-v1', role: 'benchmark' } : null,
    status: 'completed', reason: null,
    samples: [sample(0, 0), sample(5, .6), sample(10, 1)].map(({ reference, ...entry }) => mode === 'comparison' ? { ...entry, reference } : entry),
    observations: [], ...override,
  };
}
function game(trials, override = {}) {
  return { ...createFactoryGame('readings'), batchId: 'readings:batch:1', configuration: structuredClone(configuration), trials, ...override };
}

test('comparison console never borrows the preceding single trial', () => {
  assert.equal(selectFactoryReadings(game([trial(1)]), 'comparison').current, null);
  const comparison = trial(2, 'comparison');
  assert.equal(selectFactoryReadings(game([trial(1), comparison, trial(3)]), 'comparison').current, comparison);
  assert.deepEqual(selectFactoryReadings(game([trial(1)]), 'comparison').history, []);
});

test('a running round without samples replaces old results immediately', () => {
  const previous = trial(1, 'comparison'), running = trial(2, 'comparison', { status: 'running', samples: [] });
  const result = selectFactoryReadings(game([previous, running], { pending: { trialId: running.id } }), 'comparison');
  assert.equal(result.current, running);
  assert.deepEqual(result.history, [previous]);
  assert.deepEqual(factoryLaneReadings(running, 'reference'), {
    latest: null, recordedThroughS: null, arrivalS: null, finishSpeedMps: null, recordedPeakTiltDeg: null,
  });
});

test('rework preserves historical identities without promoting old results to the new configuration', () => {
  const old = trial(1), state = game([old], { configuration: { ...configuration, id: 'readings:config:2', revision: 2 } });
  assert.equal(selectFactoryReadings(state, 'single').current, null);
  assert.deepEqual(selectFactoryReadings(state, 'single').history, [old]);
  assert.equal(selectFactoryReadings(game([old], { configuration: { ...configuration, parts: { ...configuration.parts, wheels: 'wheels:2' } } }), 'single').current, null);
  assert.equal(selectFactoryReadings(game([old], { batchId: 'other-batch' }), 'single').current, null);
  assert.equal(factoryTrialRound(old), '1');
});

test('both lanes retain their own sampled finish time, finish speed and absolute peak tilt', () => {
  const record = trial(2, 'comparison', { samples: [
    sample(0, 0),
    { elapsedS: 5, player: measurement(.6, 1.8, -17), reference: measurement(.4, 1.2, 8) },
    { elapsedS: 8, player: measurement(1, 0, 2), reference: measurement(.7, 1.1, -12) },
    { elapsedS: 11, player: measurement(1, 0, 2), reference: measurement(1, 0, 4) },
  ] });
  const player = factoryLaneReadings(record, 'player'), reference = factoryLaneReadings(record, 'reference');
  assert.equal(player.arrivalS, 8);
  assert.equal(reference.arrivalS, 11);
  assert.equal(player.finishSpeedMps, 0, 'safety-stop measurement is not replaced with an invented moving speed');
  assert.equal(player.recordedPeakTiltDeg, 17);
  assert.equal(reference.recordedPeakTiltDeg, 12);
  assert.equal(player.recordedThroughS, 11);
  assert.equal(factoryTrialHasCompletedEvidence(record), true);
});

test('incomplete and interrupted trials keep measurements without becoming successful results', () => {
  const partial = trial(2, 'comparison', { status: 'incomplete', reason: 'stalled', samples: [sample(0, 0), sample(9, 1, .5)] });
  assert.equal(factoryTrialHasCompletedEvidence(partial), false);
  assert.equal(factoryLaneReadings(partial, 'player').arrivalS, 9);
  assert.equal(factoryLaneReadings(partial, 'reference').arrivalS, null);
  assert.equal(factoryLaneReadings(partial, 'reference').finishSpeedMps, null);
  assert.equal(factoryTrialHasCompletedEvidence({ ...partial, status: 'completed' }), false);
  assert.equal(factoryTrialHasCompletedEvidence(trial(3, 'single', { status: 'interrupted', reason: 'operator-cancelled' })), false);
  assert.equal(factoryTrialHasCompletedEvidence(trial(4, 'comparison', { samples: [] })), false);
});

test('no readings or peak are fabricated for a missing benchmark; reason codes remain inspectable', () => {
  const record = trial(2, 'comparison', { samples: [{ elapsedS: 0, player: measurement(0) }] });
  assert.equal(factoryLaneReadings(record, 'reference').recordedPeakTiltDeg, null);
  assert.equal(factoryTrialHasCompletedEvidence(record), false);
  assert.equal(factoryTrialReason('new-physics-reason', true), 'new-physics-reason');
  assert.equal(factoryTrialReason(null, false), null);
});
