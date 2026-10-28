import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_GEOMETRY_BUDGET } from './ibd-geometry-budget.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { buildIbdStatic, buildIbdCoil, buildIbdPack, buildIbdLid, buildIbdCrane, buildIbdHook, buildIbdCables, buildIbdShutter, buildIbdTorch } from './ibd-yard-geometry.ts';
import { IBD_STATIONS, IBD_CARGO_HOME, IBD_RAMP, IBD_SHEDS } from './ibd-yard-layout.ts';
import { playerSupport, followPlayerGround } from '../player-ground.ts';
import { createPlayerClearance, playerVelocityChange, sweptPlayerVelocity } from '../player-motion.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdCargoPose } from './ibd-yard-motion.ts';
import { IBD_FOOTPRINT, IBD_YARD } from './attraction-layout.ts';
await RAPIER.init();
const identity = { x: 0, y: 0, z: 0, w: 1 }, capsule = new RAPIER.Capsule(.48, .34);
function fixture(cargo = true) {
  const data = buildIbdStatic(), world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  for (const s of data.solids) {
    const q = new Quaternion().setFromEuler(new Euler(...(s.rotation ?? [0, 0, 0])));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size.map(n => n / 2)).setTranslation(...s.at).setRotation(q));
  }
  world.createCollider(RAPIER.ColliderDesc.trimesh(data.walkSurface.vertices, data.walkSurface.indices));
  for (const [slot, at] of cargo ? Object.entries(IBD_CARGO_HOME) : []) {
    const coil = slot.startsWith('coil');
    world.createCollider(RAPIER.ColliderDesc.cuboid(...(coil ? [2, 2, 1.4] : [1.4, .55, 1.3])).setTranslation(at[0], at[1] + (coil ? 0 : .45), at[2]));
  }
  world.step();
  const free = (x, foot, z) => {
    let hit = false;
    world.intersectionsWithShape({ x, y: foot + .86, z }, identity, capsule, () => { hit = true; return false; });
    return !hit;
  };
  return { world, data, free, dispose: () => { world.free(); data.geometry.dispose(); } };
}
test('geometry is finite, bounded to the survey, and stays below the provisional triangle budget', () => {
  const staticData = buildIbdStatic();
  const geometries = [staticData.geometry, buildIbdCoil(false), buildIbdCoil(true, 2), buildIbdPack(4, 'M8'), buildIbdPack(3, 'M8'),
    buildIbdLid(), buildIbdLid(), buildIbdCrane(), buildIbdHook(), buildIbdCables(), buildIbdShutter(), buildIbdTorch(), buildIbdPack(4, 'M6')];
  let triangles = 24; // open 12-sided inspection light shaft
  for (const g of geometries) {
    assert.ok(g.index && g.getAttribute('color')); triangles += g.index.count / 3;
    assert.ok([...g.getAttribute('position').array].every(Number.isFinite)); g.dispose();
  }
  assert.ok(triangles < IBD_GEOMETRY_BUDGET.representative, `${triangles} triangles`);
  const xs = IBD_FOOTPRINT.map(p => p[0] - IBD_YARD.center[0]), zs = IBD_FOOTPRINT.map(p => p[1] - IBD_YARD.center[2]);
  assert.ok(staticData.geometry.boundingBox.min.x >= Math.min(...xs) - .2 && staticData.geometry.boundingBox.max.x <= Math.max(...xs) + .2);
  assert.ok(staticData.geometry.boundingBox.min.z >= Math.min(...zs) - .2 && staticData.geometry.boundingBox.max.z <= Math.max(...zs) + .2);
});
test('all animated transport lanes clear the enlarged architecture with the actual cargo collider sizes', () => {
  const f = fixture(false);
  try {
    for (const slot of ['parts-a', 'parts-b', 'coil-front', 'coil-rear']) {
      const coil = slot.startsWith('coil');
      const kinds = coil ? ['turn', 'replace', ...(slot === 'coil-front' ? ['crane', 'replace-moved'] : [])] : ['load', 'unload', 'replace'];
      // Shrink 2 cm solely to exclude resting contact with cradles and benches.
      const shape = new RAPIER.Cuboid(...(coil ? [1.98, 1.98, 1.38] : [1.38, .53, 1.28]));
      for (const kind of kinds) {
        const game = createIbdYardGame();
        if (kind === 'replace-moved') game.core.moved.push('coil-front');
        game.pending = { token: 1, seconds: 1, action: { kind: kind === 'replace-moved' ? 'replace' : kind, slot, station: slot } };
        for (let i = 0; i <= 160; i++) {
          const pose = ibdCargoPose(game, slot, i / 160), [x, y, z] = pose.at;
          const hits = [];
          const rotation = new Quaternion().setFromEuler(new Euler(0, pose.yaw, 0));
          f.world.intersectionsWithShape({ x, y: y + (coil ? 0 : .45), z }, rotation, shape,
            collider => { hits.push(collider.translation()); return true; });
          assert.deepEqual(hits, [], `${slot}/${kind} collides at progress ${i / 160}, position ${pose.at}`);
        }
      }
    }
  } finally { f.dispose(); }
});
test('south entrance and the outside portal landings have no facility collider obstruction', () => {
  const f = fixture();
  try {
    for (let z = 22; z <= 34; z += .5) for (const x of [-1, 0, 1]) assert.ok(f.free(x, .1, z), `entry blocked at ${x},${z}`);
    for (const z of [28.5, 31, 33.5]) assert.ok(f.free(-13, .1, z), `portal blocked at ${z}`);
  } finally { f.dispose(); }
});
test('camera-sized sphere sweeps hit both physical roof slopes of all three sheds', () => {
  const f = fixture();
  try {
    for (const { x, z, width, eave: height, rise } of IBD_SHEDS) {
      for (const side of [-1, 1]) {
        const hit = f.world.castShape({ x: x + side * width / 4, y: height + rise / 2 + 1.5, z }, identity,
          { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.25), 0, 2, true);
        assert.ok(hit && hit.time_of_impact < 1.5, `roof ${x},${z}/${side} must stop the camera sphere`);
      }
    }
  } finally { f.dispose(); }
});
test('west ramp, north deck and side gallery form a continuous capsule-clear route', () => {
  const f = fixture();
  try {
    for (let z = 4; z >= -13.5; z -= .25) {
      const top = .1 + Math.max(0, Math.min(4, (IBD_RAMP.south - z) * 4 / IBD_RAMP.length));
      assert.ok(f.free(-24, top, z), `ramp blocked at ${z}`);
    }
    for (let x = -24; x <= -6; x += .25) assert.ok(f.free(x, 4.12, -13.5), `deck blocked at ${x}`);
    for (let z = -13.5; z <= -3.5; z += .25) assert.ok(f.free(-6, 4.12, z), `gallery blocked at ${z}`);
  } finally { f.dispose(); }
});

test('the real player support and swept-motion helpers cross the ramp crest without a southward ejection', () => {
  const f = fixture(), dt = 1 / 60;
  const body = f.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-24.25, .92, 4.23)
    .setGravityScale(12.5 / 9.81).setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false).lockRotations());
  f.world.createCollider(RAPIER.ColliderDesc.capsule(.48, .34).setMass(72).setFriction(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
  const clearance = createPlayerClearance(f.world);
  const step = (x, z) => {
    const before = body.translation(), v = body.linvel(), grounded = playerSupport(f.world, RAPIER, body)?.grounded ?? false;
    const change = playerVelocityChange(v, { x, y: 0, z }, dt, grounded), mass = body.mass();
    body.applyImpulse({ x: change.x * mass, y: 0, z: change.z * mass }, true);
    const safe = sweptPlayerVelocity(clearance, body, body.linvel(), dt, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    body.setLinvel(safe, true); followPlayerGround(f.world, RAPIER, body, body.linvel(), dt, false);
    f.world.step(); return { before, after: body.translation() };
  };
  try {
    for (let i = 0; i < 350; i++) {
      const { before, after } = step(0, -3.6);
      assert.ok(after.z - before.z < .12, `unexpected southward step ${after.z - before.z}`);
    }
    assert.ok(body.translation().y > 4.85, 'continuous uphill route reaches the landing');
    // Exact reported crest location, including the small ordinary contact penetration.
    body.setTranslation({ x: -23.9, y: 4.9, z: -13.37 }, true); body.setLinvel({ x: 0, y: 0, z: -3.6 }, true); f.world.step();
    for (let i = 0; i < 21; i++) {
      const { before, after } = step(0, -3.6);
      assert.ok(after.z - before.z < .12, 'north input must not eject the capsule south');
      assert.ok(after.y > 4.84, 'capsule remains supported at the crest');
    }
    // The observed D travel had a south component. Actual rails must contain that drift.
    for (let i = 0; i < 240; i++) {
      const { after } = step(3.35, 1.3);
      assert.ok(after.y > 4.84, 'turning along the gallery must not fall to the yard floor');
    }
    assert.ok(body.translation().x > -15, 'guardrail still allows eastward travel');
  } finally { f.world.removeCharacterController(clearance); f.dispose(); }
});
test('every station has a collision-free standing point within its own interaction radius', () => {
  const f = fixture();
  try {
    for (const station of IBD_STATIONS) {
      const foot = station.id.startsWith('gallery') ? 4.12 : .1;
      const candidates = [[0, 0], [0, .6], [0, -.6], [.6, 0], [-.6, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      assert.ok(candidates.some(([dx, dz]) => {
        const x = station.at[0] + dx, z = station.at[2] + dz;
        if (!f.free(x, foot, z)) return false;
        const origin = { x, y: foot + .86 + .45, z };
        const delta = { x: station.at[0] - x, y: station.at[1] + .2 - origin.y, z: station.at[2] - z };
        const length = Math.hypot(delta.x, delta.y, delta.z);
        return length < .35 || !f.world.castRay(new RAPIER.Ray(origin, { x: delta.x / length, y: delta.y / length, z: delta.z / length }), length - .3, true);
      }), `${station.id} has no clear standing point and line of sight`);
    }
  } finally { f.dispose(); }
});
