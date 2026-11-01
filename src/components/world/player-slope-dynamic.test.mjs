import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { PHYSICS_STEP as dt, PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from './actor-physics.ts';
import { playerSupport, followPlayerGround, compensatePlayerSlopeGravity, clearPlayerSlopeGravity } from './player-ground.ts';
import { playerVelocityChange, createPlayerClearance, sweptPlayerVelocity } from './player-motion.ts';
import { createCoasterStructure } from './attractions/coaster-geometry.ts';
import { coasterColliderDescriptor } from './attractions/coaster-collision.ts';
import { COASTER_CLIFF_WALK } from './attractions/coaster-landscape-cliffs.ts';
import { coasterWorld } from './attractions/coaster-track.ts';
await R.init();

// Match the production dynamic capsule and the actual controller order. In particular,
// do not replace the exponential horizontal controller with a per-frame velocity snap.
function fixture(position, populate) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 }); world.timestep = dt;
  populate(world);
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...position).lockRotations()
    .setGravityScale(12.5 / 9.81).setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false));
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS).setMass(72)
    .setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0), body);
  const guard = createPlayerClearance(world); world.step();
  const tick = (x = 0, z = 0, jump = false) => {
    const support = playerSupport(world, R, body), grounded = support?.grounded ?? false, v = body.linvel();
    const change = playerVelocityChange(v, { x, y: 0, z }, dt, grounded);
    const slopeGravity = compensatePlayerSlopeGravity(world, body, support, dt, jump && grounded);
    body.applyImpulse({ x: change.x * body.mass(), y: 0, z: change.z * body.mass() }, true);
    const current = body.linvel(), safe = sweptPlayerVelocity(guard, body, current, dt, R.QueryFilterFlags.EXCLUDE_SENSORS);
    if (safe !== current) body.setLinvel(safe, true);
    const follow = followPlayerGround(world, R, body, body.linvel(), dt, jump && grounded);
    if (jump && grounded) body.setLinvel({ x: v.x, y: 5, z: v.z }, true);
    world.step(); clearPlayerSlopeGravity(body); return { support, follow, grounded, slopeGravity };
  };
  return { world, body, tick, free() { world.removeCharacterController(guard); world.free(); } };
}
function slope(degrees = 15) {
  const a = degrees * Math.PI / 180;
  return fixture([0, PLAYER_HALF_HEIGHT + PLAYER_RADIUS / Math.cos(a) + .002, 0], world => {
    world.createCollider(R.ColliderDesc.cuboid(50, .5, 10).setTranslation(.5 * Math.sin(a), -.5 * Math.cos(a), 0)
      .setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }).setFriction(.9));
  });
}
test('the zero-friction dynamic player stands on a 15 degree slope for ten seconds', t => {
  const f = slope();
  try {
    for (let i = 0; i < 60; i++) f.tick();
    const start = f.body.translation(); let grounded = 0;
    for (let i = 0; i < 600; i++) if (f.tick().grounded) grounded++;
    const end = f.body.translation(), drift = Math.hypot(end.x - start.x, end.z - start.z);
    t.diagnostic(JSON.stringify({ stationarySeconds: 10, drift, grounded, start, end }));
    assert.ok(drift < .025, `idle drift ${drift} m`); assert.equal(grounded, 600);
    assert.equal(f.body.collider(0).friction(), 0);
  } finally { f.free(); }
});
test('uphill and downhill retain movement and settle after release instead of creeping', t => {
  for (const direction of [1, -1]) {
    const f = slope();
    try {
      for (let i = 0; i < 60; i++) f.tick();
      let airborne = 0;
      for (let i = 0; i < 240; i++) if (!f.tick(direction * 3.6).grounded) airborne++;
      const moving = f.body.translation(); assert.ok(moving.x * direction > 10); assert.ok(airborne < 3);
      for (let i = 0; i < 60; i++) f.tick();
      const stopped = f.body.translation();
      for (let i = 0; i < 600; i++) f.tick();
      const end = f.body.translation(), drift = Math.hypot(end.x - stopped.x, end.z - stopped.z);
      t.diagnostic(JSON.stringify({ direction, moving, airborne, stopped, drift }));
      assert.ok(drift < .025, `release drift ${drift}`);
    } finally { f.free(); }
  }
});
test('slope compensation releases for a jump and strictly separated ground', () => {
  const f = slope();
  try {
    for (let i = 0; i < 60; i++) f.tick();
    const start = f.body.translation(), launch = f.tick(0, 0, true); assert.equal(launch.follow, null);
    let peak = 0;
    for (let i = 0; i < 25; i++) {
      const state = f.tick(); assert.equal(state.grounded, false); assert.equal(state.follow, null); assert.equal(state.slopeGravity, null);
      peak = Math.max(peak, f.body.translation().y - start.y);
    }
    assert.ok(peak > .85 && peak < 1.05);
    f.body.setTranslation({ ...start, y: start.y + .018 }, true); f.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    assert.equal(playerSupport(f.world, R, f.body)?.grounded, false);
    assert.equal(compensatePlayerSlopeGravity(f.world, f.body, playerSupport(f.world, R, f.body), dt, false), null);
    const v = f.body.linvel(); followPlayerGround(f.world, R, f.body, v, dt, false);
    assert.equal(f.body.linvel().x, v.x, 'the old seam search skin must not activate slope holding');
  } finally { f.free(); }
});
test('flat startup keeps the existing 8 m/s² cap and a wall does not gain friction', () => {
  const f = slope(0);
  try {
    for (let i = 0; i < 60; i++) f.tick();
    f.tick(6.2); assert.ok(Math.abs(f.body.linvel().x - (8 * dt) / (1 + .2 * dt)) < .001);
    f.world.createCollider(R.ColliderDesc.cuboid(.02, 3, 8).setTranslation(1, 2, 0)); f.world.step();
    for (let i = 0; i < 60; i++) f.tick(3.6);
    const atWall = f.body.translation();
    for (let i = 0; i < 60; i++) f.tick(-3.6);
    assert.ok(f.body.translation().x < atWall.x - 2, 'walk away from wall contact');
  } finally { f.free(); }
});
test('a one-step slope force leaves other forces intact and cannot persist into a cliff fall', () => {
  const f = slope();
  try {
    for (let i = 0; i < 60; i++) f.tick();
    f.body.addForce({ x: 1, y: 2, z: 3 }, true);
    compensatePlayerSlopeGravity(f.world, f.body, playerSupport(f.world, R, f.body), dt, false);
    clearPlayerSlopeGravity(f.body);
    const force = f.body.userForce();
    assert.ok(Math.abs(force.x - 1) < 1e-4); assert.equal(force.y, 2); assert.equal(force.z, 3);
  } finally { f.free(); }
  const edge = fixture([0, .823, 0], world => world.createCollider(R.ColliderDesc.cuboid(1, .5, 3).setTranslation(0, -.5, 0)));
  try {
    for (let i = 0; i < 60; i++) edge.tick();
    for (let i = 0; i < 120; i++) edge.tick(3.6);
    const state = edge.tick(3.6);
    assert.equal(state.grounded, false); assert.equal(state.slopeGravity, null);
    assert.ok(edge.body.translation().y < -.5);
    assert.deepEqual({ ...edge.body.userForce() }, { x: 0, y: 0, z: 0 });
  } finally { edge.free(); }
});
test('steep faces and dynamic support never acquire slope gravity compensation', () => {
  const steep = slope(35);
  try { assert.equal(steep.tick().slopeGravity, null); } finally { steep.free(); }
  const moving = fixture([0, .823, 0], world => {
    const platform = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, -.5, 0));
    world.createCollider(R.ColliderDesc.cuboid(3, .5, 3).setMass(1000), platform);
  });
  try { assert.equal(moving.tick().slopeGravity, null); } finally { moving.free(); }
});
test('actual cliff promenade supports the dynamic player uphill, ten-second stop and downhill across seams', t => {
  // Include the real lookout edge, so a platform face across the incline cannot
  // pass a test that only follows the centreline or reaches the first junction.
  const g = createCoasterStructure(false), points = COASTER_CLIFF_WALK.map(coasterWorld);
  points.splice(2, 0, [108.57, 5.28, -159.89]); // Observed QA stop, with the capsule offset removed.
  const f = fixture([points[0][0], points[0][1] + .84, points[0][2]], world => {
    world.createCollider(R.ColliderDesc.trimesh(g.relief.vertices, g.relief.indices));
    world.createCollider(R.ColliderDesc.cuboid(80, .5, 120).setTranslation(50, .5, -195));
    for (const c of g.colliders) world.createCollider(coasterColliderDescriptor(R, c));
  });
  try {
    for (let i = 0; i < 60; i++) f.tick();
    const records = [];
    for (const target of [...points.slice(1), ...points.slice(0, -1).reverse()]) {
      let reached = false, lost = 0;
      for (let i = 0; i < 1200; i++) {
        const p = f.body.translation(), x = target[0] - p.x, z = target[2] - p.z, d = Math.hypot(x, z);
        if (d < .15) { reached = true; break; }
        if (!f.tick(x / d * Math.min(3.6, d * 4), z / d * Math.min(3.6, d * 4)).grounded) lost++;
      }
      records.push({ target, reached, lost, position: f.body.translation() });
      if (!reached) f.world.contactPairsWith(f.body.collider(0), c => t.diagnostic(JSON.stringify({ blockedContact: c.translation(), shapeType: c.shapeType(), half: c.shape.halfExtents })));
      assert.ok(reached, JSON.stringify(records));
      assert.ok(lost < 12, `seam support lost ${lost} frames`);
      if (target === points[2]) {
        for (let i = 0; i < 60; i++) f.tick();
        const start = f.body.translation(); for (let i = 0; i < 600; i++) f.tick();
        const end = f.body.translation(), drift = Math.hypot(end.x - start.x, end.z - start.z);
        t.diagnostic(JSON.stringify({ actualPromenadeIdleDrift: drift, start, end }));
        assert.ok(drift < .025);
      }
    }
    t.diagnostic(JSON.stringify({ dynamicPromenade: records }));
  } finally { f.free(); g.steel.dispose(); g.glow.dispose(); }
});
