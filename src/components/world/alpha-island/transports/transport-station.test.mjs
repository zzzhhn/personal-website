import test from 'node:test';
import assert from 'node:assert/strict';
import { transportStation } from './transport-station.ts';

test('a station offers a call, waits for the vehicle, then offers boarding', () => {
  for (const kind of ['cable', 'ferry']) {
    let parked = 1, available = true;
    const events = [];
    const station = transportStation({ kind, id: kind }, 0, [2, 1, 4], () => parked, () => available,
      () => events.push('board'), () => { events.push('call'); available = false; });
    assert.match(station.label.zh, /^呼叫/);
    assert.ok(station.enabled());
    station.onInteract();
    assert.equal(station.enabled(), false);
    station.onInteract();
    parked = 0;
    available = true;
    assert.match(station.label.zh, /^搭乘/);
    station.onInteract();
    assert.deepEqual(events, ['call', 'board']);
  }
});

test('one-way sled has no boarding action at its destination', () => {
  assert.equal(transportStation({ kind: 'sled', id: 'sled' }, 1, [0, 0, 0], () => 1,
    () => true, assert.fail, assert.fail), null);
});
