import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { buildFactoryForecourtDetail, FACTORY_FORECOURT_GUARDS, FACTORY_FORECOURT_RACKS } from './factory-forecourt-detail.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY, FACTORY_COURSE_LOCAL, FACTORY_LANE_OFFSET, FACTORY_STATIONS, factoryPolygonDistance, FACTORY_FOOTPRINT } from './factory-layout.ts';
import { FACTORY_WALK_EDGES, FACTORY_WALK_NODES } from './factory-navigation.ts';

await R.init();
const identity = { x: 0, y: 0, z: 0, w: 1 };

function physics(built) {
  const world = new R.World({ x: 0, y: 0, z: 0 }), body = world.createRigidBody(R.RigidBodyDesc.fixed());
  for (const contact of built.contacts) world.createCollider(R.ColliderDesc.trimesh(contact.vertices, contact.indices), body);
  world.step();
  return world;
}

test('forecourt and courtyard perimeter details stay bounded, finite, inside survey footprint and clear of all paths and trial lanes', () => {
  const built = buildFactoryForecourtDetail(FACTORY_PALETTE), world = physics(built);
  try {
    assert.ok(built.triangles > 400 && built.triangles < 4500, `triangles=${built.triangles}`);
    assert.equal(built.geometry.index.count / 3, built.triangles);
    assert.equal(built.lamps.length, 5);
    assert.equal(built.contacts.length, 9);
    assert.equal(built.contacts.concat(built.decorations).reduce((count, range) => count + range.indexCount, 0), built.geometry.index.count);

    for (const a of Object.values(built.geometry.attributes)) {
      for (const v of a.array) assert.ok(Number.isFinite(v));
    }

    // Test the actual surfaces, including the oblique guard spans, against all protected access volumes.
    const protectedBoxes = [
      new Box3(new Vector3(42, 0.13, -30.1), new Vector3(50, 2.4, -28.9)), // east entrance
      new Box3(new Vector3(44.5, 0.13, -31.5), new Vector3(45.5, 2.4, -30.5)), // north-east corner door
      ...FACTORY_STATIONS.map(s => new Box3(
        new Vector3(s.at[0] - 0.75, s.at[1] + 0.02, s.at[2] - 0.75),
        new Vector3(s.at[0] + 0.75, s.at[1] + 2.2, s.at[2] + 0.75),
      )),
      ...[0, FACTORY_LANE_OFFSET].flatMap(dx => FACTORY_COURSE_LOCAL.map(p => new Box3(
        new Vector3(p[0] + dx - 2.2, 0.12, p[2] - 2.2),
        new Vector3(p[0] + dx + 2.2, 3.2, p[2] + 2.2),
      ))),
    ];

    for (const [a, b] of FACTORY_WALK_EDGES) {
      const p = FACTORY_WALK_NODES[a], q = FACTORY_WALK_NODES[b];
      const steps = Math.ceil(Math.hypot(q[0] - p[0], q[2] - p[2]) / 0.4);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
        protectedBoxes.push(new Box3(new Vector3(x - 0.5, 0.13, z - 0.5), new Vector3(x + 0.5, 2.3, z + 0.5)));
      }
    }

    for (const area of protectedBoxes) {
      const half = area.getSize(new Vector3()).multiplyScalar(.5);
      const hit = world.intersectionWithShape(area.getCenter(new Vector3()), identity, new R.Cuboid(...half));
      assert.equal(hit, null, `foreground contact intersects protected passage ${JSON.stringify(area)}`);
    }
    for (const contact of built.contacts) {
      const points = new Box3();
      for (let i = 0; i < contact.vertices.length; i += 3) points.expandByPoint(new Vector3().fromArray(contact.vertices, i));
      const center = points.getCenter(new Vector3());
      if (center.x > 50) {
        const wx = center.x + FACTORY.origin[0], wz = center.z + FACTORY.origin[2];
        assert.ok(factoryPolygonDistance(wx, wz, FACTORY_FOOTPRINT) <= .1, `yard contact ${contact.id} outside factory apron`);
      }
    }
  } finally {
    world.free(); built.geometry.dispose();
  }
});


test('the courtyard rails, spare racks and wheel cradle reproduce the visible openings and contact faces', () => {
  const built = buildFactoryForecourtDetail(FACTORY_PALETTE), world = physics(built);
  const material = new MeshBasicMaterial(), mesh = new Mesh(built.geometry, material);
  const visible = (start, direction, range) => new Raycaster(start, direction, 0, range).intersectObject(mesh)[0];
  const open = (start, direction, range) => {
    assert.equal(visible(start, direction, range), undefined);
    assert.equal(world.castRay(new R.Ray(start, direction), range, true), null);
    assert.equal(world.castShape(start, identity, direction, new R.Ball(.025), 0, range, true), null);
  };
  const touches = (start, direction, range) => {
    const drawn = visible(start, direction, range), hit = world.castRay(new R.Ray(start, direction), range, true);
    assert.ok(drawn && hit, JSON.stringify({ start, direction }));
    assert.ok(Math.abs(drawn.distance - hit.timeOfImpact) < .001, JSON.stringify({ visual: drawn.distance, physical: hit.timeOfImpact }));
  };
  let openings = 0, surfaces = 0;
  try {
    for (const [[ax, az], [bx, bz]] of FACTORY_FORECOURT_GUARDS) {
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      const direction = new Vector3(-dz / length, 0, dx / length), steps = Math.max(2, Math.round(length / 4.2));
      const start = (t, height) => new Vector3(ax + dx * t, height, az + dz * t).addScaledVector(direction, -.38);
      for (let segment = 0; segment < steps; segment++) {
        const t = (segment + .5) / steps;
        open(start(t, .45), direction, .76); openings++;
        for (const h of [.19, .74, 1.2]) { touches(start(t, h), direction, .76); surfaces++; }
      }
      const guide = new R.Capsule(.48, .34);
      assert.ok(world.castShape(start(.5 / steps, .95).addScaledVector(direction, -.5), identity, direction, guide, 0, 1.4, true));
    }
    const north = new Vector3(0, 0, -1), down = new Vector3(0, -1, 0);
    for (const rackZ of FACTORY_FORECOURT_RACKS) {
      open(new Vector3(93.3, 1.94, rackZ + .9), north, 1.8); openings++;
      touches(new Vector3(93.3, 2.75, rackZ), down, .75); surfaces++;
      touches(new Vector3(92.45, 1.62, rackZ + .85), north, .8); surfaces++;
    }
    open(new Vector3(92.8, .91, 3), north, 1.6); openings++;
    touches(new Vector3(92.8 + .85, .62, 3), north, .8); surfaces++;
    console.log(JSON.stringify({ openings, surfaces, supplied: built.contacts.map(contact => contact.id) }));
  } finally { world.free(); built.geometry.dispose(); material.dispose(); }
});
