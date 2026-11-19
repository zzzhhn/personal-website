import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import R from '@dimforge/rapier3d-compat';
import { BUILDINGS } from '../../../src/components/world/layout.ts';
import { townPlaqueCollision } from '../../../src/components/world/town-plaque-collision.ts';
import { townThresholdCollision } from '../../../src/components/world/town-threshold-collision.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../../../src/components/world/actor-physics.ts';
import { playerSupport } from '../../../src/components/world/player-ground.ts';

const dracoURL = new URL('../../../public/assets/world/draco/', import.meta.url);
const factory = runInNewContext(readFileSync(new URL('draco_wasm_wrapper.js', dracoURL), 'utf8') + ';DracoDecoderModule;',
  { console, TextDecoder, WebAssembly, Buffer, Uint8Array, ArrayBuffer, setTimeout, clearTimeout });
const draco = await factory({ wasmBinary: readFileSync(new URL('draco_decoder.wasm', dracoURL)) });
const loader = new GLTFLoader().setDRACOLoader({
  preload() {},
  decodeDracoFile(data, callback, ids) {
    // Collision and raycast use positions and indices. Keep the shipped GLB node transforms.
    const buffer = new draco.DecoderBuffer(), decoder = new draco.Decoder(), mesh = new draco.Mesh();
    const values = new draco.DracoFloat32Array(), face = new draco.DracoInt32Array();
    try {
      buffer.Init(new Int8Array(data), data.byteLength);
      const status = decoder.DecodeBufferToMesh(buffer, mesh);
      assert.ok(status.ok(), status.error_msg());
      const attribute = decoder.GetAttributeByUniqueId(mesh, ids.position);
      assert.ok(decoder.GetAttributeFloatForAllPoints(mesh, attribute, values));
      const points = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
      const indices = [];
      for (let i = 0; i < mesh.num_faces(); i++) {
        decoder.GetFaceFromMesh(mesh, i, face);
        indices.push(face.GetValue(0), face.GetValue(1), face.GetValue(2));
      }
      const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
      geometry.setIndex(indices);
      callback(geometry);
    } finally { [buffer, decoder, mesh, values, face].forEach(value => draco.destroy(value)); }
  },
});
async function loadTownAsset(id) {
  const glb = readFileSync(new URL(`../../../public/assets/world/town-craft/${id}.glb`, import.meta.url));
  const { scene } = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  scene.updateMatrixWorld(true);
  return scene;
}
const scene = await loadTownAsset('T09');
const model = scene.getObjectByName('T09_body'), oldHull = scene.getObjectByName('col_plaque');
await R.init();

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
    const collision = townPlaqueCollision(parts);
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
    const threshold = world.createCollider(R.ColliderDesc.convexHull(source.points), fixed);
    for (const mesh of root.children) {
      if (!mesh.name.startsWith('col_') || mesh === legacy) continue;
      const geometry = place(mesh);
      world.createCollider(R.ColliderDesc.convexHull(geometry.attributes.position.array), fixed);
      geometry.dispose();
    }
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
  let worst = 0;
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
    const collider = world.createCollider(R.ColliderDesc.convexHull(shaped.attributes.position.array),body);
    world.step();
    const count = Math.max(1, Math.floor(depth/2.2)), doorZ = depth/2 - (Math.floor(count/2) + .5)*depth/count;
    const from = new Vector3(width/2+.65,1.20,doorZ).applyMatrix4(placement), direction = new Vector3(-1,0,0).applyQuaternion(q);
    const visual = new Raycaster(from,direction,0,2).intersectObject(visible,true)[0];
    const physics = collider.castRay(new R.Ray(from,direction),2,true);
    assert.ok(visual && physics >= 0, `${name}: actual closed facade from its installed front`);
    const delta = Math.abs(visual.distance-physics);
    worst = Math.max(worst,delta);
    assert.ok(delta < .25, `${name}: closed recess separates ${delta} m from proxy`);
    shaped.dispose();
    world.removeRigidBody(body);
  }
  t.diagnostic(`Seven paired visual/hull facade rays, largest separation ${worst.toFixed(3)} m`);
});
