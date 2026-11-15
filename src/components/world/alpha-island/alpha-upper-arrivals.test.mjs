import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { alphaTerrainData } from './alpha-terrain.ts';
import { ALPHA_ORIGIN } from './alpha-layout.ts';
import { namedAlphaArrival, activatePlayerArrival } from '../world-arrival-readiness.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';
await R.init();

test('upper playtest arrivals have real terrain support and an escape corridor', () => {
  const terrain = alphaTerrainData();
  const world = new R.World({ x: 0, y: -12.5, z: 0 });
  try {
    const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_ORIGIN));
    world.createCollider(R.ColliderDesc.trimesh(terrain.positions, terrain.surface), ground);
    world.createCollider(R.ColliderDesc.trimesh(terrain.positions, terrain.solid), ground);
    for (const name of ['alpha-wind', 'alpha-summit']) {
      const p = namedAlphaArrival(name);
      assert.ok(p);
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p[0], p[1] + PLAYER_CENTER_HEIGHT, p[2])
        .lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
      world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), body);
      body.setEnabled(false); world.step();
      const landing = activatePlayerArrival(world, R, body, p, -.7);
      assert.ok(landing, `${name}: actual support-ring / capsule / exit query failed`);
      for (let i = 0; i < 90; i++) world.step();
      assert.ok(Math.abs(body.translation().y - landing[1]) < .08, `${name}: dynamic body fell after activation`);
      world.removeRigidBody(body);
    }
  } finally { world.free(); }
});
