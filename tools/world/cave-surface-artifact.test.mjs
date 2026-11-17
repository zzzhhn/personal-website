import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { createCaveArt } from '../../src/components/world/alpha-island/batch2/cave-art.ts';
import { encodeCaveArtifact, decodeCaveArtifact, CAVE_PART_GROUPS } from '../../src/components/world/alpha-island/batch2/cave-artifact.ts';
import { encodeStaticSurfaces, decodeStaticSurfaces, surfaceColliderBuffers, castStaticSurface } from '../../src/components/world/static-surface-asset.ts';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END } from '../../src/components/world/alpha-island/alpha-batch2-layout.ts';
import { ALPHA_ORIGIN } from '../../src/components/world/alpha-island/alpha-layout.ts';
import { CAVE_LAMP_HOME, CAVE_CHIME_ANCHOR, CAVE_CHIME_YAW } from '../../src/components/world/alpha-island/batch2/cave-state.ts';
import { decodeAlphaTerrain } from '../../src/components/world/alpha-island/alpha-terrain-artifact.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'src/components/world/terrain-artifacts.generated.json'), 'utf8'));
const compressed = gunzipSync(await readFile(path.join(root, 'public', manifest.cave.url)));
const raw = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
const baked = decodeCaveArtifact(raw), authored = createCaveArt();
const groups = CAVE_PART_GROUPS, all = ['solid', 'floor', 'detail', 'seams'].flatMap(k => baked[k]);
const dispose = art => groups.forEach(k => art[k].forEach(p => p.geometry.dispose()));
const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
test.after(() => { dispose(authored); dispose(baked); });

test('built cave preserves every visible attribute, triangle, finish and mural anchor', () => {
  assert.deepEqual(new Uint8Array(encodeCaveArtifact(authored)), new Uint8Array(raw));
  assert.deepEqual(baked.muralPosition, authored.muralPosition); assert.equal(baked.muralYaw, authored.muralYaw);
  assert.deepEqual(baked.rackPosition, CAVE_LAMP_HOME); assert.deepEqual(baked.scaffoldPosition, CAVE_CHIME_ANCHOR); assert.equal(baked.scaffoldYaw, CAVE_CHIME_YAW);
  for (const group of groups) {
    assert.equal(baked[group].length, authored[group].length);
    baked[group].forEach((p, i) => {
      const old = authored[group][i]; assert.equal(p.finish, old.finish); assert.equal(p.id, old.id);
      assert.deepEqual(Object.keys(p.geometry.attributes), Object.keys(old.geometry.attributes));
      for (const [name, a] of Object.entries(p.geometry.attributes)) assert.deepEqual(bytes(a.array), bytes(old.geometry.attributes[name].array));
      assert.deepEqual(p.geometry.index?.array ?? null, old.geometry.index?.array ?? null);
      const buffers = surfaceColliderBuffers(p);
      if (p.collision === 'solid') {
        assert.equal(buffers.vertices, p.geometry.attributes.position.array, 'collider uses visible positions by identity');
        assert.equal(buffers.indices.length, p.geometry.index?.count ?? p.geometry.attributes.position.count);
      } else assert.equal(buffers, null, 'declared decoration never gains an invisible collider');
    });
  }
});

test('bake rejects omitted policies and malformed payloads, including invalid indices and attributes', () => {
  const sample = baked.floor[0];
  for (const change of [{ collision: undefined }, { collision: 'pushable' }, { role: undefined }, { space: undefined }, { reason: '' }, { collision: 'none' }]) {
    assert.throws(() => encodeStaticSurfaces([{ ...sample, ...change }], {}), /Invalid static surface/);
  }
  assert.throws(() => encodeStaticSurfaces([sample, sample], {}), /Invalid static surface/);
  assert.throws(() => decodeCaveArtifact(raw.slice(0, -4)));
  const extra = new Uint8Array(raw.byteLength + 4); extra.set(new Uint8Array(raw)); assert.throws(() => decodeCaveArtifact(extra.buffer));
  const corrupt = raw.slice(0), corruptScene = decodeCaveArtifact(corrupt);
  corruptScene.floor[0].geometry.attributes.position.array[0] = NaN;
  assert.throws(() => decodeCaveArtifact(corrupt)); dispose(corruptScene);
  const indexed = sample.geometry.clone(); indexed.setIndex([0, 1, 0xffffff]);
  try { assert.throws(() => encodeStaticSurfaces([{ ...sample, geometry: indexed }], {})); }
  finally { indexed.dispose(); }
  // A generic static asset must not masquerade as a complete cave.
  assert.throws(() => decodeCaveArtifact(encodeStaticSurfaces([sample], { region: 'alpha-cave', muralPosition: [0, 0, 0], muralYaw: 0, rackPosition: CAVE_LAMP_HOME, scaffoldPosition: CAVE_CHIME_ANCHOR, scaffoldYaw: CAVE_CHIME_YAW })));
  assert.throws(() => castStaticSurface([...baked.floor, ...baked.rack], 0, 10, 0, -1, 20), /one coordinate space/);
});

test('independent floor and ceiling survey matches visible rays and real colliders after the island transform', async () => {
  await R.init();
  const world = new R.World({ x: 0, y: -9.81, z: 0 }), scene = new Group(), material = new MeshBasicMaterial({ side: DoubleSide });
  scene.position.fromArray(ALPHA_ORIGIN);
  const handles = new Map();
  for (const part of all) {
    const buffers = surfaceColliderBuffers(part); if (!buffers) continue;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_ORIGIN));
    const collider = world.createCollider(R.ColliderDesc.trimesh(buffers.vertices, buffers.indices), body);
    handles.set(collider.handle, part.id);
    const mesh = new Mesh(part.geometry, material); mesh.userData.surfaceId = part.id; scene.add(mesh);
  }
  scene.updateMatrixWorld(true); world.step();
  const ray = new Raycaster(); let count = 0, minClearance = Infinity;
  try {
    for (const route of [ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END]) for (let j = 1; j < route.length; j++) {
      const a = route[j - 1], b = route[j], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
      // Avoid the authored roof ridges at +/-1.2 m: either adjoining triangle
      // normal is valid exactly on that edge, especially after Float32 transforms.
      for (const t of [.217, .431, .673, .823]) for (const across of [-1.13, .137, 1.19]) {
        const x = a[0] + dx * t - dz / len * across, z = a[2] + dz * t + dx / len * across;
        const floor = castStaticSurface(all, x, 100, z, -1, 100, 'floor'); assert.ok(floor);
        const y = floor.height + 1.7;
        for (const dir of [-1, 1]) {
          const hit = castStaticSurface(all, x, y, z, dir, 20); assert.ok(hit);
          const origin = new Vector3(x + ALPHA_ORIGIN[0], y + ALPHA_ORIGIN[1], z + ALPHA_ORIGIN[2]);
          ray.set(origin, new Vector3(0, dir, 0)); ray.far = 20;
          const visible = ray.intersectObject(scene)[0];
          const physical = world.castRayAndGetNormal(new R.Ray(origin, { x: 0, y: dir, z: 0 }), 20, false);
          assert.ok(visible && physical);
          assert.equal(hit.id, visible.object.userData.surfaceId); assert.equal(hit.id, handles.get(physical.collider.handle));
          assert.ok(Math.abs(hit.distance - visible.distance) < .0002);
          assert.ok(Math.abs(hit.distance - physical.timeOfImpact) < .0005);
          assert.ok(Math.abs(Math.abs(hit.normalY) - Math.abs(physical.normal.y)) < .001, JSON.stringify({x,y,z,dir,hit,physicalNormal:physical.normal,physicalTime:physical.timeOfImpact}));
          assert.equal(hit.role, dir === -1 ? 'floor' : 'enclosure');
          if (dir === 1) { minClearance = Math.min(minClearance, hit.height - floor.height); assert.ok(hit.height - floor.height > 4.5); }
          count++;
        }
        const outside = castStaticSurface(all, x, 100, z, -1, 100);
        assert.equal(outside.role, 'enclosure'); assert.ok(outside.height > floor.height + 6);
      }
    }
    assert.ok(count >= 100);
    assert.equal(castStaticSurface(all, 999, 100, 999, -1, 100), null);
    assert.equal(castStaticSurface(all, 0, NaN, 0, -1, 1), null);
    assert.equal(castStaticSurface(all, -10, 28, -42, -1, .1), null);
    console.log(JSON.stringify({ caveRayPairs: count, minClearance, surfaces: all.length }));
  } finally { world.free(); material.dispose(); }
});

test('rack and rotated chime frame collide at their visible faces while the central walking space stays open', async () => {
  await R.init(); let hits = 0, misses = 0, triangles = 0;
  for (const [key, anchor, yaw, width, height] of [['rack', baked.rackPosition, 0, 1.4, 1.9], ['scaffold', baked.scaffoldPosition, baked.scaffoldYaw, 3.2, 3.9]]) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 }), scene = new Group(), material = new MeshBasicMaterial({ side: DoubleSide });
    const translation = new Vector3(...anchor).add(new Vector3(...ALPHA_ORIGIN)), rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    scene.position.copy(translation); scene.quaternion.copy(rotation);
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...translation.toArray()).setRotation(rotation));
    const ids = new Map();
    try {
      for (const part of baked[key]) {
        const buffers = surfaceColliderBuffers(part); if (!buffers) { assert.equal(part.finish, 'rope'); continue; }
        triangles += buffers.indices.length / 3;
        const physical = world.createCollider(R.ColliderDesc.trimesh(buffers.vertices, buffers.indices), body);
        ids.set(physical.handle, part.id);
        const mesh = new Mesh(part.geometry, material); mesh.userData.surfaceId = part.id; scene.add(mesh);
      }
      scene.updateMatrixWorld(true); world.step();
      const ray = new Raycaster(), direction = new Vector3(0, 0, 1).applyQuaternion(rotation);
      for (let x = -width / 2 + .031; x < width / 2; x += .137) for (let y = .047; y < height; y += .143) {
        const origin = new Vector3(x, y, -1.4).applyQuaternion(rotation).add(translation);
        ray.set(origin, direction); ray.far = 3;
        const visible = ray.intersectObject(scene)[0], physical = world.castRay(new R.Ray(origin, direction), 3, false);
        assert.equal(!!physical, !!visible, `${key}: ${x},${y}`);
        if (physical) {
          assert.ok(Math.abs(visible.distance - physical.timeOfImpact) < .0005, `${key}: visual/physical face drift`);
          assert.equal(ids.get(physical.collider.handle), visible.object.userData.surfaceId); hits++;
        } else misses++;
      }
      if (key === 'scaffold') {
        const capsule = new R.Capsule(.45, .3), center = new Vector3(0, 1.4, 0).applyQuaternion(rotation).add(translation);
        assert.equal(world.intersectionWithShape(center, rotation, capsule), null, 'central standing lane remains open');
        const post = new Vector3(1.12, 1.4, 0).applyQuaternion(rotation).add(translation);
        assert.ok(world.intersectionWithShape(post, rotation, capsule), 'visible post blocks the capsule');
      }
    } finally { world.free(); material.dispose(); }
  }
  for (const key of ['lamp', 'mural', 'chime0', 'chime1', 'chime2']) for (const p of baked[key]) assert.equal(surfaceColliderBuffers(p), null);
  assert.ok(hits > 80 && misses > 100);
  console.log(JSON.stringify({ propRayHits: hits, propRayMisses: misses, staticPropTriangles: triangles }));
});

test('both chime feet are supported by built floor/terrain triangles without moving their top or timber anchors', async () => {
  await R.init();
  const data = gunzipSync(await readFile(path.join(root, 'public', manifest.alpha.url)));
  const terrain = decodeAlphaTerrain(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  let samples = 0, maxGap = -Infinity;
  try {
    world.createCollider(R.ColliderDesc.trimesh(terrain.positions, terrain.indices));
    for (const floor of baked.floor) { const b = surfaceColliderBuffers(floor); world.createCollider(R.ColliderDesc.trimesh(b.vertices, b.indices)); }
    world.step();
    const foot = baked.scaffold.find(p => p.finish === 'stone').geometry, p = foot.attributes.position, normals = foot.attributes.normal;
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), baked.scaffoldYaw), anchor = new Vector3(...baked.scaffoldPosition);
    foot.computeBoundingBox(); assert.ok(Math.abs(foot.boundingBox.max.y - .38) < 1e-6);
    for (let i = 0; i < p.count; i += 3) {
      if ([i, i + 1, i + 2].some(k => normals.getY(k) > -.999)) continue;
      const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1), c = new Vector3().fromBufferAttribute(p, i + 2);
      for (let u = 0; u <= 7; u++) for (let v = 0; v <= 7 - u; v++) {
        const point = a.clone().multiplyScalar(1 - (u + v) / 7).addScaledVector(b, u / 7).addScaledVector(c, v / 7).applyQuaternion(rotation).add(anchor);
        const origin = { x: point.x, y: point.y + 1, z: point.z };
        const hit = world.castRay(new R.Ray(origin, { x: 0, y: -1, z: 0 }), 4, false);
        assert.ok(hit, 'footprint has real floor or island terrain');
        const gap = hit.timeOfImpact - 1;
        assert.ok(gap < -.02, `unsupported foot sample: ${point.toArray()} gap ${gap}`);
        maxGap = Math.max(maxGap, gap); samples++;
      }
    }
    assert.ok(samples >= 100); console.log(JSON.stringify({ chimeFootSamples: samples, maxFootGap: maxGap }));
  } finally { world.free(); }
});

test('browser cave requires built data, works without authoring terrain and preserves remount ownership', async () => {
  const dir = await mkdtemp(path.join(root, 'tools/world/.cave-surface-test-'));
  try {
    const { build } = await import('esbuild'), file = path.join(dir, 'client.mjs');
    await build({ stdin: { contents: `export * from './alpha-island/batch2/cave-art'; export * from './alpha-island/batch2/cave-artifact';`, resolveDir: path.join(root, 'src/components/world') }, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env.SSR': 'false' }, outfile: file, logLevel: 'silent' });
    const browser = await import(pathToFileURL(file).href);
    assert.throws(() => browser.createCaveArt(), /Built cave surfaces must be loaded/);
    const propFactories = [['rack', () => browser.caveLampRack()], ['scaffold', () => browser.caveScaffold()], ['lamp', () => browser.caveMinerLamp()], ['mural', () => browser.caveMural()], ...[0, 1, 2].map(i => [`chime${i}`, () => browser.caveChime(i)])];
    for (const [, factory] of propFactories) assert.throws(factory, /Built cave surfaces must be loaded/);
    const installed = browser.decodeCaveArtifact(raw.slice(0)); browser.installCaveArtifact(installed);
    for (const [key, factory] of propFactories) {
      const parts = factory();
      parts.forEach((p, i) => { assert.deepEqual(bytes(p.geometry.attributes.position.array), bytes(baked[key][i].geometry.attributes.position.array)); p.geometry.dispose(); });
    }
    const first = browser.createCaveArt(), second = browser.createCaveArt();
    assert.notEqual(first.floor[0].geometry, second.floor[0].geometry);
    first.floor[0].geometry.attributes.position.array[0] += 50;
    assert.deepEqual(bytes(second.floor[0].geometry.attributes.position.array), bytes(baked.floor[0].geometry.attributes.position.array));
    dispose(first); dispose(second); dispose(installed);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
