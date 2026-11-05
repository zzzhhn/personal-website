import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const root = 'docs/world/phase-2-playground/coaster-rail-craft-20261105/';
const sourcePath = 'tools/world/coaster-rail-craft-20261105/representative-near.source.json';
const source = JSON.parse(readFileSync(sourcePath)), glbPath = `${root}coaster-rail-representative.glb`, blendPath = `${root}coaster-rail-representative.blend`;
const bytes = readFileSync(glbPath); assert.equal(bytes.readUInt32LE(0), 0x46546c67);
const jsonLength = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binary = bytes.subarray(20 + jsonLength + 8);
const accessor = id => {
  const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView], size = a.type === 'VEC3' ? 3 : 2;
  assert.equal(a.componentType, 5126);
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? size * 4;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: size }, (_, j) => binary.readFloatLE(start + i * stride + j * 4)));
};
let triangles = 0, maxBoundsError = 0, maxNormalLengthError = 0;
for (const node of gltf.nodes) {
  assert(node.matrix === undefined && node.rotation === undefined && node.translation === undefined && node.scale === undefined);
  const part = source.parts.find(p => p.name === node.name); assert(part);
  const mesh = gltf.meshes[node.mesh]; assert.equal(mesh.primitives.length, 1);
  const p = mesh.primitives[0];
  assert(p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined);
  const positions = accessor(p.attributes.POSITION), normals = accessor(p.attributes.NORMAL), uv = accessor(p.attributes.TEXCOORD_0);
  assert(positions.flat().every(Number.isFinite) && normals.flat().every(Number.isFinite) && uv.flat().every(Number.isFinite));
  for (let axis = 0; axis < 3; axis++) for (const reducer of [Math.min, Math.max]) {
    const actual = reducer(...positions.map(p => p[axis])), original = reducer(...part.positions.filter((_, i) => i % 3 === axis));
    maxBoundsError = Math.max(maxBoundsError, Math.abs(actual - original));
  }
  for (const n of normals) maxNormalLengthError = Math.max(maxNormalLengthError, Math.abs(Math.hypot(...n) - 1));
  triangles += gltf.accessors[p.indices].count / 3;
}
assert.equal(triangles, source.parts.reduce((sum, p) => sum + p.indices.length / 3, 0));
assert.equal(gltf.materials.length, 4); assert(maxBoundsError < .0001 && maxNormalLengthError < .00001);
const file = path => ({ path, bytes: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
const report = { source: file(sourcePath), blend: file(blendPath), glb: file(glbPath), objects: gltf.nodes.length, materials: gltf.materials.length,
  triangles, maxBoundsErrorMetres: maxBoundsError, maxNormalLengthError, normalAndUvPresent: true, rendered: false,
  verification: 'Direct portable-file geometry and attribute inspection; no Blender reimport or visual judgment.' };
writeFileSync('tools/world/coaster-rail-craft-20261105/native-export-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
