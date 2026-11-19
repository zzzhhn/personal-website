import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { BufferAttribute, BufferGeometry, Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { collisionInventory } from '../world-collision-inventory.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { packCoasterStructure, unpackCoasterStructure } from './coaster-structure-transfer.ts';

await R.init();

for (const near of [false,true]) test(`${near ? 'near' : 'far'} courtyard and fence contacts come from the mixed site's actual placed ranges`, t => {
  const data = createCoasterStructure(near);
  const expected = data.steel.userData.siteContactRanges;
  const { packet, transfer } = packCoasterStructure(data);
  const received = unpackCoasterStructure(structuredClone(packet,{ transfer }));
  const ranges = received.steel.userData.siteContactRanges, position = received.steel.getAttribute('position');
  assert.deepEqual(ranges,expected);
  assert.ok(ranges.reduce((total, range) => total + range.vertexCount,0) < position.count,'untreated site sources remain visible to the inventory');
  const material = new MeshBasicMaterial(), site = new Mesh(received.steel,material), scene = new Scene();
  site.userData = { worldCollisionSources: ranges, worldCollisionPartial: true };
  scene.add(site);
  const inventory = collisionInventory(scene,[site],[],[]);
  assert.equal(inventory.mounted.unclassified,1);
  assert.deepEqual(inventory.errors,[]);
  t.after(() => {
    material.dispose();
    for (const value of [data,received]) [value.glow,value.steel,value.railShadow,...Object.values(value.railCraft)].forEach(g => g?.dispose());
  });

  const drawRange = range => new BufferGeometry().setAttribute('position',new BufferAttribute(
    position.array.subarray(range.firstVertex * 3,(range.firstVertex + range.vertexCount) * 3),3));
  const land = received.relief, relief = ranges.at(-1);
  assert.equal(relief.id,'coaster-relief-surface');
  assert.equal(relief.vertexCount,land.indices.length);
  for (const [i,id] of land.indices.entries()) for (let axis = 0; axis < 3; axis++) {
    assert.equal(position.array[3 * (relief.firstVertex + i) + axis],land.vertices[3 * id + axis]);
  }

  let maximumFenceGap = 0;
  for (const source of ranges.slice(0,-1)) {
    assert.equal(source.id,source.surfaceId);
    const info = received.colliders.find(c => c.sourceId === source.id);
    assert.ok(info,`${source.id} has no matching physical descriptor`);
    const shape = drawRange(source), mesh = new Mesh(shape,material);
    const world = new R.World({x:0,y:0,z:0});
    const legacy = new R.World({x:0,y:0,z:0});
    try {
      world.createCollider(coasterColliderDescriptor(R,info));
      legacy.createCollider(coasterColliderDescriptor(R,{ ...info, mesh: undefined }));
      world.step(); legacy.step();
      const q = new Quaternion().setFromEuler(new Euler(...(info.rotation ?? [0,0,0])));
      const origin = new Vector3(...(info.surface ? [0,1,0] : [0,.052,.3])).applyQuaternion(q).add(new Vector3(...info.position));
      const direction = new Vector3(...(info.surface ? [0,-1,0] : [0,0,-1])).applyQuaternion(q);
      const expected = new Raycaster(origin,direction,0,2).intersectObject(mesh)[0];
      const ray = new R.Ray(origin,direction), hit = world.castRay(ray,2,true);
      const old = legacy.castRay(ray,2,true);
      assert.ok(expected && hit && old,`${source.id} should intersect all three shapes`);
      assert.ok(Math.abs(expected.distance - hit.timeOfImpact) < .002,
        `${source.id} visible ${expected.distance} physical ${hit.timeOfImpact} old ${old.timeOfImpact}`);
      if (info.surface) assert.ok(Math.abs(old.timeOfImpact - hit.timeOfImpact) < .002);
      else {
        assert.ok(info.mesh && hit.timeOfImpact - old.timeOfImpact > .01,source.id);
        maximumFenceGap = Math.max(maximumFenceGap,hit.timeOfImpact - old.timeOfImpact);
      }
    } finally { world.free(); legacy.free(); shape.dispose(); }
  }
  t.diagnostic(`${ranges.length - 1} installed paving or perimeter sources, ${relief.vertexCount/3} relief triangles, former fence hit ${(maximumFenceGap * 1000).toFixed(1)} mm too early`);
});
