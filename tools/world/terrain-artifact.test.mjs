import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const variant = process.env.TERRAIN_TEST_VARIANT;
if (!variant) {
  for (const value of ['v4', 'v3']) test(`${value}: built terrain preserves the real runtime geometry and loading contract`, async () => {
    const env = { ...process.env, TERRAIN_TEST_VARIANT: value }; delete env.NODE_TEST_CONTEXT;
    const { stdout } = await promisify(execFile)(process.execPath, ['--test-reporter=tap', '--import', './tools/world/alpha-mine-tests/register.mjs', fileURLToPath(import.meta.url)], {
      cwd: root, env, maxBuffer: 32768,
    });
    assert.match(stdout, /# fail 0/);
  });
} else {
  globalThis.window = { location: { search: `?layout=${variant}` } };
  const authored = await import('../../src/components/world/WorldLandform.ts');
  const { encodeTerrainArtifact, decodeTerrainArtifact } = await import('../../src/components/world/terrain-artifact.ts');
  const { loadTerrainArtifact } = await import('../../src/components/world/load-terrain-artifact.ts');
  const manifest = JSON.parse(await readFile(path.join(root, 'src/components/world/terrain-artifacts.generated.json'), 'utf8'));
  const entry = manifest[variant], zipped = await readFile(path.join(root, 'public', entry.url));
  const rawBytes = gunzipSync(zipped), raw = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
  const artifact = decodeTerrainArtifact(raw, variant), original = authored.buildTerrain();
  const arrays = t => [t.positions, t.indices, t.surface, t.solid, t.nodeHeight, t.cellDiag, t.vertexOf, t.blocks.kind, t.blocks.start, t.blocks.count, t.blocks.corners];
  const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  test('all authored geometry, holes, LOD tables and partitions survive bit for bit', () => {
    arrays(original).forEach((a, i) => assert.deepEqual(bytes(arrays(artifact.terrain)[i]), bytes(a)));
    assert.deepEqual(artifact.grid, authored.GRID);
    assert.deepEqual(artifact.terrain.seawall, original.seawall);
    const encoded = encodeTerrainArtifact({ terrain: original, grid: authored.GRID, cell: authored.CELL, variant });
    assert.deepEqual(new Uint8Array(encoded), new Uint8Array(raw));
    original.stats.buildMs += 100;
    assert.deepEqual(new Uint8Array(encodeTerrainArtifact({ terrain: original, grid: authored.GRID, cell: authored.CELL, variant })), new Uint8Array(raw));
  });
  test('decoder rejects truncation, trailing bytes, wrong layout and invalid triangle vertices', () => {
    assert.throws(() => decodeTerrainArtifact(raw.slice(0, raw.byteLength - 4), variant));
    assert.throws(() => decodeTerrainArtifact(new Uint8Array([...new Uint8Array(raw.slice(0, 100)), 0]).buffer, variant));
    assert.throws(() => decodeTerrainArtifact(raw, variant === 'v4' ? 'v3' : 'v4'));
    const corrupted = raw.slice(0), copy = decodeTerrainArtifact(corrupted, variant);
    copy.terrain.indices[0] = 0xffffffff;
    assert.throws(() => decodeTerrainArtifact(corrupted, variant));
    const trailing = new Uint8Array(raw.byteLength + 4); trailing.set(new Uint8Array(raw));
    assert.throws(() => decodeTerrainArtifact(trailing.buffer, variant));
  });
  test('production loader verifies response, compressed hash and decoded size before installation', async () => {
    const fetcher = async url => { assert.equal(url, `${entry.url}?v=${entry.sha256}`); return new Response(zipped); };
    const loaded = await loadTerrainArtifact(variant, entry, fetcher);
    assert.deepEqual(bytes(loaded.terrain.positions), bytes(original.positions));
    await assert.rejects(loadTerrainArtifact(variant, entry, async () => new Response(null, { status: 404 })), /download failed/);
    await assert.rejects(loadTerrainArtifact(variant, entry, async () => new Response(zipped.subarray(0, -1))), /length mismatch/);
    const corrupt = Buffer.from(zipped); corrupt[corrupt.length - 10] ^= 1;
    await assert.rejects(loadTerrainArtifact(variant, entry, async () => new Response(corrupt)), /checksum mismatch/);
    await assert.rejects(loadTerrainArtifact(variant, { ...entry, rawBytes: 1 }, fetcher), /decompression length mismatch/);
    const bad = Buffer.alloc(zipped.length);
    await assert.rejects(loadTerrainArtifact(variant, { ...entry, sha256: createHash('sha256').update(bad).digest('hex') }, async () => new Response(bad)));
  });
  test('real Rapier queries agree for authored and decoded collision partitions', async () => {
    // The layout-only window stub is not a browser Window. Rapier's timer must use Node here.
    const layoutWindow = globalThis.window; delete globalThis.window;
    const worlds = [];
    try {
      const { default: R } = await import('@dimforge/rapier3d-compat'); await R.init();
      for (const [i, t] of [original, artifact.terrain].entries()) {
        const world = new R.World({ x: 0, y: -9.81, z: 0 });
        worlds.push(world);
        for (const indices of [t.surface, t.solid]) world.createCollider(R.ColliderDesc.trimesh(t.positions, indices), world.createRigidBody(R.RigidBodyDesc.fixed()));
        try { world.step(); } catch (error) { throw new Error(`Physics step failed for ${i === 0 ? 'authored' : 'decoded'} mesh`, { cause: error }); }
      }
      let hits = 0;
      const { minX, minZ, nx, nz } = authored.GRID;
      for (let i = 0; i < 160; i++) {
        const x = minX + ((i * 7919) % (nx * 50)) / 100, z = minZ + ((i * 3571) % (nz * 50)) / 100;
        const ray = new R.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 });
        const [a, b] = worlds.map(w => w.castRayAndGetNormal(ray, 500, true));
        assert.equal(Boolean(a), Boolean(b));
        if (a) { hits++; assert.equal(a.timeOfImpact, b.timeOfImpact); assert.deepEqual(a.normal, b.normal); }
      }
      assert.ok(hits > 10);
    } finally { worlds.forEach(w => w.free()); globalThis.window = layoutWindow; }
  });
  test('browser build fails closed before loading, then shares exact render and height-query arrays', async () => {
    const dir = await mkdtemp(path.join(root, 'tools/world/.terrain-test-'));
    try {
      const { build } = await import('esbuild');
      const output = path.join(dir, 'client.mjs');
      await build({ stdin: { contents: `export * from './WorldLandform'; export * from './terrain-artifact';`, resolveDir: path.join(root, 'src/components/world') },
        bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env.SSR': 'false' }, outfile: output, logLevel: 'silent' });
      const browser = await import(pathToFileURL(output).href);
      assert.throws(() => browser.buildTerrain(), /must be loaded/);
      browser.installTerrainArtifact(artifact);
      assert.equal(browser.buildTerrain(), artifact.terrain);
      const before = authored.createTerrainGeometry(), after = browser.createTerrainGeometry();
      for (const key of ['position', 'normal']) assert.deepEqual(bytes(before.getAttribute(key).array), bytes(after.getAttribute(key).array));
      assert.deepEqual(bytes(before.index.array), bytes(after.index.array));
      const a = authored.terrainColours(before.getAttribute('normal').array), b = browser.terrainColours(after.getAttribute('normal').array);
      assert.deepEqual(bytes(a.colours), bytes(b.colours)); assert.deepEqual(bytes(a.groundMix), bytes(b.groundMix));
      const { minX, minZ, nx, nz } = authored.GRID;
      for (let i = 0; i < 1200; i++) {
        const x = minX + ((i * 7919) % (nx * 50)) / 100, z = minZ + ((i * 3571) % (nz * 50)) / 100;
        assert.equal(browser.meshHeight(x, z), authored.meshHeight(x, z));
      }
      before.dispose(); after.dispose();
      browser.installTerrainArtifact({ ...artifact, grid: { ...artifact.grid, minX: 999 } });
      assert.throws(() => browser.buildTerrain(), /must be loaded/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
