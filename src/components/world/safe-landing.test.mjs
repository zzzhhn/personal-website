import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { findSafePlayerLanding, findSafeVehicleLanding, PLAYER_HEAD_OFFSET, updateHeadSubmersion } from './safe-landing.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, wheelGeometry } from './actor-physics.ts';
import { pavedV4, ROAD_Y } from './layout-v4.ts';
const require = createRequire(import.meta.url);
const entry = require.resolve('@dimforge/rapier3d-compat', { paths: [require.resolve('@react-three/rapier')] });
const { default: RAPIER } = await import(entry); await RAPIER.init();
const size = [4.3, 1.05, 1.9], candidate = { position: [0, 0, 0], yaw: 0 };
function scene() {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2, .5, 1), body);
  return { world, body };
}
function floor(world, hx = 20, hz = 20, y = 0) {
  return world.createCollider(RAPIER.ColliderDesc.cuboid(hx, .5, hz).setTranslation(0, y - .5, 0));
}
function queries({ world, body }, waterY = -.7) {
  world.step();
  return { player: findSafePlayerLanding(world, RAPIER, body, [[0, 0, 0]], waterY),
    vehicle: findSafeVehicleLanding(world, RAPIER, body, size, [candidate], waterY) };
}
test('open static ground allows a full standing capsule and a driveable vehicle landing', () => {
  const s = scene(); floor(s.world);
  try {
    const result = queries(s);
    assert.ok(Math.abs(result.player[1] - PLAYER_CENTER_HEIGHT) < 1e-6);
    assert.ok(Math.abs(result.vehicle.position[1] - wheelGeometry(size).height - .12) < 1e-6);
    assert.equal(result.vehicle.yaw, 0);
    assert.deepEqual({ ...s.body.translation() }, { x: 0, y: -5, z: 0 }, 'queries never relocate the actor');
  } finally { assert.doesNotThrow(() => s.world.free()); }
});
test('the inflated capsule has 2 cm clearance at the actual spawn height; 4 cm penetration is rejected', t => {
  const s = scene(), support = floor(s.world);
  const shape = new RAPIER.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS + .04);
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  try {
    s.world.step();
    assert.ok(Math.abs(PLAYER_CENTER_HEIGHT - .88) < 1e-9, 'standing centre includes the 6 cm spawn skin');
    for (const [height, distance, intersects] of [[PLAYER_CENTER_HEIGHT, .02, false], [.82, -.04, true]]) {
      const p = { x: 0, y: height, z: 0 };
      const contact = support.contactShape(shape, p, rotation, .1);
      const hit = s.world.intersectionWithShape(p, rotation, shape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, s.body);
      t.diagnostic(`centreY=${height.toFixed(2)}, signed floor distance=${contact?.distance}, intersection=${!!hit}`);
      assert.ok(contact && Math.abs(contact.distance - distance) < 1e-4, 'signed contact distance matches within 0.1 mm');
      assert.equal(!!hit, intersects);
    }
  } finally { assert.doesNotThrow(() => s.world.free()); }
});
for (const kind of ['narrow-shore', 'shore-corner', 'small-island', 'submerged', 'steep-slope', 'ridge', 'roof', 'dynamic-floor', 'kinematic-floor']) {
  test(`${kind} cannot become a recovery landing`, () => {
    const s = scene();
    if (kind === 'narrow-shore') floor(s.world, 12, .3);
    if (kind === 'shore-corner') floor(s.world, .4, .4);
    if (kind === 'small-island') floor(s.world, .9, .9);
    if (kind === 'submerged') floor(s.world, 20, 20, -.6);
    if (kind === 'steep-slope') s.world.createCollider(RAPIER.ColliderDesc.cuboid(20, .5, 20)
      .setTranslation(0, -.5, 0).setRotation({ x: 0, y: 0, z: Math.sin(.6 / 2), w: Math.cos(.6 / 2) }));
    if (kind === 'ridge') {
      floor(s.world, 20, 20, -.4);
      s.world.createCollider(RAPIER.ColliderDesc.cuboid(.15, .2, 20).setTranslation(0, -.2, 0));
    }
    if (kind === 'roof') floor(s.world, 20, 20, 3);
    if (kind === 'dynamic-floor' || kind === 'kinematic-floor') {
      const desc = kind === 'dynamic-floor' ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.kinematicPositionBased();
      const other = s.world.createRigidBody(desc);
      s.world.createCollider(RAPIER.ColliderDesc.cuboid(20, .5, 20).setTranslation(0, -.5, 0), other);
    }
    try { assert.deepEqual(queries(s), { player: null, vehicle: null }); }
    finally { assert.doesNotThrow(() => s.world.free()); }
  });
}
for (const kind of ['wall', 'dynamic-vehicle', 'kinematic-obstacle', 'low-ceiling']) {
  test(`the complete body clearance rejects ${kind}`, () => {
    const s = scene(); floor(s.world);
    const owner = kind === 'dynamic-vehicle' ? s.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()) :
      kind === 'kinematic-obstacle' ? s.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()) : undefined;
    s.world.createCollider(kind === 'low-ceiling' ? RAPIER.ColliderDesc.cuboid(8, .1, 8).setTranslation(0, 1.5, 0) :
      RAPIER.ColliderDesc.cuboid(.15, 1, 2).setTranslation(.2, 1, 0), owner);
    try { assert.deepEqual(queries(s), { player: null, vehicle: null }); }
    finally { assert.doesNotThrow(() => s.world.free()); }
  });
}
test('a full footprint on a short peninsula still fails the vehicle front/back runway', () => {
  const s = scene(); floor(s.world, 3.1, 2);
  try { assert.equal(queries(s).vehicle, null); } finally { s.world.free(); }
});
test('a wall in the driving runway rejects the vehicle even when its spawn volume is clear', () => {
  const s = scene(); floor(s.world);
  s.world.createCollider(RAPIER.ColliderDesc.cuboid(.1, 2, 4).setTranslation(4, 2, 0));
  try { assert.equal(queries(s).vehicle, null); } finally { s.world.free(); }
});
test('an enclosed dry pocket needs an actual supported capsule escape corridor', () => {
  const s = scene(); floor(s.world);
  for (const side of [-1, 1]) {
    s.world.createCollider(RAPIER.ColliderDesc.cuboid(.1, 1.5, 2).setTranslation(side * 1.25, 1.5, 0));
    s.world.createCollider(RAPIER.ColliderDesc.cuboid(2, 1.5, .1).setTranslation(0, 1.5, side * 1.25));
  }
  try { assert.equal(queries(s).player, null); } finally { s.world.free(); }
});
test('query flags ignore sensors, exclude the recovered body, and leave Rapier usable after repeated calls', () => {
  const s = scene(); floor(s.world);
  s.body.setTranslation({ x: 0, y: 1, z: 0 }, true);
  s.world.createCollider(RAPIER.ColliderDesc.cuboid(8, 3, 8).setTranslation(0, 3, 0).setSensor(true));
  s.world.step();
  // A forbidden callback would trigger these methods while Rapier borrows its collider set.
  s.world.forEachCollider(c => { c.isSensor = () => { throw new Error('query re-entered collider set'); }; });
  try {
    for (let i = 0; i < 10; i++) {
      assert.ok(findSafePlayerLanding(s.world, RAPIER, s.body, [[0, 0, 0]], -.7));
      assert.ok(findSafeVehicleLanding(s.world, RAPIER, s.body, size, [candidate], -.7));
    }
    assert.doesNotThrow(() => s.world.step());
  } finally { assert.doesNotThrow(() => s.world.free()); }
});
test('candidates remain ordered, have ground heights, and preserve road yaw', () => {
  const s = scene(); floor(s.world);
  try {
    s.world.step();
    const result = findSafeVehicleLanding(s.world, RAPIER, s.body, size,
      [{ position: [100, 0, 0], yaw: 0 }, { position: [2, 0, 2], yaw: Math.PI / 2 }], -.7);
    assert.deepEqual([result.position[0], result.position[2], result.yaw], [2, 2, Math.PI / 2]);
  } finally { s.world.free(); }
});
test('real avenue road meshes support the player and every production vehicle size', () => {
  const s = scene();
  for (const p of pavedV4().filter(p => p.road === 'avenue')) {
    const vertices = new Float32Array(p.pts.flatMap(([x, z], i) => [x, p.ys[i], z]));
    const triangles = [];
    for (let i = 1; i < p.pts.length - 1; i++) triangles.push(0, i + 1, i);
    s.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, new Uint32Array(triangles)));
  }
  try {
    s.world.step();
    assert.ok(findSafePlayerLanding(s.world, RAPIER, s.body, [[21, ROAD_Y, 0]], -.7));
    for (const dimensions of [[3.9, 1.35, 2], size, [4.5, 1.9, 2.2]]) {
      assert.ok(findSafeVehicleLanding(s.world, RAPIER, s.body, dimensions,
        [{ position: [21, ROAD_Y, 0], yaw: Math.PI / 2 }], -.7), `vehicle size ${dimensions}`);
    }
  } finally { s.world.free(); }
});
test('shallow water never accumulates rescue time; only continuously submerged mouth/nose does', () => {
  let seconds = 0;
  for (let i = 0; i < 300; i++) {
    const state = updateHeadSubmersion(seconds, 1 / 60, -.3, 0);
    seconds = state.submergedSeconds; assert.equal(state.shouldRescue, false);
  }
  assert.equal(seconds, 0);
  let state = updateHeadSubmersion(0, 1.9, -PLAYER_HEAD_OFFSET - .01, 0);
  assert.equal(state.shouldRescue, false);
  state = updateHeadSubmersion(state.submergedSeconds, .1, -PLAYER_HEAD_OFFSET - .01, 0);
  assert.equal(state.shouldRescue, true);
  assert.deepEqual(updateHeadSubmersion(state.submergedSeconds, .1, -PLAYER_HEAD_OFFSET, 0), { submergedSeconds: 0, shouldRescue: false });
  assert.equal(updateHeadSubmersion(1.9, .1, -.4, 0, .3).shouldRescue, true, 'explicit head offset is supported');
});
