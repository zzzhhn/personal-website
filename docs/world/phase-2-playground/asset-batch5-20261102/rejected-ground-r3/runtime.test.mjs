/** No renderer/service: compile the affected material factory and check its contracts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const path = 'src/components/world/WorldTerrain.tsx';
const current = readFileSync(path, 'utf8');
const baselineRevision = '2f22560fff2174195d8ce70b855ae4b871a388a7';
const baseline = execFileSync('git', ['show', `${baselineRevision}:${path}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const westPath = JSON.parse(readFileSync('src/components/world/WorldLandform.ts', 'utf8').match(/\[\[-59, 33\][^\n]+\]/)[0]);
function ground(source, search) {
  const prefix = source.slice(0, source.indexOf('/** Footprints where ground detail')).replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
  const code = ts.transpileModule(`${prefix}\nexports.make = createGroundMaterial;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { ...THREE, exports: {}, window: { location: { search } }, URLSearchParams,
    GROUND_Y: .22, SHORE_GLSL: '', shoreUniforms: () => ({}), weatherUniforms: {},
    windUniforms: { uWindTime: { value: 0 }, uWindStrength: { value: 1 } },
    WORN_PATHS: [[], [], westPath],
  };
  vm.runInNewContext(code, context, { timeout: 1000 });
  const material = context.exports.make(Array.from({ length: 6 }, () => new THREE.Texture()));
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  return { shader, key: material.customProgramCacheKey() };
}

test('facility legacy returns the exact batch4 material; older nature legacy retains priority', () => {
  const old = ground(baseline, '');
  const legacy = ground(current, '?facilityCraft=legacy');
  assert.equal(legacy.shader.vertexShader, old.shader.vertexShader);
  assert.equal(legacy.shader.fragmentShader, old.shader.fragmentShader);
  assert.equal(legacy.key, old.key);
  const ancient = ground(baseline, '?natureCraft=legacy');
  for (const query of ['?natureCraft=legacy', '?natureCraft=legacy&facilityCraft=legacy']) {
    const actual = ground(current, query);
    assert.equal(actual.shader.fragmentShader, ancient.shader.fragmentShader);
    assert.equal(actual.key, ancient.key);
  }
});

test('candidate retains vertex ABI and 18 reads, with no unmasked pigment correction', () => {
  const actual = ground(current, '').shader, old = ground(baseline, '').shader;
  assert.equal(actual.vertexShader, old.vertexShader);
  assert.equal((actual.fragmentShader.match(/tileMix\(uAlb/g) || []).length, 3);
  assert.equal((actual.fragmentShader.match(/tileNormalMix\(uNr/g) || []).length, 3);
  assert.equal((actual.fragmentShader.match(/texture2D\(/g) || []).length, 6); // two helpers, three reads each
  assert.ok(actual.fragmentShader.includes('vec3 gw = max(vGroundMix.xyz, vec3(0.0));'));
  assert.ok(actual.fragmentShader.includes('if (patchScope > 0.0)'));
  assert.ok(actual.fragmentShader.includes('if (natureSample > 0.0 && tWalk > 0.001)'));
  assert.ok(actual.fragmentShader.includes('vec2(-61.5, 34.0)'));
  assert.equal((actual.fragmentShader.match(/d = min\(d, naturePathSegment/g) || []).length, westPath.length - 1);
  assert.ok(actual.fragmentShader.includes('smoothstep(0.55, 0.78, pathD)'));
  assert.ok(actual.fragmentShader.includes('vec3 patchWeights = vec3(clamp(grassCover'));
});

test('coverage remap is finite; outside scope is exact; pure shoulders can become islands or bare soil', () => {
  const remap = (raw, grass, scope) => {
    const nonnegative = raw.map(x => Math.max(0, x));
    const sum = Math.max(nonnegative.reduce((a, b) => a + b, 0), .001);
    const gw = nonnegative.map(x => x / sum);
    if (scope === 0 || !nonnegative.some(Boolean)) return gw;
    const desired = [grass, 0, 1 - grass];
    const result = gw.map((x, i) => x * (1 - scope) + desired[i] * scope);
    const norm = Math.max(result.reduce((a, b) => a + b, 0), .001);
    return result.map(x => x / norm);
  };
  for (const raw of [[-.5, .4, .8], [1, 0, 0], [0, 0, 1], [0, 0, 0], [.4, .2, .4]]) {
    const nonnegative = raw.map(x => Math.max(0, x));
    const sum = Math.max(nonnegative.reduce((a, b) => a + b, 0), .001);
    const weights = nonnegative.map(x => x / sum);
    for (const cover of [0, .5, 1]) {
      for (const scope of [0, .5, 1]) remap(raw, cover, scope).forEach(x => { assert.ok(Number.isFinite(x)); assert.ok(x >= 0); });
      assert.deepEqual(remap(raw, cover, 0), weights);
    }
  }
  assert.ok(remap([1, 0, 0], .02, 1)[2] > .95);
  assert.ok(remap([0, 0, 1], .98, 1)[0] > .95);
  assert.deepEqual(remap([.4, .2, .4], 0, 1), [0, 0, 1]); // explicit bare path core
});

test('jittered island field contains filled turf and bare interstices at normal-view scale', () => {
  const fract = x => x - Math.floor(x);
  const hash = (x, y) => {
    x = fract(x * 123.34); y = fract(y * 456.21);
    const d = x * (x + 45.32) + y * (y + 45.32);
    return fract((x + d) * (y + d));
  };
  const sdf = (px, py) => {
    const cx = Math.floor(px / .82), cy = Math.floor(py / .82);
    let nearest = 10;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy, h = hash(x + 17.31, y + 17.31), jy = hash(x + 49.73, y + 49.73);
      let ax = h - .457, ay = jy - .531;
      const len = Math.max(Math.hypot(ax, ay), .01); ax /= len; ay /= len;
      const rx = px - (x + .16 + .68 * h) * .82, ry = py - (y + .16 + .68 * jy) * .82;
      const lx = rx * ax + ry * ay, ly = (-rx * ay + ry * ax) * (.78 + h * .63);
      nearest = Math.min(nearest, Math.hypot(lx, ly) - (.23 + .20 * hash(x + 81.19, y + 81.19)));
    }
    return nearest;
  };
  const values = [];
  for (let x = -64; x <= -59; x += .05) for (let y = 33.7; y <= 35; y += .05) values.push(sdf(x, y));
  assert.ok(values.filter(x => x < -.025).length > values.length * .20);
  assert.ok(values.filter(x => x > .025).length > values.length * .10);
  assert.ok(values.every(Number.isFinite));
});
