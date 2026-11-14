import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { buildFactoryGeometry } from './factory-geometry.ts';
import { FACTORY_LANE_OFFSET } from './factory-layout.ts';
import { createFactoryTrialRig } from './factory-trial-physics.ts';

await R.init();
const dt = 1 / 60;
const conditions = (testKind = 'slope', extra = {}) => ({ testKind, loadKg: 0, courseVersion: 'factory-course-v1', seed: 1, durationLimitS: 60, ...extra });
function fixture({ flat = false, origin = [0, 0, 0] } = {}) {
  const world = new R.World({ x: 0, y: -12.5, z: 0 }); world.timestep = dt;
  const geometry = flat ? null : buildFactoryGeometry();
  if (flat) world.createCollider(R.ColliderDesc.cuboid(120, .1, 120).setTranslation(origin[0] + 60, origin[1] + .02, origin[2]).setFriction(.8));
  else world.createCollider(R.ColliderDesc.trimesh(geometry.surface.getAttribute('position').array, geometry.surface.index.array).setTranslation(...origin).setFriction(.8));
  const rigs = [];
  const create = (options = {}) => {
    const rig = createFactoryTrialRig({ world, rapier: R, configuration: { kind: 'nimble' }, conditions: conditions(), lane: 0, origin, ...options });
    rigs.push(rig); return rig;
  };
  const step = (seconds, onStep) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      rigs.forEach(rig => rig.advance(dt)); world.step();
      onStep?.(rigs.map(rig => rig.read()));
    }
    return rigs.map(rig => rig.read());
  };
  return { world, create, step, free() { rigs.forEach(rig => rig.dispose()); world.free(); if (geometry) { geometry.geometry.dispose(); geometry.roofs.dispose(); geometry.surface.dispose(); } } };
}

test('four actual suspension rays settle and traction starts the companion on flat ground', () => {
  const f = fixture({ flat: true });
  try {
    const rig = f.create(); const initial = rig.read();
    assert.equal(initial.progress, 0); assert.equal(initial.speedMps, 0);
    assert.equal(rig.controller.numWheels(), 4);
    const [reading] = f.step(1.5);
    assert.ok(reading.position.z > initial.position.z + .5, JSON.stringify(reading));
    assert.ok(reading.speedMps > .3, JSON.stringify(reading));
    assert.ok(reading.wheels.filter(wheel => wheel.grounded).length >= 3);
    assert.ok(reading.position.y > .25 && reading.position.y < .55);
    assert.ok(Math.abs(rig.body.mass() - 12) < .001);
    assert.ok(reading.wheels.some(wheel => Math.abs(wheel.rotation) > .1));
    assert.ok(reading.tiltDeg < 10);
  } finally { f.free(); }
});

test('actual authored hill supports ascent, descent and an observed finish without prescribed transforms', t => {
  const f = fixture();
  try {
    const rig = f.create(); let highest = 0, maxTilt = 0, contacts = 0;
    const [reading] = f.step(45, rows => { highest = Math.max(highest, rows[0].position.y); maxTilt = Math.max(maxTilt, rows[0].tiltDeg); contacts += rows[0].wheels.filter(wheel => wheel.grounded).length; });
    assert.equal(reading.status, 'completed', JSON.stringify({ reading, highest, maxTilt }));
    assert.equal(reading.progress, 1);
    assert.ok(highest > 1.5, `actual rise ${highest}`);
    assert.ok(maxTilt > 8, `actual pitch ${maxTilt}`);
    assert.ok(contacts > 300);
    assert.ok(Math.hypot(reading.position.x - 56, reading.position.z - 11) <= .3);
    assert.equal(rig.body.isDynamic(), false, 'terminal safety stop retains the actual finish position');
    t.diagnostic(JSON.stringify({ finishS: reading.elapsedS, highestBodyY: highest, peakTiltDeg: maxTilt, position: reading.position }));
  } finally { f.free(); }
});

test('translated comparison lanes share conditions and produce matching actual trajectories', t => {
  const f = fixture({ origin: [-197.5, 1, 12.5] });
  try {
    const a = f.create({ conditions: conditions('slope', { loadKg: 2 }) });
    const b = f.create({ lane: 1, conditions: conditions('slope', { loadKg: 2 }) });
    let maxDifference = 0;
    const readings = f.step(40, rows => {
      const [left, right] = rows;
      maxDifference = Math.max(maxDifference, Math.hypot(right.position.x - left.position.x - FACTORY_LANE_OFFSET, right.position.y - left.position.y, right.position.z - left.position.z));
    });
    assert.deepEqual(readings.map(reading => reading.status), ['completed', 'completed'], JSON.stringify(readings));
    assert.ok(maxDifference < .04, `translation error ${maxDifference}`);
    assert.equal(a.read().loadKg, b.read().loadKg);
    assert.ok(Math.abs(a.body.mass() - 14) < .001);
    assert.equal(a.route.length, b.route.length);
    assert.throws(() => f.create(), /At most two/);
    t.diagnostic(JSON.stringify({ maxLaneDifferenceM: maxDifference, finishS: readings.map(reading => reading.elapsedS) }));
  } finally { f.free(); }
});

test('timeout is incomplete; explicit pause and zero dt never advance elapsed or physical position', () => {
  const f = fixture();
  try {
    const rig = f.create({ conditions: conditions('slope', { durationLimitS: 1 }) });
    f.step(.25); rig.setPaused(true);
    const before = rig.read(); f.step(2); const after = rig.read();
    assert.equal(after.elapsedS, before.elapsedS);
    assert.deepEqual(after.position, before.position);
    assert.equal(after.status, 'running');
    rig.advance(0); assert.equal(rig.read().elapsedS, before.elapsedS);
    rig.setPaused(false); const [last] = f.step(2);
    assert.equal(last.status, 'incomplete'); assert.equal(last.reason, 'timeout'); assert.ok(last.progress < 1);
  } finally { f.free(); }
});

test('dispose removes owned controller and chassis, is idempotent, and allows another rig', () => {
  const f = fixture();
  try {
    const baselineBodies = f.world.bodies.len(), baselineControllers = f.world.vehicleControllers.size;
    const rig = f.create(); const handle = rig.body.handle;
    assert.equal(f.world.bodies.len(), baselineBodies + 1);
    assert.equal(f.world.vehicleControllers.size, baselineControllers + 1);
    rig.dispose(); rig.dispose();
    assert.equal(f.world.getRigidBody(handle), null);
    assert.equal(f.world.bodies.len(), baselineBodies);
    assert.equal(f.world.vehicleControllers.size, baselineControllers);
    assert.doesNotThrow(() => rig.advance(dt));
    assert.equal(rig.read().reason, 'disposed');
    assert.ok(f.create());
  } finally { f.free(); }
});

test('variants, payload and selected road section change actual physics parameters', () => {
  const f = fixture();
  try {
    const nimble = f.create({ conditions: conditions('load', { loadKg: 2 }) });
    const steady = f.create({ configuration: { kind: 'steady' }, conditions: conditions('rumble', { loadKg: 2 }), lane: 1 });
    assert.equal(nimble.route.length, 5, 'loaded test keeps full hill');
    assert.equal(steady.route.length, 3, 'rumble test uses returning flat straight');
    assert.ok(Math.abs(nimble.body.mass() - 14) < .001);
    assert.ok(Math.abs(steady.body.mass() - 20) < .001);
    assert.equal(nimble.controller.wheelRadius(0), Math.fround(.13));
    assert.equal(steady.controller.wheelRadius(0), Math.fround(.14));
    assert.notEqual(nimble.controller.wheelSuspensionStiffness(0), steady.controller.wheelSuspensionStiffness(0));
    const [hill, rumble] = f.step(40);
    assert.equal(hill.status, 'completed', JSON.stringify(hill));
    assert.equal(rumble.status, 'completed', JSON.stringify(rumble));
  } finally { f.free(); }
});

test('actual 10cm return-lane ridges produce suspension and tilt differences from a smooth surface', t => {
  const results = [];
  for (const rough of [false, true]) {
    const f = fixture({ flat: true });
    try {
      if (rough) for (let z = 3; z <= 7; z += .65) {
        const vertices = new Float32Array([61, .12, z, 63, .12, z, 63, .22, z + .22, 61, .22, z + .22, 63, .12, z + .44, 61, .12, z + .44]);
        f.world.createCollider(R.ColliderDesc.trimesh(vertices, new Uint32Array([0, 2, 1, 0, 3, 2, 3, 4, 2, 3, 5, 4])).setFriction(.8));
      }
      const rig = f.create({ configuration: { kind: 'steady' }, conditions: conditions('rumble', { loadKg: 2 }) });
      let maxTilt = 0, verticalSpeed = 0, suspensionRange = 0;
      const [reading] = f.step(40, rows => {
        if (rows[0].position.z > 3 && rows[0].position.z < 7.5) {
          maxTilt = Math.max(maxTilt, rows[0].tiltDeg);
          verticalSpeed = Math.max(verticalSpeed, Math.abs(rig.body.linvel().y));
          suspensionRange = Math.max(suspensionRange, ...rows[0].wheels.map(wheel => Math.abs(wheel.suspensionLength - .15)));
        }
      });
      assert.equal(reading.status, 'completed', JSON.stringify({ rough, reading, maxTilt, verticalSpeed }));
      results.push({ maxTilt, verticalSpeed, suspensionRange });
    } finally { f.free(); }
  }
  assert.ok(results[1].maxTilt > results[0].maxTilt + 2, JSON.stringify(results));
  assert.ok(results[1].verticalSpeed > results[0].verticalSpeed + .05, JSON.stringify(results));
  assert.ok(results[1].suspensionRange > results[0].suspensionRange + .02, JSON.stringify(results));
  t.diagnostic(JSON.stringify({ smooth: results[0], ridged: results[1] }));
});

test('external displacement, overturned chassis and oversized timesteps stop honestly without a reset', () => {
  for (const hazard of ['out-of-bounds', 'overturned', 'physics-step-too-large']) {
    const f = fixture({ flat: true });
    try {
      const rig = f.create(); f.step(.5);
      if (hazard === 'out-of-bounds') rig.body.applyImpulse({ x: rig.body.mass() * 30, y: 0, z: 0 }, true);
      if (hazard === 'overturned') rig.body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
      if (hazard === 'physics-step-too-large') rig.advance(.5);
      const [reading] = f.step(2);
      assert.equal(reading.status, 'incomplete', JSON.stringify({ hazard, reading }));
      assert.equal(reading.reason, hazard, JSON.stringify(reading));
      assert.ok(reading.progress < 1);
      const stopped = reading.position; f.step(1);
      assert.deepEqual(rig.read().position, stopped, 'safety stop remains at the measured failure location');
    } finally { f.free(); }
  }
});
