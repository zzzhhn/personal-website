import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, InstancedMesh, Mesh, Scene } from 'three';
import { collisionInventory } from '../../src/components/world/world-collision-inventory.ts';

test('colour-pass inventory counts material batches once and distinguishes inactive LODs and missing labels', () => {
  const scene = new Scene(), region = new Group(), decoration = new Group();
  region.name = 'trail';
  decoration.userData.collision = 'none';
  const rock = new Mesh(), sign = new Mesh(), lod = new InstancedMesh(undefined, undefined, 2);
  rock.userData.solid = true;
  lod.count = 0;
  scene.add(region); region.add(rock, lod, decoration); decoration.add(sign);
  const report = collisionInventory(scene, [rock, rock, lod, sign], [], []);
  assert.deepEqual(report.mounted, { meshes: 3, declared: 1, unclassified: 2, invalid: 0 });
  assert.deepEqual(report.submitted, { meshes: 2, declared: 1, unclassified: 1, invalid: 0 });
  assert.deepEqual(report.submittedGapsByRegion, { trail: 1 });
  assert.deepEqual(report.errors, []);
});

test('merged ranges must cover their geometry and name one active collider inside their own structure', () => {
  const scene = new Scene(), root = new Group(), other = new Group();
  const mesh = new Mesh(new BoxGeometry().toNonIndexed()), collider = new Group(), wrong = new Group();
  root.name = 'house'; collider.name = wrong.name = 'board';
  scene.add(root, other); root.add(mesh, collider); other.add(wrong);
  const p = { id: 'board', firstVertex: 0, vertexCount: mesh.geometry.attributes.position.count, collision: 'solid' };
  mesh.userData = { collision: 'solid', sources: [p] };
  const run = active => collisionInventory(scene, [mesh], active, ['house']);
  assert.deepEqual(run([collider, wrong]).errors, []);
  assert.ok(run([wrong]).errors.length);
  assert.ok(run([collider, collider]).errors.length);
  p.firstVertex++;
  assert.equal(run([collider]).submitted.invalid, 1);
  delete mesh.userData.sources;
  mesh.userData.collision = 'typo';
  assert.equal(run([collider]).mounted.invalid, 1);
});
