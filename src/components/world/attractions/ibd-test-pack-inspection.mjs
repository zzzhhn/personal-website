import assert from 'node:assert/strict';
import { inspectIbdYardPack, yardActions, yardPackItem } from './ibd-yard-game.ts';
import { IBD_STOCK_KEYS, ibdStation, isIbdStockKey } from './ibd-yard-layout.ts';
import { ibdPackInspectionReading } from './ibd-pack-inspection.ts';

/** Simulated player choice: the guide points to a room, but only its two benches
 * offer actions. Sample both before choosing from measured readings, never labels. */
export function ibdTestGuideAction(game, action) {
  if (action.station !== 'stock-room') return action;
  assert.equal(action.kind, 'contents');
  assert.equal(game.stock.requested, true);
  assert.deepEqual(yardActions(game, 'stock-room'), []);
  for (const key of IBD_STOCK_KEYS) {
    const item = yardPackItem(game, key);
    assert.equal(item?.kind, 'hardware-pack');
    if (!game.core.opened.includes(item.id)) return yardActions(game, key).find(a => a.kind === 'open');
    const inspection = game.packInspections[item.id];
    if (!inspection || !ibdPackInspectionReading(inspection)) return yardActions(game, key).find(a => a.kind === 'contents');
  }
  const key = IBD_STOCK_KEYS.find(key => {
    const reading = ibdPackInspectionReading(game.packInspections[yardPackItem(game, key).id]);
    return reading.quantity === 4 && reading.specIds.length === 1 && reading.specIds[0] === 'M8';
  });
  assert.ok(key, 'one sampled reserve must match the manifest');
  return yardActions(game, key).find(a => a.kind === 'select-stock');
}

/** Explicit simulated contact events for CPU tests only; production never calls this helper. */
export function ibdTestPackEvent(game, station, event, publish) {
  const request = { ...event, itemId: yardPackItem(game, station)?.id, round: game.round, revision: game.revision };
  const next = inspectIbdYardPack(game, request, { active: true, local: ibdStation(station, game.core.moved).at });
  publish?.(next);
  return next;
}

/** Complete each actual pocket through the public bridge, without forging proofs or timed completions. */
export function inspectIbdTestPack(game, action, publish) {
  assert.equal(action.kind, 'contents');
  const station = action.station, item = yardPackItem(game, station), itemId = item?.id;
  assert.equal(item?.kind, 'hardware-pack');
  assert.ok(game.core.opened.includes(itemId), 'test must physically open the carton first');
  const initialProofs = game.core.proofs[itemId];
  for (const slot of [2,0,3,1]) {
    if (game.packInspections[itemId]?.slots[slot].complete) continue;
    if (slot >= item.quantity) game = ibdTestPackEvent(game, station, { type: 'view-empty', slot, visible: true }, publish);
    else {
      game = ibdTestPackEvent(game, station, { type: 'take', slot, contact: true }, publish);
      assert.equal(game.packInspections[itemId]?.held, slot, `slot ${slot} must be held before measurement`);
      game = ibdTestPackEvent(game, station, { type: 'measure', slot, contact: true, aligned: true }, publish);
      assert.equal(game.packInspections[itemId]?.measurement, item.specId, 'reading comes from this fixture');
      assert.equal(game.packInspections[itemId]?.slots[slot].complete, false, 'measurement still requires original-pocket return');
      game = ibdTestPackEvent(game, station, { type: 'return', slot, contact: true }, publish);
    }
    const inspection = game.packInspections[itemId];
    assert.equal(inspection.slots[slot].complete, true);
    if (!inspection.slots.every(slot => slot.complete)) assert.strictEqual(game.core.proofs[itemId], initialProofs, 'partial pockets grant no contents evidence');
  }
  assert.equal(game.packInspections[itemId].held, null);
  assert.ok(game.packInspections[itemId].slots.every(slot => slot.complete));
  if (isIbdStockKey(station)) assert.strictEqual(game.core.proofs[itemId], initialProofs, 'reserve sampling grants no shipment evidence');
  else assert.deepEqual(game.core.proofs[itemId], ['identity','quantity','specification','quality-contents']);
  return game;
}
