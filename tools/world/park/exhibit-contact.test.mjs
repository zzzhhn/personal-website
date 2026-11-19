import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import R from '@dimforge/rapier3d-compat';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../../../src/components/world/actor-physics.ts';
import { EXHIBITS, HUTS, exhibitMatrix } from '../../../src/components/world/WorldParkLayout.ts';
import { gltfTrimesh } from '../../../src/components/world/WorldParkKit.ts';
import { boardFlipAngle, exhibitBoardRotation, exhibitBoardSweepClear, exhibitPartContact, exhibitPartShape,
  exhibitRecordPose, exhibitSweepClear } from '../../../src/components/world/park-exhibit-collision.ts';
import { disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

const dracoURL = new URL('../../../public/assets/world/draco/', import.meta.url);
const decoder = runInNewContext(readFileSync(new URL('draco_wasm_wrapper.js', dracoURL), 'utf8') + ';DracoDecoderModule;',
  { console, TextDecoder, WebAssembly, Buffer, Uint8Array, ArrayBuffer, setTimeout, clearTimeout });
const draco = await decoder({ wasmBinary: readFileSync(new URL('draco_decoder.wasm', dracoURL)) });
const loader = new GLTFLoader().setDRACOLoader({
  preload() {},
  decodeDracoFile(data, callback, attributes) {
    const buffer = new draco.DecoderBuffer(), decoder = new draco.Decoder(), mesh = new draco.Mesh();
    const values = new draco.DracoFloat32Array(), face = new draco.DracoInt32Array();
    try {
      buffer.Init(new Int8Array(data), data.byteLength);
      const status = decoder.DecodeBufferToMesh(buffer, mesh);
      assert.ok(status.ok(), status.error_msg());
      const position = decoder.GetAttributeByUniqueId(mesh, attributes.position);
      assert.ok(decoder.GetAttributeFloatForAllPoints(mesh, position, values));
      const points = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
      const indices = [];
      for (let i = 0; i < mesh.num_faces(); i++) {
        decoder.GetFaceFromMesh(mesh, i, face);
        indices.push(face.GetValue(0), face.GetValue(1), face.GetValue(2));
      }
      callback(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3)).setIndex(indices));
    } finally { [buffer, decoder, mesh, values, face].forEach(value => draco.destroy(value)); }
  },
});
await R.init();

async function loadExhibit(id) {
  const hut = HUTS.find(h => EXHIBITS[h.id]?.some(ex => ex.id === id));
  const { at, yaw } = EXHIBITS[hut.id].find(ex => ex.id === id);
  const bytes = readFileSync(new URL(`../../../public/assets/world/park/${id}.glb`, import.meta.url));
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  return { hut, root: scene.getObjectByName(id), scene, placement: exhibitMatrix(hut, at, yaw) };
}

test('the six shipped exhibits classify every named part and retain the fixed contact geometry', async t => {
  const exhibitClasses = {
    P13: { solid: 4, none: 3 }, P14: { solid: 4, pushable: 1 },
    P15: { solid: 10, soft: 12, pushable: 1 }, P16: { solid: 1 }, P17: { solid: 2, none: 1 }, P18: { solid: 2 },
  };
  for (const [id, expected] of Object.entries(exhibitClasses)) await t.test(id, async t => {
    const { root, placement, scene } = await loadExhibit(id);
    t.after(() => disposeWorldCraftGltf(scene));
    const classes = {}, attached = [];
    for (const child of root.children) {
      const policy = exhibitPartContact(id, child.name);
      classes[policy.collision] = (classes[policy.collision] ?? 0) + 1;
      if (policy.collision === 'solid' && policy.group === 'body' && child.name !== 'body') attached.push(child.name);
      else if (policy.collision === 'solid' && policy.group !== 'body') assert.ok(exhibitPartShape(child, placement).indices.length > 0);
      else if ('reason' in policy) assert.ok(policy.reason);
    }
    assert.deepEqual(classes, expected);
    assert.throws(() => exhibitPartContact(id, 'unclassified-visible-part'));
    const body = gltfTrimesh(root, placement, node => node === 'body');
    const full = gltfTrimesh(root, placement, node => node === 'body' || attached.includes(node));
    for (const part of attached) {
      const shape = exhibitPartShape(root.getObjectByName(part), placement);
      assert.ok(shape.half.length() > 0);
      const geometry = gltfTrimesh(root, placement, node => node === part);
      assert.equal(geometry.indices.length, shape.indices.length);
    }
    assert.equal(full.indices.length > body.indices.length, attached.length > 0);
  });
});

test('the real board face, frame, and open sides agree with Rapier throughout two flips', async t => {
  const { root, placement, scene } = await loadExhibit('P18');
  const world = new R.World({ x: 0, y: 0, z: 0 }), board = root.getObjectByName('board');
  const material = new MeshBasicMaterial({ side: DoubleSide });
  t.after(() => { world.free(); material.dispose(); disposeWorldCraftGltf(scene); });
  const shape = exhibitPartShape(board, placement);
  assert.ok(Math.abs(shape.half.x * 2 - 2.1) < .002);
  assert.ok(Math.abs(shape.half.y * 2 - 1.2) < .002);
  const [x,y,z] = shape.position;
  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x,y,z).setRotation(shape.rotation));
  const actual = world.createCollider(R.ColliderDesc.trimesh(shape.vertices, shape.indices), body);
  const fixed = gltfTrimesh(root, placement, node => node === 'body');
  const old = world.createCollider(R.ColliderDesc.trimesh(fixed.vertices, fixed.indices));
  const drawing = new Group();
  drawing.matrixAutoUpdate = false;
  drawing.matrix.copy(placement);
  const visible = board.clone(true);
  visible.traverse(node => { if (node instanceof Mesh) node.material = material; });
  drawing.add(visible);
  let maxError = 0;
  for (const angle of [0, .6, Math.PI / 2, 2.6, Math.PI, 3.8, 4.9, 5.9, 2 * Math.PI]) {
    const rotation = exhibitBoardRotation(shape, angle);
    body.setNextKinematicRotation(rotation);
    world.step();
    visible.rotation.x = angle;
    drawing.updateMatrixWorld(true);
    const rayDir = new Vector3(0, 0, -1).applyQuaternion(rotation);
    for (const [lateral, vertical] of [[0,.2], [.8,.3], [1.03,.31], [-1.03,-.29], [1.08,.3], [0,.64]]) {
      const origin = new Vector3(lateral, vertical, .8).applyQuaternion(rotation).add(new Vector3(x,y,z));
      const visibleHit = new Raycaster(origin, rayDir, 0, 1).intersectObject(drawing, true)[0];
      const ray = new R.Ray(origin, rayDir), contact = actual.castRay(ray, 1, false);
      assert.equal(contact >= 0, !!visibleHit, `angle ${angle}, ray at ${lateral},${vertical}`);
      if (visibleHit) maxError = Math.max(maxError, Math.abs(visibleHit.distance - contact));
      if (angle === 0 && lateral === 0 && vertical === .2) assert.equal(old.castRay(ray, 1, false), -1, 'legacy body misses the visible board');
    }
  }
  assert.ok(maxError < .001);
  t.diagnostic(`54 rays across nine actual poses; maximum error ${maxError.toFixed(6)} m`);
});

test('the new pivot sweep holds for a standing capsule and advances after the actor steps clear', async t => {
  const { root, placement, scene } = await loadExhibit('P18');
  const world = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => { world.free(); disposeWorldCraftGltf(scene); });
  const shape = exhibitPartShape(root.getObjectByName('board'), placement);
  const [x,y,z] = shape.position;
  const moving = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x,y,z).setRotation(shape.rotation));
  world.createCollider(R.ColliderDesc.trimesh(shape.vertices, shape.indices), moving);
  const at = new Vector3(0, PLAYER_CENTER_HEIGHT, .53).applyMatrix4(placement);
  const actor = world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations().setTranslation(at.x, at.y, at.z));
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), actor);
  world.step();
  let angle = 0, elapsed = 0, heldAt;
  for (let frame = 0; frame < 80; frame++) {
    const next = boardFlipAngle(0, elapsed + world.timestep);
    if (exhibitBoardSweepClear(world, R, shape, angle, next)) {
      assert.equal(heldAt, undefined, 'the board advances after it encounters the player');
      elapsed += world.timestep;
      angle = next;
      moving.setNextKinematicRotation(exhibitBoardRotation(shape, angle));
    } else heldAt ??= frame;
    world.step();
  }
  assert.ok(heldAt > 0 && heldAt < 40 && angle > 0 && angle < Math.PI);
  const stopped = actor.translation();
  assert.ok(at.distanceTo(stopped) < .002);
  const clear = new Vector3(0, PLAYER_CENTER_HEIGHT, 1.05).applyMatrix4(placement);
  actor.setTranslation(clear, true);
  world.step();
  for (let frame = 0; frame < 60 && angle < Math.PI; frame++) {
    const next = boardFlipAngle(0, elapsed + world.timestep);
    assert.ok(exhibitBoardSweepClear(world, R, shape, angle, next));
    elapsed += world.timestep;
    angle = next;
    moving.setNextKinematicRotation(exhibitBoardRotation(shape, angle));
    world.step();
  }
  assert.equal(angle, Math.PI);
  assert.ok(clear.distanceTo(actor.translation()) < .002);
  t.diagnostic(`hold began on physics step ${heldAt}`);
});

test('a real lower-row record follows the authored arc with room for a standing actor', async t => {
  const { root, placement, scene } = await loadExhibit('P15');
  const world = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => { world.free(); disposeWorldCraftGltf(scene); });
  const disc = root.getObjectByName('record_6'), target = root.getObjectByName('record_8');
  const shape = exhibitPartShape(disc, placement);
  const [x,y,z] = shape.position;
  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x,y,z).setRotation(shape.rotation));
  const contact = world.createCollider(R.ColliderDesc.trimesh(shape.vertices, shape.indices), body);
  const at = new Vector3(0, PLAYER_CENTER_HEIGHT, .63).applyMatrix4(placement);
  const player = world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations().setTranslation(at.x, at.y, at.z));
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), player);
  world.step();
  const poseAt = time => exhibitRecordPose(disc.position, target.position, placement, time, true);
  const spin = angle => shape.rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1), angle));
  let from = poseAt(0), blocked = false;
  for (let frame = 1; frame <= 54; frame++) {
    const to = poseAt(frame / 60), midpoint = spin((from.angle + to.angle) / 2);
    const clear = exhibitSweepClear(world, R, shape, from.position, to.position, midpoint,
      Math.abs(from.angle - to.angle), Math.hypot(shape.edge.x, shape.edge.y));
    if (!clear) {
      assert.equal(blocked, false, 'move the player only when the protruding disc first approaches');
      assert.ok(at.distanceTo(player.translation()) < .002);
      const away = new Vector3(0, PLAYER_CENTER_HEIGHT, .95).applyMatrix4(placement);
      player.setTranslation(away, true);
      world.step();
      blocked = true;
      frame--;
      continue;
    }
    body.setNextKinematicTranslation(to.position);
    body.setNextKinematicRotation(spin(to.angle));
    world.step();
    const rayOrigin = new Vector3(0,0,.6).applyQuaternion(spin(to.angle)).add(to.position);
    const rayDir = new Vector3(0,0,-1).applyQuaternion(spin(to.angle));
    const depth = contact.castRay(new R.Ray(rayOrigin, rayDir), 1, false);
    assert.ok(depth > .54 && depth <= .6, `disc pose ${frame} at depth ${depth}`);
    from = to;
  }
  assert.ok(blocked);
  assert.ok(from.local.distanceTo(target.position) < .001);
});
