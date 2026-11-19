import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Group, Object3D, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { collisionInventory } from '../world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { coasterContactSources, coasterModelContact } from './coaster-model-contact.ts';
import { createCoasterStationCraft } from './coaster-station-craft-runtime.ts';
import { coasterStationContact, COASTER_STATION_WALLS } from './coaster-station-contact.ts';
import { COASTER_BOARDING, COASTER_TREAD_COLLIDER, advanceCoasterTransition,
  captureCoasterStart, createCoasterTransition } from './coaster-transition.ts';
import { coasterRidePose, coasterWorld } from './coaster-track.ts';
import { rideFootRouteClear } from '../rides/ride-clearance.ts';
import { coasterRailContactShapes, coasterRailSteelSources, coasterRunningRailSources, mergeRailContactShapes } from './coaster-rail-contact.ts';

const { scene: source } = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-station-craft-20261105/station.glb']);
const origin = coasterWorld([0,0,0]);
const ids = [COASTER_TREAD_COLLIDER, COASTER_STATION_WALLS];
await R.init();
test.after(() => disposeWorldCraftGltf(source));

function station(t) {
  const model = createCoasterStationCraft(source);
  const scope = new Group(); scope.name = 'coaster-station-architecture-contact'; scope.position.set(...origin);
  const scene = new Scene(); scene.add(scope); scope.add(model.root);
  const near = coasterContactSources(model.near, COASTER_STATION_WALLS, coasterStationContact);
  const far = coasterContactSources(model.far, COASTER_STATION_WALLS, coasterStationContact);
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const nodes = ids.map(id => {
    const shape = coasterModelContact(model.near, id, 1, near);
    const collider = world.createCollider(R.ColliderDesc.trimesh(shape.vertices, shape.indices).setTranslation(...origin));
    const node = new Object3D(); node.name = id; scope.add(node);
    return { id, node, collider, indices: shape.indices.length };
  });
  world.step(); scene.updateMatrixWorld(true);
  t.after(() => { world.free(); model.dispose(); });
  return { model, scene, scope, nodes, near, far, world };
}

const hit = (world, from, dir, predicate) => world.castRay(new R.Ray(from, dir), 10, true,
  undefined, undefined, undefined, undefined, predicate);

test('published station LODs retain their tread heights, contact footings, and doorway faces', t => {
  const { model, scene, scope, nodes, world, near, far } = station(t);
  assert.deepEqual(nodes.map(n => n.indices / 3), [504,28976]);
  const old = new R.World({ x: 0, y: 0, z: 0 }), s = createCoasterStructure(true);
  t.after(() => { old.free(); [s.steel,s.glow,s.railShadow,...Object.values(s.railCraft)].forEach(g => g?.dispose()); });
  for (const c of s.colliders) old.createCollider(coasterColliderDescriptor(R,c));
  old.step();
  assert.equal(s.colliders.filter(c => c.stationCraftFallback && c.boardingSupport).length, 7);
  for (const meshes of [near,far]) {
    model.setDetailed(meshes === near);
    const inventory = collisionInventory(scene, meshes, nodes.map(n => n.node), [scope.name]);
    assert.deepEqual(inventory.errors, []);
    assert.equal(inventory.mounted.declared, 15);
    assert.equal(inventory.registrations[scope.name], 2);
    const down = new Vector3(0,-1,0), inwards = new Vector3(0,0,-1);
    for (const step of [...COASTER_BOARDING.stairs, { position: COASTER_BOARDING.threshold.position, top: COASTER_BOARDING.floorY }]) {
      const from = new Vector3(step.position[0],step.top+.25,step.position[2]);
      const visible = new Raycaster(from,down,0,.45).intersectObjects(meshes)[0];
      const physical = hit(world,from,down,c => c.handle === nodes[0].collider.handle);
      assert.ok(visible && physical);
      assert.ok(Math.abs(.25 - visible.distance) < .001 && Math.abs(visible.distance - physical.timeOfImpact) < .001);
    }
    for (const [from,dir,legacy] of [
      [new Vector3(56.559,1.42,-141.5),inwards,null],
      [new Vector3(40.562,1.42,-149.5),inwards,null],
      [new Vector3(60.72,3.15,-143),inwards,2],
      [new Vector3(56.875,9.5,-151.5),down,1.1],
    ]) {
      const visible = new Raycaster(from,dir,0,10).intersectObjects(meshes)[0];
      const physical = hit(world,from,dir,c => c.handle === nodes[1].collider.handle);
      assert.ok(visible && physical);
      assert.ok(Math.abs(visible.distance - physical.timeOfImpact) < .002);
      const before = hit(old,from,dir);
      assert.ok(legacy === null ? before === null : Math.abs(before.timeOfImpact - legacy) < .002);
      if (before) assert.ok(Math.abs(before.timeOfImpact - physical.timeOfImpact) > .20);
    }
  }
});

test('the real stair shape keeps the walking aisle and guards an actual blocker on egress', t => {
  const { world, nodes } = station(t);
  const rail = createCoasterStructure(true);
  const { runningSteel, coatedSteel, jointSteel } = rail.railCraft;
  const running = coasterRailContactShapes(runningSteel,coasterRunningRailSources(runningSteel).cells);
  const steel = mergeRailContactShapes([coatedSteel,jointSteel].map(g => [g,coasterRailSteelSources(g).cells]));
  for (const cell of [...running,...steel]) {
    world.createCollider(R.ColliderDesc.trimesh(cell.vertices,cell.indices).setTranslation(...cell.at));
  }
  world.step();
  t.after(() => [rail.steel,rail.glow,rail.railShadow,...Object.values(rail.railCraft)].forEach(g => g?.dispose()));
  const from = [55.12766,1.078824,-152.43985];
  const pose = coasterRidePose(0), transition = createCoasterTransition(from,0,pose);
  captureCoasterStart(transition,from,0);
  const clear = (a,b,onStairs) => rideFootRouteClear(world,R,undefined,[a,b],c => !onStairs || c.handle !== nodes[0].collider.handle);
  const advance = () => advanceCoasterTransition(transition,1/60,false,pose,clear);
  for (let i=0; i<600 && transition.phase !== 'riding'; i++) advance();
  assert.equal(transition.phase,'riding');
  transition.skipRequested = true;
  transition.phase = 'stand'; transition.elapsed = 0;
  const block = world.createCollider(R.ColliderDesc.cuboid(.18,.68,.18).setTranslation(52.31,2.543,-152.446));
  world.step();
  for (let i=0; i<600 && !transition.blockedMotion; i++) advance();
  assert.ok(transition.blockedMotion);
  assert.equal(transition.phase,'step-out');
  world.removeCollider(block,false); world.step();
  for (let i=0; i<600 && transition.phase !== 'complete'; i++) advance();
  assert.equal(transition.phase,'complete');
  assert.deepEqual(transition.frame.root,COASTER_BOARDING.exit);
  const approach = new Vector3(50,1.9,-141.1);
  const dir = new Vector3(4,0,-4).normalize();
  assert.equal(world.castShape(approach,new Quaternion(),dir,new R.Capsule(.48,.34),0,4,true),null);
});
