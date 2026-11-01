import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_ALL_CLEAR, IBD_SHORT_PACK, IBD_REAR_DAMAGE, IBD_WRONG_SPEC } from './ibd-cases.ts';
import { createIbdState, transitionIbd, assessIbd, measureIbd } from './ibd-model.ts';

const step = (scenario, state, event) => transitionIbd(scenario, state, event);
const inspect = (scenario, state, itemId, aspect, tool, viewpoint = 'floor') =>
  step(scenario, state, { type: 'inspect', itemId, aspect, tool, viewpoint });
function verified(scenario, route = 'catwalk') {
  let state = createIbdState(scenario);
  if (route === 'floor') state = step(scenario, state, { type: 'move', itemId: 'coil-front', tool: 'crane', destination: 'inspection-bay' }).state;
  for (const item of scenario.items) {
    if (item.package) state = step(scenario, state, { type: 'open', itemId: item.id, tool: 'opener' }).state;
    if (item.kind === 'coil' && route === 'floor') state = step(scenario, state, { type: 'turn', itemId: item.id, tool: 'turntable' }).state;
    for (const [aspect, tool] of [['identity', 'tag-reader'], ['quantity', 'visual'], ['specification', 'gauge'], ...item.qualityChecks.map(face => [face, 'flashlight'])]) {
      const result = inspect(scenario, state, item.id, aspect, tool, route);
      assert.equal(result.code, 'observed'); state = result.state;
    }
  }
  return state;
}
function loadedAndConfirmed(scenario, state, ids = ['parts-a', 'parts-b']) {
  for (const itemId of ids) state = step(scenario, state, { type: 'load', itemId, tool: 'trolley' }).state;
  return step(scenario, state, { type: 'confirm-shipment' }).state;
}

test('a completely compliant batch can pass without inventing a discrepancy or changing any cargo', () => {
  const state = loadedAndConfirmed(IBD_ALL_CLEAR, verified(IBD_ALL_CLEAR));
  const result = assessIbd(IBD_ALL_CLEAR, state);
  assert.equal(result.status, 'clear');
  assert.deepEqual(result.inventory.findings, []);
  assert.deepEqual(result.shipment.findings, []);
});

test('floor occlusion needs a real logical reveal; catwalk and crane are alternative evidence routes', () => {
  const scenario = IBD_ALL_CLEAR, start = createIbdState(scenario);
  assert.equal(inspect(scenario, start, 'coil-rear', 'quantity', 'visual').code, 'occluded');
  assert.equal(inspect(scenario, start, 'coil-rear', 'quantity', 'visual', 'catwalk').code, 'observed');
  assert.equal(step(scenario, start, { type: 'move', itemId: 'coil-front', tool: 'trolley', destination: 'inspection-bay' }).code, 'wrong-tool');
  const moved = step(scenario, start, { type: 'move', itemId: 'coil-front', tool: 'crane', destination: 'inspection-bay' }).state;
  assert.equal(inspect(scenario, moved, 'coil-rear', 'quantity', 'visual').code, 'observed');
  assert.equal(assessIbd(scenario, verified(scenario, 'floor')).inventory.status, 'clear');
  assert.equal(assessIbd(scenario, verified(scenario, 'catwalk')).inventory.status, 'clear');
});

test('scale readings and labels never prove contents, specification or quality', () => {
  const scenario = IBD_SHORT_PACK, start = createIbdState(scenario);
  const weighed = step(scenario, start, { type: 'weigh', itemId: 'parts-b', tool: 'scale' });
  assert.equal(weighed.code, 'weight-is-clue'); assert.ok(Number.isFinite(weighed.readingKg));
  assert.deepEqual(weighed.state.proofs, {});
  const tagged = inspect(scenario, weighed.state, 'parts-b', 'identity', 'tag-reader').state;
  assert.equal(inspect(scenario, tagged, 'parts-b', 'quantity', 'visual').code, 'package-sealed');
  assert.equal(inspect(scenario, tagged, 'parts-b', 'specification', 'gauge').code, 'package-sealed');
  assert.equal(assessIbd(scenario, tagged).inventory.status, 'insufficient');
  assert.deepEqual(assessIbd(scenario, tagged).inventory.findings, [], 'hidden discrepancy not leaked without evidence');
});

test('quantity, specification and each required quality face remain distinct proofs', () => {
  const scenario = IBD_REAR_DAMAGE;
  let state = createIbdState(scenario);
  assert.equal(inspect(scenario, state, 'coil-front', 'quality-rear', 'flashlight').code, 'turn-or-change-view');
  assert.equal(inspect(scenario, state, 'coil-front', 'specification', 'tag-reader').code, 'wrong-tool');
  state = inspect(scenario, state, 'coil-rear', 'quantity', 'visual', 'catwalk').state;
  assert.equal(assessIbd(scenario, state).inventory.status, 'insufficient');
  const result = assessIbd(scenario, verified(scenario));
  assert.equal(result.inventory.status, 'different');
  assert.ok(result.inventory.findings.some(f => f.code === 'condition-difference' && f.itemId === 'coil-rear'));
});

test('an opened pack reveals actual units rather than its printed declaration', () => {
  const result = assessIbd(IBD_SHORT_PACK, loadedAndConfirmed(IBD_SHORT_PACK, verified(IBD_SHORT_PACK)));
  const count = result.inventory.findings.find(f => f.code === 'quantity-difference');
  assert.deepEqual([count.expected, count.actual, count.unit], [8, 7, 'piece']);
  assert.equal(result.shipment.status, 'different');
  assert.equal(IBD_SHORT_PACK.items.find(item => item.id === 'parts-b').package.declaredUnits, 4);
});

test('specification mismatch cannot pass because quantity or packaging labels look right', () => {
  const result = assessIbd(IBD_WRONG_SPEC, verified(IBD_WRONG_SPEC));
  assert.equal(result.inventory.status, 'different');
  assert.ok(result.inventory.findings.some(f => f.code === 'unexpected-specification' && f.specId === 'M6'));
});

test('carton and piece units are separate and manifest interpretation uses the declared unit', () => {
  const scenario = IBD_ALL_CLEAR, packs = scenario.items.filter(item => item.package);
  assert.equal(measureIbd(packs, { lotId: 'parts-lot', specId: 'M8', quantity: 2, unit: 'carton' }), 2);
  assert.equal(measureIbd(packs, { lotId: 'parts-lot', specId: 'M8', quantity: 8, unit: 'piece' }), 8);
  const cartons = { ...scenario, waybill: [{ lotId: 'parts-lot', specId: 'M8', quantity: 2, unit: 'carton' }] };
  assert.equal(assessIbd(cartons, loadedAndConfirmed(cartons, verified(cartons))).shipment.status, 'clear');
});

test('only actual loading events count, duplicate loading is idempotent, unloading invalidates confirmation', () => {
  const scenario = IBD_ALL_CLEAR;
  let state = verified(scenario);
  assert.equal(assessIbd(scenario, state).shipment.status, 'in-progress');
  assert.equal(assessIbd(scenario, step(scenario, state, { type: 'confirm-shipment' }).state).shipment.status, 'different');
  state = loadedAndConfirmed(scenario, state);
  assert.equal(step(scenario, state, { type: 'load', itemId: 'parts-a', tool: 'trolley' }).code, 'already-loaded');
  assert.deepEqual(state.loaded, ['parts-a', 'parts-b']);
  state = step(scenario, state, { type: 'unload', itemId: 'parts-a' }).state;
  assert.equal(assessIbd(scenario, state).shipment.status, 'in-progress');
  state = step(scenario, state, { type: 'confirm-shipment' }).state;
  const actual = assessIbd(scenario, state).shipment.findings[0].actual;
  assert.equal(actual, 4);
  assert.equal(step(scenario, state, { type: 'unload', itemId: 'parts-a' }).code, 'not-loaded');
});

test('loading unseen evidence does not convert it into verified inventory', () => {
  const scenario = IBD_ALL_CLEAR;
  const state = loadedAndConfirmed(scenario, createIbdState(scenario));
  assert.equal(assessIbd(scenario, state).shipment.status, 'insufficient');
  assert.equal(assessIbd(scenario, state).status, 'insufficient');
});

test('failed actions and successful transitions do not mutate callers or case definitions', () => {
  const scenario = IBD_ALL_CLEAR, before = JSON.stringify(scenario), state = createIbdState(scenario);
  Object.freeze(state.moved); Object.freeze(state.proofs); Object.freeze(state);
  assert.equal(inspect(scenario, state, 'missing', 'quantity', 'visual').state, state);
  const next = inspect(scenario, state, 'coil-front', 'quantity', 'visual').state;
  assert.deepEqual(state.proofs, {}); assert.notEqual(next, state); assert.equal(JSON.stringify(scenario), before);
  assert.equal(step(IBD_SHORT_PACK, state, { type: 'confirm-shipment' }).code, 'case-mismatch');
  assert.throws(() => assessIbd(IBD_SHORT_PACK, state), TypeError);
});

test('invalid item identity, carton identity and manifest definitions are rejected', () => {
  const scenario = IBD_ALL_CLEAR;
  assert.throws(() => createIbdState({ ...scenario, items: [...scenario.items, scenario.items[0]] }), TypeError);
  assert.throws(() => createIbdState({ ...scenario, inventory: [...scenario.inventory, scenario.inventory[0]] }), TypeError);
  assert.throws(() => createIbdState({ ...scenario, items: scenario.items.map(item => item.id === 'parts-b' ?
    { ...item, package: { ...item.package, outerId: 'carton-a' } } : item) }), TypeError);
});
