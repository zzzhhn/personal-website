import test from 'node:test';
import assert from 'node:assert/strict';
import { createIbdYardGame, yardActions, yardItemId, yardItemJudged, yardItemDifferent,
  requestIbdYardAction, finishIbdYardAction } from './ibd-yard-game.ts';
import { ibdStation } from './ibd-yard-layout.ts';
import { ibdGuideStep, ibdGuidePhaseDone } from './ibd-yard-guide.ts';
import { ibdVerdictOptions, ibdVerdictEvidence } from './ibd-yard-verdict.ts';
import { ibdNotice } from './ibd-yard-copy.ts';
import { inspectIbdTestPack } from './ibd-test-pack-inspection.mjs';
import { ibdStockItem } from './ibd-stock.ts';

const actor = (g, station) => ({ active: true, local: ibdStation(station, g.core.moved).at });
function act(g, station, kind, verdict) {
  const offered = yardActions(g, station).find(a => !kind || a.kind === kind);
  assert.ok(offered, `${station}/${kind}`);
  if (offered.kind === 'contents') return inspectIbdTestPack(g, offered);
  const a = verdict ? { ...offered, verdict } : offered;
  const next = requestIbdYardAction(g, a, actor(g, station));
  return next.pending ? finishIbdYardAction(next, next.pending.token, actor(g, station)) : next;
}
function inspected(index, slot, round = 1) {
  let g = act(act(createIbdYardGame(index, round), 'manifest'), 'kit');
  if (slot.startsWith('coil')) return act(g, slot === 'coil-front' ? 'gallery-front' : 'gallery-rear');
  return act(act(g, slot, 'open'), slot, 'contents');
}

test('all four cases offer unselected conclusions, wrong answers preserve evidence and correct answers seal the item', () => {
  for (const [index, slot, correct] of [[0, 'parts-b', 'matches'], [1, 'parts-b', 'short'],
    [2, 'coil-rear', 'rear-damage'], [3, 'parts-b', 'wrong-spec'], [0, 'coil-front', 'sound']]) {
    const g = inspected(index, slot), action = yardActions(g, slot).find(a => a.kind === 'judge');
    assert.ok(action); assert.equal(action.verdict, undefined);
    assert.equal(yardItemJudged(g, slot), false); assert.equal(yardItemDifferent(g, slot), false);
    assert.equal(yardActions(g, slot).some(a => a.kind === 'replace'), false, 'evidence alone never unlocks exchange');
    assert.equal(act(g, slot, 'judge').notice, 'judgement-needed');
    assert.deepEqual(act(g, slot, 'judge').judgements, {}, 'E never signs the first option');
    for (const wrong of ibdVerdictOptions(slot).filter(v => v !== correct)) {
      const retry = act(g, slot, 'judge', wrong);
      assert.equal(retry.notice, `judgement-retry-${correct}`); assert.ok(ibdNotice(retry).zh && ibdNotice(retry).en);
      assert.equal(retry.core, g.core); assert.equal(retry.pending, null); assert.deepEqual(retry.judgements, {});
      assert.deepEqual(ibdVerdictEvidence(retry, slot), ibdVerdictEvidence(g, slot));
      const fixed = act(retry, slot, 'judge', correct);
      assert.equal(yardItemJudged(fixed, slot), true); assert.equal(fixed.core, g.core);
      assert.equal(fixed.judgements[yardItemId(g, slot)], correct);
      assert.equal(yardItemDifferent(fixed, slot), !['matches', 'sound'].includes(correct));
      assert.equal(yardActions(fixed, slot).some(a => a.kind === 'judge'), false);
      if (slot.startsWith('coil')) {
        const surveyed = act(fixed, slot === 'coil-front' ? 'gallery-front' : 'gallery-rear');
        assert.equal(surveyed.notice, 'survey', 'optional re-observation never asks for an already sealed verdict');
        assert.deepEqual(surveyed.judgements, fixed.judgements);
      }
    }
  }
});

test('sealed, weighed and one-face evidence cannot produce a verdict or an all-clear release', () => {
  let g = act(act(createIbdYardGame(), 'manifest'), 'kit');
  for (const station of ['parts-a', 'coil-front']) {
    const attempt = requestIbdYardAction(g, { kind: 'judge', station, slot: station, itemId: station, verdict: 'matches' }, actor(g, station));
    assert.deepEqual(attempt.judgements, {}); assert.equal(attempt.notice, 'action-unavailable');
  }
  g = act(g, 'scale-a'); assert.equal(yardActions(g, 'parts-a')[0].kind, 'open');
  g = act(g, 'coil-front', 'scan'); assert.equal(yardActions(g, 'coil-front')[0].kind, 'rear');
  for (const station of ['gallery-front', 'gallery-rear']) g = act(g, station);
  for (const slot of ['parts-a', 'parts-b']) { g = act(act(g, slot, 'open'), slot, 'contents'); g = act(g, slot === 'parts-a' ? 'load-a' : 'load-b'); }
  const checked = act(g, 'dispatch', 'verify');
  assert.equal(checked.notice, 'judgement-missing'); assert.equal(checked.core.shipmentConfirmed, false);
  assert.equal(yardActions(checked, 'dispatch')[0].kind, 'verify'); assert.equal(checked.released, false);
  assert.equal(ibdGuidePhaseDone(checked)[2], false); assert.equal(ibdGuideStep(checked).action.kind, 'judge');
});

test('verdicts require physical reach and a live item identity; replacement inspection and judgement both start fresh', () => {
  let g = inspected(1, 'parts-b');
  const oldAction = { ...yardActions(g, 'parts-b')[0], verdict: 'short' };
  const nextRound = inspected(1, 'parts-b', 2);
  assert.equal(requestIbdYardAction(nextRound, oldAction, actor(nextRound, 'parts-b')).notice, 'action-unavailable');
  for (const flag of ['paused', 'hidden', 'driving'])
    assert.equal(requestIbdYardAction(g, oldAction, { ...actor(g, 'parts-b'), [flag]: true }), g);
  assert.equal(requestIbdYardAction(g, oldAction, { ...actor(g, 'parts-b'), active: false }), g);
  assert.equal(requestIbdYardAction(g, oldAction, { active: true, local: [50, 0, 50] }).notice, 'out-of-reach');
  g = act(g, 'parts-b', 'judge', 'short');
  const originalProofs = g.core.proofs['parts-b'];
  g = act(g, 'parts-b', 'replace');
  assert.equal(g.stock.originalReturned, true); assert.equal(yardItemJudged(g, 'parts-b'), false);
  const key = ['stock-a', 'stock-b'].find(key => ibdStockItem(g.round, g.caseIndex, key).specId === 'M8');
  g = act(g, key, 'select-stock');
  const freshId = yardItemId(g, 'parts-b');
  assert.notEqual(freshId, 'parts-b'); assert.equal(g.judgements[freshId], undefined);
  assert.equal(g.judgements['parts-b'], 'short'); assert.deepEqual(g.core.proofs['parts-b'], originalProofs);
  assert.deepEqual(g.exchanges, [], 'original quarantine does not spawn an automatic replacement');
  assert.equal(g.core.proofs[freshId], undefined); assert.equal(yardItemJudged(g, 'parts-b'), false);
  assert.equal(requestIbdYardAction(g, oldAction, actor(g, 'parts-b')).notice, 'action-unavailable');
  g = act(act(g, 'parts-b', 'open'), 'parts-b', 'contents');
  assert.equal(yardItemJudged(g, 'parts-b'), false, 'fresh evidence does not inherit the old signature');
  assert.equal(requestIbdYardAction(g, oldAction, actor(g, 'parts-b')).notice, 'action-unavailable');
  const retry = act(g, 'parts-b', 'judge', 'short');
  assert.equal(retry.notice, 'judgement-retry-matches');
  g = act(retry, 'parts-b', 'judge', 'matches'); assert.equal(yardItemJudged(g, 'parts-b'), true);
  assert.deepEqual(g.core.proofs['parts-b'], originalProofs); assert.equal(g.judgements['parts-b'], 'short');
});

test('unobserved cargo never reveals its hidden count, wrong specification or rear damage', () => {
  for (const [index, slot] of [[1, 'parts-b'], [2, 'coil-rear'], [3, 'parts-b']]) {
    const before = createIbdYardGame(index);
    assert.equal(ibdVerdictEvidence(before, slot).length, 1, 'only the manifest is known before inspection');
    const after = inspected(index, slot);
    const rows = ibdVerdictEvidence(after, slot);
    assert.ok(rows.length >= 3);
    assert.ok(rows.every(row => row.zh.length && row.en.length));
    assert.deepEqual(before.judgements, {}, 'revealing observations must not sign a verdict');
  }
});

test('a visit kept in memory from before verdicts resumes with its existing inspection evidence', () => {
  const legacy = inspected(0, 'coil-front'); delete legacy.judgements;
  const evidence = legacy.core;
  assert.equal(ibdGuideStep(legacy).action.kind, 'judge');
  const resumed = act(legacy, 'coil-front', 'judge', 'sound');
  assert.equal(resumed.core, evidence); assert.equal(yardItemJudged(resumed, 'coil-front'), true);
});
