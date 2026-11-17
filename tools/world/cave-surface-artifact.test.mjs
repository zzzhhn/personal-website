import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { createCaveArt } from '../../src/components/world/alpha-island/batch2/cave-art.ts';
import { encodeCaveArtifact, decodeCaveArtifact } from '../../src/components/world/alpha-island/batch2/cave-artifact.ts';
import { encodeStaticSurfaces, decodeStaticSurfaces, surfaceColliderBuffers, castStaticSurface } from '../../src/components/world/static-surface-asset.ts';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END } from '../../src/components/world/alpha-island/alpha-batch2-layout.ts';
import { ALPHA_ORIGIN } from '../../src/components/world/alpha-island/alpha-layout.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'src/components/world/terrain-artifacts.generated.json'), 'utf8'));
const compressed = gunzipSync(await readFile(path.join(root, 'public', manifest.cave.url)));
const raw = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
const baked = decodeCaveArtifact(raw), authored = createCaveArt();
const groups = ['solid', 'floor', 'detail', 'seams'], all = groups.flatMap(k => baked[k]);
const dispose = art => groups.forEach(k => art[k].forEach(p => p.geometry.dispose()));
const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
test.after(() => { dispose(authored); dispose(baked); });

test('built cave preserves every visible attribute, triangle, finish and mural anchor', () => {
  assert.deepEqual(new Uint8Array(encodeCaveArtifact(authored)), new Uint8Array(raw));
  assert.deepEqual(baked.muralPosition, authored.muralPosition); assert.equal(baked.muralYaw, authored.muralYaw);
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
  for (const change of [{ collision: undefined }, { collision: 'pushable' }, { role: undefined }, { reason: '' }, { collision: 'none' }]) {
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
  assert.throws(() => decodeCaveArtifact(encodeStaticSurfaces([sample], { region: 'alpha-cave', muralPosition: [0, 0, 0], muralYaw: 0 })));
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

test('browser cave requires built data, works without authoring terrain and preserves remount ownership', async () => {
  const dir = await mkdtemp(path.join(root, 'tools/world/.cave-surface-test-'));
  try {
    const { build } = await import('esbuild'), file = path.join(dir, 'client.mjs');
    await build({ stdin: { contents: `export {createCaveArt} from './alpha-island/batch2/cave-art'; export * from './alpha-island/batch2/cave-artifact';`, resolveDir: path.join(root, 'src/components/world') }, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env.SSR': 'false' }, outfile: file, logLevel: 'silent' });
    const browser = await import(pathToFileURL(file).href);
    assert.throws(() => browser.createCaveArt(), /Built cave surfaces must be loaded/);
    const installed = browser.decodeCaveArtifact(raw.slice(0)); browser.installCaveArtifact(installed);
    const first = browser.createCaveArt(), second = browser.createCaveArt();
    assert.notEqual(first.floor[0].geometry, second.floor[0].geometry);
    first.floor[0].geometry.attributes.position.array[0] += 50;
    assert.deepEqual(bytes(second.floor[0].geometry.attributes.position.array), bytes(baked.floor[0].geometry.attributes.position.array));
    dispose(first); dispose(second); dispose(installed);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
