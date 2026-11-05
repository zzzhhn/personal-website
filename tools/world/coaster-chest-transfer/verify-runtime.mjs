import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Mesh } from 'three';
import { createCoasterChestRuntime } from '../../../src/components/world/attractions/coaster-chest-runtime.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

const origin = new URL('../../../docs/world/phase-2-playground/coaster-chest-transfer-20261104/', import.meta.url);
const originalHashes = {};
for (const [file, expected] of [
  ['coaster-chest.glb', '0e4483bcee6ba2fe63848691c81b24d5fb1091f5415e26272c5cc3c22a2f7382'],
  ['coaster-chest-editable.blend', '20177d76ffa77ed20cef9437c23b04c9d2fbe5e6a9e885cf9733d443f45ca1d7'],
]) {
  const hash = createHash('sha256').update(await readFile(new URL(file, origin))).digest('hex');
  assert.equal(hash, expected);
  originalHashes[file] = hash;
}
const gltf = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-chest-transfer-20261104/coaster-chest.glb']);
assert.ok(gltf);
const pack = createCoasterChestRuntime(gltf.scene);
const all = []; pack.root.traverse(o => { if (o instanceof Mesh) all.push(o); });
const cost = () => {
  let visual = 0, main = 0, shadow = 0, visibleTriangles = 0, mainTriangles = 0, shadowTriangles = 0;
  for (const mesh of all) {
    if (!mesh.visible) continue;
    const triangleCount = Math.min(mesh.geometry.index.count, mesh.geometry.drawRange.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1);
    main++; mainTriangles += triangleCount;
    if (mesh.material.colorWrite) { visual++; visibleTriangles += triangleCount; }
    if (mesh.castShadow) { shadow++; shadowTriangles += triangleCount; }
  }
  return { mainBatches: main, visualBatches: visual, shadowBatches: shadow, visibleTriangles, mainTriangles, shadowTriangles };
};
const states = [];
for (let mask = 0; mask < 128; mask++) {
  const passed = Array.from({ length: 7 }, (_, i) => `T${i + 1}`).filter((_, i) => mask & 1 << i);
  pack.setPassed(passed); states.push(cost());
}
const range = key => [Math.min(...states.map(s => s[key])), Math.max(...states.map(s => s[key]))];
const allocatedBytes = [...pack.resources.geometry].reduce((sum, g) =>
  sum + g.index.array.byteLength + Object.values(g.attributes).reduce((a, b) => a + b.array.byteLength, 0), 0)
  + pack.resources.instances.reduce((sum, m) => sum + m.instanceMatrix.array.byteLength, 0);
const report = {
  baselineCommit: 'b75c474', originalHashes,
  scope: 'CPU structure/channel audit; texture samplers are placeholders, no decoded image or WebGL performance claim',
  source: { visibleBatches: 28, shadowBatches: 9, triangles: 17940 },
  derivative: Object.fromEntries(['mainBatches', 'visualBatches', 'shadowBatches', 'visibleTriangles', 'mainTriangles', 'shadowTriangles'].map(k => [k, range(k)])),
  owned: { geometry: pack.resources.geometry.size, materials: pack.resources.materials.size, instanceBuffers: pack.resources.instances.length, bufferBytes: allocatedBytes },
  motion: { lidAngle: [0, -1.3], shackleAngle: [0, -1.12], shackleLift: .058, independentTaskMasksAudited: 128 },
  preserved: ['all visible triangles and PBR channels', 'original opaque double-sided shadow triangles', 'cached GLB geometry/materials/textures', 'original asset hashes'],
  tradeoff: 'Two full-resolution nonwriting shadow carriers add main-pass geometry; fewer submissions are not an FPS result.',
  runtimePerformance: 'pending fresh-page matched browser windows',
};
const output = new URL('../../../docs/world/phase-2-playground/coaster-chest-runtime-20261105/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('structure-check.json', output), JSON.stringify(report, null, 2) + '\n');
pack.dispose(); disposeWorldCraftGltf(gltf.scene);
console.log(`Chest runtime: main batches ${range('mainBatches')}, shadow batches ${range('shadowBatches')}; original hashes unchanged.`);
