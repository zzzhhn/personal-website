import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import R from '@dimforge/rapier3d-compat';
import { alphaTerrainData, alphaGroundHeight, alphaGroundSample, alphaSurfaceNormalY, alphaShoreline } from '../../src/components/world/alpha-island/alpha-terrain.ts';
import { encodeAlphaTerrain, decodeAlphaTerrain } from '../../src/components/world/alpha-island/alpha-terrain-artifact.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'src/components/world/terrain-artifacts.generated.json'), 'utf8'));
async function unpack(entry) { const b = gunzipSync(await readFile(path.join(root, 'public', entry.url))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
const raw = await unpack(manifest.alpha), decoded = decodeAlphaTerrain(raw), original = alphaTerrainData();
const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
await R.init();

test('Alpha artifact preserves every original vertex, triangle and collision partition', () => {
  for (const key of ['positions', 'indices', 'surface', 'solid']) assert.deepEqual(bytes(original[key]), bytes(decoded[key]));
  assert.deepEqual(new Uint8Array(encodeAlphaTerrain(original)), new Uint8Array(raw));
  assert.equal(decoded.nx, original.nx); assert.equal(decoded.nz, original.nz);
});
test('malformed topology, layout, positions, lengths and extra bytes are rejected', () => {
  assert.throws(() => decodeAlphaTerrain(raw.slice(0, -4)));
  const extra = new Uint8Array(raw.byteLength + 4); extra.set(new Uint8Array(raw)); assert.throws(() => decodeAlphaTerrain(extra.buffer));
  for (const mutate of [t => t.positions[0] += 1, t => t.positions[1] = NaN, t => t.indices[0] += 1, t => t.surface[0] = 0xffffffff]) {
    const copy = raw.slice(0); mutate(decodeAlphaTerrain(copy)); assert.throws(() => decodeAlphaTerrain(copy));
  }
  const magic = raw.slice(0); new DataView(magic).setUint32(0, 1); assert.throws(() => decodeAlphaTerrain(magic));
});
test('height and slope query the actual physical triangle; off-grid coordinates never invent land', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.trimesh(decoded.positions, decoded.indices)); world.step();
  try {
    for (let j = 0; j < decoded.nz; j += 7) for (let i = 0; i < decoded.nx; i += 7) for (const [u, v] of [[.23, .31], [.82, .67]]) {
      const x = -98 + (i + u) * 196 / decoded.nx, z = -114 + (j + v) * 228 / decoded.nz;
      const sample = alphaGroundSample(x, z), hit = world.castRayAndGetNormal(new R.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 }), 200, true);
      assert.ok(hit && sample); assert.ok(Math.abs(100 - hit.timeOfImpact - sample.height) < .0002);
      assert.ok(Math.abs(hit.normal.y - sample.normalY) < .0002); assert.equal(alphaSurfaceNormalY(x, z), sample.normalY);
    }
    for (const p of [[-98, -114], [98, 114], [-98, 114], [98, -114]]) assert.ok(Number.isFinite(alphaGroundHeight(...p)));
    for (const p of [[98.01, 0], [0, 114.01], [NaN, 0], [0, Infinity]]) {
      assert.equal(alphaGroundSample(...p), null); assert.equal(alphaSurfaceNormalY(...p), 0); assert.throws(() => alphaGroundHeight(...p), /No Alpha terrain/);
    }
    for (const [wx, wz] of alphaShoreline()) {
      const x=wx-235,z=wz-190,boundary=Math.min(98-Math.abs(x),114-Math.abs(z));
      // The existing finite mesh ends above water at one north-edge sample.
      // Map that actual edge, rather than extrapolating authoring terrain beyond it.
      assert.ok(boundary < .001 || Math.abs(alphaGroundHeight(x,z) + .7) < .001);
    }
  } finally { world.free(); }
});
test('browser consumers use installed terrain for markings, tree roots, rocks and ferry arrival', async () => {
  const dir = await mkdtemp(path.join(root, 'tools/world/.alpha-terrain-test-'));
  try {
    const { build } = await import('esbuild'), output = path.join(dir, 'client.mjs');
    await build({ stdin: { contents: `
      export * from './alpha-island/alpha-terrain';
      export * from './alpha-island/alpha-terrain-artifact';
      export {createAlphaVisitorMarkings} from './alpha-island/alpha-visitor-markings';
      export {createAlphaGrammarTree} from './alpha-island/alpha-grammar-tree';
      export {createAlphaBoulderField} from './alpha-island/alpha-rocks';
      export {alphaFerryRoute,alphaFerryGroundHeight} from './alpha-island/transports/alpha-routes';
      export {decodeTerrainArtifact,installTerrainArtifact} from './terrain-artifact';
    `, resolveDir: path.join(root, 'src/components/world') }, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { 'import.meta.env.SSR': 'false' }, outfile: output, logLevel: 'silent' });
    const browser = await import(pathToFileURL(output).href);
    assert.throws(() => browser.alphaTerrainData(), /must be loaded/);
    browser.installAlphaTerrain(decoded);
    browser.installTerrainArtifact(browser.decodeTerrainArtifact(await unpack(manifest.v4), 'v4'));
    assert.equal(browser.alphaTerrainData(), decoded);
    assert.throws(() => browser.alphaTerrainData(3), /build-defined/);
    assert.throws(() => browser.alphaHeight(0, 0), /authoring height is unavailable/);
    const marks = browser.createAlphaVisitorMarkings(), positions = marks.geometry.getAttribute('position');
    assert.ok(positions.count > 100);
    for (let i = 0; i < positions.count; i++) assert.ok(Math.abs(positions.getY(i) - browser.alphaGroundHeight(positions.getX(i), positions.getZ(i)) - .006) < .0002);
    marks.geometry.dispose();
    const tree = browser.createAlphaGrammarTree();
    for (const foot of tree.report.footSupports) {
      const [x, , z] = foot.position, [ox, oy, oz] = tree.report.origin;
      assert.ok(Math.abs(foot.terrainY - (browser.alphaGroundHeight(ox + x, oz + z) - oy)) < 1e-8);
      assert.ok(foot.burial > 0 && foot.terminalMaxGap < .03);
    }
    tree.parts.forEach(p => p.geometry.dispose()); tree.breakaway.parts.forEach(p => p.geometry.dispose()); tree.pulse.dispose();
    const rocks = browser.createAlphaBoulderField(); assert.equal(rocks.witnesses.length, 32);
    for (const { position: [x, y, z] } of rocks.witnesses) assert.equal(y, browser.alphaGroundHeight(x, z));
    rocks.parts.forEach(p => p.geometry.dispose());
    const dock = browser.alphaFerryRoute().terminals[1];
    for (const [x, y, z] of dock.boarding.slice(0, dock.gangwayStart)) assert.ok(y >= browser.alphaGroundHeight(x - 235, z - 190));
    assert.ok(Math.abs(dock.safeExit[1] - browser.alphaFerryGroundHeight(dock.safeExit[0], dock.safeExit[2]) - .006) < 1e-6);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
