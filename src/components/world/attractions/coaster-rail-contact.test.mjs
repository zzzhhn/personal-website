import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { collisionInventory } from '../world-collision-inventory.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterRailContactShapes, coasterRailFootingSources, coasterRailPartSources, coasterRailSteelSources,
  coasterRunningRailSources, mergeRailContactShapes } from './coaster-rail-contact.ts';
import { coasterFrame } from './coaster-track.ts';
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
  const sources = coasterRailFootingSources(geometry), cells = coasterRailContactShapes(geometry,sources.cells);
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

for (const near of [false,true]) test(`${near ? 'near' : 'far'} installed support tube preserves its open round corner`, t => {
  const geometry = createCoasterStructure(near);
  const { railCraft } = geometry;
  const world = new R.World({x:0,y:0,z:0}), old = new R.World({x:0,y:0,z:0});
  const material = new MeshBasicMaterial();
  t.after(() => {
    world.free(); old.free(); material.dispose();
    for (const g of [geometry.steel,geometry.glow,geometry.railShadow,...Object.values(railCraft)]) g?.dispose();
  });
  const sources = Object.entries(railCraft).filter(([key]) => key === 'coatedSteel' || key === 'jointSteel')
    .map(([key, g]) => ({ key, g, source: coasterRailPartSources(g,`coaster-rail-support-${key}`,part => part.name.startsWith('Bent')) }));
  const cells = sources.flatMap(({g,source}) => coasterRailContactShapes(g,source.cells));
  assert.ok(cells.length < geometry.colliders.filter(c => c.railSupportFallback).length);
  for (const {g,source} of sources) {
    assert.ok(source.ranges.every(range => range.id.startsWith('Bent')));
    assert.ok(source.ranges.reduce((n,range) => n+range.indexCount,0) < g.index.count,'track faces are a separate unclaimed range');
  }

  const member = thrillSupports(near)[0].beams[0], axis = member.b.clone().sub(member.a), length = axis.length();
  const rotate = new Quaternion().setFromUnitVectors(new Vector3(0,1,0),axis.normalize());
  const centre = member.a.clone().add(member.b).multiplyScalar(.5), radius = member.radius;
  old.createCollider(R.ColliderDesc.cuboid(radius,length/2,radius).setTranslation(...centre).setRotation(rotate));
  const {g,source} = sources[0], named = source.ranges.find(range => range.id === 'Bent0_Member0');
  const cell = source.cells.get(named.surfaceId), part = cell.parts.find(row => row.name === named.id);
  const [actual] = coasterRailContactShapes(g,new Map([[named.surfaceId,{...cell,parts:[part]}]]));
  world.createCollider(R.ColliderDesc.trimesh(actual.vertices,actual.indices).setTranslation(...actual.at));
  old.step(); world.step();
  const rendered = new Mesh(g,material);
  const local = p => new Vector3(...p).applyQuaternion(rotate).add(centre);
  const start = local([.9 * radius,-length/2 + 1.65,2 * radius]), toward = new Vector3(0,0,-1).applyQuaternion(rotate);
  const previous = cast(old,start,toward), hit = cast(world,start,toward);
  assert.ok(previous && hit && hit.timeOfImpact - previous.timeOfImpact > .25 * radius);
  const visible = new Raycaster(start,toward,0,3).intersectObject(rendered).find(row =>
    row.faceIndex * 3 >= named.firstIndex && row.faceIndex * 3 < named.firstIndex + named.indexCount);
  assert.ok(visible && Math.abs(visible.distance - hit.timeOfImpact) < .002);
  const corner = local([.86 * radius,length*.55,.86 * radius]);
  const down = new Vector3(0,-1,0).applyQuaternion(rotate);
  assert.ok(cast(old,corner,down));
  assert.equal(cast(world,corner,down),null);
  t.diagnostic(`${cells.length} steel cells, ${countTriangles(cells)} real triangles; former side hit early by ${(hit.timeOfImpact - previous.timeOfImpact).toFixed(3)} m`);
});

for (const near of [false,true]) test(`${near ? 'near' : 'far'} running rails retain all source indices, including below the boarding hall`, t => {
  const data = createCoasterStructure(near), original = data.railCraft.runningSteel;
  const source = coasterRunningRailSources(original);
  const { packet, transfer } = packCoasterStructure(data);
  const received = unpackCoasterStructure(structuredClone(packet, { transfer }));
  const geometry = received.railCraft.runningSteel, delivered = coasterRunningRailSources(geometry);
  assert.deepEqual(delivered.ranges, source.ranges);
  const cells = coasterRailContactShapes(geometry,delivered.cells);
  assert.equal(countTriangles(cells), geometry.index.count/3);
  assert.ok(cells.length > 10 && cells.length < 120);
  const world = new R.World({x:0,y:0,z:0}), old = new R.World({x:0,y:0,z:0});
  const scene = new Scene(), scope = new Group(); scope.name = 'coaster-running-rails-contact'; scene.add(scope);
  const material = new MeshBasicMaterial(), mesh = new Mesh(geometry,material); scope.add(mesh);
  mesh.userData.worldCollisionSources = delivered.ranges;
  t.after(() => {
    world.free(); old.free(); material.dispose();
    for (const value of [received,data]) for (const g of [value.steel,value.glow,value.railShadow,...Object.values(value.railCraft)]) g?.dispose();
  });
  const nodes = cells.map(cell => {
    world.createCollider(R.ColliderDesc.trimesh(cell.vertices,cell.indices).setTranslation(...cell.at));
    const node = new Object3D(); node.name = cell.id; scope.add(node); return node;
  });
  old.createCollider(R.ColliderDesc.trimesh(received.track.vertices,received.track.indices));
  world.step(); old.step(); scene.updateMatrixWorld(true);
  const inventory = collisionInventory(scene,[mesh],nodes,[scope.name]);
  assert.deepEqual(inventory.errors,[]);
  assert.equal(inventory.registrations[scope.name],cells.length);
  for (const u of [.0009,.014,.265,.752, .985]) {
    const frame = coasterFrame(u);
    for (const side of [-.78,.78]) {
      const origin = frame.point.clone().addScaledVector(frame.side,side).addScaledVector(frame.up,.55);
      const dir = frame.up.clone().negate(), physical = cast(world,origin,dir);
      const visible = new Raycaster(origin,dir,0,1).intersectObject(mesh)[0];
      assert.ok(visible && physical);
      assert.ok(Math.abs(physical.timeOfImpact - visible.distance) < .002);
      if (u === .0009) assert.equal(cast(old,origin,dir), null,'the former sample left both real station rails unrepresented');
    }
  }
  t.diagnostic(`${cells.length} active cells and ${countTriangles(cells)} rail triangles`);
});

for (const near of [false,true]) test(`${near ? 'near' : 'far'} coated and joint steel share named contact cells with the actual I-beam openings`, t => {
  const data = createCoasterStructure(near);
  const keys = ['coatedSteel','jointSteel'];
  const original = keys.map(key => coasterRailSteelSources(data.railCraft[key]));
  const { packet, transfer } = packCoasterStructure(data);
  const received = unpackCoasterStructure(structuredClone(packet,{ transfer }));
  const geometry = keys.map(key => received.railCraft[key]);
  const sources = geometry.map(coasterRailSteelSources);
  assert.deepEqual(sources.map(source => source.ranges), original.map(source => source.ranges));
  for (const [i,source] of sources.entries()) {
    assert.equal(source.ranges.reduce((total,range) => total + range.indexCount,0),geometry[i].index.count);
    assert.ok(source.ranges.some(range => range.id.startsWith('Spine_FoldedBox')));
    assert.ok(source.ranges.some(range => range.id.startsWith('Bent0_')));
  }
  const cells = mergeRailContactShapes(geometry.map((g,i) => [g,sources[i].cells]));
  assert.equal(countTriangles(cells),geometry.reduce((sum,g) => sum + g.index.count/3,0));
  assert.ok(cells.length < sources[0].cells.size + sources[1].cells.size,'shared steel surfaces use a single collider per cell');
  const r = new R.World({x:0,y:0,z:0}), material = new MeshBasicMaterial();
  const scene = new Scene(), scope = new Group(); scope.name = 'coaster-rail-steel-contact'; scene.add(scope);
  t.after(() => {
    r.free(); material.dispose();
    for (const value of [received,data]) for (const g of [value.steel,value.glow,value.railShadow,...Object.values(value.railCraft)]) g?.dispose();
  });
  const meshes = geometry.map((g,i) => {
    const mesh = new Mesh(g,material); mesh.name = keys[i]; scope.add(mesh);
    mesh.userData.worldCollisionSources = sources[i].ranges;
    return mesh;
  });
  const nodes = cells.map(cell => {
    r.createCollider(R.ColliderDesc.trimesh(cell.vertices,cell.indices).setTranslation(...cell.at));
    const node = new Object3D(); node.name = cell.id; scope.add(node); return node;
  });
  r.step(); scene.updateMatrixWorld(true);
  const inventory = collisionInventory(scene,meshes,nodes,[scope.name]);
  assert.deepEqual(inventory.errors,[]);
  assert.equal(inventory.registrations[scope.name],cells.length);

  const tie = received.railCraft.coatedSteel.userData.contactParts.find(part => part.name.endsWith('_ISection') && part.u > .98);
  assert.ok(tie);
  const frame = coasterFrame(tie.u), start = (up) => frame.point.clone().addScaledVector(frame.side,.55)
    .addScaledVector(frame.up,-.21+up).addScaledVector(frame.forward,-.18);
  for (const [up,expected] of [[0,.1475],[.08,.06],[-.08,.06]]) {
    const origin = start(up), physical = r.castRay(new R.Ray(origin,frame.forward),.26,true);
    const visible = new Raycaster(origin,frame.forward,0,.26).intersectObjects(meshes)[0];
    assert.ok(visible && physical, `the I-section has a visible and physical face at ${up}`);
    assert.ok(Math.abs(physical.timeOfImpact - visible.distance) < .002);
    assert.ok(Math.abs(physical.timeOfImpact - expected) < .002);
  }
  t.diagnostic(`${cells.length} shared steel cells, ${countTriangles(cells)} real triangles and an open I-section recess of 0.0875 m`);
});
