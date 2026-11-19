import React from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import manifest from '../../../src/components/world/terrain-artifacts.generated.json';
import { loadTerrainArtifact } from '../../../src/components/world/load-terrain-artifact';

// This fixture runs in an isolated browser drawing buffer. Load the shipped terrain before
// importing the scene, as in the ordinary world client, and use the material the scene mounts.
await loadTerrainArtifact('v4', manifest.v4);
const { IslandTerrain } = await import('../../../src/components/world/WorldTerrain.tsx');
const { createSeaGeometry, createWorldWaterMaterial, seaSpotUniform } = await import('../../../src/components/world/WorldWater');
const { waterContacts, publishWaterImpacts } = await import('../../../src/components/world/WorldWaterInteraction');
const { getShoreTexture, terrainColours } = await import('../../../src/components/world/WorldLandform');
const { windUniforms } = await import('../../../src/components/world/WorldWind');
const { WATER_Y } = await import('../../../src/components/world/layout');

const size = 48;
const canvas = document.createElement('canvas');
document.body.append(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(size, size);
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  throw new Error([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
};
if (!renderer.extensions.get('EXT_color_buffer_float')) throw new Error('Floating-point WebGL readback is unavailable');
const target = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType });
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1.3));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(2, 5, 2);
scene.add(light);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 100);
const origin = new THREE.Vector3();

function render(mesh, { x, z, span, height = 3 }) {
  camera.left = camera.bottom = -span / 2;
  camera.right = camera.top = span / 2;
  camera.position.set(x, height, z);
  camera.up.set(0, 0, -1);
  camera.lookAt(origin.set(x, 0, z));
  camera.updateProjectionMatrix();
  scene.add(mesh);
  renderer.setRenderTarget(target);
  renderer.setClearColor(0, 0);
  renderer.render(scene, camera);
  const pixels = new Float32Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  const context = renderer.getContext();
  if (context.getError() !== context.NO_ERROR) throw new Error('WebGL framebuffer readback failed');
  renderer.setRenderTarget(null);
  scene.remove(mesh);
  return pixels;
}

function summarize(pixels) {
  const sum = [0, 0, 0, 0], minimum = [Infinity, Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity, -Infinity];
  let nonFinite = 0;
  for (let idx = 0; idx < pixels.length; idx++) {
    const channel = idx % 4, value = pixels[idx];
    if (!Number.isFinite(value)) nonFinite++;
    sum[channel] += value; minimum[channel] = Math.min(minimum[channel], value); maximum[channel] = Math.max(maximum[channel], value);
  }
  const middle = 4 * (size * Math.floor(size / 2) + Math.floor(size / 2));
  return { mean: sum.map(value => value / (pixels.length / 4)), minimum, maximum, nonFinite,
    center: Array.from(pixels.subarray(middle, middle + 4)) };
}

function difference(a, b, channel) {
  let sum = 0;
  for (let i = channel; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length / 4);
}

function sharedNormalPixels(near, far) {
  // The far view covers three times as much world space from the same camera position.
  // Compare the 16 x 16 centres common to both grids to vary footprint without moving the probe.
  let delta = 0, count = 0;
  for (let y = 16; y < 32; y++) for (let x = 16; x < 32; x++) {
    const fine = 4 * ((3 * y - 47) * size + 3 * x - 47), coarse = 4 * (y * size + x);
    delta += Math.hypot(near[fine] - far[coarse], near[fine + 1] - far[coarse + 1]);
    count++;
  }
  return delta / count;
}

function constantTexture(r, g, b = 0) {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

// The actual onBeforeCompile produces the whole shader and shared uniforms. When requested,
// use Three's final fragment hook to read its resolved view normal, roughness, or raster depth.
// No application GLSL body is duplicated here.
const materialHooks = new WeakMap();
function instrument(material, output, changeUniforms) {
  if (!materialHooks.has(material)) materialHooks.set(material, {
    compile: material.onBeforeCompile, cacheKey: material.customProgramCacheKey(),
  });
  const { compile, cacheKey } = materialHooks.get(material);
  material.customProgramCacheKey = () => output ? cacheKey + ':' + output : cacheKey;
  material.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    changeUniforms?.(shader.uniforms);
    if (output) shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
      `#include <dithering_fragment>\n gl_FragColor = ${output};`);
  };
}

async function mountGround() {
  extend(THREE);
  const root = createRoot(canvas), groundScene = new THREE.Scene();
  await root.configure({ gl: renderer, scene: groundScene, size: { width: size, height: size, top: 0, left: 0 }, frameloop: 'never', dpr: 1 });
  root.render(React.createElement(React.Suspense, { fallback: null },
    React.createElement(Physics, { paused: true }, React.createElement(IslandTerrain))));
  let terrain;
  for (let i = 0; i < 300 && !terrain; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    terrain = groundScene.getObjectByName('island-terrain-v4-chunk-0');
  }
  if (!terrain) throw new Error('IslandTerrain did not mount');
  return { terrain, unmount: () => root.unmount() };
}

const groundSamples = { grass: [1, 0, 0, 0], sand: [0, 1, 0, 0], dirt: [0, 0, 1, 0], stone: [0, 0, 0, 1] };
const normalOutput = 'vec4(normal * 0.5 + 0.5, roughnessFactor)';

export async function sampleGround() {
  const { terrain, unmount } = await mountGround();
  const { material } = terrain;
  const groundMix = terrain.geometry.getAttribute('groundMix');
  const { groundMix: authored } = terrainColours(terrain.geometry.getAttribute('normal').array);
  const examples = {}, edge = [Infinity, -Infinity];
  for (let i = 0; i < groundMix.count; i++) {
    const lane = groundMix.array.subarray(i * 4, i * 4 + 4);
    for (let j = 0; j < 4; j++) {
      if (lane[j] !== authored[i * 4 + j]) throw new Error('Rendered terrain weights differ from the terrain writer');
      edge[0] = Math.min(edge[0], lane[j]); edge[1] = Math.max(edge[1], lane[j]);
    }
    for (const [name, pure] of Object.entries(groundSamples)) {
      if (!examples[name] && pure.every((value, j) => value === lane[j])) examples[name] = Array.from(lane);
    }
  }
  const geometry = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2);
  const weight = new THREE.Float32BufferAttribute(new Float32Array(16), 4);
  geometry.setAttribute('groundMix', weight);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(.42), 3));
  const mesh = new THREE.Mesh(geometry, material);
  const pbr = !material.flatShading;
  const cacheKey = material.customProgramCacheKey();
  const context = renderer.getContext();
  const scans = new Set();
  const probe = { x: 8.4, z: 12.7, span: .84 };
  mesh.position.set(probe.x, 0, probe.z);
  const baseShore = getShoreTexture();
  const dry = constantTexture(25, 0);
  const wet = constantTexture(124, 0);
  const white = constantTexture(190, 190, 190), darker = constantTexture(55, 55, 55);
  const normalMap = constantTexture(191, 151, 210), sandMap = constantTexture(67, 151, 210);
  const neutral = constantTexture(128, 128, 210);
  // Wait for the real TextureLoader uploads on the material's ordinary path. Controlled
  // scans are substituted only for captures that isolate coverage and normal orientation.
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, gl) => {
    compile(shader, gl);
    for (let i = 0; i < 3; i++) {
      for (const prefix of ['uAlb', 'uNr']) {
        const uniform = shader.uniforms[prefix + i];
        if (!uniform) continue;
        scans.add(uniform.value);
      }
    }
  };
  function draw(lane, span = probe.span) {
    for (let i = 0; i < 4; i++) weight.setXYZW(i, ...lane);
    weight.needsUpdate = true;
    return render(mesh, { ...probe, span });
  }
  draw(groundSamples.grass);
  for (let i = 0; i < 300 && [...scans].some(texture => !texture.image); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  if ([...scans].some(texture => !texture.image)) throw new Error('PBR scan failed to load');
  const shipped = {};
  for (const [name, lane] of Object.entries(groundSamples)) shipped[name] = summarize(draw(lane));
  const program = renderer.info.programs.at(-1).program;
  const uniforms = Array.from({ length: context.getProgramParameter(program, context.ACTIVE_UNIFORMS) }, (_, i) => context.getActiveUniform(program, i).name);
  let captured;
  instrument(material, normalOutput, uniforms => { captured = uniforms; });
  material.needsUpdate = true;
  draw(groundSamples.grass);
  captured.uShore.value = dry;
  if (pbr) for (let i = 0; i < 3; i++) {
    captured[`uAlb${i}`].value = white;
    captured[`uNr${i}`].value = i === 1 ? sandMap : normalMap;
  }
  const mixed = [0.46, 0.36, 0.18, 0];
  // Same Float32 affine extrapolation that derivative helper lanes can receive beyond a
  // real grass/sand edge. Render it in the covered lanes so invalid values can be measured.
  const outside = examples.grass.map((value, i) => Math.fround(value + (examples.sand[i] - value) * 1.125));
  const direction = summarize(draw(groundSamples.grass));
  const mixture = summarize(draw(mixed));
  const boundary = summarize(draw(outside));
  const pureSand = summarize(draw(groundSamples.sand));
  if (pbr) captured.uAlb1.value = darker;
  const darkMixture = summarize(draw(mixed));
  const grassWithDarkSand = summarize(draw(groundSamples.grass));
  if (pbr) for (let i = 0; i < 3; i++) captured[`uNr${i}`].value = neutral;
  const flat = summarize(draw(groundSamples.grass));
  const drySand = summarize(draw(groundSamples.sand));
  captured.uShore.value = wet;
  const wetSand = summarize(draw(groundSamples.sand));
  captured.uShore.value = baseShore;
  geometry.dispose();
  for (const texture of [dry, wet, white, darker, normalMap, sandMap, neutral]) texture.dispose();
  unmount();
  return { pbr, cacheKey, edge, examples, outside, scans: [...scans].map(({ image, colorSpace, wrapS, wrapT }) => ({
    width: image.width, height: image.height, colorSpace, repeated: wrapS === THREE.RepeatWrapping && wrapT === THREE.RepeatWrapping,
  })), uniforms, shipped, direction, mixture, darkMixture, grassWithDarkSand, boundary, pureSand, flat, drySand, wetSand };
}

export function sampleWater() {
  const geometry = createSeaGeometry(1);
  const material = createWorldWaterMaterial('#1E5A5E');
  const cacheKey = material.customProgramCacheKey();
  material.blending = THREE.NoBlending; // retain the water's uncomposited opacity in the float target
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.y = WATER_Y;
  geometry.instanceCount = 1;
  const patch = geometry.getAttribute('seaPatch');
  patch.setXYZW(0, -10, -10, 2.5, 180);
  patch.needsUpdate = true;
  const probe = { x: .52, z: -.37, span: .58 };
  const deep = constantTexture(249, 0), shoal = constantTexture(131, 0);
  let captured;
  instrument(material, null, uniforms => { captured = uniforms; uniforms.uShore.value = deep; });
  const draw = (span = probe.span) => render(mesh, { ...probe, span });
  windUniforms.uWindTime.value = 2;
  windUniforms.uWindStrength.value = 0;
  const dryContact = draw();
  captured.uShore.value = shoal;
  const shoalColor = draw();
  const drawFoam = summarize(draw(10));
  captured.uShore.value = deep;
  seaSpotUniform.value[0].set(probe.x, probe.z, 0.35, 1);
  const opening = summarize(draw(1.4));
  seaSpotUniform.value[0].set(0, 0, 0, 0);
  const body = { id: 'test-wading-player', x: probe.x, y: WATER_Y + .2, z: probe.z, bottom: WATER_Y + .1, radius: .32, kind: 'player' };
  waterContacts.step([body], 1.9, () => WATER_Y);
  waterContacts.step([{ ...body, bottom: WATER_Y - .3 }], 2, () => WATER_Y);
  publishWaterImpacts(2);
  const hit = draw();
  publishWaterImpacts(5);
  const expired = draw();
  waterContacts.reset();
  instrument(material, normalOutput, uniforms => { captured = uniforms; uniforms.uShore.value = deep; });
  material.needsUpdate = true;
  windUniforms.uWindStrength.value = 1;
  const normalNear = draw(1.38), normalFar = draw(4.14);
  captured.uShore.value = shoal;
  const gloss = summarize(draw(10));
  instrument(material, 'vec4(vec3(gl_FragCoord.z), 1.0)', uniforms => { captured = uniforms; uniforms.uShore.value = deep; });
  material.needsUpdate = true;
  const motion = draw(3);
  windUniforms.uWindStrength.value = 0;
  const rest = draw(3);
  geometry.dispose(); material.dispose(); deep.dispose(); shoal.dispose();
  return { cacheKey, deep: summarize(dryContact), shoal: summarize(shoalColor), drawFoam, opening, gloss,
    hit: difference(hit, dryContact, 0), expired: difference(expired, dryContact, 0),
    footprint: sharedNormalPixels(normalNear, normalFar), motion: difference(motion, rest, 0), depth: summarize(motion) };
}
