import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptAction, advanceAcceptedAction, cancelAcceptedAction, heldPropPoint } from './accepted-action.ts';

test('an accepted action completes once without a palm sample and cannot replay its commit', () => {
  const action = acceptAction(); let commits = 0;
  for (let i = 0; i < 60; i++) commits += Number(advanceAcceptedAction(action, 1 / 60, true));
  assert.equal(commits, 1); assert.equal(action.status, 'committed');
});
test('cancelling one frame before completion never commits even when eligibility returns', () => {
  for (const explicit of [true, false]) {
    const action = acceptAction(.4);
    for (let i = 0; i < 4; i++) assert.equal(advanceAcceptedAction(action, .08, true), false);
    if (explicit) cancelAcceptedAction(action); else advanceAcceptedAction(action, .08, false);
    for (let i = 0; i < 20; i++) assert.equal(advanceAcceptedAction(action, .08, true), false);
    assert.equal(action.status, 'cancelled');
  }
});
test('invalid deltas cannot complete an action; background gaps cannot skip its short animation', () => {
  const action = acceptAction();
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(advanceAcceptedAction(action, dt, true), false);
  assert.equal(action.elapsed, 0);
  assert.equal(advanceAcceptedAction(action, 30, true), false); assert.equal(action.elapsed, .08);
});
test('held props use their attachment socket when animation output is unavailable', () => {
  const socket = [2, 3, 4], palm = [2.1, 3, 4];
  assert.deepEqual(heldPropPoint(null, socket), socket);
  assert.deepEqual(heldPropPoint([NaN, 3, 4], socket), socket);
  assert.deepEqual(heldPropPoint(palm, socket), palm);
});
