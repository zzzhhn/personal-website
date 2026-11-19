import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { FACTORY_FIXTURE_CONTACT, buildFactoryFixture } from './factory-fixture.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY_ASSEMBLY_CONTACT } from './factory-operation.ts';
import { factoryStation } from './factory-layout.ts';
import { buildFactoryCompanion } from './factory-companion.ts';

await R.init();
const pose = { x: 0, y: 0, z: 0, w: 1 };
function physical(fixture) {
  const world = new R.World({ x: 0, y: 0, z: 0 }), body = world.createRigidBody(R.RigidBodyDesc.fixed());
  for (const contact of fixture.contacts) world.createCollider(R.ColliderDesc.trimesh(contact.vertices, contact.indices), body);
  world.step();
  return world;
}

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const area = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
function clear(fixture, world, box, label) {
  const half = box.getSize(new Vector3()).multiplyScalar(.5);
  assert.equal(world.intersectionWithShape(box.getCenter(new Vector3()), pose, new R.Cuboid(...half)), null, label);
  const p = fixture.geometry.attributes.position, index = fixture.geometry.index, triangle = new Triangle();
  for (let i = 0; i < index.count; i += 3) {
    triangle.a.fromBufferAttribute(p, index.getX(i)); triangle.b.fromBufferAttribute(p, index.getX(i + 1)); triangle.c.fromBufferAttribute(p, index.getX(i + 2));
    assert.ok(!box.intersectsTriangle(triangle), `${label}: fixture triangle ${i / 3} intrudes`);
  }
}

test('fixture preserves the production datum with a compact finite single-batch envelope', () => {
  const fixture = buildFactoryFixture(FACTORY_PALETTE);
  try {
    assert.deepEqual([...FACTORY_FIXTURE_CONTACT], FACTORY_ASSEMBLY_CONTACT);
    assert.deepEqual([...FACTORY_FIXTURE_CONTACT], [24, 1.14, -4]);
    const g = fixture.geometry, bounds = g.boundingBox;
    near(bounds.min.x, 22.95); near(bounds.max.x, 25.05);
    near(bounds.min.z, -4.85); near(bounds.max.z, -3.15);
    near(bounds.min.y, .12); assert.ok(bounds.max.y <= 1.40001);
    assert.deepEqual(g.groups, []); assert.equal(fixture.triangles, g.index.count / 3); assert.ok(fixture.triangles < 6000);
    assert.equal(fixture.contacts.length, 1);
    assert.equal(fixture.contacts[0].indexCount, g.index.count);
    for (const name of ['position', 'normal', 'color', 'aMat', 'aSuv']) assert.ok(g.attributes[name]);
    for (const attribute of Object.values(g.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), p = g.attributes.position;
    for (let i = 0; i < g.index.count; i += 3) {
      for (let j = 0; j < 3; j++) assert.ok(g.index.getX(i + j) < p.count);
      a.fromBufferAttribute(p, g.index.getX(i)); b.fromBufferAttribute(p, g.index.getX(i + 1)); c.fromBufferAttribute(p, g.index.getX(i + 2));
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, 'no collapsed fixture face');
    }
    console.log(JSON.stringify({ triangles: fixture.triangles, colliders: fixture.contacts.length, vertices: p.count }));
  } finally { fixture.geometry.dispose(); }
});

test('workplane and four actual chassis support pads meet the unmodified companion in both configurations', () => {
  const fixture = buildFactoryFixture(FACTORY_PALETTE), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(fixture.geometry, material), world = physical(fixture);
  const ray = (target, origin, direction) => new Raycaster(new Vector3(...origin), new Vector3(...direction), 0, 2).intersectObject(target, false)[0];
  try {
    near(ray(mesh, [24.7, 2, -4], [0, -1, 0]).point.y, 1.14);
    near(2 - world.castRay(new R.Ray({ x: 24.7, y: 2, z: -4 }, { x: 0, y: -1, z: 0 }), 2, true).timeOfImpact, 1.14);
    for (const configuration of ['nimble', 'steady']) {
      const companion = buildFactoryCompanion({ configuration });
      try {
        companion.group.position.set(...FACTORY_FIXTURE_CONTACT); companion.group.updateMatrixWorld(true);
        const chassis = companion.group.getObjectByName('companion-chassis');
        for (const x of [-.15, .15]) for (const z of [-.18, .18]) {
          const pad = ray(mesh, [24 + x, 1.44, -4 + z], [0, -1, 0]);
          const underside = ray(chassis, [24 + x, 1.36, -4 + z], [0, 1, 0]);
          assert.ok(pad && underside); near(pad.point.y, 1.385); near(pad.point.y, underside.point.y);
          const contact = world.castRay(new R.Ray({ x: 24 + x, y: 1.44, z: -4 + z }, { x: 0, y: -1, z: 0 }), .2, true);
          near(1.44 - contact.timeOfImpact, pad.point.y);
        }
      } finally { companion.dispose(); }
    }
    clear(fixture, world, area([23.744, 1.405, -4.335], [24.256, 1.81, -3.665]), 'upper body and removable shell');
    clear(fixture, world, area([23.839, 1.296, -4.151], [24.161, 1.363, -3.849]), 'steady ballast envelope');
  } finally { world.free(); fixture.geometry.dispose(); material.dispose(); }
});

test('real wheel geometries can sweep a full revolution above four actual recessed pockets', () => {
  const fixture = buildFactoryFixture(FACTORY_PALETTE), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(fixture.geometry, material), world = physical(fixture);
  try {
    for (const configuration of ['nimble', 'steady']) {
      const companion = buildFactoryCompanion({ configuration });
      try {
        for (const wheel of companion.wheels) {
          let radius = 0, minX = Infinity, maxX = -Infinity;
          for (const part of wheel.children) {
            const p = part.geometry.attributes.position;
            for (let i = 0; i < p.count; i++) {
              radius = Math.max(radius, Math.hypot(p.getY(i), p.getZ(i)));
              minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
            }
          }
          const x = 24 + wheel.position.x, y = 1.14 + wheel.position.y, z = -4 + wheel.position.z;
          clear(fixture, world, area([x + minX - .002, y - radius - .002, z - radius - .002],
            [x + maxX + .002, y + radius + .002, z + radius + .002]), `${configuration} ${wheel.name} full sweep`);
          const floor = new Raycaster(new Vector3(x, 1.13, z), new Vector3(0, -1, 0), 0, .2).intersectObject(mesh, false)[0];
          assert.ok(floor); near(floor.point.y, 1.06);
          const contact = world.castRay(new R.Ray({ x, y: 1.13, z }, { x: 0, y: -1, z: 0 }), .2, true);
          near(1.13 - contact.timeOfImpact, floor.point.y);
        }
      } finally { companion.dispose(); }
    }
  } finally { world.free(); fixture.geometry.dispose(); material.dispose(); }
});

test('assembly and finish standing points, their unchanged controls and both side passages remain clear', () => {
  const fixture = buildFactoryFixture(FACTORY_PALETTE), world = physical(fixture);
  try {
    for (const id of ['assembly', 'finish']) {
      const station = factoryStation(id), [x, y, z] = station.at;
      assert.deepEqual(station.at, id === 'assembly' ? [24, .12, -8] : [24, .12, 0]);
      clear(fixture, world, area([x - .7, y + .02, z - .7], [x + .7, y + 2.1, z + .7]), `${id} standing body`);
      const cx = x + Math.sin(station.yaw) * .9, cz = z + Math.cos(station.yaw) * .9;
      clear(fixture, world, area([cx - .6, y, cz - .6], [cx + .6, y + 1.5, cz + .6]), `${id} existing console`);
    }
    for (const x of [22.2, 25.8]) clear(fixture, world,
      area([x - .55, .14, -6.6], [x + .55, 2.3, -1.4]), 'side passage');
  } finally { world.free(); fixture.geometry.dispose(); }
});

test('the assembly frame leaves the visible openings beside its service cabinet passable', () => {
  const fixture = buildFactoryFixture(FACTORY_PALETTE), world = physical(fixture);
  try {
    const direction = { x: 0, y: 0, z: -1 };
    for (const x of [23.4, 24.6]) {
      const from = { x, y: .65, z: -2.9 };
      assert.equal(world.castRay(new R.Ray(from, direction), 1.25, true), null);
      assert.equal(world.castShape(from, pose, direction, new R.Ball(.025), 0, 1.25, true), null);
    }
    assert.ok(world.castRay(new R.Ray({ x: 24, y: .65, z: -2.9 }, direction), 1.25, true));
  } finally { world.free(); fixture.geometry.dispose(); }
});

test('fixture does not mutate the supplied palette or share resources across owners', () => {
  const palette = structuredClone(FACTORY_PALETTE), before = structuredClone(palette);
  const a = buildFactoryFixture(palette), b = buildFactoryFixture(palette);
  let otherDisposals = 0; b.geometry.addEventListener('dispose', () => otherDisposals++);
  try {
    assert.deepEqual(palette, before); assert.notEqual(a.geometry, b.geometry); assert.notEqual(a.contacts, b.contacts);
    a.geometry.dispose(); assert.equal(otherDisposals, 0);
  } finally { b.geometry.dispose(); }
});
