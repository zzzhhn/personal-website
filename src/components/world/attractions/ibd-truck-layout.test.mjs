import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Color, DoubleSide, Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { Builder, cbox } from '../WorldStreetGeometry.ts';
import { buildIbdPack, buildIbdStatic } from './ibd-yard-geometry.ts';
import { buildIbdTruck } from './ibd-truck-geometry.ts';
import { IBD_MATERIALS } from './ibd-yard-palette.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdCargoRoutes, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';
import { createPlayerClearance, playerVelocityChange, sweptPlayerVelocity } from '../player-motion.ts';
import { clearPlayerSlopeGravity, compensatePlayerSlopeGravity, followPlayerGround, playerSupport } from '../player-ground.ts';

await RAPIER.init();
const data = buildIbdStatic(), pack = buildIbdPack(4, 'M8');
const identity = { x: 0, y: 0, z: 0, w: 1 }, dt = 1 / 60;
const material = new MeshBasicMaterial({ side: DoubleSide }), visible = new Mesh(data.geometry, material);
pack.computeBoundingBox();
after(() => { data.geometry.dispose(); pack.dispose(); material.dispose(); });

function operation(kind, slot) {
  const game = createIbdYardGame();
  game.pending = { token: 1, seconds: 3, action: { kind, slot, station: slot === 'parts-a' ? 'load-a' : 'load-b' } };
  return game;
}
function fixture() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = dt;
  const truck = new Set(), source = new Map();
  for (const s of data.solids) {
    const c = world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size.map(n => n / 2)).setTranslation(...s.at)
      .setRotation(new Quaternion().setFromEuler(new Euler(...(s.rotation ?? [0, 0, 0])))));
    source.set(c.handle, s);
    // Select production solids in the truck body/cab footprint, excluding the approach ramps.
    // Do not substitute a hand-authored truck collider for the production geometry.
    if (s.at[0] >= 13.8 && s.at[0] <= 18.2 && s.at[2] >= 7.9 && s.at[2] <= 21.5 && s.at[1] > .3) truck.add(c.handle);
  }
  world.createCollider(RAPIER.ColliderDesc.trimesh(data.walkSurface.vertices, data.walkSurface.indices).setFriction(.85));
  world.step();
  return { world, truck, source };
}
const position = at => ({ x: at[0], y: at[1] + .45, z: at[2] });
const describe = (f, c) => JSON.stringify(f.source.get(c.handle));
function floorAt(f, x, z, fromY) {
  const hit = f.world.castRayAndGetNormal(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }),
    3, true, undefined, undefined, undefined, undefined, c => f.truck.has(c.handle));
  assert.ok(hit && hit.normal.y > .99, `no truck support surface below ${x},${fromY},${z}`);
  return { y: fromY - hit.timeOfImpact, solid: f.source.get(hit.collider.handle), handle: hit.collider.handle };
}

test('unchanged load and unload routes sweep the full runtime pallet collider clear of the production truck', () => {
  const f = fixture(), shape = new RAPIER.Cuboid(1.4, .55, 1.3);
  try {
    assert.ok(f.truck.size >= 5, 'truck floor, walls and cab must be present in production solids');
    for (const slot of ['parts-a', 'parts-b']) for (const kind of ['load', 'unload']) {
      const game = operation(kind, slot), routes = ibdCargoRoutes(game, slot);
      // The real route is piecewise linear with eased timing. Sweeping every leg covers its
      // whole swept volume, including corners that uniform animation samples can miss.
      for (const route of routes) for (let i = 0; i < route.points.length - 1; i++) {
        const a = position(route.points[i]), b = position(route.points[i + 1]);
        const hit = f.world.castShape(a, identity, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
          shape, 0, 1, true, undefined, undefined, undefined, undefined, c => f.truck.has(c.handle));
        assert.equal(hit, null, `${slot}/${kind} leg ${i} hits ${hit ? describe(f, hit.collider) : ''}`);
      }
      for (let i = 0; i <= 70; i++) {
        const pose = ibdPhysicalCargoPose(game, slot, i / 70);
        f.world.intersectionsWithShape(position(pose.at), identity, shape, c => {
          assert.ok(!f.truck.has(c.handle), `${slot}/${kind} at ${i / 70} intersects ${describe(f, c)}`);
          return true;
        });
      }
    }
  } finally { f.world.free(); }
});

test('both final visible pallet footprints have truck-floor support, wall clearance and roof headroom', () => {
  const f = fixture(), box = pack.boundingBox, ray = new Raycaster();
  const half = box.getSize(new Vector3()).multiplyScalar(.5), offset = box.getCenter(new Vector3());
  const shape = new RAPIER.Cuboid(half.x, half.y, half.z), finals = [];
  try {
    for (const slot of ['parts-a', 'parts-b']) {
      const at = ibdPhysicalCargoPose(operation('load', slot), slot, 1).at;
      const center = { x: at[0] + offset.x, y: at[1] + offset.y, z: at[2] + offset.z };
      f.world.intersectionsWithShape(center, identity, shape, c => {
        assert.ok(!f.truck.has(c.handle), `${slot} visible pallet intersects ${describe(f, c)}`);
        return true;
      });
      for (const dx of [box.min.x, box.max.x]) for (const dz of [box.min.z, box.max.z]) {
        const x = at[0] + dx, z = at[2] + dz;
        const support = f.world.castRayAndGetNormal(new RAPIER.Ray({ x, y: at[1] + box.min.y, z }, { x: 0, y: -1, z: 0 }),
          .3, true, undefined, undefined, undefined, undefined, c => f.truck.has(c.handle));
        assert.ok(support && support.normal.y > .99, `${slot} footprint corner ${x},${z} lacks truck-floor support`);
        // Include the closed lid's highest point (1.08 pivot + .13 lid rail),
        // and check both the physical ceiling and the actual visible roof underside.
        const top = at[1] + Math.max(box.max.y, 1.21);
        const physicalCeiling = f.world.castRayAndGetNormal(new RAPIER.Ray({ x, y: top, z }, { x: 0, y: 1, z: 0 }),
          1, true, undefined, undefined, undefined, undefined, c => f.truck.has(c.handle));
        assert.ok(physicalCeiling && physicalCeiling.normal.y < -.99 && physicalCeiling.timeOfImpact > .25,
          `${slot} lacks physical roof clearance at ${x},${z}`);
        ray.set(new Vector3(x, top, z), new Vector3(0, 1, 0)); ray.far = 1;
        const ceiling = ray.intersectObject(visible, false)[0];
        assert.ok(ceiling && ceiling.distance > .25, `${slot} lacks visible roof clearance at ${x},${z}`);
        assert.ok(Math.abs(ceiling.distance - physicalCeiling.timeOfImpact) < .03, 'physical and visible roof undersides disagree');
      }
      finals.push(center);
    }
    assert.equal(shape.intersectsShape(finals[0], identity, shape, finals[1], identity), false, 'loaded pallet footprints overlap');
    // Rays distinguish an enclosing wall from an accidentally open east/end face.
    for (const [from, direction] of [
      [{ x: 16, y: 2.5, z: 12.5 }, { x: 1, y: 0, z: 0 }],
      [{ x: 16, y: 2.5, z: 10.5 }, { x: 0, y: 0, z: -1 }],
      [{ x: 16, y: 2.5, z: 14.5 }, { x: 0, y: 0, z: 1 }],
    ]) assert.ok(f.world.castRay(new RAPIER.Ray(from, direction), 3, true, undefined, undefined, undefined, undefined, c => f.truck.has(c.handle)));
    assert.equal(f.world.castShape({ x: 12, y: 2.2, z: 12.5 }, identity, { x: 3, y: 0, z: 0 },
      new RAPIER.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), 0, 1, true,
      undefined, undefined, undefined, undefined, c => f.truck.has(c.handle)), null, 'west loading opening is blocked');
  } finally { f.world.free(); }
});

function walker(world, start) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start[0], .1 + PLAYER_CENTER_HEIGHT, start[1])
    .setGravityScale(12.5 / 9.81).setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false).lockRotations());
  world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS).setMass(72).setFriction(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
  const clearance = createPlayerClearance(world);
  return {
    body,
    to(x, z, steps = 300) {
      for (let i = 0; i < steps; i++) {
        const p = body.translation(), dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
        if (distance < .08) return p;
        const support = playerSupport(world, RAPIER, body), speed = Math.min(3.6, distance * 5);
        const change = playerVelocityChange(body.linvel(), { x: dx / distance * speed, y: 0, z: dz / distance * speed }, dt, support?.grounded ?? false);
        body.applyImpulse({ x: change.x * body.mass(), y: 0, z: change.z * body.mass() }, true);
        compensatePlayerSlopeGravity(world, body, support, dt, false);
        body.setLinvel(sweptPlayerVelocity(clearance, body, body.linvel(), dt, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS), true);
        followPlayerGround(world, RAPIER, body, body.linvel(), dt, false); world.step(); clearPlayerSlopeGravity(body);
      }
      return body.translation();
    },
    free() { clearPlayerSlopeGravity(body); world.removeCharacterController(clearance); world.removeRigidBody(body); },
  };
}

test('ordinary player capsules climb and leave both real loading ramps without a floor-contact false wall', () => {
  const f = fixture();
  try {
    for (const z of [10.5, 14.5]) {
      const player = walker(f.world, [10.3, z]);
      try {
        const loaded = player.to(14.8, z);
        const floor = floorAt(f, loaded.x, z, loaded.y + .5), support = playerSupport(f.world, RAPIER, player.body);
        assert.ok(loaded.x > 14.65 && Math.abs(loaded.y - floor.y - PLAYER_CENTER_HEIGHT) < .09,
          `ramp ${z} cannot reach truck support at ${floor.y}: ${JSON.stringify(loaded)}`);
        assert.ok(support?.grounded && support.handle === floor.handle, `ramp ${z} player is not standing on the truck floor`);
        const returned = player.to(10.3, z);
        assert.ok(returned.x < 10.45 && returned.y < 1.1, `ramp ${z} cannot exit: ${JSON.stringify(returned)}`);
      } finally { player.free(); }
    }
  } finally { f.world.free(); }
});

test('actual rear wheel vertices remain below the visible carrying surface and its collision floor', () => {
  const f = fixture(), ray = new Raycaster(), builder = new Builder();
  // Reuse the actual truck model before baked lighting alters material colors.
  // The adapter draws its cubes; no wheel position, profile or radius is reproduced here.
  buildIbdTruck(builder, (at, size, surf, _solid = false, bevel = .03, rotation) => {
    if (rotation) builder.tr(at, rotation, () => cbox(builder, [0, 0, 0], size, surf, bevel));
    else cbox(builder, at, size, surf, bevel);
  }, []);
  const truckGeometry = builder.build(), p = truckGeometry.attributes.position, colors = truckGeometry.attributes.color;
  const rubber = new Color(IBD_MATERIALS.rubber.color);
  try {
    const at = ibdPhysicalCargoPose(operation('load', 'parts-a'), 'parts-a', 1).at;
    const floor = floorAt(f, at[0], at[2], at[1]), { solid } = floor;
    const wheels = [];
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(colors.getX(i) - rubber.r) > 1e-6 || Math.abs(colors.getY(i) - rubber.g) > 1e-6
        || Math.abs(colors.getZ(i) - rubber.b) > 1e-6) continue;
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Derive the rear-wheel subset from the actual carrying floor footprint, so
      // cab wheels and any outboard faces cannot stand in for the affected rear tyres.
      if (Math.abs(x - solid.at[0]) <= solid.size[0] / 2 && Math.abs(z - solid.at[2]) < solid.size[2] / 2) wheels.push({ x, y, z });
    }
    assert.ok(wheels.length > 0, 'no actual wheel geometry lies below the carrying floor footprint');
    const highest = Math.max(...wheels.map(v => v.y)), tops = wheels.filter(v => v.y > highest - .001);
    assert.ok(floor.y - highest > .005, `rear tyres reach ${highest} through collision floor at ${floor.y}`);
    const checked = new Set();
    for (const top of tops) {
      const key = `${top.x},${top.z}`;
      if (checked.has(key)) continue;
      checked.add(key);
      ray.set(new Vector3(top.x, highest + .5, top.z), new Vector3(0, -1, 0)); ray.far = .7;
      const surface = ray.intersectObject(visible, false)[0];
      assert.ok(surface && surface.point.y - top.y > .005,
        `rear tyre at ${top.x},${top.z},${top.y} breaks through the visible carrying surface`);
      assert.ok(Math.abs(surface.point.y - floor.y) < .03, 'visible carrying surface disagrees with the collision floor');
    }
    assert.ok(checked.size >= 4, 'check wheel tops on both sides at both rear axles');
  } finally { truckGeometry.dispose(); f.world.free(); }
});

test('cab faces the exit direction while a full standing player can pass its west side to the yard exit', () => {
  const f = fixture(), player = walker(f.world, [12, 16.5]);
  try {
    const cab = f.world.castRayAndGetNormal(new RAPIER.Ray({ x: 16, y: 1.55, z: 23 }, { x: 0, y: 0, z: -1 }), 3.5, true,
      undefined, undefined, undefined, undefined, c => f.truck.has(c.handle));
    assert.ok(cab && cab.normal.z > .99, 'exit-facing cab must physically occupy the +Z end');
    const beside = player.to(12, 23);
    assert.ok(beside.z > 22.85 && beside.y < 1.1, `cab-side passage blocked: ${JSON.stringify(beside)}`);
    const exit = player.to(7, 23);
    assert.ok(exit.x < 7.15, `yard exit approach blocked: ${JSON.stringify(exit)}`);
  } finally { player.free(); f.world.free(); }
});
