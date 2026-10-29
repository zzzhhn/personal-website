import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial,
  Raycaster, Vector3 } from 'three';
import { bakeNode, vehicleMaterial } from './WorldVehicleAssets.ts';
import { createVehicleBoostExhaust, refineCoupeWheel, refineVehicleBody, subtractVehicleAperture,
  updateVehicleBoostExhaust, coupeNoseX } from './WorldVehicleDetail.ts';
import { createDrivingState } from './vehicle-driving.ts';
import { publishDrivingTelemetry, readDrivingTelemetry } from './vehicle-telemetry.ts';
import { drivingReadout } from './vehicle-driving-display.ts';

function bakedBox(size = [4.3, .8, 1.9], position = [0, .6, 0]) {
  const group = new Group(), mesh = new Mesh(new BoxGeometry(...size), new MeshStandardMaterial({ color: '#E6DCCB' }));
  mesh.position.set(...position); group.add(mesh); return bakeNode(group);
}
function rayX(geometry, y, z) {
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ side: DoubleSide })); mesh.updateMatrixWorld();
  return new Raycaster(new Vector3(3, y, z), new Vector3(-1, 0, 0)).intersectObject(mesh);
}

test('bake respects non-indexed material ranges and single-material primitive groups', () => {
  const source = new BufferGeometry(); source.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0,
  ]), 3)); source.computeVertexNormals(); source.addGroup(0, 3, 0); source.addGroup(3, 3, 1);
  const front = new MeshStandardMaterial({ color: '#F3ECDC' }), paint = new MeshStandardMaterial({ color: '#E6DCCB' });
  front.userData.materialRole = 'light_front';
  const group = new Group(); group.add(new Mesh(source, [front, paint])); const result = bakeNode(group);
  assert.equal(result.attributes.position.count, 6);
  assert.deepEqual(Array.from(result.attributes.aRole.array), [1, 1, 1, 0, 0, 0]);
  assert.equal(bakedBox().attributes.position.count, 36);
});

test('subtracts an actual opening and retains material attributes and the original source', () => {
  const source = bakedBox([.3, .8, 1.9], [2, .5, 0]), before = Array.from(source.attributes.position.array);
  const cut = subtractVehicleAperture(source, [[-.4, .3], [.4, .3], [.4, .7], [-.4, .7]], 1.8, 2.3);
  assert.ok(rayX(source, .5, 0).length > 0); assert.equal(rayX(cut, .5, 0).length, 0);
  assert.ok(rayX(cut, .8, 0).length > 0); assert.ok(rayX(cut, .5, .7).length > 0);
  assert.deepEqual(Array.from(source.attributes.position.array), before);
  for (const key of ['position', 'normal', 'color', 'aRM', 'aRole']) {
    assert.equal(cut.attributes[key].count, cut.attributes.position.count);
    assert.ok(Array.from(cut.attributes[key].array).every(Number.isFinite));
  }
});

test('three refined bodies keep one baked geometry and produce a physically recessed coupe grille', () => {
  for (const id of ['offroad', 'coupe', 'van']) {
    const source = bakedBox(), result = refineVehicleBody(id, source);
    assert.equal(result.index, null); assert.equal(result.groups.length, 0);
    assert.ok(result.userData.detailTriangles > 400 && result.userData.detailTriangles <= 1200);
    for (const attribute of Object.values(result.attributes)) {
      assert.equal(attribute.count, result.attributes.position.count); assert.ok(Array.from(attribute.array).every(Number.isFinite));
    }
    assert.deepEqual([...new Set(result.attributes.aRole.array)].sort(), [0, 1, 5]);
    assert.ok(result.attributes.position.count / 3 < source.attributes.position.count / 3 + 1900);
  }
  const source = bakedBox([.3, .8, 1.9], [2, .5, 0]), result = refineVehicleBody('coupe', source);
  const hit = rayX(result, .347, .1)[0];
  assert.ok(hit); assert.ok(hit.point.x < 2.12, `grille back is recessed: ${hit.point.x}`);
  assert.ok(hit.point.x > 2.02); assert.ok(coupeNoseX(.9, .6) < coupeNoseX(0, .6));
});

test('coupe rotor has real perforations and stays behind the authored rim face', () => {
  const source = bakedBox([.02, .02, .02], [0, 0, 0]), result = refineCoupeWheel(source);
  assert.ok(result.userData.detailTriangles <= 240);
  const mesh = new Mesh(result, new MeshStandardMaterial({ side: DoubleSide })); mesh.updateMatrixWorld();
  const hole = new Raycaster(new Vector3(.145, 0, -.2), new Vector3(0, 0, 1)).intersectObject(mesh);
  const metal = new Raycaster(new Vector3(.17, 0, -.2), new Vector3(0, 0, 1)).intersectObject(mesh);
  assert.equal(hole.length, 0); assert.ok(metal.length > 0);
  assert.ok(metal.every(hit => hit.point.z >= -.096 && hit.point.z <= -.085));
});

test('boost exhaust is bounded, attached to authored outlets and driven by actual boosting only', () => {
  const exhaust = createVehicleBoostExhaust(-.9959); assert.equal(exhaust.visible, false); assert.equal(exhaust.count, 4);
  updateVehicleBoostExhaust(exhaust, true, 1); assert.equal(exhaust.visible, true);
  for (let i = 0; i < 4; i++) {
    const matrix = new Matrix4(); exhaust.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(matrix.elements[13] - (-.9959 + .25)) < 1e-6);
    assert.ok(Math.abs(Math.abs(matrix.elements[14]) - .36) < 1e-6);
    assert.ok(Math.abs(matrix.elements[12] + matrix.elements[0] / 2 + 2.205) < 1e-6);
  }
  assert.equal(exhaust.castShadow, false); assert.ok(exhaust.geometry.attributes.position.count / 3 <= 32);
  updateVehicleBoostExhaust(exhaust, false, 2); assert.equal(exhaust.visible, false);
});

test('HUD interprets measured slip and published physics cooldown/lock without inventing drift or recharge', () => {
  const state = createDrivingState(); state.speed = 10; state.contacts = 4; state.slipAngle = -.2;
  publishDrivingTelemetry(state); let display = drivingReadout(readDrivingTelemetry());
  assert.equal(display.drifting, true); assert.equal(display.slipDegrees, 11); assert.equal(display.boostState, 'ready');
  state.contacts = 0; publishDrivingTelemetry(state); assert.equal(drivingReadout(readDrivingTelemetry()).drifting, false);
  state.contacts = 4; state.speed = 1; publishDrivingTelemetry(state); assert.equal(drivingReadout(readDrivingTelemetry()).drifting, false);
  state.nitro = .5; state.rechargeDelay = .7; publishDrivingTelemetry(state); display = drivingReadout(readDrivingTelemetry());
  assert.equal(display.boostState, 'cooldown'); assert.equal(display.cooldownSeconds, .7); assert.equal(display.boostSeconds, 1.5);
  state.boostLock = true; publishDrivingTelemetry(state); assert.equal(drivingReadout(readDrivingTelemetry()).boostState, 'locked');
  state.boosting = true; publishDrivingTelemetry(state); assert.equal(drivingReadout(readDrivingTelemetry()).boostState, 'boosting');
  state.boosting = false; state.boostLock = false; state.rechargeDelay = 0; publishDrivingTelemetry(state);
  assert.equal(drivingReadout(readDrivingTelemetry()).boostState, 'partial');
  const material = vehicleMaterial(); assert.equal(material.customProgramCacheKey(), 'world-vehicle-v1');
  publishDrivingTelemetry(null); assert.equal(readDrivingTelemetry(), null);
});
