import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { createFactoryConveyors, factoryRollerPositions, FACTORY_ROLLER_RADIUS, sampleFactoryChain, FACTORY_BELT_RUNS } from './factory-conveyor.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { createFactoryOperation, FACTORY_CONVEYOR_TOP } from './factory-operation.ts';

test('rollers meet carrier undersides and exclude the transverse table and solid inlet belts', () => {
  const positions = factoryRollerPositions();
  assert.ok(positions.length < 270);
  for (const { at, line } of positions) if (line < 3) {
    assert.ok(at[0] - FACTORY_ROLLER_RADIUS > -20);
    assert.ok(Math.abs(at[1] + FACTORY_ROLLER_RADIUS - FACTORY_CONVEYOR_TOP) < 1e-9);
  }
});

test('two instanced draws follow actual outfeed, stay still at idle and pause, and dispose once', () => {
  const data = createFactoryConveyors(FACTORY_PALETTE, { value: 0 });
  const op = createFactoryOperation({ type: 'process', module: 'frame' });
  const matrix = new Matrix4(), vertex = new Vector3(0, FACTORY_ROLLER_RADIUS, 0);
  const read = index => { data.mesh.getMatrixAt(index, matrix); return vertex.clone().applyMatrix4(matrix); };
  let disposed = 0; data.mesh.geometry.addEventListener('dispose', () => disposed++);
  try {
    assert.equal(data.group.children.length, 2);
    assert.equal(data.metrics.colorDraws, 2); assert.equal(data.metrics.colliders, 0);
    assert.ok(data.metrics.triangles < 40000); assert.ok(data.metrics.chainInstances < 400);
    const baseline = read(0), other = data.placements.findIndex(p => p.line === 1), still = read(other);
    data.update(op, false); assert.deepEqual(read(0), baseline);
    op.phase = 'outfeed'; op.progress = .001;
    data.update(op, true); assert.deepEqual(read(0), baseline);
    data.update(op, false); assert.notDeepEqual(read(0), baseline);
    assert.deepEqual(read(other), still);
    const moving = read(0); data.update(op, false); assert.deepEqual(read(0), moving);
    data.update(null, false); assert.deepEqual(read(0), moving);
    assert.ok(moving.x > baseline.x, 'top surface travels towards +X with the carrier');
  } finally { data.dispose(); data.dispose(); }
  assert.equal(disposed, 1);
});

test('closed chain links turn at both sprockets and return below the continuous belt', () => {
  const point = { u: 0, y: 0, angle: 0 }, length = 4, radius = .13, arc = Math.PI * radius;
  const checkpoints = [[0, 0, 0], [length, length, 0], [length + arc, length, -.26],
    [2 * length + arc, 0, -.26], [2 * length + 2 * arc, 0, 0]];
  for (const [distance, u, y] of checkpoints) {
    sampleFactoryChain(length, distance, point);
    assert.ok(Math.abs(point.u - u) < 1e-8); assert.ok(Math.abs(point.y - y) < 1e-8);
  }
  let previous = null;
  for (let s = 0; s <= 2 * length + 2 * arc; s += .005) {
    sampleFactoryChain(length, s, point);
    if (previous) assert.ok(Math.hypot(point.u - previous[0], point.y - previous[1]) <= .005001);
    previous = [point.u, point.y];
    assert.ok(point.y <= 1e-8 && point.y >= -.260001);
  }
});

test('intake and forward or recorded wrong-line reverse routing drive only their real mechanical runs', () => {
  const data = createFactoryConveyors(FACTORY_PALETTE, { value: 1 }), matrix = new Matrix4();
  const read = run => {
    const i = data.beltPlacements.findIndex(p => FACTORY_BELT_RUNS[p.run].id === run);
    data.belts.getMatrixAt(i, matrix); return [...matrix.elements];
  };
  const step = (op, line) => { for (let i = 0; i <= 1000; i++) { op.progress = i / 1000; data.update(op, false, line); } };
  let chainDisposals = 0; data.belts.geometry.addEventListener('dispose', () => chainDisposals++);
  try {
    const initial = read('sorting'), unrelated = read('wheels');
    const extract = createFactoryOperation({ type: 'extract', module: 'frame' }); extract.phase = 'outfeed';
    data.update(extract, false); extract.progress = .1; data.update(extract, true); assert.deepEqual(read('sorting'), initial);
    step(extract); assert.notDeepEqual(read('sorting'), initial); assert.deepEqual(read('wheels'), unrelated);
    const route = createFactoryOperation({ type: 'route', module: 'frame', line: 'wheels' }); route.phase = 'cycle';
    const transfer = read('transfer'); step(route);
    assert.notDeepEqual(read('transfer'), transfer); assert.notDeepEqual(read('wheels'), unrelated);
    const beforeMissing = read('wheels'), back = createFactoryOperation({ type: 'route', module: 'frame' }); back.phase = 'cycle';
    back.progress = .02; data.update(back, false); assert.deepEqual(read('wheels'), beforeMissing, 'no guessed reverse destination');
    step(back, 'wheels'); assert.notDeepEqual(read('wheels'), beforeMissing, 'recorded wrong-line route is used');
    const stopped = read('wheels'); data.update(null, false); assert.deepEqual(read('wheels'), stopped);
    console.log(JSON.stringify(data.metrics));
  } finally { data.dispose(); data.dispose(); }
  assert.equal(chainDisposals, 1);
});
