import test from 'node:test';
import assert from 'node:assert/strict';
import { waterwheelFlow, cycleWaterwheelGate, getWaterwheelSnapshot, subscribeWaterwheel, WATERWHEEL_PASSAGE } from './waterwheel-state.ts';

test('all 27 combinations retain a useful moderate flow between dry and spilling', () => {
  let balanced = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const flow = waterwheelFlow([a, b, c]), total = a + b + c;
    assert.equal(flow.irrigating, total >= 2 && total <= 4);
    assert.equal(flow.passageRevealed, flow.irrigating || total === 0);
    if (flow.irrigating) { balanced++; assert.ok(flow.bucketFill > .8); }
    if (total >= 5) { assert.equal(flow.mode, 'spill'); assert.ok(flow.bucketFill < .3); assert.ok(flow.radiansPerSecond > 3 * waterwheelFlow([1, 1, 1]).radiansPerSecond); }
    if (!total) assert.equal(flow.radiansPerSecond, 0);
  }
  assert.ok(balanced > 1, 'many combinations work, without a hidden exact-code puzzle');
});

test('E cycles only its own sluice and completion survives later overwatering', () => {
  assert.deepEqual(getWaterwheelSnapshot().gates, [2, 2, 2]);
  let notices = 0;
  const off = subscribeWaterwheel(() => notices++);
  const balanced = cycleWaterwheelGate(0);
  assert.deepEqual(balanced.gates, [0, 2, 2]);
  assert.equal(balanced.everBalanced, true);
  cycleWaterwheelGate(0); const fast = cycleWaterwheelGate(0);
  assert.deepEqual(fast.gates, [2, 2, 2]); assert.equal(fast.flow.mode, 'spill'); assert.equal(fast.everBalanced, true);
  assert.equal(notices, 3); assert.equal(balanced.gates[0], 0, 'old snapshots remain immutable');
  off(); cycleWaterwheelGate(1); assert.equal(notices, 3);
});

test('hidden passage contract leaves room for the player and trailing camera', () => {
  const b = WATERWHEEL_PASSAGE.bounds;
  assert.ok(b.ceilingY - b.floorY >= 4.5);
  assert.ok(b.maxZ - b.minZ >= 2.5);
  assert.equal(WATERWHEEL_PASSAGE.west[1], WATERWHEEL_PASSAGE.east[1]);
});
