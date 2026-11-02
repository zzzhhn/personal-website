import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidence = path.join(root, 'docs/world/phase-2-playground/asset-batch5-20261102');
const hash = data => createHash('sha256').update(data).digest('hex');
const frozen = JSON.parse(await readFile(path.join(evidence, 'baseline.json')));
for (const [name, expected] of Object.entries(frozen.assets)) {
  const data = await readFile(path.join(frozen.asset_source_root, 'public/assets/world', name));
  assert.equal(hash(data), expected.sha256, `Original asset changed: ${name}`);
}

async function walk(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Candidate output must be owned, not a symlink: ${entry.name}`);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await walk(file));
    else if (entry.isFile() && entry.name.endsWith('.glb')) out.push(file);
  }
  return out;
}

const assets = [];
for (const file of await walk(path.join(root, 'public/assets/world/facility-craft'))) {
  const data = await readFile(file);
  assert.equal(data.readUInt32LE(0), 0x46546c67, `${file}: GLB magic`);
  assert.equal(data.readUInt32LE(4), 2, `${file}: glTF 2`);
  assert.equal(data.readUInt32LE(8), data.length, `${file}: complete container`);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a, `${file}: first chunk is JSON`);
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  const primitives = (json.meshes || []).flatMap(mesh => mesh.primitives);
  let triangles = 0;
  for (const primitive of primitives) {
    assert.equal(primitive.mode ?? 4, 4, `${file}: triangle primitives`);
    const count = json.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
    assert.equal(count % 3, 0, `${file}: whole triangles`);
    triangles += count / 3;
  }
  assets.push({
    path: path.relative(root, file), bytes: data.length, sha256: hash(data),
    triangles, primitives: primitives.length, materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    nodes: (json.nodes || []).map(node => node.name).filter(Boolean),
    extensionNames: json.extensionsUsed || [],
  });
}
const report = { baselineAssetsUnchanged: Object.keys(frozen.assets).length, assets,
  glbBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
  note: 'LOD levels counted together in GLB inventory; runtime active triangles require actual renderer evidence.' };
await writeFile(path.join(evidence, 'asset-costs.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ baselineAssetsUnchanged: report.baselineAssetsUnchanged,
  glbs: assets.length, bytes: report.glbBytes }));
