import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

// Freeze the production material before batch 4, rather than a moving HEAD.
const baseline = '362e68d';
const terrainPath = 'src/components/world/WorldTerrain.tsx';
const waterPath = 'src/components/world/WorldWater.ts';
const source = path => readFileSync(path, 'utf8');
const oldSource = path => execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const terrain = source(terrainPath), water = source(waterPath);
const oldTerrain = oldSource(terrainPath), oldWater = oldSource(waterPath);
const compiled = new Map();

function loadMaterial(text, kind, search = '') {
  const cutoff = kind === 'ground' ? '/** Footprints where ground detail' : '/** The one shared quadrant patch';
  const prefix = text.slice(0, text.indexOf(cutoff)).replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
  const entry = kind === 'ground' ? 'createGroundMaterial' : 'createWorldWaterMaterial';
  const cacheId = `${kind}:${prefix}`;
  if (!compiled.has(cacheId)) {
    compiled.set(cacheId, ts.transpileModule(`${prefix}\nexports.make = ${entry};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText);
  }
  const globals = {
    ...THREE, exports: {}, URLSearchParams, window: { location: { search } },
    GROUND_Y: 0.22, WATER_Y: -0.12,
    NO_UNUSED: null,
    SHORE_GLSL: 'float shoreSigned(vec4 v) { return v.r; }\nvec4 shoreSample(vec2 p) { return vec4(0.0); }\nfloat shoreSwash(vec2 p, float t) { return 0.0; }',
    shoreUniforms: () => ({ uShore: { value: null } }),
    weatherUniforms: { uRain: { value: 0 }, uSnow: { value: 0 } },
    windUniforms: { uWindTime: { value: 0 }, uWindStrength: { value: 1 } },
    WATER_IMPACT_GLSL: 'vec4 waterDisturbance(vec2 p, float h, float t) { return vec4(0.0); }',
    waterImpactUniforms: {},
  };
  vm.runInNewContext(compiled.get(cacheId), globals, { timeout: 1000 });
  return (...args) => {
    const material = globals.exports.make(...args);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader);
    return { material, shader };
  };
}

const fakeTextures = Array.from({ length: 6 }, () => new THREE.Texture());
const baseGround = loadMaterial(oldTerrain, 'ground')(fakeTextures);
const legacyGround = loadMaterial(terrain, 'ground', '?natureCraft=legacy')(fakeTextures);
const newGround = loadMaterial(terrain, 'ground')(fakeTextures);
const baseWater = loadMaterial(oldWater, 'water')('#1E5A5E');
const legacyWater = loadMaterial(water, 'water', '?natureCraft=legacy')('#1E5A5E');
const newWater = loadMaterial(water, 'water')('#1E5A5E');

test('legacy reproduces complete pre-batch-4 ground/water shaders and cache keys', () => {
  for (const [base, legacy] of [[baseGround, legacyGround], [baseWater, legacyWater]]) {
    assert.equal(legacy.shader.fragmentShader, base.shader.fragmentShader);
    assert.equal(legacy.shader.vertexShader, base.shader.vertexShader);
    assert.equal(legacy.material.customProgramCacheKey(), base.material.customProgramCacheKey());
    assert.deepEqual(Object.keys(legacy.shader.uniforms), Object.keys(base.shader.uniforms));
  }
});

test('new materials preserve all vertex displacement and material alpha/interaction code', () => {
  assert.equal(newGround.shader.vertexShader, baseGround.shader.vertexShader);
  assert.equal(newWater.shader.vertexShader, baseWater.shader.vertexShader);
  const clearSpotBlock = shader => shader.fragmentShader.slice(shader.fragmentShader.indexOf('float clear = 0.0;'), shader.fragmentShader.indexOf('#include <alphamap_fragment>'));
  assert.equal(clearSpotBlock(newWater.shader), clearSpotBlock(baseWater.shader));
  assert.ok(clearSpotBlock(newWater.shader).includes('contactWave.w'));
  const groundSuffix = text => text.slice(text.indexOf('/** Footprints where ground detail'));
  const waterSuffix = text => text.slice(text.indexOf('/** The one shared quadrant patch'));
  assert.equal(groundSuffix(terrain), groundSuffix(oldTerrain));
  assert.equal(waterSuffix(water), waterSuffix(oldWater));
});

test('ground coverage uses the existing scans and correctly reorients their normal data', () => {
  const f = newGround.shader.fragmentShader;
  assert.ok(f.includes('vec3 edgeWeights = pow(gw * (1.0 + coverage * 0.7), vec3(1.35));'));
  assert.ok(f.includes('mat2(0.7986, 0.6018, -0.6018, 0.7986)'));
  assert.ok(f.includes('mat2(0.3256, -0.9455, 0.9455, 0.3256)'));
  assert.ok(f.includes('tileNormalMix(uNr0, puv * 1.35, pm)'));
  assert.equal((f.match(/tileMix\(uAlb/g) || []).length, 3);
  assert.equal((f.match(/tileNormalMix\(uNr/g) || []).length, 3);
  assert.ok(!f.includes('tileMix(uNr'));
  // Coverage is normalized, finite, leaves absent materials absent and pure regions pure.
  for (const gw of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.4, 0.35, 0.25], [0, 0, 0]]) {
    for (const coverage of [-0.5, 0, 0.5]) {
      const w = gw.map(x => (x * (1 + coverage * 0.7)) ** 1.35);
      const sum = Math.max(w.reduce((a, b) => a + b, 0), 1e-3);
      w.forEach((x, i) => { assert.ok(Number.isFinite(x / sum)); if (!gw[i]) assert.equal(x, 0); });
      if (gw.some(Boolean)) assert.ok(Math.abs(w.reduce((a, b) => a + b / sum, 0) - 1) < 1e-12);
    }
  }
  const fallback = loadMaterial(terrain, 'ground')(null);
  const oldFallback = loadMaterial(oldTerrain, 'ground')(null);
  assert.equal(fallback.shader.fragmentShader, oldFallback.shader.fragmentShader);
});

test('water refinement changes meaningful surface terms without extra evaluations', () => {
  const f = newWater.shader.fragmentShader, before = baseWater.shader.fragmentShader;
  for (const call of ['sNoise(', 'sFbm(', 'texture2D(', 'cos(', 'sin(']) {
    assert.equal(f.split(call).length, before.split(call).length, `${call} evaluation count`);
  }
  assert.ok(f.includes('band * mix(0.12, 1.0, breakup)'));
  assert.ok(f.includes('smoothstep(0.045, 0.09, px)'));
  assert.ok(f.includes('roughnessFactor = mix(roughnessFactor, 0.92, foam);'));
  assert.ok(f.indexOf('float foam =') < f.indexOf('roughnessFactor = mix(roughnessFactor, 0.92, foam);'));
  assert.notEqual(newWater.material.customProgramCacheKey(), legacyWater.material.customProgramCacheKey());
  assert.notEqual(newGround.material.customProgramCacheKey(), legacyGround.material.customProgramCacheKey());
  const wavelength = 2 * Math.PI / Math.hypot(1.45 * 9.9, -0.62 * 9.9);
  assert.ok(wavelength > 0.39 && wavelength < 0.41);
  assert.ok(0.09 < wavelength / 4, 'short ripples fade before the quarter-wavelength footprint');
});

test('actual terrainColours boundary weights stay finite in extrapolated derivative helper lanes', () => {
  // Run the real CPU weight writer without building the full island or loading a renderer.
  const landform = source('src/components/world/WorldLandform.ts');
  const writer = landform.slice(landform.indexOf('export function terrainColours('), landform.indexOf('\nconst PADS ='));
  const samples = [
    { kind: 'stone', grass: 0 }, { kind: 'grass', grass: 1 }, { kind: 'sand', grass: 0 },
    { kind: 'path', grass: 0.3 }, { kind: 'plaza', grass: 0 },
    { kind: 'grass', grass: Math.fround(1 - 2 ** -24) },
  ];
  const positions = new Float32Array(samples.flatMap((_, i) => [i, 1, 0]));
  const globals = {
    exports: {}, Float32Array, Math,
    buildTerrain: () => ({ positions }),
    groundSample: x => ({ ...samples[x], colour: [0.5, 0.5, 0.5] }),
    valueNoise: () => 0.5,
  };
  const js = ts.transpileModule(writer, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, globals, { timeout: 1000 });
  const raw = globals.exports.terrainColours(new Float32Array(positions.length).fill(1)).groundMix;
  const weights = samples.map((_, i) => Array.from(raw.slice(i * 4, i * 4 + 3)));
  assert.deepEqual(weights.slice(0, 3), [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  assert.ok(weights.flat().every(Number.isFinite));

  // A neighbouring 2x2 derivative quad can run helper lanes beyond a primitive edge.
  // These are affine extrapolations of actual vertex weights, not corrupt CPU data.
  const helpers = [];
  for (let i = 0; i < weights.length; i++) for (let j = 0; j < weights.length; j++) {
    for (const t of [-0.125, -(2 ** -23), 0, 0.5, 1, 1 + 2 ** -23, 1.125]) {
      helpers.push(weights[i].map((x, k) => Math.fround(x + (weights[j][k] - x) * t)));
    }
  }
  // Demonstrate the exact old failure domain before asserting the repaired result.
  const badLane = helpers.find(w => w.some(x => x < 0));
  assert.ok(badLane);
  assert.ok(badLane.some(x => !Number.isFinite(x ** 1.35)), 'fractional pow of an extrapolated negative weight is NaN');
  const f = newGround.shader.fragmentShader;
  assert.ok(f.includes('vec3 gw = max(vGroundMix.xyz, vec3(0.0));'));
  assert.ok(f.includes('gw /= max(dot(gw, vec3(1.0)), 1e-3);'));
  assert.ok(f.indexOf('vec3 gw = max(vGroundMix.xyz') < f.indexOf('vec3 edgeWeights = pow('));
  for (const lane of [...weights, ...helpers, [0, 0, 0], [-1e-20, 1e-20, 0]]) {
    const positive = lane.map(x => Math.max(x, 0));
    const total = Math.max(positive.reduce((a, b) => a + b, 0), 1e-3);
    const gw = positive.map(x => x / total);
    for (const coverage of [-0.5, 0, 0.5]) {
      const edge = gw.map(x => (x * (1 + coverage * 0.7)) ** 1.35);
      const sum = Math.max(edge.reduce((a, b) => a + b, 0), 1e-3);
      const mixed = gw.map((x, k) => x * 0.25 + edge[k] / sum * 0.75);
      // sandWeight and hence derivative inputs no longer receive invalid values.
      assert.ok([...gw, ...edge, ...mixed].every(x => Number.isFinite(x) && x >= 0));
      assert.ok(mixed[1] <= 1 + 1e-12);
    }
  }
});
