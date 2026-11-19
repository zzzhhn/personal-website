import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Group, Object3D, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { collisionInventory } from '../world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
import { COASTER_GATE_LEAVES, coasterGateAngle } from './coaster-access.ts';
import { coasterModelContact } from './coaster-model-contact.ts';

const { scene: source } = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-gate-craft-20261105/coaster-gate.glb']);
const model = source.getObjectByName('GateLeaf');
await R.init();
test.after(() => disposeWorldCraftGltf(source));

function makeGate(t, old = false) {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => world.free());
  const scene = new Scene();
  const root = new Group(); root.name = 'coaster-gate-leaves'; scene.add(root);
  const leaves = COASTER_GATE_LEAVES.map((layout, i) => {
    const hinge = new Group(), leaf = model.clone(true);
    root.add(hinge); hinge.add(leaf); hinge.position.set(...layout.hinge);
    const name = `coaster-gate-leaf-${i + 1}`;
    const contact = coasterModelContact(leaf, name, -layout.side);
    leaf.scale.x = -layout.side;
    const node = new Object3D(); node.name = name; hinge.add(node);
    const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...layout.hinge));
    const shape = old ? R.ColliderDesc.cuboid(...layout.half).setTranslation(...layout.centre)
      : R.ColliderDesc.trimesh(contact.vertices, contact.indices);
    const collider = world.createCollider(shape, body);
    const meshes = [];
    leaf.traverse(o => { if (o.isMesh) meshes.push(o); });
    return { layout, hinge, body, collider, node, meshes, contact };
  });
  function pose(progress) {
    leaves.forEach(({ layout, hinge, body }) => {
      hinge.rotation.y = coasterGateAngle(layout.side, progress);
      body.setNextKinematicRotation(hinge.quaternion);
    });
    world.step(); scene.updateMatrixWorld(true);
  }
  pose(0);
  return { world, scene, root, leaves, pose };
}

const forward = new Vector3(0, 0, -1), up = new Quaternion();
const cast = (world, origin, radius, dir = forward) => world.castShape(origin, up, dir, new R.Ball(radius), 0, 3, true);

test('the closed solid leaves retain player clearance limits without filling the visible picket hole', t => {
  const old = makeGate(t, true);
  const gate = makeGate(t);
  const hole = new Vector3(45.69, 3.35, -137.7), picket = new Vector3(45.46, 3.35, -137.7);
  assert.ok(cast(old.world, hole, .065));
  assert.equal(cast(gate.world, hole, .065), null);
  assert.ok(cast(gate.world, picket, .065));
  for (const x of [45.69, 49.8, 50, 52.17, 54.31]) for (const z of [-137.7, -140.3]) {
    const origin = new Vector3(x, 1.90, z), direction = new Vector3(0, 0, -Math.sign(z + 139));
    assert.ok(gate.world.castShape(origin, up, direction, new R.Capsule(.48, .34), 0, 3, true), `closed capsule at ${x},${z}`);
  }
  gate.pose(1);
  assert.equal(gate.world.castShape(new Vector3(50, 1.90, -137.7), up, forward, new R.Capsule(.48, .34), 0, 4, true), null);
});

test('both moving leaves derive all material ranges and first contact from the same mirrored source', t => {
  const { scene, world, leaves, pose, root } = makeGate(t);
  const meshes = leaves.flatMap(row => row.meshes);
  for (const leaf of leaves) {
    assert.equal(leaf.meshes.length, 4);
    assert.equal(leaf.contact.indices.length, leaf.meshes.reduce((total, m) => total + m.geometry.index.count, 0));
    assert.equal(leaf.collider.shapeType(), R.ShapeType.TriMesh);
  }
  const inventory = collisionInventory(scene, meshes, leaves.map(leaf => leaf.node), [root.name]);
  assert.deepEqual(inventory.errors, []);
  assert.equal(inventory.registrations[root.name], 2);
  assert.equal(inventory.mounted.declared, 8);
  for (const progress of [0, .34, .72, 1]) {
    pose(progress);
    for (const { layout, hinge, meshes, collider } of leaves) {
      for (const sign of [-1, 1]) {
        const from = hinge.localToWorld(new Vector3(-layout.side * 1.38, 2.3, sign * .75));
        const direction = new Vector3(0, 0, -sign).applyQuaternion(hinge.quaternion);
        const vis = new Raycaster(from, direction, 0, 2).intersectObjects(meshes)[0];
        const hit = world.castRay(new R.Ray(from, direction), 2, true, undefined, undefined, undefined, undefined, c => c.handle === collider.handle);
        assert.ok(vis && hit);
        assert.ok(Math.abs(vis.distance - hit.timeOfImpact) < .001, `first position at ${progress}/${layout.side}/${sign}`);
        const opening = hinge.localToWorld(new Vector3(-layout.side * .69, 2.35, sign * .75));
        assert.equal(new Raycaster(opening, direction, 0, 1.5).intersectObjects(meshes).length, 0);
        assert.equal(world.castShape(opening, up, direction, new R.Ball(.065), 0, 1.5, true,
          undefined, undefined, undefined, undefined, c => c.handle === collider.handle), null);
      }
    }
  }
});

test('the static gate keeps the real stone returns and recessed mortar gaps', t => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), old = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => { world.free(); old.free(); });
  const scene = new Scene(), gate = source.getObjectByName('GateStatic').clone(true);
  const scope = new Group(); scope.name = 'coaster-gate-portal-contact'; scene.add(scope); scope.add(gate);
  scope.position.set(50, 1, -139); scene.updateMatrixWorld(true);
  const contact = coasterModelContact(gate, 'coaster-gate-portal');
  const node = new Object3D(); node.name = 'coaster-gate-portal'; scope.add(node);
  world.createCollider(R.ColliderDesc.trimesh(contact.vertices, contact.indices).setTranslation(50, 1, -139));
  for (const x of [44.2,55.8]) old.createCollider(R.ColliderDesc.cuboid(.8,3.3,.9).setTranslation(x,4.3,-139));
  old.createCollider(R.ColliderDesc.cuboid(6.6,.65,1).setTranslation(50,7.4,-139));
  world.step(); old.step();
  const meshes = [];
  gate.traverse(node => { if (node.isMesh) meshes.push(node); });
  const inventory = collisionInventory(scene, meshes, [node], [scope.name]);
  assert.deepEqual(inventory.errors, []);
  assert.equal(inventory.registrations[scope.name], 1);
  assert.equal(inventory.mounted.declared, 5);
  for (const sign of [-1, 1]) {
    const dir = new Vector3(0,0,-sign), z = -139 + sign * 2;
    const origin = new Vector3(56.575,3.25,z);
    const visual = new Raycaster(origin,dir,0,4).intersectObjects(meshes)[0];
    const first = world.castRay(new R.Ray(origin,dir),4,true);
    const former = old.castRay(new R.Ray(origin,dir),4,true);
    assert.ok(visual && first && former);
    assert.ok(Math.abs(visual.distance - first.timeOfImpact) < .001);
    assert.ok(first.timeOfImpact - former.timeOfImpact > .20);
    const recess = new Vector3(56.575,3.3,z);
    assert.ok(old.castRay(new R.Ray(recess,dir),4,true));
    assert.equal(world.castRay(new R.Ray(recess,dir),4,true), null);
  }
  assert.equal(world.castShape(new Vector3(50, 1.9, -137.4), up, forward, new R.Capsule(.48,.34), 0, 4, true), null);
});
