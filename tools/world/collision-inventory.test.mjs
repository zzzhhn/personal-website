import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, InstancedMesh, Mesh, Scene } from 'three';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../src/components/world/world-craft-gltf-test.mjs';
import { collisionInventory } from '../../src/components/world/world-collision-inventory.ts';

test('colour-pass inventory counts material batches once and distinguishes inactive LODs and missing labels', () => {
  const scene = new Scene(), region = new Group(), decoration = new Group();
  region.name = 'trail';
  decoration.userData.worldCollision = 'none';
  const rock = new Mesh(), sign = new Mesh(), lod = new InstancedMesh(undefined, undefined, 2);
  rock.userData.solid = true;
  lod.count = 0;
  scene.add(region); region.add(rock, lod, decoration); decoration.add(sign);
  const report = collisionInventory(scene, [rock, rock, lod, sign], [], []);
  assert.deepEqual(report.mounted, { meshes: 3, declared: 1, unclassified: 2, invalid: 0 });
  assert.deepEqual(report.submitted, { meshes: 2, declared: 1, unclassified: 1, invalid: 0 });
  assert.deepEqual(report.submittedGapsByRegion, { trail: 1 });
  assert.deepEqual(report.mountedGapsByRegion, { trail: 2 });
  assert.deepEqual(report.errors, []);
});

test('merged ranges must cover their geometry and name one active collider inside their own structure', () => {
  const scene = new Scene(), root = new Group(), other = new Group();
  const mesh = new Mesh(new BoxGeometry().toNonIndexed()), collider = new Group(), wrong = new Group();
  root.name = 'house'; collider.name = wrong.name = 'board';
  scene.add(root, other); root.add(mesh, collider); other.add(wrong);
  const p = { id: 'board', firstVertex: 0, vertexCount: mesh.geometry.attributes.position.count, collision: 'solid' };
  mesh.userData = { worldCollision: 'solid', worldCollisionSources: [p] };
  const run = active => collisionInventory(scene, [mesh], active, ['house']);
  assert.deepEqual(run([collider, wrong]).errors, []);
  assert.ok(run([wrong]).errors.length);
  assert.ok(run([collider, collider]).errors.length);
  p.firstVertex++;
  assert.equal(run([collider]).submitted.invalid, 1);
  delete mesh.userData.worldCollisionSources;
  mesh.userData.worldCollision = 'typo';
  assert.equal(run([collider]).mounted.invalid, 1);
});

test('shipping camp GLB keeps artist prose separate from the enforceable runtime contract', async () => {
  const gltf = await readWorldCraftGltf(['public/assets/world/facility-craft/camp/camp-facilities-v1.glb']);
  const scene = new Scene(), lamp = gltf.scene.getObjectByName('C16'), guitar = gltf.scene.getObjectByName('C12');
  try {
    assert.match(lamp.userData.collision, /desk/);
    assert.match(guitar.userData.collision, /pushable/);
    scene.add(gltf.scene);
    const raw = collisionInventory(scene, [], [], []);
    assert.equal(raw.mounted.invalid, 0);
    assert.equal(raw.mounted.declared, 0);
    lamp.userData.worldCollision = 'none';
    const declared = collisionInventory(scene, [], [], []);
    assert.ok(declared.mounted.declared > 0);
    assert.ok(declared.mounted.unclassified > 0);
    guitar.userData.worldCollision = 'pushabel';
    assert.ok(collisionInventory(scene, [], [], []).errors.some(e => e.includes('C12')));
  } finally { disposeWorldCraftGltf(gltf.scene); }
});

test('explicit pieces can share one aggregate collider but cannot borrow a duplicate or absent one', () => {
  const scene = new Scene(), root = new Group(), collider = new Group(), visual = new Mesh();
  root.name = 'hall'; collider.name = 'shell'; scene.add(root); root.add(visual, collider);
  visual.userData = { worldCollision: 'solid', surfaceId: 'shell', worldCollisionSharedSurface: true };
  root.add(visual.clone());
  const report = active => collisionInventory(scene, [], active, ['hall']);
  assert.deepEqual(report([collider]).registrations, { hall: 1 });
  assert.deepEqual(report([collider]).errors, []);
  assert.ok(report([]).errors.length);
  assert.ok(report([collider,collider]).errors.length);
  visual.userData.worldCollisionSharedSurface = false;
  assert.ok(report([collider]).errors.length);
});

test('indexed material batches cover every referenced triangle in index space', () => {
  const scene = new Scene(), mesh = new Mesh(new BoxGeometry()), root = new Group(), collider = new Group();
  scene.add(root); root.name = 'town'; root.add(mesh,collider); collider.name = 'desk';
  const source = { id: 'case', collision: 'solid', surfaceId: 'desk', firstIndex:0, indexCount: mesh.geometry.index.count };
  mesh.userData.worldCollisionSources = [source];
  const run = () => collisionInventory(scene, [mesh],[collider],['town']);
  assert.deepEqual(run().errors, []);
  source.indexCount -= 3;
  assert.equal(run().submitted.invalid,1);
  source.indexCount += 3; source.firstVertex = 0;
  assert.equal(run().submitted.invalid,1);
});

test('a partially migrated batch reports its gaps and remains ineligible for strict coverage', () => {
  const scene = new Scene(), root = new Group(), model = new Mesh(new BoxGeometry()), wall = new Group();
  root.name='street'; wall.name='reader'; scene.add(root);root.add(model,wall);
  const source={id:'panel',collision:'solid',surfaceId:'reader',firstIndex:3,indexCount:3};
  model.userData={worldCollisionPartial:true,worldCollisionSources:[source]};
  const sample = strict => collisionInventory(scene,[model],[wall],strict?['street']:[]);
  assert.equal(sample(false).submitted.unclassified,1);
  assert.deepEqual(sample(false).errors,[]);
  assert.ok(sample(true).errors.some(e=>e.includes('unclassified')));
  model.userData.worldCollisionSources.push({...source,id:'overlap'});
  assert.equal(sample(false).submitted.invalid,1);
});

test('a venue can share an earlier approach collider only while its exact registered node exists',()=>{
  const scene=new Scene(),venue=new Group(),road=new Group(),other=new Group();
  venue.name='venue';road.name='approach';scene.add(venue,road,other);
  const skin=new Mesh(),lane=new Mesh(),supply=new Group(),impostor=new Group();
  skin.userData=lane.userData={worldCollision:'solid',surfaceId:'walk'};
  venue.add(skin);road.add(lane,supply);other.add(impostor);supply.name=impostor.name='walk';
  const roots=['venue','approach'],bindings=[{root:'venue',collider:supply}];
  const read=(active,held=[],external=bindings)=>collisionInventory(scene,[skin,lane],active,roots,held,external);
  assert.deepEqual(read([supply]).registrations,{venue:1,approach:1});
  assert.deepEqual(read([supply]).errors,[]);
  assert.deepEqual(read([],[supply]).registrations,{venue:0,approach:0});
  assert.ok(read([]).errors.some(s=>s.startsWith('venue: expected one unique collider')));
  assert.ok(read([impostor]).errors.some(s=>s.startsWith('venue: expected one unique collider')));
  assert.ok(read([supply],[],[]).errors.some(s=>s.startsWith('venue: expected one unique collider')));
  assert.ok(read([supply,impostor],[],[...bindings,{root:'venue',collider:impostor}]).errors.some(s=>s.startsWith('venue: expected one unique collider')));
});

test('a complete scene requires active contact owners and audits the dormant visual roots separately', () => {
  const scene = new Scene(), ride = new Group(), rail = new Mesh(), road = new Group(), walk = new Group();
  ride.name = 'remote-ride';
  walk.name = 'approach-walk';
  rail.userData = {worldCollision:'solid',surfaceId:walk.name};
  scene.add(ride, road);
  ride.add(rail);
  road.add(walk);
  const shared = [{root:ride.name,collider:walk}];
  const run = (bodies, distant, supplies=shared) => collisionInventory(scene, [rail], bodies, [], [], supplies, distant);
  const remote = run([walk], [ride]);
  assert.deepEqual(remote.errors, []);
  assert.deepEqual(remote.distantPhysicalMeshesByRoot, {'remote-ride':1});
  assert.ok(run([walk], []).errors.some(text=>text.includes('physical mesh outside')));
  assert.ok(run([], [ride]).errors.some(text=>text.includes('missing shared collider')));
  assert.ok(run([], [ride], [{root:ride.name,collider:null,missingId:walk.name}]).errors.length);
  const stray = new Group();
  stray.name = walk.name;
  road.add(stray);
  assert.ok(run([walk,stray], [ride]).errors.some(text=>text.includes('collider outside')));
  delete rail.userData.surfaceId;
  assert.ok(run([walk], [ride]).errors.some(text=>text.includes('unnamed physical source')));
});
