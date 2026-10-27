import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { coasterLookoutSolids, createLookoutRockGeometry, lookoutSolidCollider, lookoutSolidMatrix } from './coaster-lookout-sample.ts';

await R.init();
const hull = new Float32Array([-2,-2,-2, 2,-2,-2, -2,-2,2, -2,2,-2, 2,2,-2, -2,2,2]);
const rock = { position: [10,3,-8], rotation: [.08,.42,-.06], half: [2,2,2], hull };
const rotation = new Quaternion().setFromEuler(new Euler(...rock.rotation));
const toWorld = p => new Vector3(...p).applyQuaternion(rotation).add(new Vector3(...rock.position));

test('a player capsule can pass a cut-away rock corner but cannot enter the visible solid', () => {
  const world = new R.World({x:0,y:0,z:0});
  try {
    world.createCollider(coasterColliderDescriptor(R, rock)); world.step();
    const origin = toWorld([1.1,0,2.5]), direction = new Vector3(0,0,-1).applyQuaternion(rotation);
    const capsule = new R.Capsule(.48,.34);
    assert.equal(world.castShape(origin, rotation, direction, capsule, 0, 1.9, true), null);
    const solid = world.castShape(origin, rotation, direction, capsule, 0, 5, true);
    assert.ok(solid && solid.time_of_impact > 3 && solid.time_of_impact < 3.3);
    // A conservative cuboid would wrongly block the same visibly open corner.
    const boxWorld = new R.World({x:0,y:0,z:0});
    try {
      boxWorld.createCollider(coasterColliderDescriptor(R, {...rock,hull:undefined})); boxWorld.step();
      const falseWall = boxWorld.castShape(origin, rotation, direction, capsule, 0, 1.9, true);
      assert.ok(falseWall && falseWall.time_of_impact < .2);
    } finally { boxWorld.free(); }
  } finally { world.free(); }
});

test('rotated physical hull contact agrees with the visible convex faces', () => {
  const world = new R.World({x:0,y:0,z:0});
  const points = Array.from({length:hull.length/3}, (_,i) => new Vector3(...hull.slice(i*3,i*3+3)));
  const mesh = new Mesh(new ConvexGeometry(points), new MeshBasicMaterial());
  mesh.position.set(...rock.position); mesh.quaternion.copy(rotation); mesh.updateMatrixWorld();
  try {
    world.createCollider(coasterColliderDescriptor(R, rock)); world.step();
    for (const localOrigin of [[6,0,0],[0,6,0],[0,0,6],[-6,0,0],[0,-6,0],[0,0,-6]]) {
      const origin = toWorld(localOrigin), direction = toWorld([-.5,0,-.5]).sub(origin).normalize();
      const visible = new Raycaster(origin,direction,0,20).intersectObject(mesh)[0];
      const physical = world.castRay(new R.Ray(origin,direction),20,true);
      assert.ok(visible && physical);
      assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.002, `${visible.distance} vs ${physical.timeOfImpact}`);
    }
  } finally { world.free(); mesh.geometry.dispose(); mesh.material.dispose(); }
});

test('each authored lookout rock has physical contact at its visible world-space surface', () => {
  for (const solid of coasterLookoutSolids().filter(s => s.hull)) {
    const world = new R.World({x:0,y:0,z:0});
    const mesh = new Mesh(createLookoutRockGeometry(solid), new MeshBasicMaterial());
    mesh.applyMatrix4(lookoutSolidMatrix(solid)); mesh.updateMatrixWorld();
    try {
      world.createCollider(coasterColliderDescriptor(R, lookoutSolidCollider(solid))); world.step();
      const centroid = new Vector3();
      const p = mesh.geometry.attributes.position;
      for (let i=0;i<p.count;i++) centroid.add(new Vector3().fromBufferAttribute(p,i));
      centroid.divideScalar(p.count).applyMatrix4(mesh.matrixWorld);
      for (const axis of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const direction = new Vector3(...axis).negate(), origin = centroid.clone().addScaledVector(direction,-30);
        const visible = new Raycaster(origin,direction,0,60).intersectObject(mesh)[0];
        const physical = world.castRay(new R.Ray(origin,direction),60,true);
        assert.ok(visible && physical, `${solid.id}: missing contact from ${axis}`);
        assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.003, `${solid.id}: visible/physical face mismatch`);
      }
    } finally { world.free(); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
});
