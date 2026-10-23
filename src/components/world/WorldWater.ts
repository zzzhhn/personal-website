import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial, Uint32BufferAttribute, Vector4 } from 'three';
import { windUniforms } from './WorldWind';
import { SHORE_GLSL, shoreUniforms } from './WorldLandform';

/** quality-v3 sea (spec §2). Four Gerstner waves (GPU Gems ch. 1, technique only) displace a
 * camera-following grid in world space: wavelengths 3.4-13 m, summed amplitude 0.245 m,
 * steepness Q 0.6, directions within +-38 deg of the island wind (0.8, 0.6), deep-water
 * dispersion c = sqrt(g L / 2 pi) (speed scale 1). Flat-shaded facets, shore foam and the
 * deep -> near-shore tint come from the baked shore distance field. Waves are visual only:
 * the mean surface stays at WATER_Y, which physics, recovery and the camera still use. One
 * draw call, no extra render pass; time and strength come from the shared wind clock. */

export const SEA_WAVES = [
  { lengthM: 13, amplitude: .09, angleDeg: 0 },
  { lengthM: 8.5, amplitude: .07, angleDeg: 24 },
  { lengthM: 5.3, amplitude: .05, angleDeg: -31 },
  { lengthM: 3.4, amplitude: .035, angleDeg: 38 },
] as const;
export const SEA_STEEPNESS = .6;
export const SEA_SPEED_SCALE = 1;
const WIND_ANGLE = Math.atan2(.6, .8);
/** Fine grid half-size (0.5 m spacing) around the focus; waves fade out over 48-58 m. */
export const SEA_FINE_HALF = 60, SEA_CELL = .5, SEA_OUTER = 300;

function waveGlsl() {
  const g = 9.81, n = SEA_WAVES.length;
  return SEA_WAVES.map(w => {
    const k = 2 * Math.PI / w.lengthM, a = WIND_ANGLE + w.angleDeg * Math.PI / 180;
    const speed = Math.sqrt(g / k) * SEA_SPEED_SCALE, q = SEA_STEEPNESS / (k * w.amplitude * n);
    const f = (v: number) => v.toFixed(5);
    return `  seaWave(vec2(${f(Math.cos(a))}, ${f(Math.sin(a))}), ${f(k)}, ${f(w.amplitude)}, ${f(q)}, ${f(speed * k)}, p, t, amp, disp);`;
  }).join('\n');
}

const VERTEX_HEAD = /* glsl */`
uniform float uSeaTime; uniform float uSeaMotion;
varying vec3 vSeaWorld;
varying float vSeaCrest;
${SHORE_GLSL}
void seaWave(vec2 d, float k, float a, float q, float w, vec2 p, float t, float amp, inout vec3 disp) {
  float ph = k * dot(d, p) - w * t, c = cos(ph), s = sin(ph);
  disp += vec3(q * a * d.x * c, a * s, q * a * d.y * c) * amp;
}
`;

/** Clear spots: up to four soft world-space discs (x, z, radius, strength 0..1) where the sea
 * turns see-through around a body that is in the water, so the submerged body and the seabed
 * show. Driven by WorldSea from the actor tracker; strength is 0 when nobody is in the water. */
export const SEA_SPOTS = 4;
export const seaSpotUniform = { value: Array.from({ length: SEA_SPOTS }, () => new Vector4()) };
/** Remaining opacity at the spot centre (water tint is kept so it still reads as water). */
export const SEA_SPOT_MIN_ALPHA = .16;

export function createWorldWaterMaterial(color: string) {
  // Transparent only for the clear spots (alpha is 1 elsewhere); it still writes depth, and every
  // opaque body and the seabed are drawn before it.
  const material = new MeshStandardMaterial({ color, emissive: '#17424A', emissiveIntensity: 0, roughness: .5, metalness: 0, flatShading: true, transparent: true, depthWrite: true });
  material.name = 'world-sea-gerstner';
  // Near-shore tint as a linear ratio of the Art Lock pair, so the night colour lerp in
  // Lighting (#1E5A5E -> #0E2A33) darkens both depths together.
  const deep = new Color('#1E5A5E'), near = new Color('#3C8A8A');
  const uniforms = {
    ...shoreUniforms(),
    uSeaTime: windUniforms.uWindTime, uSeaMotion: windUniforms.uWindStrength,
    uNearTint: { value: [near.r / deep.r, near.g / deep.g, near.b / deep.b] },
    uFoam: { value: new Color('#E6DCCB') },
    uDeepLuma: { value: .2126 * deep.r + .7152 * deep.g + .0722 * deep.b },
    uSeaSpot: seaSpotUniform,
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec2 centre = modelMatrix[3].xz, p = wp.xz;
        float window = max(abs(p.x - centre.x), abs(p.y - centre.y));
        float amp = (1.0 - smoothstep(48.0, 58.0, window)) * uSeaMotion;
        // Slightly smaller swell right at the waterline, full height from 6 m out.
        amp *= mix(0.6, 1.0, smoothstep(0.0, 6.0, shoreSigned(shoreSample(p))));
        vec3 disp = vec3(0.0); float t = uSeaTime;
        if (amp > 0.0) {
${waveGlsl()}
        }
        transformed += disp;
        vSeaCrest = disp.y / ${SEA_WAVES.reduce((a, w) => a + w.amplitude, 0).toFixed(3)};
      }`).replace('#include <project_vertex>', `#include <project_vertex>
      vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `varying vec3 vSeaWorld;\nvarying float vSeaCrest;\nuniform float uSeaTime; uniform float uSeaMotion; uniform vec3 uNearTint; uniform vec3 uFoam; uniform float uDeepLuma; uniform vec4 uSeaSpot[${SEA_SPOTS}];\n${SHORE_GLSL}
float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y); }
` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 sp = vSeaWorld.xz;
      float shoreD = shoreSigned(shoreSample(sp));
      // Deep -> near-shore teal over 0-8 m from the waterline.
      diffuseColor.rgb *= mix(uNearTint, vec3(1.0), smoothstep(0.0, 8.0, shoreD));
      // Stylised crest/trough tint (+-14%) so the travelling swell reads from the high camera.
      diffuseColor.rgb *= 1.0 + 0.14 * clamp(vSeaCrest, -1.0, 1.0);
      // Swash foam: a broken cream band (0.4-1.2 m wide) that runs 0.55 m up and back every
      // ~5.5 s, plus a faint second line further out; noise drifts slowly to break it up.
      float tt = uSeaTime * step(0.001, uSeaMotion);
      float sw = shoreSwash(sp, tt);
      float width = 0.4 + 0.8 * sNoise(sp * 0.35 + 3.1);
      float edge = shoreD + 0.3 - 0.55 * sw;
      float band = (1.0 - smoothstep(width - 0.25, width + 0.1, edge)) * smoothstep(-0.6, -0.2, edge);
      float breakup = smoothstep(0.28, 0.62, sNoise(sp * 0.9 + vec2(tt * 0.12, -tt * 0.07)) * 0.75 + sNoise(sp * 2.6) * 0.25);
      float outer = smoothstep(0.25, 0.0, abs(shoreD - 1.8 - 1.1 * (1.0 - sw))) * 0.45 * smoothstep(0.45, 0.75, sNoise(sp * 0.7 - tt * 0.05));
      float foam = clamp(band * mix(0.55, 1.0, breakup) + outer, 0.0, 1.0) * (1.0 - smoothstep(10.0, 14.0, shoreD));
      // Foam brightness follows the lighting's sea colour (1 at dusk, ~0.4 at night).
      float seaLight = clamp(dot(diffuse, vec3(0.2126, 0.7152, 0.0722)) / uDeepLuma, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, uFoam * mix(0.45, 1.0, seaLight), 0.85 * foam);
      // Clear spot around submerged bodies: soft edge (inner 45 % fully clear), slightly brighter
      // teal rim so the hole reads as clear water, not a missing surface.
      float clear = 0.0;
      for (int i = 0; i < ${SEA_SPOTS}; i++) {
        vec4 sp4 = uSeaSpot[i];
        if (sp4.w <= 0.0) continue;
        float l = distance(sp, sp4.xy);
        clear = max(clear, sp4.w * (1.0 - smoothstep(sp4.z * 0.45, sp4.z, l)));
      }
      diffuseColor.rgb *= 1.0 + 0.25 * clear;
      diffuseColor.a = mix(1.0, ${SEA_SPOT_MIN_ALPHA.toFixed(2)}, clear);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        // Fine ripples on top of the flat facets (keep distant water moving after waves fade).
        vec2 a = vec2(0.72, 0.36) * 1.6, b = vec2(-0.34, 1.10) * 1.9, c = vec2(1.45, -0.62) * 2.2;
        float fine = 1.0 - smoothstep(0.12, 0.45, length(fwidth(sp)));
        vec2 slope = a * (0.07 * cos(dot(sp, a) - uSeaTime * 1.6)) + b * (0.045 * fine * cos(dot(sp, b) - uSeaTime * 1.9 + 1.8))
                   + c * (0.03 * fine * cos(dot(sp, c) - uSeaTime * 2.3 + 0.7));
        normal = normalize(normal + (viewMatrix * vec4(-slope.x * uSeaMotion, 0.0, -slope.y * uSeaMotion, 0.0)).xyz);
      }`);
  };
  material.customProgramCacheKey = () => 'world-sea-gerstner-v4';
  return material;
}

/** Tensor grid: 0.5 m cells over +-60 m, then spacing grows x1.3 per step out to +-300 m. */
export function createSeaGeometry() {
  const coords: number[] = [];
  for (let v = -SEA_FINE_HALF; v <= SEA_FINE_HALF + 1e-6; v += SEA_CELL) coords.push(+v.toFixed(3));
  let step = SEA_CELL, v = SEA_FINE_HALF;
  while (v < SEA_OUTER) { step *= 1.3; v = Math.min(SEA_OUTER, v + step); coords.push(v); coords.unshift(-v); }
  const n = coords.length, pos = new Float32Array(n * n * 3), normal = new Float32Array(n * n * 3), idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 3; pos[k] = coords[i]; pos[k + 2] = coords[j]; normal[k + 1] = 1;
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if ((i + j) % 2) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setIndex(new Uint32BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 1;
  return g;
}
