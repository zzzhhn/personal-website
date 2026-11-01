import test from 'node:test';
import assert from 'node:assert/strict';
import { createExchangeRound, reduceExchangeRound, roundEquity } from './alpha-exchange-round.ts';

const history = (values = [100, 101, 102, 110, 111, 112, 90, 91, 92, 120]) => values.map((value, day) => ({
  date: new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10), value,
}));
const act = (round, type, extra = {}) => reduceExchangeRound(round, { type, ...extra });
const choose = (round, units) => act(act(act(round, 'target', { units }), 'seal'), 'ring');
function finish(round, units = 0) {
  round = act(round, 'insert');
  while (round.phase === 'selecting') round = choose(round, units);
  return act(round, 'collect');
}

test('three decisions rebalance at known NAV and mark every real day under the held exposure', () => {
  let round = act(createExchangeRound(history()), 'insert');
  round = choose(round, 20);
  assert.equal(round.phase, 'selecting');
  assert.equal(round.day, 3);
  assert.equal(round.cash, 8000);
  assert.equal(roundEquity(round), 10200);
  round = choose(round, 10);
  assert.equal(round.day, 6);
  assert.equal(round.cash, 9100);
  assert.equal(roundEquity(round), 10000);
  round = choose(round, 30);
  assert.equal(round.phase, 'clearing');
  assert.equal(round.day, 9);
  assert.equal(round.cash, 7300);
  assert.equal(roundEquity(round), 10900);
  assert.deepEqual(round.choices.map(c => [c.day, c.value, c.deltaUnits, c.throughDay, c.equityAfter]), [
    [0, 100, 20, 3, 10200], [3, 110, -10, 6, 10000], [6, 90, 20, 9, 10900],
  ]);
  assert.deepEqual(round.equityTrace.map(p => p.equity), [10000, 10020, 10040, 10200, 10210, 10220, 10000, 10030, 10060, 10900]);
  assert.deepEqual(round.equityTrace.map(p => p.units), [20, 20, 20, 10, 10, 10, 30, 30, 30, 30]);
  assert.ok(round.equityTrace.every(p => p.equity === p.cash + p.units * p.value));
  assert.deepEqual(round.equityTrace.map(p => p.date), history().map(p => p.date));
});

test('future prices affect marks, never the fill or cash at the current decision', () => {
  const a = choose(act(createExchangeRound(history([100, 110, 120, 130])), 'insert'), 50);
  const b = choose(act(createExchangeRound(history([100, 2, 3, 4])), 'insert'), 50);
  assert.equal(a.choices[0].value, 100);
  assert.equal(b.choices[0].value, 100);
  assert.equal(a.cash, 5000);
  assert.equal(b.cash, 5000);
  assert.equal(a.choices[0].equityBefore, b.choices[0].equityBefore);
  assert.notEqual(roundEquity(a), roundEquity(b));
});

test('insufficient cash rejects the entire rebalance and recovers through target selection', () => {
  let round = choose(act(createExchangeRound(history([100, 200, 300, 1000, 900, 800, 700, 600, 500, 400])), 'insert'), 0);
  const before = round;
  round = choose(round, 50);
  assert.equal(round.phase, 'selecting');
  assert.equal(round.message, 'insufficient');
  assert.equal(round.day, before.day);
  assert.equal(round.cash, before.cash);
  assert.equal(round.units, before.units);
  assert.equal(round.checkpoint, before.checkpoint);
  assert.strictEqual(round.choices, before.choices);
  assert.strictEqual(round.equityTrace, before.equityTrace);
  assert.equal(round.targetUnits, 50);
  round = choose(round, 10);
  assert.equal(round.cash, 0);
  assert.equal(round.units, 10);
  assert.equal(round.choices.length, 2);
  round = choose(round, 0);
  assert.equal(round.cash, 7000);
  assert.equal(round.units, 0);
  assert.equal(round.phase, 'clearing');
});

test('invalid targets leave the last valid selection and accounting unchanged', () => {
  const initial = act(act(createExchangeRound(history()), 'insert'), 'target', { units: 20 });
  for (const units of [-10, 1, 25, 60, 10.5, NaN, Infinity, '10', null]) {
    const next = act(initial, 'target', { units });
    assert.equal(next.message, 'invalid-target');
    assert.equal(next.targetUnits, 20);
    assert.equal(next.cash, initial.cash);
    assert.equal(next.units, 0);
    assert.equal(next.choices.length, 0);
  }
  for (const units of [0, 10, 20, 30, 40, 50]) assert.equal(act(initial, 'target', { units }).targetUnits, units);
});

test('wrong-phase and duplicate actions are identity no-ops; sealing freezes the target', () => {
  const ticket = createExchangeRound(history());
  for (const type of ['target', 'seal', 'ring', 'collect', 'replay']) assert.strictEqual(act(ticket, type, { units: 50 }), ticket);
  let round = act(ticket, 'insert');
  assert.strictEqual(act(round, 'insert'), round);
  assert.strictEqual(act(round, 'ring'), round);
  assert.strictEqual(act(round, 'collect'), round);
  assert.strictEqual(act(round, 'replay'), round);
  round = act(act(round, 'target', { units: 20 }), 'seal');
  for (const type of ['insert', 'target', 'seal', 'collect', 'replay']) assert.strictEqual(act(round, type, { units: 50 }), round);
  assert.equal(round.targetUnits, 20);
  round = act(round, 'ring');
  assert.strictEqual(act(round, 'ring'), round);
  round = choose(choose(round, 20), 20);
  for (const type of ['insert', 'target', 'seal', 'ring', 'replay']) assert.strictEqual(act(round, type, { units: 50 }), round);
  round = act(round, 'collect');
  for (const type of ['insert', 'target', 'seal', 'ring', 'collect']) assert.strictEqual(act(round, type, { units: 50 }), round);
});

test('short histories use only unique available checkpoints and one trace mark per date', () => {
  for (let length = 1; length <= 12; length++) {
    const days = history(Array.from({ length }, (_, i) => 100 + i));
    const round = finish(createExchangeRound(days), 10);
    assert.equal(round.phase, 'complete');
    assert.equal(round.day, length - 1);
    assert.equal(round.choices.length, Math.min(3, Math.max(1, length - 1)));
    assert.equal(new Set(round.choices.map(c => c.throughDay)).size, round.choices.length);
    assert.deepEqual(round.equityTrace.map(p => p.date), days.map(p => p.date));
    assert.equal(roundEquity(round), 10000 + (length - 1) * 10);
  }
});

test('receipt describes the actual historical run; replay retains exactly the previous receipt', () => {
  let round = finish(createExchangeRound(history()), 20);
  const receipt = round.receipt;
  assert.equal(receipt.startDate, '2026-01-01');
  assert.equal(receipt.endDate, '2026-01-10');
  assert.equal(receipt.startPoints, 10000);
  assert.equal(receipt.finalEquity, 10400);
  assert.equal(receipt.pnl, 400);
  assert.equal(receipt.returnPct, 4);
  assert.equal(receipt.benchmark, 'SPY');
  assert.equal(receipt.historical, true);
  assert.match(receipt.caveat, /virtual points/);
  assert.match(receipt.caveat, /no trading fees or slippage/);
  assert.deepEqual(receipt.choices, round.choices);
  assert.deepEqual(receipt.equityTrace, round.equityTrace);
  assert.notStrictEqual(receipt.choices[0], round.choices[0]);
  round = act(round, 'replay');
  assert.equal(round.phase, 'ticket');
  assert.equal(round.cash, 10000);
  assert.equal(round.units, 0);
  assert.equal(round.day, 0);
  assert.equal(round.receipt, null);
  assert.deepEqual(round.previousRun, receipt);
  assert.equal(round.choices.length, 0);
  assert.equal(round.equityTrace.length, 1);
  round = finish(round, 0);
  assert.equal(round.receipt.finalEquity, 10000);
  assert.deepEqual(round.previousRun, receipt);
  round = act(round, 'replay');
  assert.equal(round.previousRun.finalEquity, 10000);
  assert.equal('previousRun' in round.previousRun, false);
});

test('history validation preserves adapter calendar, finite NAV and normalized start guarantees', () => {
  const invalid = [[], null, history([101]), history([100, 0]), history([100, -1]), history([100, NaN]),
    history([100, Infinity]), history([100, 1e8 + 1]), history([100, '101']),
    [{ date: '2026-02-30', value: 100 }], [{ date: '2026-2-01', value: 100 }],
    [{ date: 'invalid', value: 100 }], [null], history([100, 101]).reverse(),
    [{ date: '2026-01-01', value: 100 }, { date: '2026-01-01', value: 101 }],
    Array.from({ length: 10001 }, () => ({ date: '2026-01-01', value: 100 })),
  ];
  for (const days of invalid) assert.throws(() => createExchangeRound(days));
  assert.doesNotThrow(() => createExchangeRound(history([100 + 1e-7, 1e8])));
  const days = history();
  const round = createExchangeRound(days);
  days[0].value = 0;
  days.push({ date: '2027-01-01', value: 1 });
  assert.equal(round.history[0].value, 100);
  assert.equal(round.history.length, 10);
});

test('repeated rounds stay bounded and reducing does not mutate an earlier state', () => {
  const original = createExchangeRound(history());
  const snapshot = JSON.stringify(original);
  let round = original;
  for (let run = 0; run < 50; run++) {
    round = finish(round, run % 2 ? 0 : 50);
    assert.equal(round.choices.length, 3);
    assert.equal(round.equityTrace.length, 10);
    assert.equal(round.receipt.choices.length, 3);
    assert.equal(round.receipt.equityTrace.length, 10);
    if (round.previousRun) {
      assert.equal(round.previousRun.choices.length, 3);
      assert.equal(round.previousRun.equityTrace.length, 10);
      assert.equal('previousRun' in round.previousRun, false);
    }
    round = act(round, 'replay');
  }
  assert.equal(JSON.stringify(original), snapshot);
});
