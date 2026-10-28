import assert from 'node:assert/strict';
import { inspectIbdYardPack, yardCase, yardItemId } from './ibd-yard-game.ts';
import { ibdStation } from './ibd-yard-layout.ts';

/** Explicit simulated contact events for CPU tests only; production never calls this helper. */
export function ibdTestPackEvent(game, station, event, publish) {
  const request = { ...event, itemId: yardItemId(game, station), round: game.round, revision: game.revision };
  const next = inspectIbdYardPack(game, request, { active: true, local: ibdStation(station, game.core.moved).at });
  publish?.(next);
  return next;
}

/** Complete each actual pocket through the public bridge, without forging proofs or timed completions. */
export function inspectIbdTestPack(game, action, publish) {
  assert.equal(action.kind, 'contents');
  const station = action.station, itemId = yardItemId(game, station);
  const item = yardCase(game).items.find(item => item.id === itemId);
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
  assert.deepEqual(game.core.proofs[itemId], ['identity','quantity','specification','quality-contents']);
  return game;
}
