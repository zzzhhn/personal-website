import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_CASES } from './ibd-cases.ts';
import { assessIbd } from './ibd-model.ts';
import { ibdGuideStep, ibdGuidePhaseDone } from './ibd-yard-guide.ts';
import { ibdStation } from './ibd-yard-layout.ts';
import { cancelIbdYardAction, createIbdYardGame, requestIbdYardAction, finishIbdYardAction, yardActions,
  yardCase, yardItemId, yardItemComplete, yardItemDifferent } from './ibd-yard-game.ts';

function act(game, action) {
  assert.ok(action, 'the requested station must offer the action');
  const actor = { active: true, local: ibdStation(action.station, game.core.moved).at };
  const requested = requestIbdYardAction(game, action, actor);
  assert.ok(requested.pending || requested.completedAction === action, `${action.kind} rejected: ${requested.notice}`);
  return requested.pending ? finishIbdYardAction(requested, requested.pending.token, actor) : requested;
}
const at = (game, station, kind) => act(game, yardActions(game, station).find(a => !kind || a.kind === kind));
function finishGuided(initial, label) {
  let game = structuredClone(initial);
  const trace = [], states = new Set();
  for (let i = 0; i < 60 && !game.released; i++) {
    const state = JSON.stringify([game.started, game.equipped, game.core, game.exchanges]);
    assert.equal(states.has(state), false, `${label}: guide stalled after ${trace.join(', ')}`);
    states.add(state);
    const { action, title, hint } = ibdGuideStep(game);
    for (const lang of ['zh', 'en']) assert.ok(title[lang] && hint[lang], `${label}: missing ${lang} instruction`);
    const before = game;
    game = act(game, action); trace.push(`${action.station}/${action.kind}`);
    assert.equal(game.pending, null);
    if (action.kind === 'replace') {
      const id = yardItemId(game, action.slot);
      assert.notEqual(id, yardItemId(before, action.slot));
      assert.equal(yardItemComplete(game, action.slot), false, 'fresh cargo must not inherit old evidence');
      assert.equal(game.core.shipmentConfirmed, false);
      assert.ok(game.exchanges.at(-1).proofs.length > 0, 'quarantine retains original evidence');
    }
    if (action.kind !== 'unload' && action.kind !== 'load') assert.deepEqual(game.core.loaded, before.core.loaded);
    // Re-enter from the persisted visit state after each completed action.
    game = structuredClone(game);
  }
  assert.equal(game.released, true, `${label}: no dispatch after ${trace.join(', ')}`);
  assert.equal(assessIbd(yardCase(game), game.core).status, 'clear');
  assert.deepEqual(ibdGuidePhaseDone(game), [true, true, true, true, true, true]);
  assert.deepEqual([...game.core.loaded].sort(), ['parts-a', yardItemId(game, 'parts-b')].sort());
  for (const slot of ['coil-front', 'coil-rear', 'parts-a', 'parts-b']) {
    assert.equal(yardItemComplete(game, slot), true); assert.equal(yardItemDifferent(game, slot), false);
  }
  assert.equal(game.exchanges.length, game.caseIndex === 0 ? 0 : 1);
  return trace;
}

test('all four orders resume guidance after partial gallery checks, pack work, loading and premature reconciliation', t => {
  const source = JSON.stringify(IBD_CASES); let journeys = 0, actions = 0;
  // 4 orders × 4 gallery proof subsets × 3 pack-work levels × 4 actual load subsets.
  for (let index = 0; index < IBD_CASES.length; index++) for (let gallery = 0; gallery < 4; gallery++)
    for (let packs = 0; packs < 3; packs++) for (let loaded = 0; loaded < 4; loaded++) {
      let game = at(at(createIbdYardGame(index), 'manifest', 'brief'), 'kit', 'kit');
      for (const [bit, station] of [[1, 'gallery-front'], [2, 'gallery-rear']])
        if (gallery & bit) game = at(game, station, 'survey');
      for (const [bit, side] of [[1, 'a'], [2, 'b']]) {
        if (packs >= 1) game = at(game, `parts-${side}`, 'open');
        if (packs >= 2) game = at(game, `parts-${side}`, 'contents');
        if (loaded & bit) game = at(game, `load-${side}`, 'load');
      }
      game = at(game, 'dispatch', 'verify');
      const trace = finishGuided(game, `case=${index},gallery=${gallery},packs=${packs},loaded=${loaded}`);
      for (const [bit, side] of [[1, 'a'], [2, 'b']]) {
        if (!(loaded & bit)) continue;
        const mustUnload = packs < 2 || yardItemDifferent(game, `parts-${side}`);
        assert.equal(trace.includes(`truck-${side}/unload`), mustUnload, 'only unchecked or faulty loaded cargo needs unloading');
      }
      actions += trace.length; journeys++;
    }
  assert.equal(journeys, 192); assert.equal(JSON.stringify(IBD_CASES), source);
  t.diagnostic(`${journeys} complete recovery journeys; ${actions} guided actions; all dispatched with matching stock and load`);
});

test('a cancelled or walked-away inspection of replacement cargo cannot revive the quarantined item evidence', () => {
  for (const index of [1, 2, 3]) {
    let game = at(at(createIbdYardGame(index), 'manifest', 'brief'), 'kit', 'kit');
    for (let i = 0; i < 40 && game.notice !== 'replaced'; i++) game = act(game, ibdGuideStep(game).action);
    assert.equal(game.notice, 'replaced');
    const replacement = game.exchanges[0].replacementId, original = game.exchanges[0].original.id;
    const action = ibdGuideStep(game).action;
    const actor = { active: true, local: ibdStation(action.station, game.core.moved).at };
    const pending = requestIbdYardAction(game, action, actor);
    assert.ok(pending.pending);
    const away = finishIbdYardAction(pending, pending.pending.token, { active: true, local: [50, 1, 50] });
    assert.equal(away.notice, 'walked-away');
    for (const interrupted of [away, cancelIbdYardAction(pending)]) {
      assert.equal(interrupted.core.proofs[replacement], undefined);
      assert.deepEqual(interrupted.core.proofs[original], game.core.proofs[original]);
      assert.equal(finishIbdYardAction(interrupted, pending.pending.token, actor), interrupted);
      finishGuided(interrupted, `replacement retry case=${index},notice=${interrupted.notice}`);
    }
  }
});
