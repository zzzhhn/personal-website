import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { yearPillar, lampGeometry } from '../../../src/components/world/WorldStreetAssets.ts';
import { BUILDINGS_V4, ROAD_Y } from '../../../src/components/world/layout-v4-flag.ts';
import { StreetBatch } from '../../../src/components/world/WorldStreetBatch.ts';
import { yearPillarSources } from '../../../src/components/world/street-year-collision.ts';
import { collisionInventory } from '../../../src/components/world/world-collision-inventory.ts';

await R.init();
const cell = [0,0,1,1], up = new Vector3(0,1,0), material = new MeshBasicMaterial();
const quat = new Quaternion().setFromAxisAngle(up, Math.PI / 2);
const from = new Vector3(.75,.54,0), forward = new Vector3(-1,0,0);

for (const level of [0,1]) test(`year pillar L${level} partitions keep the original lighting and plaque index arrays`, () => {
  const source = yearPillar(level, cell);
  const old = lampGeometry({ height: 2.3, arm: 0, cyanRing: true, lod: level });
  // Only the lamp has been partitioned. Its original geometry is still the batch prefix.
  for (const key of ['pos','idx','nrm','col','mat','suv']) assert.deepEqual(source[key].slice(0, old[key].length), old[key]);
  const parts = yearPillarSources(source, 'year-fixture', level);
  assert.equal(parts.reduce((n, part) => n + part.indexCount, 0), source.idx.length);
  assert.ok(parts.every((part, i) => !i || part.firstIndex === parts[i-1].firstIndex + parts[i-1].indexCount));
  assert.deepEqual(parts.flatMap(part => part.surfaceId ? [part.surfaceId.split('/').at(-1)] : []), ['footing','base','shaft','cap','head','date-frame']);
});

test('all six date lights use their own two LOD source ranges and one body pose after motion', t => {
  const configs = BUILDINGS_V4.map(({id, position, size}, i) => ({
    id: 'year-' + id, anchor: new Vector3(position[0] + size[0] / 2 + 5, ROAD_Y + .01, position[2]),
    builders: [yearPillar(0, [i/8,0,1/8,.5]), yearPillar(1, [i/8,0,1/8,.5])],
  }));
  const batches = configs.map(({id, builders}) => ({ id, L0: builders[0].build(), L1: builders[1].build(), lodNear: 28, far: 135 }));
  const batch = new StreetBatch('street-year', batches, configs.map(() => 1), material);
  const world = new R.World({x:0,y:0,z:0}), scene = new Scene(), group = new Object3D();
  group.name = 'street-year-group'; group.add(batch.mesh); scene.add(group);
  t.after(() => { batch.dispose(); world.free(); });
  const nodes = [], sources = [], reused = new Set();
  let worstDiff = 0, smallestOverhang = Infinity;
  for (const [i, { id, anchor, builders }] of configs.entries()) {
    const pose = new Matrix4().compose(anchor, quat, new Vector3(1,1,1));
    const instance = batch.add(i, pose);
    for (const lod of [0,1]) {
      const { indexStart, indexCount } = batch.geometryRange(i,lod), ranges = yearPillarSources(builders[lod],id,lod);
      assert.equal(ranges.reduce((sum, r) => sum+r.indexCount,0),indexCount);
      sources.push(...ranges.map(part => ({...part, firstIndex:part.firstIndex+indexStart})));
    }
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...anchor).setRotation(quat));
    const hulls = builders[0].hulls(), names = yearPillarSources(builders[0], id, 0).flatMap(source => source.surfaceId ? [source.surfaceId] : []);
    assert.equal(hulls.length,names.length);
    const colliders = hulls.map((points, i) => {
      const node = new Object3D(); node.name = names[i]; group.add(node); nodes.push(node);
      assert.equal(reused.has(node.name),false); reused.add(node.name);
      return world.createCollider(R.ColliderDesc.convexHull(points),body);
    });
    world.step();
    const ray = new R.Ray(from.clone().applyMatrix4(pose), forward.clone().applyQuaternion(quat));
    const rendered = new Mesh(batches[i].L0, material);
    rendered.matrixAutoUpdate = false; rendered.matrix.copy(pose); rendered.updateMatrixWorld(true);
    const visualDistance = new Raycaster(ray.origin,ray.dir,0,1).intersectObject(rendered)[0].distance;
    const hits = colliders.map(c => c.castRay(ray,1,true)).filter(toi => toi >= 0);
    const actual = Math.min(...hits);
    const oldToi = .75 - .2; // legacy vertical prism's support on the local X axis
    assert.ok(actual - oldToi > .08, `${id}: the raised skirt no longer blocks empty air`);
    smallestOverhang = Math.min(smallestOverhang, actual-oldToi);
    worstDiff = Math.max(worstDiff,Math.abs(actual-visualDistance));
    assert.ok(Math.abs(actual-visualDistance) < .02, `${id}: neck near visible profile`);
    const camera = new PerspectiveCamera();
    camera.position.copy(anchor).add(new Vector3(10,3,0)); batch.update(camera);
    assert.equal(batch.mesh.getGeometryIdAt(instance), i*2);
    camera.position.copy(anchor).add(new Vector3(55,3,0)); batch.update(camera);
    assert.equal(batch.mesh.getGeometryIdAt(instance), i*2+1);
    body.setLinvel({x:.8,y:0,z:0},true); body.setAngvel({x:.7,y:0,z:1.1},true);
    for (let frame = 0; frame < 12; frame++) world.step();
    const p = body.translation(), q = body.rotation();
    const live = new Matrix4().compose(new Vector3(p.x,p.y,p.z), new Quaternion(q.x,q.y,q.z,q.w), new Vector3(1,1,1));
    batch.setMatrix(instance,live);
    const gpu = new Matrix4(); batch.mesh.getMatrixAt(instance,gpu);
    assert.ok(gpu.elements.every((value, k) => Math.abs(value - live.elements[k]) < .00001));
    assert.ok(Math.abs(gpu.elements[12] - anchor.x) > .1);
  }
  batch.mesh.userData.worldCollisionSources = sources;
  const inventory = collisionInventory(scene, [batch.mesh], nodes, ['street-year-group']);
  assert.deepEqual(inventory.errors, []);
  assert.equal(inventory.registrations['street-year-group'], 36);
  t.diagnostic(`Six G11 instances, removed ${smallestOverhang.toFixed(3)} m of empty skirt; maximum visible/hull neck delta ${worstDiff.toFixed(3)} m`);
});
