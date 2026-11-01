import test from 'node:test';
import assert from 'node:assert/strict';
import { RAPIER, quarryWorld } from '../../../tools/world/alpha-mine-tests/quarry-walk.mjs';
import { findRailVault, railVaultVelocity } from './player-vault.ts';
import { findLowVault } from './player-motion.ts';
import { terrainHeight } from './WorldLandform.ts';
import { mineFoundationSurface } from './alpha-mine-foundation.ts';
import { ALPHA_MINE_ORIGIN as origin } from './alpha-mine-layout.ts';
import { addQuarryTerrain } from '../../../tools/world/alpha-mine-tests/quarry-terrain.mjs';

const direction = { x: 0, y: 0, z: -1 };
function actualQuarry() {
  const world = quarryWorld();
  addQuarryTerrain(world, terrainHeight, { minX: 3, maxX: 13, minZ: -5, maxZ: 5, step: 1 });
  const f = mineFoundationSurface(terrainHeight);
  world.createCollider(RAPIER.ColliderDesc.trimesh(f.vertices.map((v, i) => v - origin[i % 3]), f.indices));
  world.step(); return world;
}
function actor(world, x = 8, z = .16) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, .84, z).lockRotations().setCcdEnabled(true).setCanSleep(false));
  world.createCollider(RAPIER.ColliderDesc.capsule(.48, .34).setFriction(0), body);
  for (let i = 0; i < 45; i++) world.step();
  return body;
}
test('actual quarry entrance rail: old hop rejects, hand-vault route crosses both ways with solid capsule', () => {
  for (const outside of [true, false]) {
    const world = actualQuarry(), body = actor(world, 8, outside ? .16 : -.72);
    const dir = outside ? direction : { x: 0, y: 0, z: 1 };
    assert.equal(findLowVault(world, RAPIER, body, dir, -2), null, 'old 72 cm hop did not cover this rail');
    const plan = findRailVault(world, RAPIER, body, dir, -2);
    assert.ok(plan, `actual rail has a safe plan from ${JSON.stringify(body.translation())}`);
    let elapsed = 0;
    while (elapsed < plan.duration) {
      const v = railVaultVelocity(world, RAPIER, body, plan, elapsed, 1 / 60);
      assert.ok(v, `route blocked at ${elapsed}, ${JSON.stringify(body.translation())}`);
      body.setLinvel(v, true); world.step(); elapsed += 1 / 60;
      assert.equal(body.isEnabled(), true); assert.equal(body.collider(0).isSensor(), false);
    }
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 30; i++) world.step();
    assert.ok(Math.abs(body.translation().z - plan.to.z) < .03);
    assert.ok(Math.abs(body.translation().y - .82) < .04);
    world.free();
  }
});

test('rail vault rejects posts, thick cliffs, unsafe landing, and ceilings', () => {
  for (const kind of ['post', 'thick', 'cliff', 'ceiling', 'high']) {
    const world = new RAPIER.World({ x: 0, y: -12.5, z: 0 }); world.timestep = 1 / 60;
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, .5, kind === 'cliff' ? .4 : 5).setTranslation(0, -.5, kind === 'cliff' ? .3 : 0));
    const height = kind === 'high' ? 1.4 : 1;
    world.createCollider(RAPIER.ColliderDesc.cuboid(kind === 'post' ? .07 : 2, height / 2, kind === 'thick' ? .7 : .05).setTranslation(0, height / 2, -.28));
    if (kind === 'ceiling') world.createCollider(RAPIER.ColliderDesc.cuboid(2, .1, 2).setTranslation(0, 2.3, 0));
    const body = actor(world, 0);
    assert.equal(findRailVault(world, RAPIER, body, direction, -2), null, kind);
    world.free();
  }
});

test('a new moving blocker cancels a planned transfer without switching off collision', () => {
  const world = actualQuarry(), body = actor(world), plan = findRailVault(world, RAPIER, body, direction, -2);
  assert.ok(plan);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setTranslation(8, 2, .16)); world.step();
  assert.equal(railVaultVelocity(world, RAPIER, body, plan, .4, 1 / 60), null);
  assert.equal(body.isEnabled(), true); world.free();
});
