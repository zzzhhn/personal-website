import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { useWorldStore } = await import('../store.ts');
const { useAlphaMineStore } = await import('../alpha-mine-state.ts');
const { nearestInteractable, registerInteractable } = await import('../WorldInteract.ts');
const { createIntentProgress, intentProgressView } = await import('./intent-progress.ts');
const { useIntentStore, activateIntentTarget } = await import('./intent-state.ts');
const { INTENT_TARGETS } = await import('./intent-stations.ts');
const { parkAudio } = await import('../WorldParkAudio.ts');
const { WORKSHOP_TARGETS, workshopTarget } = await import('./intent-workshop-layout.ts');
const { operateWorkshop, advanceWorkshop, resetWorkshop, workshopAvailable, useWorkshopStore, workshopClock,
  workshopOutputComplete, workshopCarrierProgress, WORKSHOP_RETURN_SECONDS, WORKSHOP_PROCESS_SECONDS } = await import('./intent-workshop-runtime.ts');
globalThis.document = { hidden: false }; globalThis.localStorage = { setItem() {} };
for (const id of WORKSHOP_TARGETS) registerInteractable({ id: `intent-workshop-${id}`, position: workshopTarget(id), radius: 2.6,
  label: { zh: id, en: id }, kind: 'exhibit', enabled: () => workshopAvailable(id), onInteract: () => operateWorkshop(id) });
function fresh() {
  resetWorkshop(); document.hidden = false;
  useWorldStore.setState({ ...useWorldStore.getInitialState(), ready: true });
  useAlphaMineStore.setState({ action: null, carried: null });
  useIntentStore.setState({ progress: createIntentProgress(), active: true, riding: false });
}
function at(id, visible = true) { const p = workshopTarget(id); useWorldStore.setState({ position: p }); nearestInteractable(...p, () => visible); }
function action(id) { at(id); operateWorkshop(id); }
function finish() { for (let i = 0; i < 30; i++) advanceWorkshop(.1, false, false); }
test('the six physical machines finish six distinct requests and unlock the existing chest without DOM answer buttons', () => {
  fresh();
  for (const [i, tool] of ['lookup', 'plan', 'rewrite', 'extract', 'debug', 'act'].entries()) {
    action('intake'); assert.equal(useWorkshopStore.getState().taskId, `T${i + 1}`);
    action(tool); assert.equal(useWorkshopStore.getState().phase, 'processing');
    assert.equal(useIntentStore.getState().progress.passed.length, i, 'credit must wait for the actual machine cycle');
    finish(); assert.equal(useIntentStore.getState().progress.passed.length, i + 1);
    assert.equal(workshopOutputComplete(tool, useIntentStore.getState().progress.passed), true);
  }
  assert.equal(intentProgressView(useIntentStore.getState().progress).chestReady, true);
  assert.equal(useIntentStore.getState().progress.gateOpen, false, 'six requests unlock the chest, not the gate');
});
test('a wrong route preserves the original task and produces no credit; repeating a completed clock cannot double-count', () => {
  fresh(); action('intake'); action('act'); finish();
  assert.equal(useWorkshopStore.getState().correct, false); assert.deepEqual(useIntentStore.getState().progress.passed, []);
  assert.equal(useWorkshopStore.getState().phase, 'returning');
  assert.equal(workshopOutputComplete('act', useIntentStore.getState().progress.passed), false, 'rejected bookings cannot reserve a seat');
  for (const id of WORKSHOP_TARGETS) { at(id); assert.equal(workshopAvailable(id), false, `${id} must wait for the carrier`); }
  const elapsed = workshopClock.elapsed;
  advanceWorkshop(.1, true, false); advanceWorkshop(.1, false, true);
  assert.equal(workshopClock.elapsed, elapsed, 'return motion pauses with the world');
  finish(); assert.equal(useWorkshopStore.getState().phase, 'ready');
  assert.equal(useWorkshopStore.getState().taskId, 'T1'); action('lookup'); finish(); finish();
  assert.deepEqual(useIntentStore.getState().progress.passed, ['T1']);
});
test('the rejected carrier reverses continuously and arrives at intake before retry', () => {
  assert.equal(workshopCarrierProgress('processing', WORKSHOP_PROCESS_SECONDS), workshopCarrierProgress('returning', 0));
  const samples = [0, .25, .5, .75, 1].map(f => workshopCarrierProgress('returning', WORKSHOP_RETURN_SECONDS * f));
  samples.forEach((value, i) => assert.ok(Math.abs(value - [1, .75, .5, .25, 0][i]) < 1e-10));
  assert.equal(workshopCarrierProgress('returning', WORKSHOP_RETURN_SECONDS), workshopCarrierProgress('ready', 0));
});
test('machine outputs survive the next request and a scene reset, but follow a cleared saved progression', () => {
  fresh(); action('intake'); action('lookup'); finish(); action('intake');
  assert.equal(workshopOutputComplete('lookup', useIntentStore.getState().progress.passed), true);
  resetWorkshop();
  assert.equal(workshopOutputComplete('lookup', useIntentStore.getState().progress.passed), true);
  useIntentStore.setState({ progress: createIntentProgress() });
  assert.equal(workshopOutputComplete('lookup', useIntentStore.getState().progress.passed), false);
});
test('paused, hidden and abnormal frames do not advance a request, and recovery cancels the unsettled cycle', () => {
  fresh(); action('intake'); action('lookup');
  for (const args of [[.1, true, false], [.1, false, true], [1, false, false], [NaN, false, false]]) advanceWorkshop(...args);
  assert.equal(workshopClock.elapsed, 0); resetWorkshop(); finish();
  assert.deepEqual(useIntentStore.getState().progress.passed, []);
});
test('spatial controls require actual line of sight and cannot submit while other actor modes are active', () => {
  fresh(); at('intake', false); operateWorkshop('intake'); assert.equal(useWorkshopStore.getState().phase, 'idle');
  action('intake'); useWorldStore.setState({ paused: true }); action('lookup'); assert.equal(useWorkshopStore.getState().phase, 'ready');
  useWorldStore.setState({ paused: false, activeVehicle: 'offroad' }); action('lookup'); assert.equal(useWorkshopStore.getState().phase, 'ready');
});
test('the ambiguous seventh request needs the physical bell before a route can earn credit', () => {
  fresh(); useIntentStore.setState({ progress: { ...createIntentProgress(), passed: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] } });
  action('intake'); action('rewrite'); finish(); assert.equal(useIntentStore.getState().progress.passed.length, 6);
  finish(); action('bell'); action('rewrite'); finish(); assert.equal(useIntentStore.getState().progress.passed.length, 7);
  at('intake'); assert.equal(workshopAvailable('intake'), false);
});

test('physical actions dispatch distinct sounds once, and machine sound stops before the actual result', t => {
  fresh(); const sounds = [];
  t.mock.method(parkAudio, 'workshopCue', kind => { sounds.push(kind); return () => sounds.push(`stop:${kind}`); });
  t.mock.method(parkAudio, 'cue', () => assert.fail('workshop must not reuse scan/strike'));
  action('intake'); action('lookup'); assert.deepEqual(sounds, ['intake', 'route']);
  for (let i = 0; i < 4; i++) advanceWorkshop(.1, false, false);
  assert.deepEqual(sounds, ['intake', 'route', 'process']);
  finish(); finish(); assert.deepEqual(sounds, ['intake', 'route', 'process', 'stop:process', 'success']);
  action('intake'); action('act'); finish();
  assert.deepEqual(sounds.slice(-5), ['intake', 'route', 'process', 'stop:process', 'error']);
});

test('pause or reset cancels machine audio without replaying elapsed sound on resumed frames', t => {
  fresh(); const sounds = [];
  t.mock.method(parkAudio, 'workshopCue', kind => { sounds.push(kind); return () => sounds.push(`stop:${kind}`); });
  action('intake'); action('lookup');
  for (let i = 0; i < 4; i++) advanceWorkshop(.1, false, false);
  advanceWorkshop(.1, true, false); advanceWorkshop(.1, false, true);
  assert.equal(sounds.filter(k => k === 'stop:process').length, 1);
  advanceWorkshop(.1, false, false); assert.equal(sounds.filter(k => k === 'process').length, 1);
  resetWorkshop(); finish(); assert.equal(sounds.includes('success'), false);
  action('intake'); action('lookup'); for (let i = 0; i < 4; i++) advanceWorkshop(.1, false, false);
  resetWorkshop(); assert.equal(sounds.filter(k => k === 'stop:process').length, 2);
});

test('clarification bell is distinct and gate unlock sounds only on a successful false-to-true transition', t => {
  fresh(); const sounds = [];
  t.mock.method(parkAudio, 'workshopCue', kind => { sounds.push(kind); return () => {}; });
  const solved = { ...createIntentProgress(), passed: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] };
  useIntentStore.setState({ progress: solved }); action('intake'); action('bell');
  assert.deepEqual(sounds, ['intake', 'bell']); sounds.length = 0;
  const p = INTENT_TARGETS.gate;
  const unregister = registerInteractable({ id: 'intent-gate', position: p, radius: 3.1, kind: 'exhibit', label: { zh: '门', en: 'Gate' }, onInteract() {} });
  t.after(unregister);
  useWorldStore.setState({ position: p }); nearestInteractable(...p, () => true);
  activateIntentTarget('gate'); assert.deepEqual(sounds, [], 'no key is not an unlock');
  useIntentStore.setState({ progress: { ...solved, chestOpen: true, keyTaken: true } });
  activateIntentTarget('gate'); activateIntentTarget('gate');
  assert.deepEqual(sounds, ['unlock']); assert.equal(useIntentStore.getState().progress.gateOpen, true);
});
