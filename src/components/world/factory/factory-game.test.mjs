import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTORY_MODULES, FACTORY_LIMITS, createFactoryGame, factoryActions, requestFactoryAction,
  finishFactoryAction, cancelFactoryAction, appendFactoryTrialSample, addFactoryObservation,
  saveFactoryGame, restoreFactoryGame,
} from './factory-game.ts';

const conditions = { testKind: 'slope', loadKg: 2, courseVersion: 'test-course-v1', seed: 7, durationLimitS: 60 };
const measure = (progress, tiltDeg = 4) => ({ progress, speedMps: 1.4, tiltDeg, loadKg: conditions.loadKg });
const sample = (elapsedS, progress, comparison = false) => ({ elapsedS, player: measure(progress), ...(comparison ? { reference: measure(progress, 2) } : {}) });
function commit(state, action, result) {
  const requested = requestFactoryAction(state, action);
  assert.notEqual(requested, state, `Action allowed: ${JSON.stringify(action)}`);
  const finished = finishFactoryAction(requested, requested.pending, result);
  assert.equal(finished.pending, null, `Action finished: ${action.type}`);
  return finished;
}
function produced() {
  let state = createFactoryGame('test-game');
  for (const module of FACTORY_MODULES) state = commit(state, { type: 'extract', module });
  state = commit(state, { type: 'group', config: 'nimble' });
  for (const module of FACTORY_MODULES) {
    state = commit(state, { type: 'route', module, line: module });
    state = commit(state, { type: 'process', module });
  }
  return state;
}
function assembled() { return commit(produced(), { type: 'trial-assemble' }); }
function runTrial(state, mode = 'single') {
  let running = requestFactoryAction(state, { type: 'test', mode, conditions });
  const ticket = running.pending;
  assert.ok(ticket);
  running = appendFactoryTrialSample(running, ticket, sample(0, 0, mode === 'comparison'));
  running = appendFactoryTrialSample(running, ticket, sample(8, 0.45, mode === 'comparison'));
  running = appendFactoryTrialSample(running, ticket, sample(17.3, 1, mode === 'comparison'));
  return finishFactoryAction(running, ticket, { outcome: 'completed' });
}
function tested() { return runTrial(runTrial(assembled()), 'comparison'); }
function inspection(state) {
  return {
    configurationId: state.configuration.id, checkedPartIds: { ...state.configuration.parts },
    checks: { frameSecured: true, wheelsSecured: true, shellSecured: true, safetyStop: true, markings: true },
  };
}

test('raw extraction, grouping and three independent processing lines preserve identities and conserve material', () => {
  let state = createFactoryGame('material-flow');
  const rawIds = FACTORY_MODULES.map(module => state.materials[module].id);
  assert.deepEqual(factoryActions(state).map(action => action.type), ['extract', 'extract', 'extract']);
  assert.equal(requestFactoryAction(state, { type: 'group', config: 'steady' }), state);
  for (const module of FACTORY_MODULES) state = commit(state, { type: 'extract', module });
  state = commit(state, { type: 'group', config: 'steady' });
  const batchId = state.batchId;
  state = commit(state, { type: 'route', module: 'frame', line: 'wheels' });
  assert.equal(requestFactoryAction(state, { type: 'process', module: 'frame' }), state, 'wrong line cannot consume material');
  state = commit(state, { type: 'route', module: 'frame', line: null });
  for (const module of FACTORY_MODULES) {
    state = commit(state, { type: 'route', module, line: module });
    state = commit(state, { type: 'process', module });
    assert.equal(state.parts[module].materialId, state.materials[module].id);
    assert.equal(state.materials[module].status, 'consumed');
    assert.equal(requestFactoryAction(state, { type: 'process', module }), state, 'no duplicate part');
  }
  assert.equal(state.batchId, batchId);
  assert.deepEqual(FACTORY_MODULES.map(module => state.materials[module].id), rawIds);
  assert.equal(new Set(FACTORY_MODULES.map(module => state.parts[module].id)).size, 3);
});

test('complete lifecycle uses measured trials, explicit inspection evidence, a product card and release', () => {
  let state = tested();
  assert.equal(state.trials.length, 2);
  assert.equal(state.trials[0].samples.at(-1).elapsedS, 17.3);
  assert.equal(state.trials[1].reference.role, 'benchmark');
  assert.deepEqual(state.trials[0].conditions, conditions);
  assert.deepEqual(state.trials[1].conditions, conditions);
  state = addFactoryObservation(state, state.trials[0].id, 'shaky');
  assert.deepEqual(state.trials[0].observations, ['shaky']);
  assert.equal(state.trials[0].samples.at(-1).player.tiltDeg, 4, 'observation does not change instrumentation');
  state = commit(state, { type: 'final-assemble' });
  state = commit(state, { type: 'inspect' }, { inspection: inspection(state) });
  assert.deepEqual(state.report.trialIds, state.trials.map(trial => trial.id));
  assert.deepEqual(state.report.configuration.parts, state.configuration.parts);
  state = commit(state, { type: 'release' });
  assert.equal(state.released, true);
  assert.deepEqual(factoryActions(state), []);
  assert.deepEqual(restoreFactoryGame(saveFactoryGame(state)), state);
});

test('requests and simulation samples do not mutate prior state or caller-owned action data', () => {
  const state = assembled(); const before = JSON.stringify(state);
  const action = { type: 'test', mode: 'single', conditions: { ...conditions } };
  const running = requestFactoryAction(state, action);
  action.conditions.loadKg = 999;
  assert.equal(running.pending.action.conditions.loadKg, 2);
  assert.equal(running.trials[0].conditions.loadKg, 2);
  assert.equal(JSON.stringify(state), before);
  const datum = sample(0, 0);
  const sampled = appendFactoryTrialSample(running, running.pending, datum);
  datum.player.progress = 1;
  assert.equal(running.trials[0].samples.length, 0);
  assert.equal(sampled.trials[0].samples[0].player.progress, 0);
});

test('failure, cancellation, retry, duplicate finish and stale callback cannot copy or lose materials', () => {
  let state = createFactoryGame('retry-game');
  let running = requestFactoryAction(state, { type: 'extract', module: 'frame' });
  const failedTicket = running.pending;
  state = finishFactoryAction(running, failedTicket, { ok: false });
  assert.equal(state.materials.frame.status, 'source');
  running = requestFactoryAction(state, { type: 'extract', module: 'frame' });
  const cancelledTicket = running.pending;
  state = cancelFactoryAction(running, cancelledTicket);
  running = requestFactoryAction(state, { type: 'extract', module: 'frame' });
  assert.notEqual(running.pending.token, cancelledTicket.token);
  assert.equal(finishFactoryAction(running, failedTicket), running);
  assert.equal(finishFactoryAction(running, cancelledTicket), running);
  assert.equal(cancelFactoryAction(running, cancelledTicket), running);
  state = finishFactoryAction(running, running.pending);
  assert.equal(finishFactoryAction(state, running.pending), state);
  assert.equal(state.materials.frame.status, 'extracted');
  assert.equal(requestFactoryAction(state, { type: 'extract', module: 'frame' }), state);
});

test('tickets bind token, revision, batch, configuration id and configuration revision', () => {
  const running = requestFactoryAction(assembled(), { type: 'test', mode: 'single', conditions });
  for (const key of ['token', 'batchId', 'configurationId', 'configurationRevision', 'revision']) {
    const wrong = { ...running.pending, [key]: typeof running.pending[key] === 'number' ? running.pending[key] + 1 : `${running.pending[key]}-wrong` };
    assert.equal(finishFactoryAction(running, wrong, { ok: false }), running, key);
    assert.equal(cancelFactoryAction(running, wrong), running, key);
    assert.equal(appendFactoryTrialSample(running, wrong, sample(0, 0)), running, key);
  }
  assert.equal(requestFactoryAction(running, { type: 'rework', module: 'wheels' }), running, 'one physical operation owns station at a time');
});

test('rework returns only the selected module and invalidates current release evidence while retaining old configuration trials', () => {
  let state = tested();
  const oldTrial = structuredClone(state.trials[0]);
  const oldParts = structuredClone(state.parts);
  const oldConfig = structuredClone(state.configuration);
  state = commit(state, { type: 'final-assemble' });
  state = commit(state, { type: 'inspect' }, { inspection: inspection(state) });
  state = commit(state, { type: 'rework', module: 'wheels', config: 'steady' });
  assert.equal(state.parts.wheels, null);
  assert.deepEqual(state.parts.frame, oldParts.frame);
  assert.deepEqual(state.parts.shell, oldParts.shell);
  assert.equal(state.materials.wheels.status, 'grouped');
  assert.equal(state.materials.frame.status, 'consumed');
  assert.equal(state.report, null);
  assert.equal(state.configuration.kind, 'steady');
  assert.equal(state.configuration.revision, oldConfig.revision + 1);
  assert.deepEqual(state.configurations.at(-1), oldConfig);
  assert.deepEqual(state.trials[0], oldTrial);
  state = commit(state, { type: 'route', module: 'wheels', line: 'wheels' });
  state = commit(state, { type: 'process', module: 'wheels' });
  assert.notEqual(state.parts.wheels.id, oldParts.wheels.id);
  assert.equal(state.parts.wheels.materialId, oldParts.wheels.materialId);
  state = commit(state, { type: 'trial-assemble' });
  assert.equal(requestFactoryAction(state, { type: 'final-assemble' }), state, 'old tests cannot approve new configuration');
  state = runTrial(state);
  assert.equal(requestFactoryAction(state, { type: 'final-assemble' }), state, 'new comparison is also required');
  state = runTrial(state, 'comparison');
  state = commit(state, { type: 'final-assemble' });
  assert.deepEqual(state.trials[0], oldTrial);
  assert.deepEqual(restoreFactoryGame(saveFactoryGame(state)), state);
});

test('changing variant requires wheel rework, not merely a shell label', () => {
  const state = tested();
  assert.ok(factoryActions(state).some(action => action.type === 'rework' && action.module === 'wheels' && action.config === 'steady'));
  assert.equal(requestFactoryAction(state, { type: 'rework', module: 'shell', config: 'steady' }), state);
  assert.notEqual(requestFactoryAction(state, { type: 'rework', module: 'shell' }), state);
});

test('empty, unfinished, reset and interrupted trials never satisfy release requirements', () => {
  let state = assembled();
  let running = requestFactoryAction(state, { type: 'test', mode: 'single', conditions });
  assert.equal(finishFactoryAction(running, running.pending, { outcome: 'completed' }), running);
  assert.equal(finishFactoryAction(running, running.pending), running);
  running = appendFactoryTrialSample(running, running.pending, sample(0, 0));
  running = appendFactoryTrialSample(running, running.pending, sample(12, 0.7));
  assert.equal(finishFactoryAction(running, running.pending, { outcome: 'completed' }), running);
  state = finishFactoryAction(running, running.pending, { outcome: 'incomplete', reason: 'stuck-at-ramp' });
  assert.equal(state.trials[0].status, 'incomplete');
  assert.equal(state.trials[0].samples.length, 2);
  running = requestFactoryAction(state, { type: 'test', mode: 'single', conditions });
  state = cancelFactoryAction(running, running.pending);
  assert.equal(state.trials[1].status, 'interrupted');
  state = runTrial(state, 'comparison');
  assert.equal(requestFactoryAction(state, { type: 'final-assemble' }), state);
  assert.equal(requestFactoryAction(state, { type: 'inspect' }), state);
  assert.equal(requestFactoryAction(state, { type: 'release' }), state);
});

test('comparison requires synchronized paired observations, same load and both machines finishing', () => {
  let state = requestFactoryAction(assembled(), { type: 'test', mode: 'comparison', conditions });
  const ticket = state.pending;
  assert.equal(appendFactoryTrialSample(state, ticket, sample(0, 0)), state, 'benchmark measurement required');
  const unequalLoad = sample(0, 0, true); unequalLoad.reference.loadKg = 3;
  assert.equal(appendFactoryTrialSample(state, ticket, unequalLoad), state);
  state = appendFactoryTrialSample(state, ticket, sample(0, 0, true));
  const last = sample(20, 1, true); last.reference.progress = 0.8;
  state = appendFactoryTrialSample(state, ticket, last);
  assert.equal(finishFactoryAction(state, ticket, { outcome: 'completed' }), state);
  state = finishFactoryAction(state, ticket, { outcome: 'incomplete', reason: 'benchmark-stopped' });
  assert.equal(state.trials[0].status, 'incomplete');
});

test('malformed, stale, out of order and out of bounds simulation samples are ignored', () => {
  let state = requestFactoryAction(assembled(), { type: 'test', mode: 'single', conditions });
  const ticket = state.pending;
  assert.equal(appendFactoryTrialSample(state, ticket, sample(1, 1)), state, 'cannot begin at finish');
  state = appendFactoryTrialSample(state, ticket, sample(0, 0));
  for (const bad of [sample(0, 0.5), sample(-1, 0.2), sample(61, 1), sample(1, 1.1), { ...sample(1, 0.5), player: { ...measure(0.5), tiltDeg: NaN } }, sample(1, 0.5, true)]) {
    assert.equal(appendFactoryTrialSample(state, ticket, bad), state);
  }
  state = cancelFactoryAction(state, ticket);
  assert.equal(appendFactoryTrialSample(state, ticket, sample(1, 0.5)), state);
});

test('inspection refuses elapsed-time-only completion, wrong parts, wrong config and failed checks', () => {
  const state = commit(tested(), { type: 'final-assemble' });
  const running = requestFactoryAction(state, { type: 'inspect' });
  assert.equal(finishFactoryAction(running, running.pending), running);
  for (const change of [evidence => { evidence.configurationId = 'old-config'; }, evidence => { evidence.checkedPartIds.wheels = 'old-wheels'; }, evidence => { evidence.checks.safetyStop = false; }]) {
    const evidence = inspection(state); change(evidence);
    assert.equal(finishFactoryAction(running, running.pending, { inspection: evidence }), running);
  }
  const failed = finishFactoryAction(running, running.pending, { ok: false });
  assert.equal(failed.report, null);
  assert.ok(requestFactoryAction(failed, { type: 'inspect' }).pending, 'inspection retry remains possible');
});

test('save and restore clear uncommitted material actions and invalidate old callback without deadlock', () => {
  let state = produced();
  state = commit(state, { type: 'rework', module: 'frame' });
  state = commit(state, { type: 'route', module: 'frame', line: 'frame' });
  const running = requestFactoryAction(state, { type: 'process', module: 'frame' });
  const ticket = running.pending;
  const restored = restoreFactoryGame(saveFactoryGame(running));
  assert.ok(restored);
  assert.equal(restored.pending, null);
  assert.equal(restored.parts.frame, null);
  assert.equal(restored.materials.frame.status, 'routed');
  const retry = requestFactoryAction(restored, { type: 'process', module: 'frame' });
  assert.notEqual(retry.pending.token, ticket.token);
  assert.equal(finishFactoryAction(retry, ticket), retry);
  assert.ok(finishFactoryAction(retry, retry.pending).parts.frame);
  assert.deepEqual(restoreFactoryGame(JSON.stringify(running)), restored, 'raw runtime snapshot is also safely interrupted');
  assert.equal(running.pending.token, ticket.token, 'saving does not mutate live state');
});

test('leaving mid-trial retains incomplete evidence, conditions and identity, then permits a new trial', () => {
  let running = requestFactoryAction(assembled(), { type: 'test', mode: 'comparison', conditions });
  const ticket = running.pending;
  running = appendFactoryTrialSample(running, ticket, sample(0, 0, true));
  running = appendFactoryTrialSample(running, ticket, sample(3, 0.2, true));
  const restored = restoreFactoryGame(saveFactoryGame(running));
  assert.equal(restored.trials[0].status, 'interrupted');
  assert.equal(restored.trials[0].reason, 'session-interrupted');
  assert.deepEqual(restored.trials[0].samples, running.trials[0].samples);
  assert.equal(restored.trials[0].id, running.trials[0].id);
  const retry = requestFactoryAction(restored, { type: 'test', mode: 'comparison', conditions });
  assert.notEqual(retry.pending.trialId, ticket.trialId);
  assert.equal(appendFactoryTrialSample(retry, ticket, sample(10, 1, true)), retry);
});

test('save parser rejects damaged inventory, measurements, reports, impossible stages and oversized histories', () => {
  const good = tested();
  const mutations = [
    s => { s.version = 2; }, s => { s.sequence = -1; }, s => { s.sequence = 1; }, s => { s.materials.frame.status = 'grouped'; },
    s => { s.parts.frame.materialId = s.materials.wheels.id; }, s => { s.parts.frame.id = s.parts.wheels.id; },
    s => { s.configuration.parts.frame = 'invented-part'; }, s => { s.configuration = null; },
    s => { s.trials[0].configuration.revision = 99; }, s => { s.trials[0].configuration.kind = 'steady'; },
    s => { s.trials[0].samples[1].elapsedS = 0; }, s => { s.trials[0].samples.at(-1).player.progress = 0.5; },
    s => { s.trials[1].reference.role = 'player'; }, s => { s.trials[1].samples[0].reference.loadKg = 30; },
    s => { s.released = true; }, s => { s.report = {}; }, s => { s.trials = Array(FACTORY_LIMITS.trials + 1).fill(s.trials[0]); },
    s => { s.pending = { token: 'fake' }; }, s => { s.parts.shell = null; }, s => { s.trials[0].status = 'running'; },
  ];
  for (const mutate of mutations) {
    const damaged = structuredClone(good); mutate(damaged);
    assert.equal(restoreFactoryGame(JSON.stringify(damaged)), null, String(mutate));
  }
  assert.equal(restoreFactoryGame('{bad-json'), null);
  assert.equal(restoreFactoryGame('null'), null);
  assert.equal(restoreFactoryGame('x'.repeat(4_000_001)), null);
});

test('restoring issued reports verifies the complete current configuration snapshot', () => {
  let state = commit(tested(), { type: 'final-assemble' });
  state = commit(state, { type: 'inspect' }, { inspection: inspection(state) });
  for (const change of [report => { report.configuration.kind = 'steady'; }, report => { report.configuration.revision++; }, report => { report.inspection.checks.shellSecured = false; }]) {
    const damaged = structuredClone(state); change(damaged.report);
    assert.equal(restoreFactoryGame(JSON.stringify(damaged)), null);
  }
});

test('history and continuous samples are bounded while preserving initial and terminal data', () => {
  let state = assembled();
  for (let i = 0; i < 60; i++) {
    const requested = requestFactoryAction(state, { type: 'test', mode: 'single', conditions });
    state = cancelFactoryAction(requested, requested.pending);
  }
  assert.equal(state.trials.length, FACTORY_LIMITS.trials);
  assert.equal(state.history.length, FACTORY_LIMITS.history);
  state = requestFactoryAction(state, { type: 'test', mode: 'single', conditions });
  const ticket = state.pending;
  for (let i = 0; i <= 600; i++) state = appendFactoryTrialSample(state, ticket, sample(i / 10, i / 600));
  assert.equal(state.trials.at(-1).samples.length, FACTORY_LIMITS.samples);
  assert.equal(state.trials.at(-1).samples[0].player.progress, 0);
  assert.equal(state.trials.at(-1).samples.at(-1).player.progress, 1);
  state = finishFactoryAction(state, ticket, { outcome: 'completed' });
  assert.equal(state.trials.at(-1).status, 'completed');
  assert.ok(restoreFactoryGame(saveFactoryGame(state)));
});
