import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { playerSupport, followPlayerGround } from './player-ground.ts';
import { createPlayerClearance, sweptPlayerVelocity } from './player-motion.ts';
import { pavedV4 } from './layout-v4.ts';
await RAPIER.init();
const dt = 1 / 60;
const guards = new WeakMap();
function scene(x = -2, y = .82) {
  const world = new RAPIER.World({ x: 0, y: -12.5, z: 0 });
  world.timestep = dt;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, 0)
    .lockRotations().setLinearDamping(.2).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.capsule(.48, .34).setMass(72).setFriction(0).setRestitution(0), body);
  guards.set(world,createPlayerClearance(world));
  return { world, body };
}
function flat(world, halfLength = 10) {
  world.createCollider(RAPIER.ColliderDesc.cuboid(halfLength, .5, 4).setTranslation(0, -.5, 0));
}
function tick(world, body, vx = 0, jumping = false) {
  const v = body.linvel();
  body.applyImpulse({ x: (vx - v.x) * body.mass(), y: 0, z: -v.z * body.mass() }, true);
  body.setLinvel(sweptPlayerVelocity(guards.get(world),body,body.linvel(),dt,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS),true);
  const result = followPlayerGround(world, RAPIER, body, body.linvel(), dt, jumping);
  if (jumping) body.setLinvel({ x: vx, y: 5, z: 0 }, true);
  world.step();
  return result;
}
test('a body 18 cm above ground is airborne; a nearby sensor is not support', () => {
  const { world, body } = scene(0, 1);
  flat(world); world.step();
  assert.equal(playerSupport(world, RAPIER, body), null);
  assert.equal(followPlayerGround(world, RAPIER, body, body.linvel(), dt, false), null);
  world.createCollider(RAPIER.ColliderDesc.cuboid(2, .01, 2).setTranslation(0, .17, 0).setSensor(true));
  world.step();
  assert.equal(playerSupport(world, RAPIER, body), null);
  world.free();
});
test('flat support is stable and a jump keeps its ballistic arc', () => {
  const { world, body } = scene(); flat(world);
  for (let i = 0; i < 120; i++) tick(world, body);
  assert.ok(Math.abs(body.translation().y - .82) < .005);
  const start = body.translation().y;
  assert.equal(tick(world, body, 0, true), null);
  let peak = 0, restored = false, flightFrames = 1;
  for (let i = 0; i < 80; i++) {
    const support = playerSupport(world, RAPIER, body);
    if (i < 25) assert.ok(!support?.grounded, 'ascending jump cannot regain ground adhesion');
    const force = tick(world, body);
    peak = Math.max(peak, body.translation().y - start);
    if (i > 25 && support?.grounded) { restored = true; break; }
    assert.equal(force, null, 'no ground force while airborne');
    flightFrames++;
  }
  assert.ok(peak > .85 && peak < 1.05, `jump peak ${peak}`);
  assert.ok(flightFrames * dt > .7 && flightFrames * dt < .9);
  assert.ok(restored);
  world.free();
});
test('sprint crosses flat-to-downhill and uphill-to-flat without a ballistic float', () => {
  for (const direction of [1, -1]) {
    const { world, body } = scene(direction === 1 ? -2 : 11, direction === 1 ? .82 : -1.93);
    const vertices = new Float32Array([-6,0,-4, 0,0,-4, 12,-3,-4, 17,-3,-4,
      -6,0,4, 0,0,4, 12,-3,4, 17,-3,4]);
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, new Uint32Array([0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7])));
    for (let i = 0; i < 60; i++) tick(world, body);
    let maxGap = 0, lost = 0;
    for (let i = 0; i < 135; i++) {
      tick(world, body, direction * 6.2);
      const p = body.translation();
      const cast = world.castShape(p, body.rotation(), {x:0,y:-1,z:0}, new RAPIER.Capsule(.48,.34), 0, .4, true, undefined, undefined, undefined, body);
      maxGap = Math.max(maxGap, cast?.time_of_impact ?? .4);
      if (!playerSupport(world, RAPIER, body)?.grounded) lost++;
    }
    assert.ok(maxGap < .015, `${direction}: max gap ${maxGap}, lost ${lost}`);
    assert.ok(lost < 3, `continuous walkable ground lost support ${lost} times`);
    world.free();
  }
});
test('walking off a cliff releases support; dynamic props never create a ground servo', () => {
  const { world, body } = scene(0); flat(world, 1);
  for (let i = 0; i < 50; i++) tick(world, body);
  for (let i = 0; i < 30; i++) tick(world, body, 6.2);
  assert.ok(body.translation().y < .4);
  assert.equal(followPlayerGround(world, RAPIER, body, body.linvel(), dt, false), null);
  world.free();
  const other = scene(0, 1.82);
  const prop = other.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, .5, 0));
  other.world.createCollider(RAPIER.ColliderDesc.cuboid(2, .5, 2).setMass(1000), prop);
  other.world.step();
  assert.equal(followPlayerGround(other.world, RAPIER, other.body, other.body.linvel(), dt, false), null);
  other.world.free();
});

test('the real camp ramp supports both directions across its full driving lane', () => {
  const road = pavedV4().filter(p => p.road === 'camp-ramp');
  for (const direction of [1, -1]) for (const offset of [-2, 0, 2]) {
    const x = direction === 1 ? -20 : -6.5, z = 34 - (x + 18) * 5 / 13;
    const height = x < -18 ? 4.84 : 4.84 - (x + 18) * 3.7 / 13;
    const { world, body } = scene(x + offset * 5 / Math.hypot(13,5), height + .84);
    body.setTranslation({ ...body.translation(), z: z + offset * 13 / Math.hypot(13,5) }, true);
    for (const p of road) {
      const vertices = p.pts.flatMap(([px,pz], i) => [px,p.ys[i],pz]);
      world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array([0,2,1,0,3,2])));
    }
    for (let i = 0; i < 60; i++) tick(world, body);
    let maxGap = 0;
    for (let i = 0; i < 125; i++) {
      const v = body.linvel(), vx = direction * 6.2 * 13 / Math.hypot(13,5), vz = -direction * 6.2 * 5 / Math.hypot(13,5);
      body.applyImpulse({x:(vx-v.x)*body.mass(),y:0,z:(vz-v.z)*body.mass()},true);
      body.setLinvel(sweptPlayerVelocity(guards.get(world),body,body.linvel(),dt,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS),true);
      followPlayerGround(world,RAPIER,body,body.linvel(),dt,false);world.step();
      const cast=world.castShape(body.translation(),body.rotation(),{x:0,y:-1,z:0},new RAPIER.Capsule(.48,.34),0,.4,true,undefined,undefined,undefined,body);
      maxGap=Math.max(maxGap,cast?.time_of_impact??.4);
    }
    assert.ok(maxGap < .02, `direction ${direction}, lane offset ${offset}: gap ${maxGap}`);
    world.free();
  }
});
