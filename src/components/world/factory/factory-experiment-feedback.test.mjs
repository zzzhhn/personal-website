import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryGame } from './factory-game.ts';
import { factorySameConditions, factoryPreviousComparable, factoryRunSummary, factoryComparisonSummary, factoryWheelExperiment } from './factory-experiment-feedback.ts';

const configuration = { id: 'feedback:config:1', revision: 1, kind: 'nimble', parts: { frame: 'f1', wheels: 'w1', shell: 's1' } };
const conditions = { testKind: 'rumble', loadKg: 0, courseVersion: 'factory-course-v1', seed: 1, durationLimitS: 60 };
const m = (progress, tiltDeg = 0, speedMps = 0) => ({ progress, tiltDeg, speedMps, loadKg: 0 });
function trial(n, overrides = {}) {
  return { id: `feedback:action:${n}:trial`, batchId: 'b1', configuration: structuredClone(configuration),
    mode: 'single', conditions: structuredClone(conditions), reference: null, status: 'completed', reason: null,
    samples: [{ elapsedS: 0, player: m(0) }, { elapsedS: 3, player: m(.5, -12, 1.4) }, { elapsedS: 6, player: m(1) }],
    observations: [], ...overrides };
}
test('summary reports actual speed/tilt and sampled position without manufacturing a verdict', () => {
  const t = trial(1);
  assert.match(factoryRunSummary(t, true), /1.40 m\/s（中段）.*12.0°（中段）/);
  assert.match(factoryRunSummary(t, false), /6.0 s sample.*1.40 m\/s.*12.0°/);
  assert.equal(factoryRunSummary({ ...t, status: 'running' }, true), null);
  assert.match(factoryRunSummary({ ...t, samples: [] }, true), /没有保留采样/);
  assert.match(factoryRunSummary({ ...t, samples: t.samples.slice(0, 2), status: 'interrupted' }, false), /50%.*without a finish/);
});
test('previous comparable requires all conditions, batch, mode and completed evidence', () => {
  const old = trial(1), current = trial(2);
  assert.equal(factoryPreviousComparable(current, [old, current]), old);
  for (const [key, value] of Object.entries({ testKind: 'slope', loadKg: 2, courseVersion: 'v2', seed: 2, durationLimitS: 30 })) {
    const changed = { ...old, conditions: { ...conditions, [key]: value } };
    assert.equal(factorySameConditions(changed.conditions, current.conditions), false);
    assert.equal(factoryPreviousComparable(current, [changed, current]), null);
  }
  for (const changed of [
    { ...old, batchId: 'b2' }, { ...old, mode: 'comparison' }, { ...old, status: 'interrupted' },
  ]) assert.equal(factoryPreviousComparable(current, [changed, current]), null);
  assert.equal(factoryPreviousComparable(current, [current, old]), null, 'future records are not previous runs');
  assert.equal(factoryPreviousComparable(current, [old]), null, 'unknown record order cannot support a comparison');
});
test('repeatability takes priority; changed setups are explicitly compared as whole setups', () => {
  const old = trial(1), changed = trial(2, { configuration: { ...configuration, id: 'config:2', revision: 2, kind: 'steady', parts: { ...configuration.parts, wheels: 'w2' } } });
  assert.equal(factoryPreviousComparable(changed, [old, changed]), old);
  assert.match(factoryComparisonSummary(changed, [old, changed], true), /整套配置前后（轻快型 → 稳健型.*不能归因于单个零件/);
  assert.match(factoryComparisonSummary(changed, [old, changed], false), /earlier whole setup.*single part/);
  const repeated = trial(3);
  assert.equal(factoryPreviousComparable(repeated, [old, changed, repeated]), old);
});
test('completed history differences retain direction and do not use finish speed as race speed', () => {
  const old = trial(1), current = trial(2, { samples: [{ elapsedS: 0, player: m(0) }, { elapsedS: 8, player: m(1, 4) }] });
  assert.match(factoryComparisonSummary(current, [old, current], true), /慢 2.0 s.*少 8.0°/);
  assert.match(factoryComparisonSummary(current, [old, current], false), /2.0 s slower.*8.0° less/);
  assert.match(factoryComparisonSummary(old, [old], false), /No complete earlier run/);
});
test('same-run benchmark comparison requires completion of both lanes and benchmark identity', () => {
  const t = trial(1, { mode: 'comparison', reference: { id: 'factory-reference-v1', role: 'benchmark' }, samples: [
    { elapsedS: 0, player: m(0), reference: m(0) },
    { elapsedS: 5, player: m(1, 8), reference: m(.7, 2) },
    { elapsedS: 7, player: m(1), reference: m(1, 3) },
  ] });
  assert.match(factoryComparisonSummary(t, [t], true), /同场基准机：快 2.0 s.*多 5.0°/);
  assert.match(factoryComparisonSummary({ ...t, status: 'incomplete' }, [t], true), /不作全程/);
  assert.match(factoryComparisonSummary({ ...t, samples: t.samples.slice(0, 2) }, [t], false), /incomplete/);
  assert.doesNotMatch(factoryComparisonSummary({ ...t, reference: null }, [t], true), /相比同场基准机/);
});
test('wheel experiment names the actual alternate configuration and rerun conditions without a promised improvement', () => {
  const game = { ...createFactoryGame('feedback'), batchId: 'b1', configuration, trialAssembled: true, trials: [trial(1)] };
  assert.match(factoryWheelExperiment(game, true), /稳健型宽轮.*相同模式与条件.*颠簸路.*不保证改善/);
  assert.match(factoryWheelExperiment(game, false), /Steady wide wheels.*same mode and conditions.*not guaranteed/);
  assert.match(factoryWheelExperiment({ ...game, trials: [trial(1, { status: 'interrupted', reason: 'session-interrupted' })] }, true), /先按原条件重跑/);
  assert.equal(factoryWheelExperiment({ ...game, configuration: { ...configuration, revision: 2 } }, true), null);
  assert.equal(factoryWheelExperiment({ ...game, finalAssembled: true }, true), null);
  const later = trial(2, { conditions: { ...conditions, testKind: 'slope' } });
  assert.match(factoryWheelExperiment({ ...game, trials: [...game.trials, later] }, true, game.trials[0]), /再跑颠簸路/);
  assert.equal(factoryWheelExperiment(game, true, { ...later, batchId: 'different' }), null);
});
