import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Scene, Group, Mesh, BoxGeometry, InstancedMesh,BatchedMesh,MeshBasicMaterial,Matrix4 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { surveyCollisionSources } from '../../src/components/world/world-collision-survey.ts';
import { collisionInventory } from '../../src/components/world/world-collision-inventory.ts';

test('on-demand source ledger preserves actual local instances, world poses, geometry and off-camera colliders',async()=>{
  await R.init();
  const scene=new Scene(),section=new Group(),world=new R.World({x:0,y:-9.8,z:0});
  const material=new MeshBasicMaterial(),g=new BoxGeometry();
  const instanced=new InstancedMesh(g,material,2);
  const batch=new BatchedMesh(3,100,150,material);
  section.name='wharf';section.position.set(6,2,-4);scene.add(section);
  instanced.name='posts';section.add(instanced);
  instanced.setMatrixAt(0,new Matrix4().makeTranslation(1,0,0));
  instanced.setMatrixAt(1,new Matrix4().makeTranslation(5,0,0));
  const geoId=batch.addGeometry(g);
  const first=batch.addInstance(geoId);batch.addInstance(geoId);batch.setMatrixAt(1,new Matrix4().makeTranslation(0,0,4));batch.deleteInstance(first);
  batch.name='boards';section.add(batch);
  const off=new Mesh(g,material);scene.add(off);off.name='outside';
  const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(6,2,-4));
  const physical=world.createCollider(R.ColliderDesc.cuboid(.35,.8,.4),body);
  const node=new Group();node.name='real-post';section.add(node);
  try{
    const survey=await surveyCollisionSources(scene,world,c=>c.handle===physical.handle?node:undefined,[instanced],'wharf');
    assert.equal(survey.meshes.length,2);
    const posts=survey.meshes.find(m=>m.path.endsWith('/posts')),boards=survey.meshes.find(m=>m.path.endsWith('/boards'));
    assert.deepEqual(posts.matrixWorld.slice(12,15),[6,2,-4]);
    assert.equal(posts.submitted,true);assert.equal(posts.declaration,null);
    assert.equal(posts.instances[1].localMatrix[12],5);
    assert.deepEqual(boards.batches.map(b=>b.slot),[1]);assert.equal(boards.batches[0].localMatrix[14],4);
    assert.equal(boards.submitted,false);
    assert.equal(survey.geometries[posts.geometry].positionBufferSha256,createHash('sha256').update(Buffer.from(g.attributes.position.array.buffer)).digest('hex'));
    assert.equal(survey.colliders.length,1);
    const [c]=survey.colliders;
    assert.equal(c.path,'/wharf/real-post');assert.equal(c.shape.type,'Cuboid');
    assert.ok(Math.abs(c.shape.halfExtents.x-.35)<1e-6);assert.deepEqual([c.translation.x,c.translation.y,c.translation.z],[6,2,-4]);
  }finally{world.free();g.dispose();material.dispose();batch.dispose();instanced.dispose();}
});

test('strict batch ranges validate native index spans, active slots and moving GPU poses', t => {
  const scene = new Scene(), root = new Group(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const mesh = new BatchedMesh(3, 48, 72, material);
  t.after(() => { mesh.dispose(); geometry.dispose(); material.dispose(); });
  root.name = 'batch-fixture'; scene.add(root); root.add(mesh);
  const near = mesh.addGeometry(geometry), far = mesh.addGeometry(geometry);
  const empty = mesh.addInstance(near), slot = mesh.addInstance(far);
  mesh.deleteInstance(empty);
  const expected = new Matrix4().makeTranslation(1, 0, 4);
  mesh.setMatrixAt(slot, expected);
  const range = (id, surfaces) => ({ id, firstIndex: 0, indexCount: 36, collision: 'pushable', surfaceIds: surfaces });
  const sources = { placements: [{ id: 'moving', slot, matrix: expected, geometryIds: [near, far], colliderPrefix: 'moving/' }],
    geometries: [{ id: near, ranges: [range('pair', ['a', 'b'])] }, { id: far, ranges: [range('coarse', ['a'])] }] };
  mesh.userData.worldCollisionBatchedInstances = sources;
  const nodes = ['moving/a', 'moving/b'].map(name => { const node = new Group(); node.name = name; root.add(node); return node; });
  const read = () => collisionInventory(scene, [mesh], nodes, [root.name]);
  assert.deepEqual(read().errors, []);
  assert.equal(read().registrations[root.name], 2);
  mesh.setGeometryIdAt(slot, near);
  mesh.setVisibleAt(slot, false);
  assert.equal(read().registrations[root.name], 2);
  expected.setPosition(2, 0, 4);
  assert.equal(read().mounted.invalid, 1);
  mesh.setMatrixAt(slot, expected);
  assert.deepEqual(read().errors, []);
  sources.geometries[0].ranges[0].firstIndex = 3;
  assert.equal(read().mounted.invalid, 1);
  sources.geometries[0].ranges[0].firstIndex = 0;
  const initial = mesh.geometry.index.getX(0);
  mesh.geometry.index.setX(0, mesh.getGeometryRangeAt(far).vertexStart);
  assert.equal(read().mounted.invalid, 1);
  mesh.geometry.index.setX(0, initial);
  sources.placements[0].slot = empty;
  assert.equal(read().mounted.invalid, 1);
});
