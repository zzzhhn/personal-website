import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import { advanceExchangeBodyAction, beginExchangeBodyAction, cancelExchangeBodyAction, exchangeActor, exchangeBody,
  exchangeBodyBusy, exchangeVisualSockets } from './alpha-exchange-motion.ts';
const anchor = { stand: [0,0,0], yaw: 0, target: [.5,1,0] };
function fixture() {
  cancelExchangeBodyAction(); exchangeBody.carried = null;
  Object.assign(exchangeActor, { position: [0,PLAYER_CENTER_HEIGHT,0], yaw: 0, grounded: true, available: true });
  Object.assign(exchangeVisualSockets, { valid: false, sampledId: null, sampledElapsed: 0, contactError: Infinity });
}
function tick(count = 1, sample = true) {
  for (let i = 0; i < count; i++) {
    const action = exchangeBody.action;
    if (action && sample) Object.assign(exchangeVisualSockets, { valid: true, sampledId: action.id, sampledElapsed: action.elapsed, contactError: 0 });
    advanceExchangeBodyAction(1/60);
  }
}

test('begin validates grounded stand reach, height and finite inputs, and never moves the actor', () => {
  fixture(); const position = [...exchangeActor.position];
  exchangeActor.available = false; assert.equal(beginExchangeBodyAction('pickup', anchor, () => {}), false);
  exchangeActor.available = true; exchangeActor.grounded = false; assert.equal(beginExchangeBodyAction('pickup', anchor, () => {}), false);
  exchangeActor.grounded = true;
  assert.equal(beginExchangeBodyAction('pickup', { ...anchor, stand: [1.11,0,0] }, () => {}), false);
  assert.equal(beginExchangeBodyAction('pickup', { ...anchor, stand: [0,.26,0] }, () => {}), false);
  assert.equal(beginExchangeBodyAction('pickup', { ...anchor, target: [NaN,1,0] }, () => {}), false);
  assert.ok(beginExchangeBodyAction('pickup', anchor, () => {}));
  assert.equal(exchangeBodyBusy(), true);
  assert.equal(beginExchangeBodyAction('ring', anchor, () => {}), false);
  tick(100); assert.deepEqual(exchangeActor.position, position); assert.equal(exchangeActor.yaw, 0);
});

test('approach waits for real position and heading and cancels after two seconds', () => {
  fixture(); let contacts = 0, cancels = 0;
  exchangeActor.position[0] = .7;
  assert.ok(beginExchangeBodyAction('pickup', anchor, () => contacts++, () => cancels++));
  tick(30); assert.equal(exchangeBody.action.phase, 'approach'); assert.equal(contacts, 0);
  exchangeActor.position[0] = 0; exchangeActor.yaw = .5;
  tick(30); assert.equal(exchangeBody.action.phase, 'approach');
  exchangeActor.yaw = .05; tick(); assert.equal(exchangeBody.action.phase, 'perform'); assert.equal(exchangeBody.action.elapsed, 0);
  tick(100); assert.equal(contacts, 1); assert.equal(cancels, 0);
  exchangeActor.position[0] = .7;
  assert.ok(beginExchangeBodyAction('ring', anchor, () => contacts++, () => cancels++));
  tick(130); assert.equal(exchangeBody.action, null); assert.equal(cancels, 1); assert.equal(contacts, 1);
});

test('matching contact sample commits once and carrying changes only at confirmed contact', () => {
  fixture(); let contacts = 0;
  for (const [kind, before, after] of [['pickup', null, 'ticket'], ['insert', 'ticket', null], ['collect', null, 'receipt']]) {
    assert.equal(exchangeBody.carried, before);
    assert.ok(beginExchangeBodyAction(kind, anchor, () => { contacts++; }));
    tick(); tick(20); assert.equal(exchangeBody.carried, before);
    tick(100); assert.equal(exchangeBody.carried, after); assert.equal(exchangeBody.action, null);
  }
  tick(100); assert.equal(contacts, 3);
});

test('wrong id, stale elapsed, invalid sockets and excessive or nonfinite error cannot commit', () => {
  for (const bad of [{ sampledId: -1 }, { sampledElapsed: 0 }, { valid: false }, { contactError: .101 }, { contactError: Infinity }, { contactError: NaN }, { contactError: -1 }]) {
    fixture(); let contacts = 0, cancels = 0;
    assert.ok(beginExchangeBodyAction('pickup', anchor, () => contacts++, () => cancels++));
    tick();
    const action = exchangeBody.action;
    for (let i = 0; i < 100; i++) {
      Object.assign(exchangeVisualSockets, { valid: true, sampledId: action.id, sampledElapsed: action.contactAt, contactError: 0 }, bad);
      tick(1, false);
    }
    assert.equal(contacts, 0, JSON.stringify(bad)); assert.equal(cancels, 1); assert.equal(exchangeBody.action, null);
    assert.equal(exchangeBody.carried, null);
  }
});

test('contact clock holds until a render samples the exact pose, without accepting a future sample early', () => {
  fixture(); let contacts = 0;
  assert.ok(beginExchangeBodyAction('ring', anchor, () => contacts++)); tick();
  const action = exchangeBody.action;
  tick(20, false); assert.equal(contacts, 0);
  tick(20, false); assert.equal(action.elapsed, action.contactAt); assert.equal(contacts, 0);
  Object.assign(exchangeVisualSockets, { valid: true, sampledId: action.id, sampledElapsed: action.contactAt, contactError: .1 });
  tick(1, false); assert.equal(contacts, 1);
  tick(100); assert.equal(contacts, 1);
});

test('cancel, lost footing, lost availability and changed stand prevent late commits', () => {
  for (const interrupt of [() => cancelExchangeBodyAction(), () => { exchangeActor.grounded = false; },
    () => { exchangeActor.available = false; }, () => { exchangeActor.position[0] = .2; }]) {
    fixture(); let contacts = 0, cancels = 0;
    assert.ok(beginExchangeBodyAction('insert', anchor, () => contacts++, () => cancels++));
    tick(); tick(10); const old = exchangeBody.action;
    interrupt(); tick(100);
    Object.assign(exchangeVisualSockets, { valid: true, sampledId: old.id, sampledElapsed: old.contactAt, contactError: 0 });
    tick(10, false); assert.equal(contacts, 0); assert.equal(cancels, 1); assert.equal(exchangeBody.action, null);
  }
});

test('false callback rejects carrying changes, thrown callback is visible and never retried', () => {
  fixture(); let cancels = 0;
  assert.ok(beginExchangeBodyAction('pickup', anchor, () => false, () => cancels++));
  tick(100); assert.equal(exchangeBody.carried, null); assert.equal(cancels, 1);
  let contacts = 0;
  assert.ok(beginExchangeBodyAction('pickup', anchor, () => { contacts++; throw new Error('visible failure'); }));
  assert.throws(() => tick(100), /visible failure/);
  tick(100); assert.equal(contacts, 1); assert.equal(exchangeBody.action, null);
});

test('no tick means no progress, invalid dt is inert, ids are unique and anchors are copied', () => {
  fixture(); const copy = structuredClone(anchor);
  assert.ok(beginExchangeBodyAction('seal', copy, () => {}));
  const action = exchangeBody.action, id = action.id;
  copy.target[0] = 999; assert.equal(action.anchor.target[0], .5);
  for (const dt of [0, -1, NaN, Infinity]) advanceExchangeBodyAction(dt);
  assert.equal(action.elapsed, 0); assert.equal(action.phase, 'approach');
  cancelExchangeBodyAction(); assert.ok(beginExchangeBodyAction('seal', anchor, () => {}));
  assert.ok(exchangeBody.action.id > id); cancelExchangeBodyAction();
});
