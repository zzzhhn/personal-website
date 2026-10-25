import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { findLowVault, playerVelocityChange } from './player-motion.ts';
await RAPIER.init();

test('start retains 8 m/s² cap; sprint brakes through several footfalls, reversal keeps momentum', () => {
  const dt = 1 / 60;
  assert.ok(playerVelocityChange({ x: 0, y: 0, z: 0 }, { x: 6.2, y: 0, z: 0 }, dt, true).x <= 8 * dt);
  let velocity = { x: 6.2, y: 0, z: 0 }, distance = 0, frames = 0;
  while (velocity.x > .1 && frames++ < 120) {
    velocity.x += playerVelocityChange(velocity, { x: 0, y: 0, z: 0 }, dt, true).x;
    distance += velocity.x * dt;
  }
  assert.ok(distance > 1.3 && distance < 1.8, `brake distance ${distance}`);
  const reverse = playerVelocityChange({ x: 6.2, y: 0, z: 0 }, { x: -6.2, y: 0, z: 0 }, dt, true);
  assert.ok(reverse.x >= -16 * dt && 6.2 + reverse.x > 0);
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
