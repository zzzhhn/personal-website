import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_CASES } from './ibd-cases.ts';
import { assessIbd } from './ibd-model.ts';
import { ibdStation } from './ibd-yard-layout.ts';
import { ibdGuideResult, ibdGuideStep } from './ibd-yard-guide.ts';
import { canCancelIbdObservation, cancelIbdYardAction, createIbdYardGame, finishIbdYardAction,
  requestIbdYardAction, yardActions, yardCase } from './ibd-yard-game.ts';

const actor = (game, action) => ({ active: true, local: ibdStation(action.station, game.core.moved).at });
function complete(game, action = ibdGuideStep(game).action) {
  const local = actor(game, action), requested = requestIbdYardAction(game, action, local);
  return requested.pending ? finishIbdYardAction(requested, requested.pending.token, local) : requested;
}
function finishBatch(game) {
  for (let i = 0; i < 60 && !game.released; i++) game = complete(game);
  assert.equal(game.released, true);
  return game;
}

test('receiving the next batch is one local action, retains the reusable kit and clears all cargo evidence', () => {
  let game = createIbdYardGame();
  for (let i = 0; i < 4; i++) {
    const shipped = finishBatch(game), next = ibdGuideStep(shipped).action;
    assert.equal(requestIbdYardAction(shipped, next, { active: true, local: [0, 0, 0] }).round, shipped.round);
    game = complete(shipped, next);
    assert.equal(game.caseIndex, (i + 1) % IBD_CASES.length);
    assert.equal(game.round, shipped.round + 1);
    assert.equal(game.started, true); assert.equal(game.equipped, true);
    assert.equal(game.released, false); assert.equal(game.core.shipmentConfirmed, false);
    assert.deepEqual(game.core.proofs, {}); assert.deepEqual(game.core.loaded, []); assert.deepEqual(game.exchanges, []);
    assert.equal(game.reading, undefined); assert.equal(ibdGuideStep(game).action.kind, 'scan');
    const repeated = requestIbdYardAction(game, next, actor(game, next));
    assert.equal(repeated.round, game.round, 'double activation at dispatch must not skip a batch');
    assert.equal(repeated.caseIndex, game.caseIndex);
  }
  const reset = complete(game, yardActions(game, 'manifest').find(a => a.kind === 'reset'));
  assert.equal(reset.started, false); assert.equal(reset.equipped, false);
  assert.equal(reset.completedAction, undefined); assert.equal(ibdGuideStep(reset).action.kind, 'brief');
  const justReceived = complete(createIbdYardGame());
  const skipped = complete(justReceived, yardActions(justReceived, 'manifest').find(a => a.kind === 'next'));
  assert.equal(skipped.equipped, false, 'changing batches cannot grant tools never collected');
  assert.equal(ibdGuideStep(skipped).action.kind, 'kit');
});

test('every batch recovers after duplicate input, suspension, cancellation and re-entry at every timed step', () => {
  const source = JSON.stringify(IBD_CASES);
  for (let index = 0; index < IBD_CASES.length; index++) {
    let game = createIbdYardGame(index);
    for (let i = 0; i < 60 && !game.released; i++) {
      const action = ibdGuideStep(game).action, local = actor(game, action);
      const pending = requestIbdYardAction(game, action, local);
      if (!pending.pending) { game = pending; continue; }
      const token = pending.pending.token;
      const duplicate = requestIbdYardAction(pending, action, local);
      assert.equal(duplicate.pending, pending.pending); assert.equal(duplicate.core, game.core);
      for (const suspended of [{ active: false }, { paused: true }, { hidden: true }])
        assert.equal(finishIbdYardAction(pending, token, { ...local, ...suspended }), pending);
      const cancelled = cancelIbdYardAction(pending);
      assert.equal(cancelled.core, game.core); assert.equal(cancelled.completedAction, game.completedAction);
      assert.equal(finishIbdYardAction(cancelled, token, local), cancelled);
      // A remount reads the stored game. No hidden tutorial counter is needed to resume.
      const reentered = structuredClone(cancelled);
      assert.deepEqual(ibdGuideStep(reentered).action, action);
      const retry = requestIbdYardAction(reentered, action, local);
      assert.ok(retry.pending.token > token);
      assert.equal(finishIbdYardAction(retry, token, local), retry, 'old completion cannot commit the retry');
      game = finishIbdYardAction(retry, retry.pending.token, local);
      assert.equal(finishIbdYardAction(game, retry.pending.token, local), game, 'completion is not applied twice');
    }
    assert.equal(game.released, true, `case ${index}`);
    assert.equal(assessIbd(yardCase(game), game.core).status, 'clear');
    assert.equal(game.exchanges.length, index ? 1 : 0);
  }
  assert.equal(JSON.stringify(IBD_CASES), source);
});

test('only local observations offer cancellation, and walking away never records their result', () => {
  let game = createIbdYardGame(); const kinds = new Set();
  for (let i = 0; i < 40 && !game.released; i++) {
    const action = ibdGuideStep(game).action, local = actor(game, action);
    const pending = requestIbdYardAction(game, action, local);
    if (pending.pending) {
      kinds.add(action.kind);
      const observing = ['kit', 'scan', 'rear', 'weigh', 'open', 'contents', 'verify'].includes(action.kind);
      assert.equal(canCancelIbdObservation(pending), observing, action.kind);
      if (observing) {
        const walked = finishIbdYardAction(pending, pending.pending.token, { active: true, local: [40, 0, 40] });
        assert.equal(walked.notice, 'walked-away'); assert.equal(walked.core, game.core);
        assert.equal(walked.completedAction, game.completedAction);
        assert.deepEqual(ibdGuideStep(walked).action, action);
      }
    }
    game = complete(game);
  }
  assert.ok(kinds.has('load') && kinds.has('release') && kinds.has('verify'));
  assert.equal(canCancelIbdObservation(game), false);
  const equipped = complete(complete(createIbdYardGame()));
  const survey = yardActions(equipped, 'gallery-front')[0];
  const surveying = requestIbdYardAction(equipped, survey, actor(equipped, survey));
  assert.equal(canCancelIbdObservation(surveying), true);
  assert.deepEqual(cancelIbdYardAction(surveying).core.proofs, {});
});

test('feedback reports observed quantities, specifications and defects only after the actual inspection', () => {
  for (const [index, zh, en] of [[1, /B 箱实点 3 件，应有 4 件/, /Pack B: 3 pieces counted; 4 required/],
    [2, /后卷背面已照见凹痕/, /Rear coil: a rear dent/], [3, /B 箱实测 M6，应为 M8/, /Pack B: measured M6; M8 required/]]) {
    let game = createIbdYardGame(index), observed = false;
    for (let i = 0; i < 60 && !game.released; i++) {
      const action = ibdGuideStep(game).action, requested = requestIbdYardAction(game, action, actor(game, action));
      if (requested.pending) assert.deepEqual(ibdGuideResult(requested), { zh: '', en: '' });
      game = complete(game, action);
      const result = ibdGuideResult(game);
      if (game.notice === 'difference-observed') {
        assert.match(result.zh, zh); assert.match(result.en, en); observed = true;
      } else {
        assert.doesNotMatch(result.zh, zh, 'future or quarantined facts must not leak into a new inspection');
      }
      if (action.kind === 'weigh' || action.kind === 'open') assert.doesNotMatch(result.zh, /实点|实测|凹痕/);
    }
    assert.equal(observed, true);
  }
});
