import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTORY_MODULES, FACTORY_LIMITS, createFactoryGame, factoryActions, requestFactoryAction,
  finishFactoryAction, cancelFactoryAction, appendFactoryTrialSample, addFactoryObservation,
  canStartNextFactoryBatch, startNextFactoryBatch, saveFactoryGame, restoreFactoryGame,
} from './factory-game.ts';
import { useWorldStore } from '../store.ts';
import {
  useFactoryStore, factoryActor, factoryControl, canStartNextFactoryBatchHere,
  startNextFactoryBatch as startNextBatchHere, finishFactoryOperation,
} from './factory-store.ts';
import { factoryStation, factoryWorld } from './factory-layout.ts';

const conditions = { testKind: 'slope', loadKg: 2, courseVersion: 'batch-course-v1', seed: 7, durationLimitS: 60 };
function commit(game, action, result) {
  const running = requestFactoryAction(game, action);
  assert.ok(running.pending, action.type);
  const next = finishFactoryAction(running, running.pending, result);
  assert.equal(next.pending, null, action.type);
  return next;
}
function produce(game = createFactoryGame('next-batch'), config = 'nimble') {
  for (const module of FACTORY_MODULES) game = commit(game, { type: 'extract', module });
  game = commit(game, { type: 'group', config });
  for (const module of FACTORY_MODULES) {
    game = commit(game, { type: 'route', module, line: module });
    game = commit(game, { type: 'process', module });
  }
  return commit(game, { type: 'trial-assemble' });
}
function trial(game, mode) {
  let running = requestFactoryAction(game, { type: 'test', mode, conditions });
  const ticket = running.pending;
  for (const [elapsedS, progress] of [[0, 0], [19, 1]]) {
    const player = { progress, speedMps: 1.1, tiltDeg: 3, loadKg: conditions.loadKg };
    running = appendFactoryTrialSample(running, ticket, { elapsedS, player,
      ...(mode === 'comparison' ? { reference: { ...player, tiltDeg: 2 } } : {}) });
  }
  return finishFactoryAction(running, ticket, { outcome: 'completed' });
}
function inspected(game = produce()) {
  game = commit(trial(trial(game, 'single'), 'comparison'), { type: 'final-assemble' });
  return commit(game, { type: 'inspect' }, { inspection: {
    configurationId: game.configuration.id, checkedPartIds: { ...game.configuration.parts },
    checks: { frameSecured: true, wheelsSecured: true, shellSecured: true, safetyStop: true, markings: true },
  } });
}
const released = (game = inspected()) => commit(game, { type: 'release' });

test('next batch requires completed inspection and committed dispatch with no pending action', () => {
  const ready = inspected();
  const dispatching = requestFactoryAction(ready, { type: 'release' });
  for (const game of [createFactoryGame(), produce(), ready, dispatching, { ...released(), report: null },
    { ...released(), finalAssembled: false }, { ...released(), pending: dispatching.pending },
    { ...released(), sequence: Number.MAX_SAFE_INTEGER - 1 }, { ...released(), revision: Number.MAX_SAFE_INTEGER - 1 }]) {
    assert.equal(canStartNextFactoryBatch(game), false);
    assert.equal(startNextFactoryBatch(game), game);
  }
  assert.equal(canStartNextFactoryBatch(released()), true);
});

test('next batch archives exact product evidence and rework while clearing all current production', () => {
  let game = trial(produce(), 'single');
  game = addFactoryObservation(game, game.trials[0].id, 'review');
  game = requestFactoryAction(game, { type: 'test', mode: 'comparison', conditions });
  game = appendFactoryTrialSample(game, game.pending, { elapsedS: 0,
    player: { progress: 0, speedMps: 0, tiltDeg: 0, loadKg: 2 }, reference: { progress: 0, speedMps: 0, tiltDeg: 0, loadKg: 2 } });
  game = cancelFactoryAction(game, game.pending);
  game = commit(game, { type: 'rework', module: 'wheels', config: 'steady' });
  game = commit(game, { type: 'route', module: 'wheels', line: 'wheels' });
  game = commit(game, { type: 'process', module: 'wheels' });
  game = released(inspected(commit(game, { type: 'trial-assemble' })));
  const before = structuredClone(game), next = startNextFactoryBatch(game);
  const { archives, ...snapshot } = before;
  assert.deepEqual(next.archives, [snapshot]);
  assert.deepEqual(game, before, 'archival never mutates the finished game');
  assert.equal(next.gameId, game.gameId);
  assert.ok(next.sequence > game.sequence && next.revision > game.revision);
  for (const key of ['batchId', 'configuration', 'report', 'pending']) assert.equal(next[key], null, key);
  for (const key of ['trialAssembled', 'finalAssembled', 'released']) assert.equal(next[key], false, key);
  for (const key of ['trials', 'configurations', 'history']) assert.deepEqual(next[key], [], key);
  for (const module of FACTORY_MODULES) {
    assert.equal(next.parts[module], null);
    assert.equal(next.materials[module].status, 'source');
    assert.equal(next.materials[module].line, null);
    assert.notEqual(next.materials[module].id, game.materials[module].id);
  }
  assert.deepEqual(factoryActions(next).map(a => a.type), ['extract', 'extract', 'extract']);
  assert.equal(next.archives[0].trials[0].observations[0], 'review');
  assert.equal(next.archives[0].trials[1].status, 'interrupted');
  assert.deepEqual(next.archives[0].trials[1].samples, before.trials[1].samples);
  assert.ok(next.archives[0].history.some(event => event.action === 'rework' && event.outcome === 'completed'));
  assert.equal(next.archives[0].configurations.length, 1);
  next.archives[0].trials[0].samples[0].player.tiltDeg = 90;
  assert.deepEqual(game, before, 'archived records share no mutable objects with the old game');
});

test('bounded archives survive repeated batches and restore without reusing physical or trial identities', () => {
  let game = createFactoryGame('many-batches');
  const seen = new Set(), completed = [];
  for (let index = 0; index < FACTORY_LIMITS.archives + 2; index++) {
    game = released(inspected(produce(game, index % 2 ? 'steady' : 'nimble')));
    for (const identity of [game.batchId, game.configuration.id, game.report.id,
      ...FACTORY_MODULES.flatMap(module => [game.materials[module].id, game.parts[module].id]), ...game.trials.map(t => t.id)]) {
      assert.equal(seen.has(identity), false, identity); seen.add(identity);
    }
    completed.push(game.batchId);
    game = startNextFactoryBatch(game);
    assert.deepEqual(game.archives.map(a => a.batchId), completed.slice(-FACTORY_LIMITS.archives));
    assert.deepEqual(restoreFactoryGame(saveFactoryGame(game)), game);
  }
  assert.equal(game.archives.length, FACTORY_LIMITS.archives);
});

test('second batch samples and state transitions share immutable archives without cloning or changing their contents', () => {
  let game = startNextFactoryBatch(released());
  const archives = game.archives, archive = archives[0], evidence = structuredClone(archives);
  const freezeTree = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freezeTree(child);
      Object.freeze(value);
    }
  };
  freezeTree(archives);
  const stable = () => {
    assert.equal(game.archives, archives);
    assert.equal(game.archives[0], archive);
    assert.deepEqual(game.archives, evidence);
  };
  game = produce(game, 'steady'); stable();
  game = requestFactoryAction(game, { type: 'test', mode: 'single', conditions }); stable();
  const ticket = game.pending;
  for (const [elapsedS, progress] of [[0, 0], [4, .25], [19, 1]]) {
    game = appendFactoryTrialSample(game, ticket, { elapsedS,
      player: { progress, speedMps: 1.1, tiltDeg: 3, loadKg: 2 } });
    stable();
  }
  game = addFactoryObservation(game, ticket.trialId, 'smooth'); stable();
  game = finishFactoryAction(game, ticket, { outcome: 'completed' }); stable();
  game = requestFactoryAction(game, { type: 'test', mode: 'comparison', conditions }); stable();
  game = appendFactoryTrialSample(game, game.pending, { elapsedS: 0,
    player: { progress: 0, speedMps: 0, tiltDeg: 0, loadKg: 2 },
    reference: { progress: 0, speedMps: 0, tiltDeg: 0, loadKg: 2 } }); stable();
  const saved = saveFactoryGame(game); stable();
  assert.deepEqual(restoreFactoryGame(saved).archives, evidence);
  assert.ok(game.pending, 'saving only interrupts the serialized active state');
  game = cancelFactoryAction(game, game.pending); stable();
  game = released(inspected(game)); stable();
  const next = startNextFactoryBatch(game);
  assert.notEqual(next.archives, archives, 'a new archive list is allocated only when appending a batch');
  assert.equal(next.archives[0], archive, 'older immutable batches remain shared when a batch is appended');
  assert.notEqual(next.archives.at(-1).trials, game.trials, 'the newly archived active batch is isolated');
  assert.deepEqual(next.archives[0], evidence[0]);
});

test('legacy v1 saves retain their exact committed state and raw runtime saves interrupt safely', () => {
  for (const game of [createFactoryGame('legacy'), produce(), released()]) {
    const { archives, ...legacy } = game;
    const restored = restoreFactoryGame(JSON.stringify(legacy));
    assert.deepEqual(restored, { ...legacy, archives: [] });
    if (restored.released) assert.ok(startNextFactoryBatch(restored).archives[0].report);
  }
  const running = requestFactoryAction(startNextFactoryBatch(released()), { type: 'extract', module: 'frame' });
  const restored = restoreFactoryGame(JSON.stringify(running));
  assert.equal(restored.pending, null);
  assert.equal(restored.materials.frame.status, 'source');
  assert.deepEqual(restored.archives, running.archives);
  const retry = requestFactoryAction(restored, { type: 'extract', module: 'frame' });
  assert.notEqual(retry.pending.token, running.pending.token);
  assert.equal(finishFactoryAction(retry, running.pending), retry);
});

test('previous batch callbacks cannot finish, cancel or sample a new batch operation', () => {
  const dispatch = requestFactoryAction(inspected(), { type: 'release' }), ticket = dispatch.pending;
  const next = requestFactoryAction(startNextFactoryBatch(finishFactoryAction(dispatch, ticket)), { type: 'extract', module: 'frame' });
  assert.equal(finishFactoryAction(next, ticket), next);
  assert.equal(cancelFactoryAction(next, ticket), next);
  assert.equal(appendFactoryTrialSample(next, ticket, {}), next);
  assert.notEqual(next.pending.token, ticket.token);
});

test('restore rejects fabricated archive evidence, duplicate batches and unbounded or nested archives', () => {
  const good = startNextFactoryBatch(released());
  const changes = [
    game => { game.archives = null; }, game => { game.archives[0].released = false; },
    game => { game.archives[0].gameId = 'another-game'; },
    game => { game.archives[0].report.inspection.checks.safetyStop = false; },
    game => { game.archives[0].trials[0].samples.at(-1).player.progress = .5; },
    game => { game.archives[0].sequence = game.sequence; },
    game => { game.archives[0].revision = game.revision; },
    game => { game.archives[0].archives = []; },
    game => { game.archives.push(structuredClone(game.archives[0])); },
    game => { game.archives = Array(FACTORY_LIMITS.archives + 1).fill(game.archives[0]); },
    game => { game.materials.frame.id = `${game.gameId}:raw:frame`; },
  ];
  for (const change of changes) {
    const damaged = structuredClone(good); change(damaged);
    assert.equal(restoreFactoryGame(JSON.stringify(damaged)), null, String(change));
  }
});

test('dispatch store authorizes location and world state, clears temporary controls and persists the new run', () => {
  const worldBefore = useWorldStore.getState(), storeBefore = useFactoryStore.getState();
  const actorBefore = structuredClone(factoryActor), controlBefore = { ...factoryControl, input: { ...factoryControl.input } };
  const descriptors = Object.fromEntries(['document', 'window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let saved = null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key, value) => { saved = { key, value }; } } });
  const done = released();
  const reset = () => {
    useWorldStore.setState({ paused: false, poolInspect: false, activeVehicle: null, seat: null, card: null, clubMode: null, factoryStation: 'release', waypoint: [1, 2] });
    useFactoryStore.setState({ game: done, active: true, printSequence: 5, dispatchView: 'printer', phase: 'old-phase', aligned: true, route: [[1, 2, 3]], notice: 'completed' });
    Object.assign(factoryActor, { available: true, grounded: true, position: factoryWorld(factoryStation('release').at) });
    document.hidden = false;
  };
  try {
    const blockers = [
      () => useFactoryStore.setState({ active: false }), () => useWorldStore.setState({ factoryStation: 'raw' }),
      () => useWorldStore.setState({ paused: true }), () => useWorldStore.setState({ poolInspect: true }),
      () => useWorldStore.setState({ activeVehicle: 'test-vehicle' }), () => useWorldStore.setState({ seat: {} }),
      () => useWorldStore.setState({ card: 'test-card' }), () => useWorldStore.setState({ clubMode: 'test' }),
      () => { document.hidden = true; }, () => { factoryActor.available = false; }, () => { factoryActor.grounded = false; },
      () => { factoryActor.position[0] += 1; }, () => { factoryActor.position[1] += 3; },
      () => useFactoryStore.setState({ game: inspected() }),
      () => useFactoryStore.setState({ game: { ...done, pending: { token: 'busy' } } }),
    ];
    for (const block of blockers) {
      reset(); block(); const before = useFactoryStore.getState();
      assert.equal(canStartNextFactoryBatchHere(), false, String(block));
      assert.equal(startNextBatchHere(), false, String(block));
      assert.equal(useFactoryStore.getState(), before, 'rejection leaves the current save and temporary state intact');
    }
    reset(); assert.equal(canStartNextFactoryBatchHere(), true);
    factoryControl.operation = { phase: 'old' }; factoryControl.inspection = { step: 3 };
    Object.assign(factoryControl.input, { x: 1, z: -1, held: true, confirm: true });
    assert.equal(startNextBatchHere(), true);
    const next = useFactoryStore.getState();
    assert.deepEqual(next.game, startNextFactoryBatch(done));
    assert.equal(next.printSequence, 0); assert.equal(next.dispatchView, 'dock');
    assert.equal(next.phase, ''); assert.equal(next.aligned, false); assert.equal(next.notice, null); assert.equal(next.route, null);
    assert.equal(useWorldStore.getState().waypoint, null);
    assert.equal(useWorldStore.getState().factoryStation, 'release');
    assert.equal(factoryControl.operation, null); assert.equal(factoryControl.inspection, null);
    assert.deepEqual(factoryControl.input, { x: 0, z: 0, held: false, confirm: false });
    assert.equal(saved.key, 'bobby.factory.v1');
    assert.deepEqual(restoreFactoryGame(saved.value), next.game);
    assert.equal(next.save, 'saved'); assert.equal(startNextBatchHere(), false);
    assert.equal(finishFactoryOperation({ token: 'previous-batch' }), false);
    const previousDiskSave = saved;
    reset(); localStorage.setItem = () => { throw new Error('quota exceeded'); };
    assert.equal(startNextBatchHere(), true, 'quota failures preserve the new run in memory');
    assert.equal(useFactoryStore.getState().save, 'memory');
    assert.deepEqual(useFactoryStore.getState().game, next.game);
    assert.equal(saved, previousDiskSave, 'a failed write never removes the previous valid disk save');
  } finally {
    useWorldStore.setState(worldBefore, true); useFactoryStore.setState(storeBefore, true);
    Object.assign(factoryActor, actorBefore); Object.assign(factoryControl, controlBefore);
    for (const key of Object.keys(descriptors)) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]); else delete globalThis[key];
    }
  }
});
