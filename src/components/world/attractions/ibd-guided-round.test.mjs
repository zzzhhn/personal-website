import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_CASES } from './ibd-cases.ts';
import { assessIbd } from './ibd-model.ts';
import { ibdGuideStep, ibdGuidePhaseDone } from './ibd-yard-guide.ts';
import { ibdStation } from './ibd-yard-layout.ts';
import { cancelIbdYardAction, createIbdYardGame, requestIbdYardAction, finishIbdYardAction, yardActions,
  yardCase, yardItemId, yardItemComplete, yardItemDifferent, yardPackItem } from './ibd-yard-game.ts';
import { playerVerdict } from './ibd-test-player.mjs';
import { inspectIbdTestPack, ibdTestGuideAction } from './ibd-test-pack-inspection.mjs';

function act(game, action) {
  assert.ok(action, 'the requested station must offer the action');
  action = ibdTestGuideAction(game, action);
  if (action.kind === 'contents') return inspectIbdTestPack(game, action);
  const actor = { active: true, local: ibdStation(action.station, game.core.moved).at };
  const selected = playerVerdict(game, action), requested = requestIbdYardAction(game, selected, actor);
  assert.ok(requested.pending || requested.completedAction === selected, `${action.kind} rejected: ${requested.notice}`);
  return requested.pending ? finishIbdYardAction(requested, requested.pending.token, actor) : requested;
}
const at = (game, station, kind) => act(game, yardActions(game, station).find(a => !kind || a.kind === kind));
function finishGuided(initial, label) {
  let game = structuredClone(initial);
  const trace = [], states = new Set();
  for (let i = 0; i < 60 && !game.released; i++) {
    const state = JSON.stringify([game.started, game.equipped, game.core, game.exchanges, game.judgements, game.stock, game.packInspections]);
    assert.equal(states.has(state), false, `${label}: guide stalled after ${trace.join(', ')}`);
    states.add(state);
    const { action: target, title, hint } = ibdGuideStep(game), action = ibdTestGuideAction(game, target);
    for (const lang of ['zh', 'en']) assert.ok(title[lang] && hint[lang], `${label}: missing ${lang} instruction`);
    const before = game;
    game = act(game, action); trace.push(`${action.station}/${action.kind}`);
    assert.equal(game.pending, null);
    if (action.kind === 'replace') {
      const id = yardItemId(game, action.slot);
      if (action.slot === 'parts-b') {
        assert.equal(game.notice, 'stock-requested');
        assert.deepEqual(game.stock, {originalReturned:true,requested:true,assigned:null});
        assert.equal(yardPackItem(game, 'parts-b'), undefined);
        assert.deepEqual(game.exchanges, before.exchanges);
        assert.deepEqual(game.core.proofs[id], before.core.proofs[id], 'quarantine retains the original findings');
      } else {
        assert.notEqual(id, yardItemId(before, action.slot));
        assert.ok(game.exchanges.at(-1).proofs.length > 0, 'quarantine retains original evidence');
      }
      assert.equal(yardItemComplete(game, action.slot), false, 'fresh cargo must not inherit old evidence');
      assert.equal(game.core.shipmentConfirmed, false);
    }
    if (action.kind === 'select-stock') {
      const id = yardItemId(game, 'parts-b');
      assert.notEqual(id, yardItemId(before, 'parts-b'));
      assert.equal(game.stock.assigned, action.station);
      assert.equal(game.stock.requested, false);
      assert.equal(game.core.proofs[id], undefined);
      assert.equal(game.packInspections[id], undefined, 'reserve sampling is cleared for full shipment inspection');
      assert.equal(game.core.opened.includes(id), false);
      assert.equal(yardItemComplete(game, 'parts-b'), false);
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
  assert.equal(game.exchanges.length, game.caseIndex === 2 ? 1 : 0);
  assert.equal(game.stock.originalReturned, [1,3].includes(game.caseIndex));
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
        assert.equal(trace.includes(`truck-${side}/unload`), true, 'unjudged loaded cargo must return for its onsite verdict');
      }
      actions += trace.length; journeys++;
    }
  assert.equal(journeys, 192); assert.equal(JSON.stringify(IBD_CASES), source);
  t.diagnostic(`${journeys} complete recovery journeys; ${actions} guided actions; all dispatched with matching stock and load`);
});

test('a cancelled or walked-away inspection of replacement cargo cannot revive the quarantined item evidence', () => {
  for (const index of [1, 2, 3]) {
    let game = at(at(createIbdYardGame(index), 'manifest', 'brief'), 'kit', 'kit');
    const expectedNotice = index === 2 ? 'replaced' : 'stock-selected';
    for (let i = 0; i < 40 && game.notice !== expectedNotice; i++) game = act(game, ibdGuideStep(game).action);
    assert.equal(game.notice, expectedNotice);
    const original = index === 2 ? 'coil-rear' : 'parts-b', replacement = yardItemId(game, original);
    assert.notEqual(replacement, original);
    assert.ok(game.core.proofs[original]?.length > 0);
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

test('stock-room guidance reaches two real sample benches and sends the measured matching carton back for fresh shipment inspection', () => {
  for (const index of [1,3]) for (const round of [1,2]) {
    let game = createIbdYardGame(index, round);
    for (let i=0;i<40&&!game.stock.requested;i++) game=act(game,ibdGuideStep(game).action);
    assert.equal(game.stock.requested,true);
    assert.equal(yardPackItem(game,'parts-b'),undefined);
    const originalProofs=game.core.proofs['parts-b'];
    assert.ok(originalProofs.length>0);
    const trace=[];
    for(let i=0;i<5;i++) {
      const target=ibdGuideStep(game).action;
      assert.deepEqual(target,{kind:'contents',station:'stock-room'});
      assert.deepEqual(yardActions(game,'stock-room'),[]);
      const action=ibdTestGuideAction(game,target);
      assert.ok(['stock-a','stock-b'].includes(action.station));
      const item=yardPackItem(game,action.station);
      if(action.kind==='select-stock') {
        assert.equal(i,4, 'both real benches are opened and sampled before this simulated choice');
        assert.ok(game.packInspections[item.id].slots.every(slot=>slot.complete&&slot.reading==='M8'));
      }
      trace.push(`${action.station}/${action.kind}`);
      game=act(game,action);
      assert.deepEqual(game.core.proofs['parts-b'],originalProofs);
      assert.equal(game.core.proofs[item.id],undefined, 'sampling and transfer never certify shipment cargo');
    }
    assert.deepEqual(trace.slice(0,4),['stock-a/open','stock-a/contents','stock-b/open','stock-b/contents']);
    assert.equal(game.notice,'stock-selected');
    const id=yardItemId(game,'parts-b');
    assert.notEqual(id,'parts-b');
    assert.equal(yardPackItem(game,'parts-b').specId,'M8');
    assert.equal(game.packInspections[id],undefined);
    assert.equal(game.core.opened.includes(id),false);
    assert.equal(game.judgements[id],undefined);
    assert.deepEqual(ibdGuideStep(game).action,{kind:'weigh',station:'scale-b',slot:'parts-b'});
    const resumed=finishGuided(game,`sampled reserve case=${index},round=${round}`);
    for(const action of ['scale-b/weigh','parts-b/open','parts-b/contents','parts-b/judge','load-b/load','dispatch/verify','dispatch/release'])
      assert.ok(resumed.includes(action), `fresh B shipment must complete ${action}`);
  }
});
