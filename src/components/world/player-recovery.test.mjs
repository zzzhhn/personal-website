import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { playerSupport, compensatePlayerSlopeGravity, clearPlayerSlopeGravity, resetPlayerBody } from './player-ground.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { CAMP_SPAWN } from './layout.ts';
import { returnPlayerToCamp } from './world-recovery.ts';
const require = createRequire(import.meta.url);
const { default: R } = await import(require.resolve('@dimforge/rapier3d-compat', { paths: [require.resolve('@react-three/rapier')] }));
await R.init();
const dt = 1 / 60;
function fixture() {
  // No global gravity after recovery: any new horizontal force is unambiguously stale
  // controller state. The pre-reset support force uses a real 15-degree contact and 72 kg body.
  const world = new R.World({ x: 0, y: 0, z: 0 }); world.timestep = dt;
  const a = Math.PI / 12;
  world.createCollider(R.ColliderDesc.cuboid(4, .5, 4).setTranslation(.5 * Math.sin(a), -.5 * Math.cos(a), 0)
    .setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }));
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, PLAYER_HALF_HEIGHT + PLAYER_RADIUS / Math.cos(a), 0)
    .lockRotations().setCanSleep(false));
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS).setMass(72)
    .setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min), body);
  world.step();
  const arm = () => {
    const support = playerSupport(world, R, body); assert.equal(support?.grounded, true);
    assert.ok(compensatePlayerSlopeGravity(world, body, support, dt, false));
    assert.ok(Math.abs(body.userForce().x) > 200, 'reproduce the real pending slope force');
  };
  return { world, body, arm };
}
const zero = v => assert.ok(Math.hypot(v.x, v.y, v.z) < 1e-5, JSON.stringify(v));
test('same-step player relocation cannot turn pending slope support into persistent reverse force', t => {
  const { world, body, arm } = fixture();
  try {
    arm(); body.setLinvel({ x: 3.6, y: -2, z: 1 }, true);
    resetPlayerBody(body, [20, 3, 20]);
    // Match the real after-physics hook, including an accidental duplicate cleanup.
    clearPlayerSlopeGravity(body); clearPlayerSlopeGravity(body);
    zero(body.userForce()); zero(body.linvel());
    for (let i = 0; i < 60; i++) world.step();
    const p = body.translation(); assert.ok(Math.hypot(p.x - 20, p.y - 3, p.z - 20) < 1e-6);
    t.diagnostic(JSON.stringify({ afterOneSecond: p, force: body.userForce() }));
  } finally { world.free(); }
});
test('disabled-capsule reset and a new support frame remain independent', () => {
  const { world, body, arm } = fixture();
  try {
    const start = { ...body.translation() }; arm(); body.setEnabled(false);
    resetPlayerBody(body, [start.x, start.y, start.z]); clearPlayerSlopeGravity(body);
    assert.equal(body.isEnabled(), false); zero(body.userForce());
    body.setEnabled(true); world.step(); arm();
    clearPlayerSlopeGravity(body); zero(body.userForce());
  } finally { world.free(); }
});
test('camp recovery clears pending support through the shared transient cleanup before body reset', () => {
  const { world, body, arm } = fixture();
  try {
    arm(); let resetCamera = 0;
    returnPlayerToCamp(body, undefined, () => clearPlayerSlopeGravity(body), () => resetCamera++);
    clearPlayerSlopeGravity(body); zero(body.userForce());
    assert.equal(resetCamera, 1); assert.equal(body.isEnabled(), true);
    for (let i = 0; i < 60; i++) world.step();
    const p = body.translation();
    assert.ok([p.x, p.y, p.z].every((n, i) => Math.abs(n - CAMP_SPAWN[i]) < 1e-5));
  } finally { world.free(); }
});
