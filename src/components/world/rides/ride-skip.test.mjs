import test from 'node:test';
import assert from 'node:assert/strict';
// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/rides/ride-skip.test.mjs
const { TransportDriver } = await import('./transport-driver.ts');
const { transportWorld } = await import('./transport-route.ts');
const { ALPHA_TRANSPORT_ROUTES, alphaFerryRoute } = await import('../alpha-island/transports/alpha-routes.ts');
const { COASTER_BOARDING, createCoasterTransition, captureCoasterStart, advanceCoasterTransition,
  requestCoasterSkip, finishSkippedCoasterTravel } = await import('../attractions/coaster-transition.ts');
const { coasterRidePose } = await import('../attractions/coaster-track.ts');
const { attractionRide, beginAttractionRide, endAttractionRide } = await import('../attractions/attraction-ride.ts');
const { useWorldStore } = await import('../store.ts');
const { skipIntentRide, clearIntentRide, intentRideClock, useIntentStore } = await import('../attractions/intent-state.ts');
const routes = [...ALPHA_TRANSPORT_ROUTES, alphaFerryRoute()], dt = 1 / 60;
function until(driver, phase) {
  for (let i = 0; i < 12000 && driver.phase !== phase; i++) driver.step(dt, false);
  assert.equal(driver.phase, phase, driver.id);
}
function boarded(route, source) {
  const d = new TransportDriver(route, source);
  d.capture(transportWorld(route.terminals[source].boarding[0], route.transform), 0);
  until(d, 'riding');
  for (let i = 0; i < 45; i++) d.step(dt, false);
  return d;
}

test('each actual transport skips both travel directions to its terminal and walks the normal egress', () => {
  for (const route of routes) for (const source of route.kind === 'sled' ? [0] : [0, 1]) {
    const d = boarded(route, source), before = d.u, destination = source === 0 ? 1 : 0;
    assert.equal(d.requestSkip(), true); assert.equal(d.requestSkip(), false);
    assert.equal(d.u, before, 'the click queues a frame-owned arrival');
    const sample = d.step(dt, false);
    assert.equal(d.phase, 'stand'); assert.equal(d.destination, destination);
    assert.equal(d.u, destination); assert.equal(d.velocity, 0);
    assert.deepEqual(d.frame.seat, sample.pose.seat);
    assert.deepEqual(d.frame.root, transportWorld(route.terminals[destination].boarding.at(-1), route.transform));
    assert.equal(d.requestSkip(), false, 'cannot restart an existing disembark');
    until(d, 'walk-out');
    assert.ok(d.egressPath.length > 1);
    until(d, 'complete');
    assert.deepEqual(d.frame.root, transportWorld(route.terminals[destination].safeExit, route.transform));
    assert.equal(d.frame.seatWeight, 0); assert.equal(d.frame.speed, 0);
  }
});

test('skip preserves cancellation destinations, pause and stale-frame freezes', () => {
  for (const route of routes) for (const source of route.kind === 'sled' ? [0] : [0, 1]) {
    const d = boarded(route, source);
    d.requestExit(); assert.equal(d.requestSkip(), true);
    const before = JSON.stringify(d);
    for (const [delta, frozen] of [[dt, true], [NaN, false], [1, false], [0, false]]) {
      d.step(delta, frozen); assert.equal(JSON.stringify(d), before);
    }
    d.step(dt, false);
    assert.equal(d.destination, route.kind === 'sled' ? 1 : source);
    assert.equal(d.u, d.destination); assert.equal(d.velocity, 0);
    until(d, 'complete'); assert.deepEqual(d.frame.root, d.safeExit);
  }
});

test('skipping never bypasses a blocked terminal or its guarded walking path', () => {
  for (const route of routes) {
    let releases = 0;
    const d = new TransportDriver(route, 0, () => releases++);
    assert.equal(d.requestSkip(), false);
    d.capture(transportWorld(route.terminals[0].boarding[0], route.transform), 0);
    assert.equal(d.requestSkip(), false, 'boarding remains physical');
    until(d, 'riding'); d.requestSkip(); d.setExitBlocked(true); d.step(dt, false);
    for (let i = 0; i < 300; i++) d.step(dt, false);
    assert.equal(d.phase, 'stand'); assert.equal(releases, 0, 'weather/ride ownership survives the blocked exit');
    d.setExitBlocked(false); until(d, 'walk-out');
    d.setMovementGuard(() => false);
    const root = [...d.frame.root];
    for (let i = 0; i < 60; i++) d.step(dt, false);
    assert.equal(d.phase, 'walk-out'); assert.deepEqual(d.frame.root, root);
    assert.equal(d.blockedMotion, true);
    d.setMovementGuard(() => true); until(d, 'complete');
    d.dispose('complete'); d.dispose('recovery');
    assert.equal(releases, 1); assert.equal(d.requestSkip(), false);
  }
});

test('a cancellation queued after skip still selects the existing safe cancellation terminal', () => {
  for (const route of routes) for (const source of route.kind === 'sled' ? [0] : [0, 1]) {
    const d = boarded(route, source);
    assert.equal(d.requestSkip(), true); d.requestExit(); d.step(dt, false);
    assert.equal(d.phase, 'stand');
    assert.equal(d.destination, route.kind === 'sled' ? 1 : source);
    assert.equal(d.u, d.destination);
    until(d, 'complete'); assert.deepEqual(d.frame.root, d.safeExit);
  }
});

test('coaster skip is idempotent, freezes normally and retains the entire station exit sequence', () => {
  const pose = coasterRidePose(0, 'chase'), t = createCoasterTransition(COASTER_BOARDING.approach, 0, pose);
  assert.equal(requestCoasterSkip(t), false);
  captureCoasterStart(t, COASTER_BOARDING.approach, 0);
  for (let i = 0; i < 3000 && t.phase !== 'riding'; i++) advanceCoasterTransition(t, dt, false, pose);
  assert.equal(t.phase, 'riding'); t.exitRequested = true;
  assert.equal(requestCoasterSkip(t), true); assert.equal(requestCoasterSkip(t), false);
  const before = structuredClone(t);
  for (const [delta, frozen] of [[dt, true], [NaN, false], [1, false], [0, false]]) {
    assert.equal(finishSkippedCoasterTravel(t, delta, frozen), false); assert.deepEqual(t, before);
  }
  assert.equal(finishSkippedCoasterTravel(t, dt, false), true);
  assert.equal(t.phase, 'stand'); assert.equal(t.elapsed, 0);
  assert.equal(finishSkippedCoasterTravel(t, dt, false), false);
  const phases = new Set([t.phase]);
  for (let i = 0; i < 3000 && t.phase !== 'complete'; i++) {
    advanceCoasterTransition(t, dt, false, pose); phases.add(t.phase);
  }
  assert.deepEqual([...phases], ['stand', 'turn-out', 'step-out', 'walk-out', 'complete']);
  assert.deepEqual(t.frame.root, COASTER_BOARDING.exit); assert.equal(t.frame.seatWeight, 0);
});

test('coaster skip command retains bridge ownership and never changes quest progress or persisted rewards', () => {
  endAttractionRide(); clearIntentRide();
  const original = useWorldStore.getState(), progress = useIntentStore.getState().progress;
  const pose = coasterRidePose(0, 'chase');
  beginAttractionRide(pose, COASTER_BOARDING.exit, COASTER_BOARDING.approach);
  const t = attractionRide.transition;
  captureCoasterStart(t, COASTER_BOARDING.approach, 0); t.phase = 'riding';
  useIntentStore.setState({ riding: true, ridePhase: 'riding' });
  Object.assign(intentRideClock, { revision: attractionRide.revision - 1, elapsed: 7, riding: true });
  useWorldStore.setState({ paused: false, poolInspect: false, shot: null });
  skipIntentRide(); assert.equal(t.skipRequested, false, 'stale owner cannot skip');
  intentRideClock.revision = attractionRide.revision;
  useWorldStore.setState({ paused: true }); skipIntentRide(); assert.equal(t.skipRequested, false);
  useWorldStore.setState({ paused: false }); skipIntentRide(); assert.equal(t.skipRequested, true);
  assert.equal(attractionRide.active, true); assert.equal(intentRideClock.elapsed, 7);
  assert.equal(useIntentStore.getState().progress, progress, 'no quest reducer or save write');
  endAttractionRide(); clearIntentRide(); useWorldStore.setState(original);
});
