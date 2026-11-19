import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import R from '@dimforge/rapier3d-compat';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Object3D, Scene, Vector3 } from 'three';
import { campCraftPushableHull, campLegacyPushableHull, createCampPushableHullBinding } from './camp-pushable-hull.ts';
import { holdCampDumbbell, isHeldCampDumbbellCollider } from './camp-prop-interactions.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

await R.init();
const pack = await readWorldCraftGltf(['public/assets/world/facility-craft/camp/camp-facilities-v1.glb']);
assert.ok(pack);
test.after(() => disposeWorldCraftGltf(pack.scene));

const nodeRequire = createRequire(import.meta.url);
const decoderPath = nodeRequire.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js');
const decoderModule = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', readFileSync(decoderPath, 'utf8'))(
  decoderModule, decoderModule.exports, nodeRequire, dirname(decoderPath), decoderPath);
const draco = await decoderModule.exports({});

function oldParts(family) {
  const bytes = readFileSync(new URL(`../../../public/assets/world/camp/${family}.glb`, import.meta.url));
  const length = bytes.readUInt32LE(12), info = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length);
  return info.nodes.filter(node => node.mesh !== undefined).flatMap(node => {
    assert.equal(node.matrix ?? node.translation ?? node.rotation ?? node.scale, undefined);
    return info.meshes[node.mesh].primitives.map(primitive => {
      const ext = primitive.extensions.KHR_draco_mesh_compression, view = info.bufferViews[ext.bufferView];
      const encoded = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const decoder = new draco.Decoder(), buffer = new draco.DecoderBuffer(), decoded = new draco.Mesh();
      buffer.Init(encoded, encoded.length);
      const status = decoder.DecodeBufferToMesh(buffer, decoded), values = new draco.DracoFloat32Array();
      try {
        assert.ok(status.ok(), status.error_msg());
        const attribute = decoder.GetAttributeByUniqueId(decoded, ext.attributes.POSITION);
        decoder.GetAttributeFloatForAllPoints(decoded, attribute, values);
        const points = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
        return { name: node.name, geometry, matrix: new Matrix4(), glow: false };
      } finally { for (const object of [values, status, decoded, buffer, decoder]) draco.destroy(object); }
    });
  });
}

function candidate(family) {
  const model = pack.scene.getObjectByName(family).clone(true);
  const strings = model.getObjectByName('C12_strings');
  if (strings) strings.name = 'camp-content-C12-strings';
  return model;
}

function rehearsal(family, scale, run) {
  const fallback = oldParts(family), model = candidate(family);
  const legacyHull = campLegacyPushableHull(fallback, family, scale);
  const surfaceId = `camp-content-${family}-hull`;
  const craftHull = campCraftPushableHull(model, family, scale, surfaceId);
  const world = new R.World({ x: 0, y: -12.5, z: 0 });
  try { run({ world, legacyHull, craftHull, model, surfaceId }); }
  finally { world.free(); fallback.forEach(p => p.geometry.dispose()); }
}

test('camp hulls use the physical mesh vertices of each displayed export and preserve the scaled dumbbell envelope', t => {
  for (const [family, scale, names] of [
    ['C12',1,['C12_guitar','C12_stand']], ['C13',1.7,['C13_dumbbell']], ['C15',1,['C15_case']],
  ]) rehearsal(family, scale, ({ world, legacyHull, craftHull, model, surfaceId }) => {
    const expected = [], point = new Vector3();
    for (const name of names) model.getObjectByName(name).traverse(mesh => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(scale);
        expected.push(...point.toArray());
      }
    });
    assert.deepEqual(craftHull, Float32Array.from(expected));
    assert.notDeepEqual(craftHull, legacyHull);

    const scene = new Scene(), node = new Object3D();
    node.name = surfaceId;
    scene.add(model); model.add(node);
    const inventory = collisionInventory(scene, [], [node], [model.name]);
    assert.deepEqual(inventory.errors, []);
    assert.equal(inventory.registrations[model.name], 1);

    for (const hull of [legacyHull, craftHull]) {
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
      const collider = world.createCollider(R.ColliderDesc.convexHull(hull), body);
      assert.ok(collider.isValid());
    }
    if (family === 'C12') assert.equal(model.getObjectByName('camp-content-C12-strings').userData.worldCollision, 'none');
    if (family === 'C15') assert.equal(model.getObjectByName('C15_handle').userData.worldCollision, 'none');

    const top = hull => Math.max(...hull.filter((_, i) => i % 3 === 1));
    t.diagnostic(`${family} height ${top(legacyHull).toFixed(5)} → ${top(craftHull).toFixed(5)} m`);
    if (family === 'C15') assert.ok(top(craftHull) - top(legacyHull) > .025);
    if (family === 'C13') assert.ok(Math.abs(top(craftHull) - .1178 * 1.7) < .001);
  });
});

function attach(world, fallback, mass) {
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(2, 5, 8));
  const collider = world.createCollider(R.ColliderDesc.convexHull(fallback).setMass(mass), body);
  const slot = createCampPushableHullBinding(fallback, (live, points) => {
    live.setShape(new R.ConvexPolyhedron(points));
    live.setMass(mass);
    body.recomputeMassPropertiesFromColliders();
  });
  return { body, collider, slot };
}

test('late candidate and legacy fallback exchange the actual suitcase blocking surface on the same rigid body', () =>
  rehearsal('C15', 1, ({ world, legacyHull, craftHull, model }) => {
    const { body, collider, slot } = attach(world, legacyHull, 12);
    slot.connect(collider);
    const y = body.translation().y, origin = body.translation(), handle = collider.handle;
    const edgeHit = () => {
      body.sleep(); world.step();
      return [-.22,-.18,-.14,.14,.18,.22].some(z => world.castRay(
        new R.Ray({x: origin.x + .4,y: y + .689,z: origin.z + z},{x:-1,y:0,z:0}), .8, true));
    };
    assert.equal(edgeHit(), false, 'the entire old case is below the candidate corner');
    const unmount = slot.mount(craftHull);
    assert.equal(edgeHit(), true, 'real Rapier query detects the installed candidate case corner');
    assert.equal(world.colliders.len(), 1);
    assert.equal(body.collider(0).handle, handle);
    assert.ok(Math.abs(body.mass() - 12) < 1e-5);
    assert.deepEqual(body.translation(), origin);

    const badCandidate = model.getObjectByName('C15_case');
    badCandidate.removeFromParent();
    assert.throws(() => campCraftPushableHull(model, 'C15', 1, 'camp-content-C15-hull'), /missing collision source C15_case/);
    unmount();
    assert.equal(edgeHit(), false, 'dropping the candidate restores the legacy surface');
    assert.equal(body.collider(0).handle, handle);
  }));

test('the C13 collider remains isolated in hand while late loading swaps its shape, then drops with the live shape', () =>
  rehearsal('C13', 1.7, ({ world, legacyHull, craftHull }) => {
    const { body, collider, slot } = attach(world, legacyHull, 16);
    slot.connect(collider);
    assert.equal(isHeldCampDumbbellCollider(collider, body), false);
    const release = holdCampDumbbell(body, R.RigidBodyType);
    const disposeOld = slot.mount(craftHull);
    const disposeLatest = slot.mount(craftHull);
    disposeOld();
    assert.strictEqual(collider.shape.vertices, craftHull);
    assert.equal(collider.isEnabled(), false);
    assert.equal(collider.isSensor(), true);
    assert.equal(collider.collisionGroups(), 0);
    assert.equal(collider.solverGroups(), 0);
    assert.equal(isHeldCampDumbbellCollider(world.getCollider(collider.handle), collider.parent()), true);
    collider.setSolverGroups(1);
    assert.equal(isHeldCampDumbbellCollider(collider, body), false);
    collider.setSolverGroups(0);
    assert.equal(world.colliders.len(), 1);
    release({ position: body.translation(), rotation: body.rotation() });
    assert.equal(body.collider(0).handle, collider.handle);
    assert.equal(collider.isEnabled(), true);
    assert.equal(collider.isSensor(), false);
    assert.equal(isHeldCampDumbbellCollider(collider, body), false);
    assert.equal(body.bodyType(), R.RigidBodyType.Dynamic);
    assert.strictEqual(collider.shape.vertices, craftHull);
    world.step();
    assert.ok(Math.abs(body.mass() - 16) < 1e-5);
    disposeLatest();
    assert.strictEqual(collider.shape.vertices, legacyHull);
    assert.equal(world.colliders.len(), 1);
  }));
