import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Group, Mesh, MeshBasicMaterial, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { collisionInventory } from '../world-collision-inventory.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterRailFootingShapes, coasterRailFootingSources } from './coaster-rail-contact.ts';
import { coasterSupportBase, thrillSupports } from './coaster-thrill-supports.ts';
import { packCoasterStructure, unpackCoasterStructure } from './coaster-structure-transfer.ts';

await R.init();
const cast = (world, from, dir) => world.castRay(new R.Ray(from,dir), 8,true);
const countTriangles = cells => cells.reduce((total, cell) => total + cell.indices.length / 3, 0);

for (const near of [false,true]) test(`${near ? 'near' : 'far'} rail footing cells use the actual indexed faces, including across the worker`, t => {
  const data = createCoasterStructure(near);
  const original = data.railCraft.concrete;
  const ranges = coasterRailFootingSources(original);
  const { packet, transfer } = packCoasterStructure(data);
  const received = unpackCoasterStructure(structuredClone(packet, { transfer }));
  const geometry = received.railCraft.concrete;
  const sources = coasterRailFootingSources(geometry), cells = coasterRailFootingShapes(geometry,sources.cells);
  assert.deepEqual(sources.ranges,ranges.ranges);
  assert.equal(countTriangles(cells),geometry.index.count/3);
  assert.equal(cells.length,near ? 39 : 32);
  assert.equal(data.colliders.filter(c => c.railFootingFallback).length,near ? 124 : 72);
  const world = new R.World({x:0,y:0,z:0}), old = new R.World({x:0,y:0,z:0});
  const scene = new Scene(), scope = new Group(); scope.name = 'coaster-rail-footings-contact'; scene.add(scope);
  const material = new MeshBasicMaterial(), mesh = new Mesh(geometry,material); scope.add(mesh);
  mesh.userData.worldCollisionSources = sources.ranges;
  t.after(() => {
    world.free(); old.free(); material.dispose();
    for (const value of [received,data]) for (const g of [value.steel,value.glow,value.railShadow,...Object.values(value.railCraft)]) g?.dispose();
  });
  const nodes = cells.map(cell => {
    world.createCollider(R.ColliderDesc.trimesh(cell.vertices,cell.indices).setTranslation(...cell.at));
    const node = new Object3D(); node.name = cell.id; scope.add(node);
    return node;
  });
  for (const c of data.colliders.filter(c => c.railFootingFallback)) {
    old.createCollider(R.ColliderDesc.cuboid(...c.half).setTranslation(...c.position));
  }
  world.step(); old.step(); scene.updateMatrixWorld(true);
  const inventory = collisionInventory(scene,[mesh],nodes,[scope.name]);
  assert.deepEqual(inventory.errors,[]);
  assert.equal(inventory.registrations[scope.name],cells.length);
  const down = new Vector3(0,-1,0);
  const support = thrillSupports(near).find(row => [row.a,row.b].some(p => p.z > -182 && p.z < -140));
  const p = [support.a,support.b].find(p => p.z > -182 && p.z < -140);
  const y = coasterSupportBase(p.x,p.z), corner = new Vector3(p.x+1.235,y+1.55,p.z+1.235);
  assert.ok(cast(old,corner,down),'former box blocked the bevelled corner');
  assert.equal(cast(world,corner,down),null);
  assert.equal(new Raycaster(corner,down,0,6).intersectObject(mesh).length,0);
  for (const [dx,dz] of [[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]]) {
    const origin = new Vector3(p.x+dx,y+1.55,p.z+dz), physical = cast(world,origin,down);
    const visible = new Raycaster(origin,down,0,6).intersectObject(mesh)[0];
    assert.ok(physical && visible);
    assert.ok(Math.abs(physical.timeOfImpact - visible.distance) < .002);
  }
  t.diagnostic(`${cells.length} cells; ${countTriangles(cells)} actual triangles; probe near ${p.x.toFixed(3)},${p.z.toFixed(3)}`);
});
