import test from 'node:test';
import assert from 'node:assert/strict';
import '../../../tools/world/alpha-mine-tests/register.mjs';
const {northTrees:points} = await import('./WorldStreetTrees.tsx');
import { attractionRoadDistance, attractionCapeDistance, ibdFootprintDistance } from './attractions/attraction-layout.ts';

test('all authored northern tree trunks clear the actual approach asphalt and shoulders',()=>{
  assert.equal(points.length,18,'relocate individual conflicts, retaining the planted tree count');
  for(const [x,,z]of points)assert.ok(attractionRoadDistance(x,z)>=5.3,`tree overlaps approach at ${x},${z}`);
});

test('three former in-lane trunks move to nearby dry ground while retaining their instance indices',()=>{
  const changes=[{index:2,old:[-24,1,-132],next:[-29,1,-125]},
    {index:4,old:[-52,1,-139],next:[-52,1,-132]},
    {index:5,old:[-70,1,-139],next:[-70,1,-132]}];
  const evidence=[];
  for(const {index,old,next}of changes){
    assert.deepEqual(points[index],next);
    const before=attractionRoadDistance(old[0],old[2]),after=attractionRoadDistance(next[0],next[2]);
    assert.ok(before<3.2,'must reproduce an old asphalt obstruction');
    assert.ok(after>5.3);
    assert.ok(attractionCapeDistance(next[0],next[2])<-5,'keep moved roots well inside the headland');
    assert.ok(ibdFootprintDistance(next[0],next[2])>2,'do not transfer an obstruction into the yard');
    assert.ok(Math.hypot(next[0]-old[0],next[2]-old[2])<9,'bounded local relocation');
    evidence.push({index,old,next,before:+before.toFixed(6),after:+after.toFixed(6)});
  }
  console.log(JSON.stringify({northernTrees:points.length,moved:evidence}));
});

test('both shipped tree families preserve bark contact and classify each near/far crown at every placement', async t => {
  const { loadShippedDraco } = await import('../../../tools/world/alpha-mine-tests/shipped-draco.mjs');
  const { disposeWorldCraftGltf } = await import('./world-craft-gltf-test.mjs');
  const { buildStreetTrees } = await import('./WorldStreetTrees.tsx');
  const { Matrix4, Mesh, Raycaster, Vector3 } = await import('three');
  const R = (await import('@dimforge/rapier3d-compat')).default;
  await R.init();
  for (const variant of ['street','nature-craft']) {
    const files = await Promise.all(['ST1','ST2'].map(id => loadShippedDraco(
      new URL('../../../public/assets/world/' + variant + '/' + id + '.glb', import.meta.url))));
    const built = buildStreetTrees(files, variant === 'nature-craft');
    const world = new R.World({ x:0, y:0, z:0 });
    t.after(() => { world.free(); built.clean.forEach(dispose => dispose()); files.forEach(g => disposeWorldCraftGltf(g.scene)); });
    const contact = new Map(built.colliders.map(c => [c.key, world.createCollider(R.ColliderDesc.trimesh(c.pos, c.idx))]));
    world.step();
    let pairs = 0, previousFarDisplacement = 0, previousFarMisses = 0;
    for (const [kind, family] of built.families.entries()) {
      const previousFar = files[kind].scene.getObjectByName('L1-trunk').clone();
      const lods = built.meshes.slice(2*kind, 2*kind+2);
      for (const lod of lods) {
        const ranges = lod.userData.worldCollisionSources;
        assert.deepEqual(ranges.map(r => r.collision).sort(), variant === 'street' ? ['soft','soft','soft','solid'] : ['soft','solid']);
        assert.equal(ranges.reduce((n,r) => n+r.vertexCount, 0), lod.geometry.attributes.position.count);
        assert.deepEqual(lod.userData.worldCollisionInstances.placements.map(p=>p.id), family.map(p=>p.id));
      }
      for (const placement of family) {
        const {matrix, p, surfaceIds} = placement;
        const col = contact.get(surfaceIds[0]);
        assert.ok(col, surfaceIds[0]);
        previousFar.matrixAutoUpdate = false;
        previousFar.matrix.copy(new Matrix4().multiplyMatrices(matrix, files[kind].scene.getObjectByName('L1-trunk').matrixWorld));
        previousFar.updateMatrixWorld(true);
        for (const lod of lods) {
          const visual = new Mesh(lod.geometry, lod.material);
          visual.matrixAutoUpdate = false; visual.matrix.copy(matrix); visual.updateMatrixWorld(true);
          const bark = lod.userData.worldCollisionSources.find(r=>r.collision === 'solid');
          for (const h of [.5, 1.25]) for (const a of [0, .9, 2.7]) {
            const direction = new Vector3(-Math.cos(a),0,-Math.sin(a)), origin = p.clone().addScaledVector(direction,-2);
            origin.y += h;
            const ray = new Raycaster(origin, direction, 0, 4);
            const hit = ray.intersectObject(visual).find(i => i.faceIndex*3 >= bark.firstVertex && i.faceIndex*3 < bark.firstVertex+bark.vertexCount);
            const physics = col.castRay(new R.Ray(origin, direction), 4, true);
            assert.ok(hit && physics >= 0, placement.id + ' missing bark');
            assert.ok(Math.abs(hit.distance - physics) < .0002, placement.id + ' mismatched shape');
            if (lod === lods[1]) {
              const old = ray.intersectObject(previousFar)[0];
              if (!old) previousFarMisses++;
              else previousFarDisplacement = Math.max(previousFarDisplacement, Math.abs(physics-old.distance));
            }
            pairs++;
          }
        }
      }
    }
    assert.ok(previousFarDisplacement > .005);
    t.diagnostic(variant + ' placements=' + contact.size + ' near/far ray pairs=' + pairs
      + ' old far max=' + previousFarDisplacement.toFixed(4) + ' m, old missing=' + previousFarMisses);
  }
});
