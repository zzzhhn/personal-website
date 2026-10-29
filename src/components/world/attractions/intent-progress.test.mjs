import test from 'node:test';
import assert from 'node:assert/strict';
import { INTENT_TASKS, normalizeIntent } from './intent-tasks.ts';
import { createIntentProgress, transitionIntent, intentProgressView, serializeIntentProgress, restoreIntentProgress } from './intent-progress.ts';

const submit = (state, taskId, answer) => transitionIntent(state, { type: 'submit', taskId, answer });
const six = () => INTENT_TASKS.slice(0, 6).reduce((state, task) => submit(state, task.id, task.intent).state, createIntentProgress());
const act = (state, type) => transitionIntent(state, { type });

test('seven original bilingual scenarios define six intent classes and one explicit clarification', () => {
  assert.equal(INTENT_TASKS.length, 7);
  assert.equal(new Set(INTENT_TASKS.map(task => task.id)).size, 7);
  assert.equal(new Set(INTENT_TASKS.map(task => task.intent)).size, 6);
  for (const task of INTENT_TASKS) {
    for (const field of ['request', 'interaction', 'retry']) {
      assert.ok(task[field].zh.length > 5 && task[field].en.length > 5);
    }
  }
  assert.deepEqual(INTENT_TASKS.filter(task => task.clarification).map(task => task.id), ['T7']);
});

test('aliases use exact normalized labels, never keyword or multiple-answer guessing', () => {
  assert.equal(normalizeIntent('  LOOK   UP '), 'lookup');
  assert.equal(normalizeIntent('ＲＥＷＲＩＴＥ'), 'rewrite');
  assert.equal(normalizeIntent('代码排错'), 'debug');
  assert.equal(normalizeIntent('查询／执行'), null);
  assert.equal(normalizeIntent('please lookup and book'), null);
  assert.equal(submit(createIntentProgress(), 'T1', 'lookup+act').code, 'unknown-intent');
});

test('availability and execution remain different goals even with the same seat prop', () => {
  const start = createIntentProgress();
  assert.equal(submit(start, 'T1', 'act').code, 'incorrect');
  assert.match(submit(start, 'T1', 'act').message.en, /Booking changes/);
  assert.equal(submit(start, 'T1', '查询').code, 'passed');
  assert.equal(submit(start, 'T6', 'lookup').code, 'incorrect');
  assert.equal(submit(start, 'T6', '预订').code, 'passed');
  assert.equal(submit(start, 'unknown', 'lookup').code, 'unknown-task');
});

test('an underspecified request needs relevant clarification before even a lucky correct answer', () => {
  const start = createIntentProgress();
  assert.equal(submit(start, 'T7', 'rewrite').code, 'needs-clarification');
  const irrelevant = transitionIntent(start, { type: 'ask', taskId: 'T7', questionId: 'favorite-color' });
  assert.equal(irrelevant.code, 'irrelevant-question');
  assert.equal(irrelevant.state, start);
  const ask = { type: 'ask', taskId: 'T7', questionId: 'desired-outcome' };
  const clarified = transitionIntent(start, ask);
  assert.match(clarified.reply.en, /Do not send/);
  assert.deepEqual(transitionIntent(clarified.state, ask).state.clarified, ['T7']);
  assert.equal(submit(clarified.state, 'T7', 'act').code, 'incorrect');
  assert.equal(submit(clarified.state, 'T7', '润色').code, 'passed');
});

test('six unique successes unlock eligibility, followed by lid, visible key and gate in order', () => {
  const start = createIntentProgress();
  assert.equal(act(start, 'open-chest').code, 'more-tasks-required');
  const ready = six();
  assert.equal(intentProgressView(ready).correct, 6);
  assert.equal(intentProgressView(ready).canRide, false);
  assert.equal(submit(ready, 'T1', 'wrong').code, 'already-passed');
  assert.equal(act(ready, 'take-key').code, 'open-chest-first');
  assert.equal(act(ready, 'unlock-gate').code, 'key-required');
  const open = act(ready, 'open-chest').state;
  assert.equal(intentProgressView(open).keyLocation, 'chest');
  assert.equal(act(open, 'unlock-gate').code, 'key-required');
  const key = act(open, 'take-key').state;
  assert.equal(intentProgressView(key).keyLocation, 'hand');
  assert.equal(act(key, 'take-key').code, 'key-already-taken');
  const gate = act(key, 'unlock-gate').state;
  assert.equal(intentProgressView(gate).keyLocation, 'gate');
  assert.equal(intentProgressView(gate).canRide, true);
  assert.deepEqual(act(gate, 'unlock-gate').state, gate);
});

test('wrong retries preserve earlier progress; clarified T7 can replace any other sixth task', () => {
  let state = INTENT_TASKS.slice(0, 5).reduce((s, task) => submit(s, task.id, task.intent).state, createIntentProgress());
  assert.equal(submit(state, 'T6', 'plan').state, state);
  assert.equal(intentProgressView(state).chestReady, false);
  state = transitionIntent(state, { type: 'ask', taskId: 'T7', questionId: 'desired-outcome' }).state;
  state = submit(state, 'T7', 'rewrite').state;
  assert.equal(intentProgressView(state).correct, 6);
  assert.equal(intentProgressView(state).chestReady, true);
  assert.equal(state.passed.includes('T6'), false);
});

test('valid progress survives a storage round trip at each physical action stage', () => {
  let state = six();
  for (const type of ['open-chest', 'take-key', 'unlock-gate']) {
    state = act(state, type).state;
    const restored = restoreIntentProgress(serializeIntentProgress(state));
    assert.equal(restored.status, 'restored');
    assert.deepEqual(restored.state, state);
    assert.notEqual(restored.state.passed, state.passed);
  }
  assert.equal(restoreIntentProgress(null).status, 'empty');
});

test('malformed, duplicate and impossible saved states cannot bypass the six-task sequence', () => {
  const start = createIntentProgress();
  const bad = [
    { ...start, passed: ['T1', 'T1'] }, { ...start, passed: ['unknown'] },
    { ...start, passed: ['T7'] }, { ...start, clarified: ['T1'] },
    { ...start, chestOpen: true }, { ...six(), keyTaken: true },
    { ...six(), chestOpen: true, gateOpen: true }, { ...start, gateOpen: 'false' },
  ];
  for (const value of bad) assert.equal(restoreIntentProgress(JSON.stringify(value)).status, 'invalid');
  for (const raw of ['{', 'null', '[]', 'x'.repeat(8193)]) assert.equal(restoreIntentProgress(raw).status, 'invalid');
  assert.throws(() => serializeIntentProgress(bad[4]), TypeError);
});

test('incompatible versions are reported without writing or silently upgrading the old record', () => {
  for (const value of [{ ...six(), version: 99 }, { ...six(), bankRevision: 'different-bank' }]) {
    const raw = JSON.stringify(value);
    const result = restoreIntentProgress(raw);
    assert.equal(result.status, 'incompatible');
    assert.equal(result.state.gateOpen, false);
    assert.equal(JSON.stringify(value), raw);
  }
});

test('reducers preserve caller state and explicit reset affects only the returned attraction state', () => {
  const state = createIntentProgress();
  Object.freeze(state.passed); Object.freeze(state.clarified); Object.freeze(state);
  const passed = submit(state, 'T1', 'lookup').state;
  assert.deepEqual(state.passed, []);
  assert.deepEqual(act(passed, 'reset').state, createIntentProgress());
  assert.deepEqual(passed.passed, ['T1']);
});
