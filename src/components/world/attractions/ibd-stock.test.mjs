import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIbd } from './ibd-model.ts';
import { ibdStockItem } from './ibd-stock.ts';
import { IBD_SLOTS, IBD_STOCK_KEYS, ibdStation } from './ibd-yard-layout.ts';
import { createIbdYardGame, yardCase, yardPackItem, yardItemId, yardItemComplete, yardItemJudged, yardActions,
  requestIbdYardAction, finishIbdYardAction, cancelIbdYardAction, inspectIbdYardPack } from './ibd-yard-game.ts';

const actor = (g, station) => ({ active: true, local: ibdStation(station, g.core.moved).at });
const offered = (g, station, kind) => {
  const action = yardActions(g, station).find(a => a.kind === kind);
  assert.ok(action, `${station}/${kind} must be available`); return action;
};
function act(g, station, kind, verdict) {
  const action = offered(g, station, kind);
  const next = requestIbdYardAction(g, verdict ? { ...action, verdict } : action, actor(g, station));
  return next.pending ? finishIbdYardAction(next, next.pending.token, actor(g, station)) : next;
}
const event = (g, station, type, slot = 0) => ({ type, itemId: yardPackItem(g, station).id, slot,
  contact: true, aligned: true, visible: true, round: g.round, revision: g.revision });
const sample = (g, station, type, slot = 0) => inspectIbdYardPack(g, event(g, station, type, slot), actor(g, station));
function inspect(g, station, slots = [0, 1, 2, 3]) {
  for (const slot of slots) {
    if (slot >= yardPackItem(g, station).quantity) g = sample(g, station, 'view-empty', slot);
    else for (const type of ['take', 'measure', 'return']) g = sample(g, station, type, slot);
  }
  return g;
}
function prepared(index = 3) {
  let g = act(act(createIbdYardGame(index), 'manifest', 'brief'), 'kit', 'kit');
  for (const side of ['front', 'rear']) {
    g = act(g, `gallery-${side}`, 'survey'); g = act(g, `coil-${side}`, 'judge', 'sound');
  }
  for (const side of ['a', 'b']) {
    g = inspect(act(g, `parts-${side}`, 'open'), `parts-${side}`);
    g = act(g, `parts-${side}`, 'judge', side === 'a' ? 'matches' : index === 1 ? 'short' : 'wrong-spec');
  }
  return g;
}
const requested = () => act(prepared(), 'parts-b', 'replace');
const keyFor = (g, spec) => IBD_STOCK_KEYS.find(key => ibdStockItem(g.round, g.caseIndex, key).specId === spec);

test('reserve fixtures keep stable physical IDs, identical M8 labels, and both real specifications', () => {
  for (const round of [1, 2]) for (const index of [0, 1, 2, 3]) {
    const items = IBD_STOCK_KEYS.map(key => ibdStockItem(round, index, key));
    assert.deepEqual(items.map(item => item.specId).sort(), ['M6', 'M8']);
    assert.deepEqual(items.map(item => item.package.declaredSpecId), ['M8', 'M8']);
    assert.equal(new Set(items.map(item => item.id)).size, 2);
    assert.ok(items.every(item => item.quantity === 4));
    assert.deepEqual(ibdStockItem(round, index, 'stock-a'), items[0]);
  }
});

test('original quarantine, wrong choice, signed return and right choice preserve facts and require fresh final inspection', () => {
  let g = prepared(); const original = yardPackItem(g, 'parts-b'), originalProofs = g.core.proofs[original.id];
  const pending = requestIbdYardAction(g, offered(g, 'parts-b', 'replace'), actor(g, 'parts-b'));
  assert.equal(pending.pending.seconds, 3); assert.equal(pending.stock.originalReturned, false);
  g = finishIbdYardAction(pending, pending.pending.token, actor(g, 'parts-b'));
  assert.deepEqual(g.stock, { originalReturned: true, requested: true, assigned: null });
  assert.deepEqual(g.exchanges, []); assert.equal(yardPackItem(g, 'parts-b'), undefined);
  assert.equal(yardItemComplete(g, 'parts-b'), false); assert.equal(yardItemJudged(g, 'parts-b'), false);
  for (const station of ['parts-b', 'load-b', 'scale-b', 'truck-b']) assert.deepEqual(yardActions(g, station), []);
  const wrong = keyFor(g, 'M6'), right = keyFor(g, 'M8');
  for (const key of IBD_STOCK_KEYS) {
    assert.deepEqual(yardActions(g, key).map(action => action.kind), ['open', 'select-stock']);
    g = inspect(act(g, key, 'open'), key);
    assert.equal(g.core.proofs[yardPackItem(g, key).id], undefined, 'reserve sampling grants no shipment proofs');
    g = act(g, key, 'contents');
    assert.equal(g.core.proofs[yardPackItem(g, key).id], undefined);
  }
  assert.equal(yardCase(g).items.length, 4); assert.deepEqual(IBD_SLOTS, ['coil-front', 'coil-rear', 'parts-a', 'parts-b']);
  const wrongId = yardPackItem(g, wrong).id, rightId = yardPackItem(g, right).id;
  g = act(g, wrong, 'select-stock');
  assert.equal(yardPackItem(g, wrong), undefined); assert.equal(yardItemId(g, 'parts-b'), wrongId);
  assert.equal(yardPackItem(g, 'parts-b').specId, 'M6'); assert.equal(g.packInspections[wrongId], undefined);
  assert.equal(g.core.opened.includes(wrongId), false); assert.equal(yardItemComplete(g, 'parts-b'), false);
  assert.equal(yardActions(g, 'parts-b').some(a => a.kind === 'return-stock'), false);
  g = inspect(act(g, 'parts-b', 'open'), 'parts-b');
  assert.equal(act(g, 'parts-b', 'judge', 'matches').notice, 'judgement-retry-wrong-spec');
  g = act(g, 'parts-b', 'judge', 'wrong-spec');
  g = act(act(g, 'load-a', 'load'), 'load-b', 'load'); g = act(g, 'dispatch', 'verify');
  assert.equal(assessIbd(yardCase(g), g.core).status, 'different');
  assert.equal(yardActions(g, 'dispatch').some(a => a.kind === 'release'), false);
  g = act(g, 'truck-b', 'unload'); g = act(g, 'parts-b', 'return-stock');
  assert.equal(g.stock.originalReturned, true); assert.equal(yardPackItem(g, wrong).id, wrongId);
  assert.equal(yardPackItem(g, wrong).specId, 'M6'); assert.equal(g.core.proofs[wrongId], undefined);
  assert.equal(g.judgements[wrongId], undefined); assert.equal(g.packInspections[wrongId], undefined);
  assert.equal(g.core.opened.includes(wrongId), false);
  g = act(g, wrong, 'select-stock'); assert.equal(yardPackItem(g, 'parts-b').specId, 'M6');
  g = inspect(act(g, 'parts-b', 'open'), 'parts-b'); g = act(g, 'parts-b', 'judge', 'wrong-spec');
  const returning = requestIbdYardAction(g, offered(g, 'parts-b', 'return-stock'), actor(g, 'parts-b'));
  assert.equal(returning.pending.seconds, 5); assert.equal(returning.stock.assigned, wrong);
  const cancelledReturn = cancelIbdYardAction(returning);
  assert.equal(cancelledReturn.stock.assigned, wrong); assert.equal(yardPackItem(cancelledReturn, wrong), undefined);
  assert.strictEqual(finishIbdYardAction(cancelledReturn, returning.pending.token, actor(g, 'parts-b')), cancelledReturn);
  g = act(g, 'parts-b', 'return-stock'); g = act(g, right, 'select-stock');
  assert.equal(yardItemId(g, 'parts-b'), rightId); assert.equal(g.packInspections[rightId], undefined);
  assert.equal(g.core.proofs[rightId], undefined); assert.equal(yardItemJudged(g, 'parts-b'), false);
  g = inspect(act(g, 'parts-b', 'open'), 'parts-b'); g = act(g, 'parts-b', 'judge', 'matches');
  g = act(g, 'load-b', 'load'); g = act(g, 'dispatch', 'verify'); g = act(g, 'dispatch', 'release');
  assert.equal(g.released, true); assert.equal(yardCase(g).items.length, 4);
  assert.deepEqual(g.core.proofs[original.id], originalProofs); assert.equal(g.judgements[original.id], 'wrong-spec');
  assert.equal(g.stock.originalReturned, true); assert.equal(new Set(g.core.loaded).size, 2);
});

test('sampling is optional for selection, but reach, hands, live identity and active state remain mandatory', () => {
  let g = requested(); const key = keyFor(g, 'M8'), action = offered(g, key, 'select-stock');
  for (const flag of ['paused', 'hidden', 'driving'])
    assert.strictEqual(requestIbdYardAction(g, action, { ...actor(g, key), [flag]: true }), g);
  assert.strictEqual(requestIbdYardAction(g, action, { ...actor(g, key), active: false }), g);
  assert.equal(requestIbdYardAction(g, action, actor(g, 'parts-b')).notice, 'out-of-reach');
  for (const altered of [{ itemId: 'parts-b' }, { round: g.round + 1 }, { slot: 'parts-a' }])
    assert.equal(requestIbdYardAction(g, { ...action, ...altered }, actor(g, key)).notice, 'action-unavailable');
  g = act(g, key, 'open'); g = sample(g, key, 'take');
  assert.equal(requestIbdYardAction(g, action, actor(g, key)).notice, 'pack-return-first');
  const other = IBD_STOCK_KEYS.find(candidate => candidate !== key);
  assert.equal(requestIbdYardAction(g, offered(g, other, 'select-stock'), actor(g, other)).notice, 'pack-return-first');
  g = sample(g, key, 'measure'); g = sample(g, key, 'return');
  const moving = requestIbdYardAction(g, action, actor(g, key));
  assert.equal(moving.pending.seconds, 5); assert.equal(moving.stock.assigned, null);
  assert.equal(moving.packInspections[action.itemId].slots.filter(slot => slot.complete).length, 1);
  const selected = finishIbdYardAction(moving, moving.pending.token, actor(g, key));
  assert.equal(selected.stock.assigned, key); assert.equal(selected.packInspections[action.itemId], undefined);
  assert.deepEqual(yardActions(selected, key), []);
  assert.equal(requestIbdYardAction(selected, action, actor(selected, key)).notice, 'action-unavailable');
  assert.equal(yardCase(selected).items.filter(item => item.id === action.itemId).length, 1);
  const unsampled = requested(); const raw = offered(unsampled, key, 'select-stock');
  assert.equal(act(unsampled, key, 'select-stock').stock.assigned, key);
  assert.equal(unsampled.packInspections[raw.itemId], undefined);
});

test('cancelled transfers, stale callbacks and old contact revisions cannot move or duplicate a carton', () => {
  const g = requested(), key = keyFor(g, 'M6'), action = offered(g, key, 'select-stock');
  const moving = requestIbdYardAction(g, action, actor(g, key)), token = moving.pending.token;
  assert.strictEqual(finishIbdYardAction(moving, token + 1, actor(g, key)), moving);
  assert.strictEqual(finishIbdYardAction(moving, token, { ...actor(g, key), paused: true }), moving);
  assert.equal(requestIbdYardAction(moving, action, actor(g, key)).notice, 'busy');
  const stopped = cancelIbdYardAction(moving);
  assert.deepEqual(stopped.stock, g.stock); assert.equal(stopped.pending, null);
  assert.strictEqual(finishIbdYardAction(stopped, token, actor(g, key)), stopped);
  const away = finishIbdYardAction(moving, token, actor(g, 'parts-b'));
  assert.equal(away.notice, 'walked-away'); assert.deepEqual(away.stock, g.stock);
  const selected = finishIbdYardAction(moving, token, actor(g, key));
  assert.strictEqual(finishIbdYardAction(selected, token, actor(g, key)), selected);
  const open = act(g, key, 'open'), contact = event(open, key, 'take');
  const changed = sample(open, key, 'take');
  assert.strictEqual(inspectIbdYardPack(changed, contact, actor(g, key)), changed);
  const newRound = act(g, 'manifest', 'next');
  assert.strictEqual(inspectIbdYardPack(newRound, contact, actor(newRound, key)), newRound);
  assert.equal(requestIbdYardAction(newRound, action, actor(newRound, key)).notice, 'action-unavailable');
  assert.deepEqual(newRound.stock, { originalReturned: false, requested: false, assigned: null });
  const reset = act(selected, 'manifest', 'reset');
  assert.deepEqual(reset.stock, { originalReturned: false, requested: false, assigned: null });
  assert.deepEqual(reset.packInspections, {}); assert.deepEqual(reset.core.proofs, {});
});

test('reserve contacts require its own open bench and cannot inspect the empty B workbench', () => {
  let g = requested(), key = keyFor(g, 'M8');
  assert.equal(sample(g, key, 'take').notice, 'package-sealed');
  g = act(g, key, 'open');
  const contact = event(g, key, 'take');
  assert.equal(inspectIbdYardPack(g, contact, actor(g, 'parts-b')).notice, 'walked-away');
  assert.equal(inspectIbdYardPack(g, { ...contact, itemId: 'parts-b' }, actor(g, 'parts-b')).notice, 'unknown-item');
  assert.equal(act(g, key, 'contents').notice, 'pack-inspection-incomplete');
  const before = act(act(createIbdYardGame(), 'manifest', 'brief'), 'kit', 'kit');
  assert.equal(yardActions(before, key).length, 0);
  assert.equal(inspectIbdYardPack(before, event(before, key, 'take'), actor(before, key)).notice, 'action-unavailable');
});
