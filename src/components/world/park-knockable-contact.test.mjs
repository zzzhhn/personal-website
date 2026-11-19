import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { RAIL, LAMP, buildWalk } from './WorldParkWalk.tsx';
import { collisionInventory, collisionInstancePartId } from './world-collision-inventory.ts';

await R.init();
const up = new Vector3(0, 1, 0);
const materials = new MeshBasicMaterial({ side: DoubleSide });
const { rails, lamps } = buildWalk();
const candidates = (geometry, range) => {
  const position = geometry.getAttribute('position');
  return Array.from({ length: range.vertexCount }, (_, i) => new Vector3().fromBufferAttribute(position, i + range.firstVertex).toArray().join(','));
};

test('park knockable source ranges cover every generated triangle and preserve named members at both levels of detail', () => {
  assert.equal(rails.length, 42);
  assert.equal(lamps.length, 9);
  for (const [asset, renderCounts, members] of [[RAIL, [156, 36], [13, 3]], [LAMP, [766, 146], [4, 4]]]) {
    const { contact } = asset;
    for (const [i, [geometry, ranges]] of [[asset.geometry, contact.near], [asset.far, contact.far]].entries()) {
      let next = 0;
      for (const range of ranges) {
        assert.equal(range.firstVertex, next, range.id);
        next += range.vertexCount;
        if (range.collision === 'pushable') assert.ok(contact.hulls.some(hull => hull.id === range.id), range.id);
      }
      assert.equal(next, geometry.getAttribute('position').count);
      assert.equal(next / 3, renderCounts[i]);
      assert.equal(ranges.filter(range => range.collision === 'pushable').length, members[i]);
    }
    for (const hull of contact.hulls) {
      const range = contact.near.find(range => range.id === hull.id);
      assert.equal(range?.collision, 'pushable');
      const rendered = new Set(candidates(asset.geometry, range));
      const physical = new Set(Array.from({ length: hull.points.length / 3 }, (_, i) => hull.points.slice(3 * i, 3 * i + 3).join(',')));
      assert.deepEqual(physical, rendered, hull.id);
    }
  }
  assert.equal(LAMP.contact.near.find(range => range.id === 'hatch').collision, 'none');
  assert.ok(LAMP.contact.hulls.every((part, index) => part.points === LAMP.hulls[index]));
});

test('all placed P03 sections preserve timber contact and actual openings in Rapier', () => {
  let rayError = 0;
  for (const rail of rails) {
    const world = new R.World({ x: 0, y: 0, z: 0 });
    try {
      const origin = new Vector3(...rail.position);
      const rotation = new Quaternion().setFromAxisAngle(up, rail.yaw);
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...rail.position).setRotation(rotation));
      const totalWeight = RAIL.contact.hulls.reduce((sum, hull) => sum + hull.weight, 0);
      for (const hull of RAIL.contact.hulls) {
        world.createCollider(R.ColliderDesc.convexHull(hull.points).setMass(RAIL.spec.mass * hull.weight / totalWeight), body);
      }
      body.sleep(); world.step();
      assert.equal(body.numColliders(), 13);
      assert.ok(Math.abs(body.mass() - 40) < .001 && body.isSleeping());
      const visual = new Mesh(RAIL.geometry, materials);
      visual.position.copy(origin); visual.quaternion.copy(rotation); visual.updateMatrixWorld();
      const shoot = (x, y, z) => {
        const start = new Vector3(x, y, z).applyQuaternion(rotation).add(origin);
        const dir = new Vector3(-Math.sign(x), 0, 0).applyQuaternion(rotation);
        const hit = world.castRay(new R.Ray(start, dir), 1.7, true);
        const drawn = new Raycaster(start, dir, 0, 1.7).intersectObject(visual)[0];
        assert.equal(Boolean(hit), Boolean(drawn), `${rail.id} at ${x}, ${y}, ${z}`);
        if (hit) rayError = Math.max(rayError, Math.abs(hit.timeOfImpact - drawn.distance));
        return Boolean(hit);
      };
      for (const side of [-.8, .8]) {
        for (const h of [.2, .5, .935]) assert.ok(shoot(side, h, 0));
        for (const h of [.095, .35, .72, 1.05]) assert.equal(shoot(side, h, 0), false);
        for (const z of [-.94, .94]) assert.ok(shoot(side, .72, z));
      }
    } finally { world.free(); }
  }
  assert.ok(rayError < .00025, `Largest physical-to-visual difference: ${rayError} m`);
});

test('strict inventory connects compacted near, far and hidden proxy to unique collider parts per dynamic instance', () => {
  const scene = new Scene(), root = new Group(), bodies = [];
  root.name = 'test-knockables'; scene.add(root);
  const placements = ['one', 'two'].map((id, i) => ({ id, matrix: new Matrix4().makeTranslation(i + 5, 2, 1),
    surfaceIds: RAIL.contact.hulls.map(hull => collisionInstancePartId(id, hull.id)) }));
  for (const p of placements) {
    const body = new Group(); body.name = p.id; body.userData.worldCollisionInstance = p.id; root.add(body);
    for (const hull of RAIL.contact.hulls) {
      const collider = new Group(); collider.name = hull.id; body.add(collider); bodies.push(collider);
    }
  }
  const meshOf = (geometry, ranges, slots) => {
    const mesh = new InstancedMesh(geometry, materials, slots.length);
    root.add(mesh);
    slots.forEach((i, slot) => mesh.setMatrixAt(slot, placements[i].matrix));
    mesh.userData = { worldCollision: 'pushable', worldCollisionSources: ranges, worldCollisionInstances: { placements, slots } };
    return mesh;
  };
  const proxy = meshOf(RAIL.geometry, RAIL.contact.near, [0, 1]); proxy.visible = false;
  const near = meshOf(RAIL.geometry, RAIL.contact.near, [1]);
  const far = meshOf(RAIL.far, RAIL.contact.far, [0]);
  const inspect = () => collisionInventory(scene, [near, far], bodies, [root.name]);
  assert.deepEqual(inspect().errors, []);
  assert.deepEqual(inspect().registrations, { [root.name]: 26 });
  assert.equal(inspect().submitted.declared, 2);
  near.userData.worldCollisionInstances.slots[0] = 0;
  assert.equal(inspect().mounted.invalid, 1);
  near.userData.worldCollisionInstances.slots[0] = 1;
  bodies.push(bodies[0]);
  assert.ok(inspect().errors.some(error => error.endsWith('one:post-negative')));
});
