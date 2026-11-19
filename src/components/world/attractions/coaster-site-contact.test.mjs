import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { BufferAttribute, BufferGeometry, Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { collisionInventory } from '../world-collision-inventory.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { COASTER_CLIFF_WALK } from './coaster-landscape-cliffs.ts';
import { packCoasterStructure, unpackCoasterStructure } from './coaster-structure-transfer.ts';
import { coasterFrame, coasterWorld, COASTER_TUNNEL } from './coaster-track.ts';

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
  const pavingAndFences = ranges.filter(source => /^coaster-(forecourt-paving|station-apron|gate-walk|perimeter-)/.test(source.id));
  for (const source of pavingAndFences) {
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
  t.diagnostic(`${pavingAndFences.length} installed paving or perimeter sources, ${relief.vertexCount/3} relief triangles, former fence hit ${(maximumFenceGap * 1000).toFixed(1)} mm too early`);

  const support = new R.World({x:0,y:0,z:0}), obstacles = new R.World({x:0,y:0,z:0});
  t.after(() => { support.free(); obstacles.free(); });
  const lookout = received.colliders.filter(c => /^coaster-(workshop-apron|cliff-|lookout-|island-)/.test(c.sourceId ?? ''));
  for (const c of lookout) {
    assert.ok(ranges.some(r => r.surfaceId === c.sourceId));
    (c.surface ? support : obstacles).createCollider(coasterColliderDescriptor(R,c));
  }
  const groupedRockRanges = ranges.filter(source => source.id.includes('-layer-'));
  assert.ok(groupedRockRanges.length > 120);
  assert.equal(new Set(groupedRockRanges.map(source => source.surfaceId)).size,44,'real colour cuts share the original rock shape');
  support.step(); obstacles.step();
  const capsule = new R.Capsule(.55,.34), identity = new Quaternion(), down = new Vector3(0,-1,0);
  for (let i = 1; i < COASTER_CLIFF_WALK.length; i++) {
    const a = new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i-1])), b = new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i]));
    for (let j = 0; j <= 20; j++) {
      const feet = a.clone().lerp(b,j/20), from = feet.clone().add(new Vector3(0,.4,0));
      const hit = support.castRay(new R.Ray(from,down),.7,true);
      assert.ok(hit && Math.abs(.4-hit.timeOfImpact) < .055,`lookout floor ${i}:${j} follows the intended walk`);
      assert.equal(obstacles.intersectionWithShape(feet.add(new Vector3(0,.97,0)),identity,capsule),null,
        `actual capsule retains clearance on lookout leg ${i}:${j}`);
    }
  }
  const compare = (sourceId, offset, direction, minimumGap) => {
    const c = received.colliders.find(c => c.sourceId === sourceId);
    assert.ok(c.mesh);
    const rotation = new Quaternion().setFromEuler(new Euler(...(c.rotation ?? [0,0,0])));
    const origin = new Vector3(...offset).applyQuaternion(rotation).add(new Vector3(...c.position));
    direction = direction.clone().applyQuaternion(rotation);
    const ray = new R.Ray(origin,direction);
    const before = new R.World({x:0,y:0,z:0}), after = new R.World({x:0,y:0,z:0});
    const visible = drawRange(ranges.find(s => s.id === sourceId));
    try {
      before.createCollider(coasterColliderDescriptor(R,{...c,mesh:undefined}));
      after.createCollider(coasterColliderDescriptor(R,c));
      before.step(); after.step();
      const old = before.castRay(ray,9,true), actual = after.castRay(ray,9,true);
      const first = new Raycaster(origin,direction,0,9).intersectObject(new Mesh(visible,material))[0];
      assert.ok(old && actual && first);
      assert.ok(actual.timeOfImpact-old.timeOfImpact > minimumGap,sourceId);
      assert.ok(Math.abs(first.distance-actual.timeOfImpact) < .002,sourceId);
      return +((actual.timeOfImpact-old.timeOfImpact)*1000).toFixed(1);
    } finally { before.free(); after.free(); visible.dispose(); }
  };
  const pier = lookout.find(c => c.sourceId === 'coaster-cliff-pier-3-0');
  const pierGap = compare(pier.sourceId,[.57,pier.half[1]+1,0],down,.10);
  const lampGap = compare('coaster-forecourt-lamp-0-base',[.53,1.2,0],down,.04);
  const houseGap = compare('coaster-helix-house',[6,0,0],new Vector3(-1,0,0),.05);
  const infieldGap = compare('coaster-infield-lamp-0-post',[.065,0,.4],new Vector3(0,0,-1),.07);
  const tower = received.colliders.find(c => c.sourceId === 'coaster-lift-tower-member-0');
  const towerGap = compare(tower.sourceId,[.52,-tower.half[1]+2,1.2],new Vector3(0,0,-1),.16);
  const tunnel = received.colliders.find(c => c.sourceId === 'coaster-return-tunnel');
  const tunnelSources = ranges.filter(r => r.surfaceId === tunnel.sourceId);
  assert.equal(tunnel.mesh.indices.length,tunnelSources.reduce((n,r)=>n+r.vertexCount,0));
  const tunnelWorld = new R.World({x:0,y:0,z:0}); t.after(() => tunnelWorld.free());
  tunnelWorld.createCollider(coasterColliderDescriptor(R,tunnel)); tunnelWorld.step();
  let tunnelHits = 0, tunnelGaps = 0;
  for (const f of [.18,.46,.75]) {
    const frame = coasterFrame(COASTER_TUNNEL.start + f*(COASTER_TUNNEL.end-COASTER_TUNNEL.start));
    const origin = frame.point.clone().addScaledVector(frame.up,1.55);
    for (const direction of [frame.side,frame.side.clone().negate(),frame.up]) {
      const hit = tunnelWorld.castRay(new R.Ray(origin,direction),6,true);
      const visible = new Raycaster(origin,direction,0,6).intersectObject(site).find(row => tunnelSources.some(r =>
        row.faceIndex*3 >= r.firstVertex && row.faceIndex*3 < r.firstVertex+r.vertexCount));
      assert.equal(Boolean(hit),Boolean(visible),`published tunnel preserves its actual surface or opening at ${f}`);
      if (hit) {
        assert.ok(hit.timeOfImpact > 1.6 && Math.abs(hit.timeOfImpact - visible.distance) < .002);
        tunnelHits++;
      } else tunnelGaps++;
    }
  }
  assert.ok(tunnelHits >= 6);
  t.diagnostic(JSON.stringify({lookoutContacts:lookout.length,walkStations:84,
    formerEarlyHitMm:{pier:pierGap,lamp:lampGap,helixHouse:houseGap,infieldPost:infieldGap,liftTower:towerGap},
    tunnelTriangles:tunnel.mesh.indices.length/3,tunnelHits,tunnelGaps}));
});
