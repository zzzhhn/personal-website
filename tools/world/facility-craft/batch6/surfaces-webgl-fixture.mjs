import * as THREE from 'three';
import { facilitySurfaceUniforms, setFacilityEnvironment } from '../../../../src/components/world/WorldFacilitySurface';
import { createStreetMaterial, paintAtlas } from '../../../../src/components/world/WorldStreetMaterial';
import { parkMaterial, parkNight, PARK_MATERIALS, toBatch } from '../../../../src/components/world/WorldParkKit';
import { night } from '../../../../src/components/world/WorldNight';

const size = 32;
const samplers = ['uFacilityWood', 'uFacilityNormal', 'uFacilityRough'];
const fill = (count, values) => Float32Array.from({ length: count * values.length }, (_, i) => values[i % values.length]);

function renderHost() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(size, size);
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    throw new Error([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
  };
  if (!renderer.extensions.get('EXT_color_buffer_float')) throw new Error('Floating-point WebGL readback is unavailable');
  const target = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType });
  const scene = new THREE.Scene(); // IBL and emission can be measured without any direct light.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
  camera.position.z = 3;
  function draw(mesh) {
    scene.add(mesh);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0, 0);
    try {
      renderer.render(scene, camera);
      const pixels = new Float32Array(size * size * 4);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const gl = renderer.getContext();
      if (gl.getError() !== gl.NO_ERROR || !pixels.every(Number.isFinite)) throw new Error('Invalid WebGL framebuffer readback');
      return pixels;
    } finally {
      renderer.setRenderTarget(null);
      scene.remove(mesh);
    }
  }
  return { renderer, draw, dispose() { target.dispose(); renderer.dispose(); } };
}

function channels(pixels) {
  const minimum = [Infinity, Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity, -Infinity];
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < pixels.length; i++) {
    const lane = i % 4, value = pixels[i];
    minimum[lane] = Math.min(minimum[lane], value);
    maximum[lane] = Math.max(maximum[lane], value);
    mean[lane] += value / (size * size);
  }
  return { minimum, maximum, mean };
}

function face(slot = 0, uv) {
  const geometry = new THREE.PlaneGeometry(2.2, 2.2), count = geometry.attributes.position.count;
  geometry.setAttribute('color', new THREE.BufferAttribute(fill(count, [.44, .37, .30]), 3));
  geometry.setAttribute('aMat', new THREE.BufferAttribute(fill(count, [.86, 0, 0, slot]), 4));
  geometry.setAttribute('aEmit', new THREE.BufferAttribute(fill(count, [0, 0, 0]), 3));
  geometry.setAttribute('aSuv', uv ? new THREE.BufferAttribute(fill(count, uv), 2) : geometry.attributes.uv.clone());
  return geometry;
}

function texel(r, g = r, b = r) {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

// Execute the complete installed material. Only Three's final output hook is used
// to read the already evaluated albedo, view normal or roughness without lighting.
function inspectMaterial(material, output) {
  const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  const key = cacheKey.call(material);
  let inputs;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    inputs = Object.fromEntries(samplers.map(name => {
      const uniform = { value: shader.uniforms[name]?.value };
      if (shader.uniforms[name]) shader.uniforms[name] = uniform;
      return [name, uniform];
    }));
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
      `#include <dithering_fragment>\n gl_FragColor = ${output};`);
  };
  material.customProgramCacheKey = () => key + ':' + output;
  material.needsUpdate = true;
  return {
    textures(wood, normal, rough) {
      inputs.uFacilityWood.value = wood;
      inputs.uFacilityNormal.value = normal;
      inputs.uFacilityRough.value = rough;
    },
    restore() {
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = cacheKey;
      material.needsUpdate = true;
    },
  };
}

async function waitForScans() {
  const pack = facilitySurfaceUniforms();
  const scans = samplers.map(name => pack[name].value);
  for (let i = 0; i < 200 && scans.some(texture => !texture?.image); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  if (scans.some(texture => !texture?.image)) throw new Error('Published facility texture failed to load');
  return scans.map(({ image, colorSpace, wrapS, wrapT }) => ({
    width: image.width, height: image.height, colorSpace, repeat: wrapS === THREE.RepeatWrapping && wrapT === THREE.RepeatWrapping,
  }));
}

function scanResponse(draw, material, wooden, plain, maps) {
  const wood = new THREE.Mesh(wooden, material), untreated = new THREE.Mesh(plain, material);
  const output = inspectMaterial(material, 'vec4(diffuseColor.rgb, roughnessFactor)');
  const shipped = channels(draw(wood));
  const untagged = channels(draw(untreated));
  output.textures(maps.gold, maps.forward, maps.smooth);
  const gold = channels(draw(wood)).mean;
  output.textures(maps.gray, maps.reverse, maps.rough);
  const gray = channels(draw(wood)).mean;
  const untreatedAfterSwap = channels(draw(untreated));
  output.restore();

  const surfaceNormal = inspectMaterial(material, 'vec4(normal * 0.5 + 0.5, roughnessFactor)');
  draw(wood);
  surfaceNormal.textures(maps.gold, maps.forward, maps.smooth);
  const forward = channels(draw(wood)).mean;
  surfaceNormal.textures(maps.gold, maps.reverse, maps.smooth);
  const reverse = channels(draw(wood)).mean;
  const normalUntagged = channels(draw(untreated)).mean;
  surfaceNormal.restore();
  return { shipped, untagged, gold, gray, untreatedAfterSwap, forward, reverse, normalUntagged };
}

function environmentResponse(draw, material, wooden, plain) {
  const wood = new THREE.Mesh(wooden, material), untreated = new THREE.Mesh(plain, material);
  function frame(value) {
    night.value = value;
    return { wood: channels(draw(wood)).mean, untreated: channels(draw(untreated)).mean };
  }
  return { day: frame(0), night: frame(1) };
}

function streetResponse(draw, material, plain) {
  const signs = [[.25, .5], [.75, .5]].map(uv => face(1, uv));
  const probe = inspectMaterial(material, 'vec4(diffuseColor.rgb, 1.0)');
  const atlas = signs.map(geometry => channels(draw(new THREE.Mesh(geometry, material))).mean);
  probe.restore();
  signs.forEach(geometry => geometry.dispose());

  const batch = new THREE.BatchedMesh(1, plain.attributes.position.count, plain.index.count, material);
  const instance = batch.addInstance(batch.addGeometry(plain));
  const frames = [0, .25, .5, .75, 1].map(fade => {
    batch.setColorAt(instance, new THREE.Vector4(1, 1, 1, fade));
    const image = draw(batch);
    const pixel = (x, y) => image[4 * (size * y + x) + 3];
    const tile = Array.from({ length: 16 }, (_, i) => pixel(i % 4, Math.floor(i / 4)));
    let repeated = true;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (pixel(x, y) !== tile[x % 4 + 4 * (y % 4)]) repeated = false;
    }
    return { fade, coverage: channels(image).mean[3], tile, repeated };
  });
  batch.dispose();
  return { atlas, frames };
}

function parkGlow(draw, material) {
  const source = new THREE.PlaneGeometry(2.2, 2.2);
  const faces = ['park_stone', 'park_glass_frosted', 'park_cyan_glow'].map(name => {
    const { color, emit } = PARK_MATERIALS[name];
    return toBatch(source, new THREE.Matrix4(), color, emit);
  });
  const meshes = faces.map(geometry => new THREE.Mesh(geometry, material));
  function frame(value) {
    parkNight.value = value;
    return meshes.map(mesh => channels(draw(mesh)).mean);
  }
  const result = { dusk: frame(0), night: frame(1) };
  for (const geometry of [source, ...faces]) geometry.dispose();
  return result;
}

export async function sampleFacilitySurfaces() {
  const host = renderHost();
  const gl = host.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const drawingDevice = gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  const atlas = paintAtlas([
    { rect: [0, 0, 8, 16], paint(ctx, w, h) { ctx.fillStyle = '#e63d25'; ctx.fillRect(0, 0, w, h); } },
    { rect: [8, 0, 8, 16], paint(ctx, w, h) { ctx.fillStyle = '#2570dd'; ctx.fillRect(0, 0, w, h); } },
  ], 16);
  const street = createStreetMaterial(atlas), park = parkMaterial();
  const wooden = face(-1), plain = face();
  const maps = { gold: texel(223, 181, 124), gray: texel(84, 87, 96), forward: texel(192, 128, 242),
    reverse: texel(63, 128, 242), smooth: texel(25), rough: texel(248) };
  const pmrem = new THREE.PMREMGenerator(host.renderer);
  let environment;
  try {
    const scans = await waitForScans();
    const materials = { street, park };
    const surface = Object.fromEntries(Object.entries(materials).map(([name, material]) =>
      [name, scanResponse(host.draw, material, wooden, plain, maps)]));
    const sky = new THREE.Scene();
    sky.background = new THREE.Color(1, .85, .7);
    environment = pmrem.fromScene(sky);
    setFacilityEnvironment(environment.texture);
    const ibl = Object.fromEntries(Object.entries(materials).map(([name, material]) =>
      [name, environmentResponse(host.draw, material, wooden, plain)]));
    setFacilityEnvironment(null);
    return { drawingDevice, scans, surface, ibl, street: streetResponse(host.draw, street, plain), glow: parkGlow(host.draw, park) };
  } finally {
    setFacilityEnvironment(null);
    for (const resource of [environment, pmrem, atlas, wooden, plain, street, park, ...Object.values(maps), host]) resource?.dispose();
  }
}
