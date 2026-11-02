import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

function geometry(text, legacy = false) {
  const flora = { exports: {}, mineEdgeDistance: () => Infinity };
  const source = readFileSync('src/components/world/alpha-mine-flora.ts', 'utf8').replace(/^import[^\n]*\n/, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, flora);
  const globals = { ...THREE, Float32Array, exports: {}, quarryFloraBanks: flora.exports.quarryFloraBanks, URLSearchParams,
    window: { location: { search: legacy ? '?natureCraft=legacy' : '' } } };
  const cut = text.slice(text.indexOf('const BLADE_H'), text.indexOf('export const GRASS_TUFT_TRIANGLES'));
  vm.runInNewContext(ts.transpileModule(cut, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, globals);
  return globals.exports.grassTuftGeometry();
}
const path = 'src/components/world/WorldGrass.tsx';
const current = readFileSync(path, 'utf8'), baseline = execFileSync('git', ['show', '362e68d:' + path], { encoding: 'utf8' });
const old = geometry(baseline), legacy = geometry(current, true), craft = geometry(current);

test('legacy grass is identical to production including quarry banks and packed attributes', () => {
  assert.deepEqual(Object.keys(legacy.attributes), Object.keys(old.attributes));
  for (const [key, value] of Object.entries(old.attributes)) assert.deepEqual(legacy.getAttribute(key).array, value.array, key);
});
test('cupped blades preserve flora ABI, root anchoring, triangle budget and valid geometry', () => {
  assert.equal(craft.getAttribute('position').count, 45);
  for (const key of ['aBlade', 'aLeafPosition', 'aBloomPosition', 'aBloomColor', 'aFloraKind', 'normal']) {
    assert.deepEqual(craft.getAttribute(key).array, old.getAttribute(key).array, key);
  }
  const pos = craft.getAttribute('position'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let changed = 0;
  for (let i = 0; i < pos.count; i++) {
    assert.ok(pos.getY(i) >= 0 && pos.getY(i) <= .420001);
    if (old.getAttribute('position').getY(i) === 0) assert.equal(pos.getY(i), 0);
    changed += Number(pos.getX(i) !== old.getAttribute('position').getX(i));
  }
  assert.ok(changed > 20);
  for (let i = 0; i < 45; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    assert.ok(b.sub(a).cross(c.sub(a)).length() > 1e-6);
  }
  assert.deepEqual(current.slice(current.indexOf('export function grassMaterial')), baseline.slice(baseline.indexOf('export function grassMaterial')));
});
