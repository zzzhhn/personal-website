import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { loadShippedDraco } from '../alpha-mine-tests/shipped-draco.mjs';
import { buildPortalFrame } from '../../../src/components/world/WorldEntry.tsx';
import { createPortalThreshold, PORTAL_FRAME_YAW } from '../../../src/components/world/WorldPortalSurface.ts';
import { WORLD_PORTALS, portalCrossing } from '../../../src/components/world/world-portals.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../../../src/components/world/actor-physics.ts';
import { disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

await R.init();
test('all five walking portals have physical stone, an open crossing and a shared visible two-way ramp', async t => {
  const gltf = await loadShippedDraco(new URL('../../../public/assets/world/entry/G28.glb', import.meta.url));
  const batches = buildPortalFrame(gltf), threshold = createPortalThreshold();
  const material = new MeshBasicMaterial({side: DoubleSide});
  t.after(() => { disposeWorldCraftGltf(gltf.scene); material.dispose(); threshold.dispose();
    for (const b of batches) { b.high.dispose(); b.low.dispose(); b.material.dispose(); } });
  for (const level of ['high','low']) {
    const ranges = batches.flatMap(b => b.sources[level]);
    assert.equal(new Set(ranges.map(r=>r.id)).size,30);
    for (const b of batches) assert.equal(b.sources[level].reduce((n, r) => n+r.indexCount, 0),b[level].index.count);
  }
  for (const site of WORLD_PORTALS) {
    const world = new R.World({x:0,y:0,z:0}), up = new Vector3(0,1,0);
    t.after(() => world.free());
    const root = new Group(); root.position.fromArray(site.position); root.rotation.y = site.yaw;
    const visual = new Group(); visual.rotation.y = PORTAL_FRAME_YAW; root.add(visual);
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...site.position).setRotation(root.quaternion));
    const deck = world.createCollider(R.ColliderDesc.trimesh(threshold.vertices, threshold.indices),body);
    const frames = batches.map(b => {
      visual.add(new Mesh(b.high, material));
      return world.createCollider(R.ColliderDesc.trimesh(b.positions,b.indices).setRotation(visual.quaternion),body);
    });
    root.updateMatrixWorld(true); world.step();
    const worldPoint = (x,y,z) => new Vector3(x,y,z).applyMatrix4(root.matrixWorld);
    const norm = new Vector3(0,0,1).applyQuaternion(root.quaternion), reverse = norm.clone().negate();
    // Sample both feet, multiple ring stones, the upper arc and the actual empty centre.
    let stoneHits = 0, openRays = 0;
    for (const height of [.22,.75,1.2,1.65,2.5,2.95,3.15]) for (const x of [-1.48,-1.32,-.7,0,.7,1.32,1.48]) {
      const start = worldPoint(x,height,1.5), ray = new R.Ray(start,reverse);
      const physics = frames.map(c=>c.castRay(ray,3,true)).filter(d=>d>=0).sort((a,b)=>a-b)[0];
      const drawn = new Raycaster(start,reverse,0,3).intersectObject(visual)[0];
      if (!drawn) { assert.equal(physics,undefined); openRays++; continue; }
      assert.ok(physics !== undefined && Math.abs(physics-drawn.distance)<.0002, site.id+' stone at '+x+','+height);
      // Previously the threshold was the only physical mesh at this site.
      if (height > .56) assert.equal(deck.castRay(ray,3,true),-1);
      stoneHits++;
    }
    assert.ok(stoneHits>18 && openRays>6);
    for (const sign of [-1,1]) for (const x of [-.18,0,.18,1.4]) {
      const start = worldPoint(x,.55+PLAYER_RADIUS+PLAYER_HALF_HEIGHT+.01,sign);
      const end = worldPoint(x,.55+PLAYER_RADIUS+PLAYER_HALF_HEIGHT+.01,-sign);
      const passing = Math.abs(x)<1;
      assert.equal(portalCrossing(site,start.toArray(),end.toArray()),passing);
      const hit = world.castShape(start,new Quaternion(),norm.clone().multiplyScalar(-sign),
        new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),0,2,true,undefined,undefined,undefined,undefined,c=>c.handle!==deck.handle);
      assert.equal(hit===null,passing,site.id+' capsule x='+x+' direction='+sign);
    }
    for (const z of [-2.3,-1.5,-.4,0,.4,1.5,2.3]) {
      const start = worldPoint(0,2,z), distance=deck.castRay(new R.Ray(start,up.clone().negate()),3,true);
      const mesh = new Mesh(threshold.geometry,material); mesh.matrixWorld.copy(root.matrixWorld);
      const expected = new Raycaster(start,up.clone().negate(),0,3).intersectObject(mesh)[0];
      assert.ok(expected && distance>=0 && Math.abs(distance-expected.distance)<.0002,site.id+' ramp '+z);
    }
    t.diagnostic(site.id+' stone='+stoneHits+' open='+openRays+' capsule=8 ramp=7');
  }
});
