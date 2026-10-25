import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { findLowVault, playerVelocityChange } from './player-motion.ts';
await RAPIER.init();

test('ordinary start, braking, reversal and air response retain the 3cb1f25 baseline', () => {
  // Fixed oracles calculated from the baseline WorldActors controller before the phase-2 experiment.
  for (const [speed, target, grounded, expected] of [
    [0, 6.2, true, .13333333333333333], [2.7, 6.2, true, .13333333333333333],
    [3.6, 0, true, -.6525692889192655], [6.2, 0, true, -1.1238693309165126],
    [6.2, -6.2, true, -2.2477386618330253], [4, -4, false, -.3901646039942879],
  ]) {
    const change = playerVelocityChange({ x: speed, y: 0, z: 0 }, { x: target, y: 0, z: 0 }, 1 / 60, grounded);
    assert.ok(Math.abs(change.x - expected) < 1e-12); assert.equal(change.z, 0);
  }
});

function scene({ height = .45, width = .12, landing = true, ceiling = false, sensor = false, dynamic = false } = {}) {
  const world = new RAPIER.World({ x: 0, y: -12.5, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(landing ? 5 : .7, .5, 3).setTranslation(0, -.5, 0));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, .823, 0).lockRotations().setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.capsule(.48, .34), body);
  const obstacleBody = world.createRigidBody((dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed()).setTranslation(.95, height / 2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, 2).setSensor(sensor), obstacleBody);
  if (ceiling) world.createCollider(RAPIER.ColliderDesc.cuboid(3, .1, 3).setTranslation(0, 2, 0));
  world.step();
  return { world, body, plan: () => findLowVault(world, RAPIER, body, { x: 1, y: 0, z: 0 }, -2) };
}

test('low rail uses a real collision-enabled ballistic flight and lands beyond it', () => {
  const { world, body, plan } = scene();
  const hop = plan(); assert.ok(hop, 'thin 45 cm rail has a safe full-capsule path');
  body.setLinvel({ x: hop.vx, y: hop.vy, z: hop.vz }, true);
  let peak = 0;
  for (let i = 0; i < 75; i++) { world.step(); peak = Math.max(peak, body.translation().y - .82); }
  assert.ok(body.translation().x > 1.5, 'cleared the obstacle');
  assert.ok(peak > .6 && peak < .8, `peak ${peak}`);
  assert.ok(Math.abs(body.translation().y - .82) < .02, 'grounded again');
  world.free();
});

for (const [name, options] of Object.entries({ tall: { height: 1.2 }, thick: { width: 2 }, cliff: { landing: false }, ceiling: { ceiling: true }, sensor: { sensor: true }, moving: { dynamic: true } })) {
  test(`vault rejects ${name} and leaves ordinary jump available`, () => {
    const { world, plan } = scene(options); assert.equal(plan(), null); world.free();
  });
}

for (const vehicle of [false, true]) {
  test(`a valid fixed rail cannot vault into an awake ${vehicle ? 'vehicle' : 'prop'}`, () => {
    const { world, plan } = scene();
    assert.ok(plan(), 'the rail has a valid path before inserting the blocker');
    const blocker = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1.9, .4, 0));
    blocker.userData = vehicle ? { vehicle: 'qa' } : { obstacle: 'qa' };
    world.createCollider(RAPIER.ColliderDesc.cuboid(.2, .4, 1), blocker);
    world.step(); assert.equal(blocker.isSleeping(), false);
    assert.equal(plan(), null, 'all solid blockers participate even when they cannot trigger the vault');
    world.free();
  });
}
