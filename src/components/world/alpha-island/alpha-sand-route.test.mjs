import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { ALPHA_MAIN_PATH, ALPHA_ORIGIN } from './alpha-layout.ts';
import {
  SAND_MODEL_ID,
  SAND_BALL_RADIUS,
  placeSandRouteBall,
  createSandRouteModel,
} from './alpha-sand-route.ts';

test('the six-second demonstration follows the displayed metal guide across the miniature', async (t) => {
  await R.init();
  const world = new R.World({ x: 0, y: 0, z: 0 }),
    parts = createSandRouteModel();
  t.after(() => {
    world.free();
    for (const p of parts) p.geometry.dispose();
  });
  const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_ORIGIN));
  body.userData = { assetId: SAND_MODEL_ID };
  const [stone, rail] = parts.map(({ geometry }) => {
    const pos = geometry.attributes.position.array,
      idx = geometry.index?.array ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    return world.createCollider(R.ColliderDesc.trimesh(pos, Uint32Array.from(idx)), body);
  });
  world.step();
  const origin = new Vector3(...ALPHA_ORIGIN),
    sphere = new R.Ball(SAND_BALL_RADIUS);
  const separation = (p, c) => p.distanceTo(c.projectPoint(p, false).point) - SAND_BALL_RADIUS;
  const observed = [],
    oldGaps = [];
  let minStone = Infinity;
  for (let k = 0; k <= 360; k++) {
    const t = k / 360,
      p = new Vector3();
    assert.ok(placeSandRouteBall(world, sphere, t, p));
    p.add(origin);
    const n = t * (ALPHA_MAIN_PATH.length - 1),
      i = Math.min(Math.floor(n), ALPHA_MAIN_PATH.length - 2);
    const point = new Vector3(...ALPHA_MAIN_PATH[i]).lerp(new Vector3(...ALPHA_MAIN_PATH[i + 1]), n - i);
    const old = new Vector3(-64 + point.x / 95, 5.49 + point.y / 180, -39.9 + point.z / 100);
    observed.push(Math.min(separation(p, rail), separation(p, stone)));
    old.add(origin);
    oldGaps.push(Math.min(separation(old, rail), separation(old, stone)));
    minStone = Math.min(minStone, separation(p, stone));
  }
  t.diagnostic(
    JSON.stringify({
      samples: observed.length,
      newRange: [Math.min(...observed), Math.max(...observed)],
      oldRange: [Math.min(...oldGaps), Math.max(...oldGaps)],
      minStone,
    }),
  );
  assert.ok(Math.min(...observed) > -0.0001 && Math.max(...observed) < 0.003);
  assert.ok(Math.min(...oldGaps) < -0.015);
  const geometry = parts[0].geometry;
  assert.equal(geometry.attributes.position.count / 3, 1152);
  for (const [x, z] of [
    [-64, -39.9],
    [-64.5, -39.9],
    [-63.5, -40.15],
  ]) {
    const height =
      9 - stone.castRay(new R.Ray({ x: x + origin.x, y: 9, z: z + origin.z }, { x: 0, y: -1, z: 0 }), 5, true);
    assert.ok(height >= 5.399 && height < 5.88);
  }
  body.setEnabled(false);
  world.step();
  assert.equal(placeSandRouteBall(world, sphere, 0.5, new Vector3()), false);
});
