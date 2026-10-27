import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Node's TS runner does not resolve the extensionless imports used by the existing world modules.
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { useWorldStore } = await import('../store.ts');
const { mineActor, useAlphaMineStore } = await import('../alpha-mine-state.ts');
const { nearestInteractable, registerInteractable } = await import('../WorldInteract.ts');
const { INTENT_TARGETS, intentReachRadius } = await import('./intent-stations.ts');
const { createIntentProgress, INTENT_STORAGE_KEY } = await import('./intent-progress.ts');
const runtime = await import('./intent-state.ts');
const { COASTER_BOARDING } = await import('./coaster-transition.ts');
const { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } = await import('../actor-physics.ts');
const { attractionRide, endAttractionRide } = await import('./attraction-ride.ts');
globalThis.document = { hidden: false };
const records = new Map();
globalThis.localStorage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
const release = Object.entries(INTENT_TARGETS).map(([id, position]) => registerInteractable({
  id: `intent-${id}`, position, radius: intentReachRadius(id), label: { zh: id, en: id }, kind: 'exhibit',
  enabled: () => runtime.intentAvailable(id), onInteract: () => runtime.activateIntentTarget(id),
}));
function standAt(id) {
  const position = id === 'board' ? COASTER_BOARDING.approach.map((v, i) => i === 1 ? v + PLAYER_RADIUS + PLAYER_HALF_HEIGHT : v) : [...INTENT_TARGETS[id]];
  useWorldStore.setState({ position });
  nearestInteractable(...position, () => true);
}
function fresh() {
  endAttractionRide(); runtime.clearIntentRide(); records.clear();
  useWorldStore.setState({ ...useWorldStore.getInitialState(), ready: true });
  useAlphaMineStore.setState({ action: null, carried: null });
  Object.assign(mineActor, { available: true, grounded: true });
  runtime.useIntentStore.setState({ progress: createIntentProgress(), loaded: false, active: true,
    tasks: { route: 0, press: 0, visitor: 0 }, tools: { route: 'lookup', press: 'rewrite', visitor: 'rewrite' }, notice: null, effect: null });
  document.hidden = false; runtime.loadIntentProgress();
}
function six() {
  standAt('route');
  for (const tool of ['lookup', 'plan', 'debug', 'act']) { runtime.operateIntent('route', tool); runtime.nextIntentTask('route'); }
  standAt('press'); runtime.operateIntent('press', 'rewrite'); runtime.nextIntentTask('press'); runtime.operateIntent('press', 'extract');
}
test('the actual runtime accepts six spatial actions, then chest, key, gate and boarding', () => {
  fresh(); six(); const s = () => runtime.useIntentStore.getState();
  assert.equal(s().progress.passed.length, 6);
  standAt('board'); runtime.activateIntentTarget('board'); assert.equal(attractionRide.active, false);
  standAt('gate'); runtime.activateIntentTarget('gate'); assert.equal(s().progress.gateOpen, false);
  standAt('chest'); runtime.activateIntentTarget('chest'); assert.equal(s().progress.chestOpen, true); assert.equal(s().progress.keyTaken, false);
  runtime.activateIntentTarget('chest'); assert.equal(s().progress.keyTaken, true);
  standAt('gate'); runtime.activateIntentTarget('gate'); assert.equal(s().progress.gateOpen, true);
  mineActor.grounded = false; standAt('board'); runtime.activateIntentTarget('board'); assert.equal(attractionRide.active, false);
  mineActor.grounded = true; standAt('board'); runtime.activateIntentTarget('board'); assert.equal(attractionRide.active, true); assert.equal(s().riding, true);
  assert.equal(runtime.intentRideClock.riding, false, 'clicking starts a walk, not the train');
  assert.equal(attractionRide.transition.phase, 'approach');
  const exit = [...attractionRide.exit]; runtime.stopIntentRide();
  assert.equal(attractionRide.active, true, 'cancel requests a physical station exit');
  assert.equal(attractionRide.transition.exitRequested, true); assert.deepEqual(attractionRide.exit, exit);
  assert.equal(s().progress.gateOpen, true); assert.equal(JSON.parse(records.get(INTENT_STORAGE_KEY)).passed.length, 6);
});
test('device calls cannot bypass distance, the shared sight check, pause, hiding or other actor actions', () => {
  fresh(); runtime.operateIntent('route', 'lookup'); assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
  standAt('route'); nearestInteractable(...INTENT_TARGETS.route, () => false);
  runtime.operateIntent('route', 'lookup'); assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
  for (const blocking of [{ paused: true }, { activeVehicle: 'offroad' }, { seat: {} }, { card: {} }]) {
    useWorldStore.setState({ paused: false, activeVehicle: null, seat: null, card: null, ...blocking }); standAt('route');
    runtime.operateIntent('route', 'lookup'); assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
  }
  useWorldStore.setState({ card: null }); document.hidden = true; standAt('route'); runtime.operateIntent('route', 'lookup');
  assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
  document.hidden = false; useAlphaMineStore.setState({ action: {} }); standAt('route'); runtime.operateIntent('route', 'lookup');
  assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
  useAlphaMineStore.setState({ action: null }); standAt('route'); runtime.operateIntent('route', 'lookup');
  assert.equal(runtime.useIntentStore.getState().progress.passed.length, 1);
});
test('the physical visitor still requires the bell, and repeated interaction counts once', () => {
  fresh(); standAt('visitor'); runtime.operateIntent('visitor', 'rewrite');
  assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
  runtime.activateIntentTarget('visitor'); assert.deepEqual(runtime.useIntentStore.getState().progress.clarified, ['T7']);
  runtime.operateIntent('visitor', 'rewrite'); runtime.operateIntent('visitor', 'rewrite');
  assert.deepEqual(runtime.useIntentStore.getState().progress.passed, ['T7']);
});
test('restarting inside the locked boundary cannot strand the player', () => {
  fresh(); six(); standAt('board'); runtime.resetIntentVisit();
  assert.equal(runtime.useIntentStore.getState().progress.passed.length, 6);
  standAt('route'); runtime.resetIntentVisit(); assert.equal(runtime.useIntentStore.getState().progress.passed.length, 0);
});
test('corrupt and incompatible saves remain untouched while a fresh visit can still be played', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 88, bankRevision: 'future' })]) {
    fresh(); records.set(INTENT_STORAGE_KEY, raw); runtime.useIntentStore.setState({ loaded: false }); runtime.loadIntentProgress();
    assert.ok(runtime.useIntentStore.getState().saveIssue);
    standAt('route'); runtime.operateIntent('route', 'lookup');
    assert.equal(runtime.useIntentStore.getState().progress.passed.length, 1); assert.equal(records.get(INTENT_STORAGE_KEY), raw);
    runtime.resetIntentVisit(); assert.equal(records.get(INTENT_STORAGE_KEY), raw);
  }
});
test.after(() => { release.forEach(fn => fn()); endAttractionRide(); delete globalThis.document; delete globalThis.localStorage; });
