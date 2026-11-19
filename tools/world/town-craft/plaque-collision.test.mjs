import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShippedDraco } from '../alpha-mine-tests/shipped-draco.mjs';
import { Matrix4, Quaternion, Raycaster, Vector3, DoubleSide } from 'three';
import R from '@dimforge/rapier3d-compat';
import { buildTownAssets } from '../../../src/components/world/WorldTownAssets.tsx';
import { BUILDINGS } from '../../../src/components/world/layout.ts';
import { townSurfaceCollision } from '../../../src/components/world/town-surface-collision.ts';
import { townThresholdCollision } from '../../../src/components/world/town-threshold-collision.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../../../src/components/world/actor-physics.ts';
import { playerSupport } from '../../../src/components/world/player-ground.ts';

async function loadTownAsset(id) {
  const { scene } = await loadShippedDraco(new URL(`../../../public/assets/world/town-craft/${id}.glb`, import.meta.url));
  scene.updateMatrixWorld(true);
  return scene;
}
const scene = await loadTownAsset('T09');
const model = scene.getObjectByName('T09_body'), oldHull = scene.getObjectByName('col_plaque');
await R.init();

const assets = ['T01','T02','T03','T04','T05','T06','T07','T09','T10','T11','T12'];
const scenes = await Promise.all(assets.map(loadTownAsset));
const town = buildTownAssets(scenes.map(scene => ({scene})), []);
test.after(() => town.dispose());

test('all six town plaques match contact to their shipped Draco triangles instead of the empty volume under the board', t => {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => world.free());
  let largestError = 0;
  for (const { id, position: [x, y, z], size: [width] } of BUILDINGS) {
    const origin = new Vector3(x + width / 2 + 3, y + .13, z + 2.7);
    const placement = new Matrix4().makeTranslation(...origin);
    const parts = [];
    model.traverse(o => {
      if (o.isMesh) parts.push(o.geometry.clone().applyMatrix4(placement.clone().multiply(o.matrixWorld)));
    });
    assert.equal(parts.length, 5, id);
    const collision = townSurfaceCollision(parts);
    assert.equal(collision.indices.length, parts.reduce((n, part) => n + part.index.count, 0));
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    const collider = world.createCollider(R.ColliderDesc.trimesh(collision.vertices, collision.indices), body);
    const legacy = oldHull.geometry.clone().applyMatrix4(placement.clone().multiply(oldHull.matrixWorld));
    const proxy = world.createCollider(R.ColliderDesc.convexHull(legacy.attributes.position.array), body);
    world.step();
    const visual = model.clone(true);
    visual.position.add(origin);
    visual.updateMatrixWorld(true);
    for (const [offset, expected] of [[.44, false], [.1,true], [1.3,true]]) {
      const start = origin.clone().add(new Vector3(.8, offset, 0)), direction = new Vector3(-1, 0, 0);
      const ray = new R.Ray(start, direction);
      const oldToi = proxy.castRay(ray, 1, true), actual = collider.castRay(ray, 1, true);
      const rendered = new Raycaster(start, direction, 0, 1).intersectObject(visual, true)[0];
      assert.ok(oldToi >= 0, `${id}: baseline hull claims all three heights`);
      if (!expected) { assert.equal(actual, -1, `${id}: the opening is clear`); assert.equal(rendered, undefined); continue; }
      assert.ok(rendered && actual >= 0, `${id}: panel/base contact`);
      const error = Math.abs(actual - rendered.distance);
      largestError = Math.max(largestError, error);
      assert.ok(error < .0001, `${id}: render and physics differ by ${error} m`);
    }
    // The hidden volume was large enough to snag a small moving prop.
    const point = origin.clone().add(new Vector3(.8, .44, 0));
    const shape = new R.Ball(.025), rotation = {x:0,y:0,z:0,w:1}, velocity = {x:-1,y:0,z:0};
    const filter = c => c.handle === collider.handle;
    assert.equal(world.castShape(point, rotation, velocity, shape, 0, 1, true, undefined, undefined, undefined, undefined, filter), null);
    world.removeRigidBody(body);
    legacy.dispose(); parts.forEach(part => part.dispose());
  }
  t.diagnostic(`Six T09 placements, max ray separation ${largestError.toFixed(7)} m`);
});

const approach = [[4.1,2.4],[3.85,0],[4.3,0],[3,2.6],[2.7,0],[3.72,0]];
for (const [slot, { id, position, size }] of BUILDINGS.entries()) {
  test(`${id}: shipped stone threshold matches physical footing and preserves the open approach`, async t => {
    const asset = 'T0' + (slot + 1), scene = await loadTownAsset(asset);
    const root = scene.getObjectByName(asset), world = new R.World({ x: 0, y: -12.5, z: 0 });
    t.after(() => world.free());
    const placement = new Matrix4().makeTranslation(...position), [x,y,z] = position;
    const place = mesh => mesh.geometry.clone().applyMatrix4(placement.clone().multiply(mesh.matrixWorld));
    const visible = root.getObjectByName(asset + '_body');
    let stone;
    visible.traverse(mesh => { if (mesh.isMesh && mesh.material.name === 'town_stone_dark') stone = place(mesh); });
    assert.ok(stone);
    const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
    const legacy = root.getObjectByName(slot ? 'col_floor' : 'col_portico_floor');
    const legacyData = place(legacy);
    const legacyCollider = world.createCollider(R.ColliderDesc.convexHull(legacyData.attributes.position.array), fixed);
    const source = townThresholdCollision(stone, legacyData.attributes.position.array, y);
    const record = town.bodies.find(body => body.name === 'building-' + id);
    assert.ok(record?.threshold);
    const threshold = world.createCollider(R.ColliderDesc.convexHull(record.threshold), fixed);
    world.createCollider(R.ColliderDesc.trimesh(record.surface.vertices,record.surface.indices),fixed);
    world.step();
    const cap = new Vector3(x + approach[slot][0], y + .6, z + approach[slot][1]);
    const down = new Vector3(0,-1,0), stepRay = new R.Ray(cap, down);
    const oldHit = legacyCollider.castRay(stepRay, .7, true), newHit = threshold.castRay(stepRay, .7, true);
    assert.ok(oldHit > 0 && newHit > 0, `${id}: solid forecourt`);
    assert.ok(Math.abs(newHit - oldHit) < .002, `${id}: preserves live top surface y`);
    const originalIndex = stone.index.array;
    for (const range of source.ranges) {
      assert.ok(range.count > 0 && range.count % 3 === 0);
      for (let i = range.first; i < range.first + range.count; i++) {
        const height = stone.attributes.position.getY(originalIndex[i]);
        assert.ok(height >= y - .002 && height <= y + .152);
      }
    }
    // Cast above the real tread: the reachable portico, lobby setback or arcade remains clear.
    const capsule = new R.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
    const [approachX, pathZ] = approach[slot], from = { x: x + size[0] / 2 + .65, y: y + .195 + PLAYER_HALF_HEIGHT + PLAYER_RADIUS, z: z + pathZ };
    const velocity = { x:x + approachX - from.x, y:0, z:0 }, rotation = { x:0,y:0,z:0,w:1 };
    const hit = world.castShape(from, rotation, velocity, capsule, 0, 1, true, undefined, undefined, undefined, undefined,
      collider => collider.handle !== legacyCollider.handle);
    assert.equal(hit, null, `${id}: capsule route from avenue into the visible approach is open`);
    const skirt = new R.Ray({x: from.x, y: y-.1, z: z + pathZ}, {x:-1,y:0,z:0});
    assert.ok(legacyCollider.castRay(skirt, 2, true) > 0);
    assert.equal(threshold.castRay(skirt, 2, true), -1, `${id}: no extruded physical skirt under the actual slab`);
    world.removeCollider(legacyCollider, false);
    const edge = x + size[0] / 2;
    world.createCollider(R.ColliderDesc.cuboid(1, .12, 1.2).setTranslation(edge + 1, y + .03, from.z), fixed);
    const actor = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(from.x, from.y, from.z).lockRotations().setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS).setMass(72).setFriction(0), actor);
    for (let i = 0; i < 35; i++) world.step();
    assert.ok(playerSupport(world,R,actor)?.grounded, `${id}: beginning on actual-height approach`);
    for (let i = 0; i < 120 && actor.translation().x > x + approachX + .02; i++) {
      actor.setLinvel({x:-1.65,y:actor.linvel().y,z:0},true);
      world.step();
    }
    assert.ok(Math.abs(actor.translation().x - (x + approachX)) < .08, `${id}: capsule actually crossed the seam`);
    assert.ok(playerSupport(world,R,actor)?.grounded, `${id}: standing in the open approach on the slab`);
    t.diagnostic(`${id}: ${source.ranges.reduce((n, range) => n + range.count / 3, 0)} source triangles, ${Math.abs(newHit - oldHit).toFixed(6)} m top delta`);
    legacyData.dispose(); stone.dispose();
  });
}


test('T07 background variants retain the real closed facades on both placement headings', async t => {
  const scene = await loadTownAsset('T07'), root = scene.getObjectByName('T07');
  const world = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => world.free());
  let worst = 0, formerWorst = 0;
  for (const [i, [x, z, width, depth, , facing]] of root.userData.spec.entries()) {
    const name = `T07_${i}`, origin = new Vector3(x,1,z);
    const q = new Quaternion().setFromAxisAngle(new Vector3(0,1,0), facing < 0 ? Math.PI : 0);
    const placement = new Matrix4().compose(origin,q,new Vector3(1,1,1));
    const visible = scene.getObjectByName(name).clone(true);
    visible.applyMatrix4(placement);
    visible.updateMatrixWorld(true);
    const proxy = scene.getObjectByName('col_' + name);
    const shaped = proxy.geometry.clone().applyMatrix4(placement.clone().multiply(proxy.matrixWorld));
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    const previous = world.createCollider(R.ColliderDesc.convexHull(shaped.attributes.position.array),body);
    const source = town.bodies.find(b=>b.name==='lowrise-'+i).surface;
    const collider = world.createCollider(R.ColliderDesc.trimesh(source.vertices,source.indices),body);
    world.step();
    const count = Math.max(1, Math.floor(depth/2.2)), doorZ = depth/2 - (Math.floor(count/2) + .5)*depth/count;
    const from = new Vector3(width/2+.65,1.20,doorZ).applyMatrix4(placement), direction = new Vector3(-1,0,0).applyQuaternion(q);
    const visual = new Raycaster(from,direction,0,2).intersectObject(visible,true)[0];
    const physics = collider.castRay(new R.Ray(from,direction),2,true);
    assert.ok(visual && physics >= 0, `${name}: actual closed facade from its installed front`);
    const delta = Math.abs(visual.distance-physics);
    worst = Math.max(worst,delta);
    const former = previous.castRay(new R.Ray(from,direction),2,true);
    assert.ok(former >= 0);
    formerWorst = Math.max(formerWorst,Math.abs(visual.distance-former));
    assert.ok(delta < .001, `${name}: closed recess separates ${delta} m from the facade`);
    shaped.dispose();
    world.removeRigidBody(body);
  }
  t.diagnostic(`Seven front doors. Maximum prior hull offset ${formerWorst.toFixed(3)} m, current ${worst.toFixed(6)} m`);
});

test('shipping town batches keep the same structural surface at every reachable side, including reversed houses and lifeguard piles', async t => {
  const world = new R.World({x:0,y:-9.81,z:0});
  t.after(() => world.free());
  const shapes = new Map();
  for (const record of town.bodies) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    const {vertices,indices} = record.surface;
    assert.ok(indices.length && indices.length % 3 === 0, record.name);
    shapes.set('town-collider-'+record.name+'-visual', world.createCollider(R.ColliderDesc.trimesh(vertices,indices), body));
    if (record.threshold) shapes.set('town-collider-'+record.name+'-threshold',
      world.createCollider(R.ColliderDesc.convexHull(record.threshold),body));
  }
  world.step();
  const visible = [...Object.values(town.regions).flatMap(region => region.meshes), ...town.palms];
  const probe = new Raycaster(), pos = new Vector3(), direction = new Vector3(), edge = new Vector3(), v = [new Vector3(),new Vector3(),new Vector3()];
  const sampled = new Set();
  let n = 0, soft = 0, max = 0;
  for (const mesh of visible) {
    mesh.material.side = DoubleSide;
    const count = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
    const parts = mesh.userData.worldCollisionSources;
    assert.equal(parts.reduce((sum,p)=>sum+(p.indexCount ?? p.vertexCount),0), count, mesh.name);
    for (const part of parts) {
      if (part.collision === 'soft') { soft++; assert.equal(part.surfaceId,undefined); continue; }
      const target=shapes.get(part.surfaceId);
      assert.ok(target, part.id);
      if (part.surfaceId.endsWith('-threshold')) continue; // Its bevel, floor and walking routes are covered above.
      const start=part.firstIndex ?? part.firstVertex, length=part.indexCount ?? part.vertexCount;
      for(let off=start;off<start+length;off+=3*Math.max(1,Math.floor(length/39))) {
        for(let i=0;i<3;i++) v[i].fromBufferAttribute(mesh.geometry.attributes.position,mesh.geometry.index?.getX(off+i) ?? off+i);
        direction.subVectors(v[1],v[0]).cross(edge.subVectors(v[2],v[0]));
        if(direction.lengthSq()<1e-12)continue;
        direction.normalize();
        pos.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1/3).addScaledVector(direction,.015);
        direction.negate(); probe.set(pos,direction);probe.far=.03;
        const first = probe.intersectObject(mesh,false)[0];
        // Windows and trim can be layered. Compare only the actual first visible
        // surface of the draw when that surface is this very source triangle.
        if (!first || first.faceIndex !== off/3 || Math.abs(first.distance-.015)>.0001) continue;
        const time = target.castRay(new R.Ray(pos,direction),.04,false);
        assert.ok(time >= 0 && time <= .0152, JSON.stringify({id:part.id,time,visual:first.distance,off,v:v.map(p=>p.toArray()),pos:pos.toArray(),direction:direction.toArray()}));
        // Another part of the very same body can legitimately occlude this face.
        if(time < .0148)continue;
        max=Math.max(max,Math.abs(first.distance-time)); sampled.add(part.surfaceId); n++;
      }
    }
  }
  assert.equal(sampled.size,town.bodies.length,'each placed object must contribute real surface comparisons');
  assert.ok(n>800 && soft>4); assert.ok(max<.0002);
  for(const region of Object.values(town.regions)) {
    const lod=region.lod;
    if (!lod) continue;
    const parts=lod.userData.worldCollisionSources;
    assert.equal(parts.reduce((n,p)=>n+(p.indexCount ?? p.vertexCount),0),lod.geometry.index?.count ?? lod.geometry.attributes.position.count);
    assert.ok(parts.every(p=>p.collision==='soft'||shapes.has(p.surfaceId)),lod.name);
  }
  t.diagnostic(JSON.stringify({bodies:sampled.size, comparisons:n, softRanges:soft, maxMetres:max}));
});
