import { Box3, Color, Float32BufferAttribute, Frustum, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, MeshStandardMaterial, Uint16BufferAttribute, Vector3, Vector4, type Camera } from 'three';
import { windUniforms } from './WorldWind';
import { CELL as SHORE_CELL, GRID as SHORE_GRID, SHORE_GLSL, shoreField, shoreUniforms } from './WorldLandform';
import { WATER_Y } from './layout';

/** quality-v3 sea (spec §2). Four Gerstner waves (GPU Gems ch. 1, technique only) displace a
 * camera-following grid in world space: wavelengths 3.4-13 m, summed amplitude 0.245 m,
 * steepness Q 0.6, directions within +-38 deg of the island wind (0.8, 0.6), deep-water
 * dispersion c = sqrt(g L / 2 pi) (speed scale 1). Flat-shaded facets, shore foam and the
 * deep -> near-shore tint come from the baked shore distance field. Waves are visual only:
 * the mean surface stays at WATER_Y, which physics, recovery and the camera still use. One
 * draw call, no extra render pass; time and strength come from the shared wind clock.
 *
 * Geometry (render session, 2026-10-24): CDLOD (Strugar 2009, technique only). One instanced 8 x 8-cell
 * quadrant patch; a per-frame quadtree around the CAMERA picks quadrants whose cell size doubles with each
 * distance ring (0.35 m within SEA_LOD.r0, 1 m to 2 r0, ...), skips quadrants entirely on land or outside the
 * view, and geomorphs odd vertices onto the coarser grid near each ring edge, so neighbouring rings share
 * vertices exactly (no cracks, no popping). Projected facet size stays roughly constant on screen. Waves fade
 * per wavelength by the local (distance-continuous) cell size, so no wave is undersampled; their shading is
 * carried on by the fine ripple normals. Still one draw call. */

export const SEA_WAVES = [
  { lengthM: 13, amplitude: .09, angleDeg: 0 },
  { lengthM: 8.5, amplitude: .07, angleDeg: 24 },
  { lengthM: 5.3, amplitude: .05, angleDeg: -31 },
  { lengthM: 3.4, amplitude: .035, angleDeg: 38 },
] as const;
export const SEA_STEEPNESS = .6;
export const SEA_SPEED_SCALE = 1;
const WIND_ANGLE = Math.atan2(.6, .8);
/** CDLOD: base cell 0.35 m, quadrant = 8 x 8 cells, ring k ends at r0 * 2^k (3D distance from the camera to the
 * undisplaced surface), 7 levels (64 m cells beyond ~1.4 km), nothing drawn past maxDistance (camera far 600 m;
 * fog is opaque from 360 m). */
export const SEA_LOD = { cell: .35, quad: 8, r0: 22, levels: 7, maxDistance: 620 } as const;
export const SEA_CELL = SEA_LOD.cell;
/** Surf: shore-normal swell (wavelength 6 m, period ~5.5 s in step with the swash) rolling in over the last 14 m. */
export const SEA_SURF = { lengthM: 6, amplitude: .07 } as const;

function waveGlsl() {
  const g = 9.81, n = SEA_WAVES.length;
  return SEA_WAVES.map(w => {
    const k = 2 * Math.PI / w.lengthM, a = WIND_ANGLE + w.angleDeg * Math.PI / 180;
    const speed = Math.sqrt(g / k) * SEA_SPEED_SCALE, q = SEA_STEEPNESS / (k * w.amplitude * n);
    const f = (v: number) => v.toFixed(5);
    // Fade a wave once the local cell exceeds lambda / 3.4 (fully gone at lambda / 2.4): never undersampled.
    return `  seaWave(vec2(${f(Math.cos(a))}, ${f(Math.sin(a))}), ${f(k)}, ${f(w.amplitude)}, ${f(q)}, ${f(speed * k)}, p, t, amp * (1.0 - smoothstep(${f(w.lengthM / 3.4)}, ${f(w.lengthM / 2.4)}, cellEff)), disp);`;
  }).join('\n');
}

/** Surf phase shared by the vertex swell and the fragment foam: crests roll toward the beach with the swash period;
 * a smooth along-shore offset (two incommensurate sines, up to ~0.4 wavelength) bends and spaces them unevenly. */
const SURF_GLSL = /* glsl */`
float surfPhase(vec2 p, float shoreD, float t) {
  float off = 1.5 * sin(dot(p, vec2(0.043, 0.067))) + 0.9 * sin(dot(p, vec2(-0.081, 0.029)) + 1.3);
  return shoreD * ${(2 * Math.PI / SEA_SURF.lengthM).toFixed(5)} + t * 1.1424 + off;
}
`;
const VERTEX_HEAD = /* glsl */`
uniform float uSeaTime; uniform float uSeaMotion;
attribute vec4 seaPatch;
varying vec3 vSeaWorld;
varying float vSeaCrest;
${SHORE_GLSL}
${SURF_GLSL}
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
/** Sun glitter: world direction toward the sun and its colour x strength (WorldEnvironment drives both per frame). */
export const seaGlintUniforms = { uSunDir: { value: new Vector3(-90, 40, 65).normalize() }, uGlint: { value: new Color(0, 0, 0) } };

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
    uSunDir: seaGlintUniforms.uSunDir, uGlint: seaGlintUniforms.uGlint,
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed;
      {
        // CDLOD quadrant: seaPatch = (origin x, origin z, cell m, ring end m). Odd grid vertices slide onto the
        // coarser grid between 65 % and 90 % of the ring end, so they meet the next ring's vertices exactly.
        vec2 g = position.xz;
        vec2 w0 = seaPatch.xy + g * seaPatch.z;
        float d0 = distance(vec3(w0.x, ${WATER_Y.toFixed(3)}, w0.y), cameraPosition);
        float mk = clamp((d0 - 0.65 * seaPatch.w) / (0.25 * seaPatch.w), 0.0, 1.0);
        g -= fract(g * 0.5) * 2.0 * mk;
        transformed = vec3(seaPatch.x + g.x * seaPatch.z, 0.0, seaPatch.y + g.y * seaPatch.z);
      }
      {
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec2 p = wp.xz;
        // Distance-continuous cell size (>= the drawn cell everywhere), shared by both sides of a ring edge.
        float cellEff = max(${SEA_LOD.cell.toFixed(2)}, distance(wp, cameraPosition) / ${SEA_LOD.r0.toFixed(1)});
        float amp = uSeaMotion;
        float shoreD = shoreSigned(shoreSample(p));
        // Slightly smaller open swell right at the waterline, full height from 6 m out.
        amp *= mix(0.6, 1.0, smoothstep(0.0, 6.0, shoreD));
        vec3 disp = vec3(0.0); float t = uSeaTime;
        if (amp > 0.0) {
${waveGlsl()}
        }
        // Surf: crests rolling toward the beach (phase falls with shore distance over time), peaked, gone at the waterline.
        float surf = pow(0.5 + 0.5 * sin(surfPhase(p, shoreD, t * step(0.001, uSeaMotion))), 3.0) * smoothstep(0.3, 2.0, shoreD) * (1.0 - smoothstep(8.0, 14.0, shoreD));
        surf *= 1.0 - smoothstep(${(SEA_SURF.lengthM / 3.4).toFixed(3)}, ${(SEA_SURF.lengthM / 2.4).toFixed(3)}, cellEff);
        disp.y += ${SEA_SURF.amplitude.toFixed(3)} * surf * uSeaMotion;
        transformed += disp;
        vSeaCrest = disp.y / ${SEA_WAVES.reduce((a, w) => a + w.amplitude, 0).toFixed(3)};
      }`).replace('#include <project_vertex>', `#include <project_vertex>
      vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `varying vec3 vSeaWorld;\nvarying float vSeaCrest;\nuniform vec3 uSunDir; uniform vec3 uGlint;\nfloat seaFootprint = 0.0;\nuniform float uSeaTime; uniform float uSeaMotion; uniform vec3 uNearTint; uniform vec3 uFoam; uniform float uDeepLuma; uniform vec4 uSeaSpot[${SEA_SPOTS}];\n${SHORE_GLSL}\n${SURF_GLSL}
float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y); }
// Three rotated octaves: no axis-aligned cell edges survive the threshold.
float sFbm(vec2 p) { return 0.5 * sNoise(p) + 0.3 * sNoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 17.1) + 0.2 * sNoise(mat2(0.28, 0.96, -0.96, 0.28) * p * 4.11 - 5.3); }
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
      // Near-shore breaker line: its distance (1.3-2.9 m) and width (0.12-0.4 m) wander along the shore.
      float lineD = 1.3 + 1.6 * sFbm(sp * 0.09 + 4.2) + 1.1 * (1.0 - sw), lineW = 0.12 + 0.28 * sFbm(sp * 0.21 - 2.7);
      float outer = (1.0 - smoothstep(lineW * 0.4, lineW, abs(shoreD - lineD))) * 0.5 * smoothstep(0.42, 0.68, sFbm(sp * vec2(0.55, 0.9) - tt * 0.05));
      // Surf foam, per pixel (no interpolated varying, so no facet-shaped patches): broken, soft-edged patches on
      // the front of each rolling crest. Each patch is born as the crest steepens and dies as it passes (the
      // threshold follows the crest phase); patches get rarer and smaller further out.
      float sph = surfPhase(sp, shoreD, tt);
      float crest = 0.5 + 0.5 * sin(sph + 0.55);                      // slightly ahead of the height crest: the face
      float life = 0.5 + 0.5 * sin(sph * 0.5 + sFbm(sp * 0.05) * 6.2832); // every other crest breaks harder, varying along shore
      float zone = smoothstep(0.6, 2.2, shoreD) * (1.0 - smoothstep(4.0, 13.0, shoreD));
      float density = mix(0.62, 0.86, smoothstep(2.0, 12.0, shoreD)) - 0.12 * life;  // higher threshold = sparser
      float capN = sFbm(sp * vec2(0.9, 1.4) + vec2(tt * 0.12, -tt * 0.05));
      float soft = 0.08 + 0.1 * smoothstep(0.0, 0.6, length(fwidth(sp)));
      float caps = smoothstep(density - soft, density + soft, capN * (0.55 + 0.6 * pow(crest, 3.0))) * zone;
      float foam = clamp(band * mix(0.55, 1.0, breakup) + outer + 0.7 * caps, 0.0, 1.0) * (1.0 - smoothstep(10.0, 14.0, shoreD));
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
        // Each ripple fades once a pixel covers a quarter of its wavelength (3.5 / 2.9 / 1.8 m): no moire at grazing angles.
        vec2 a = vec2(0.72, 0.36) * 1.6, b = vec2(-0.34, 1.10) * 1.9, c = vec2(1.45, -0.62) * 2.2;
        float px = length(fwidth(sp));
        seaFootprint = px;
        vec2 slope = a * (0.07 * (1.0 - smoothstep(0.45, 0.9, px)) * cos(dot(sp, a) - uSeaTime * 1.6))
                   + b * (0.045 * (1.0 - smoothstep(0.36, 0.72, px)) * cos(dot(sp, b) - uSeaTime * 1.9 + 1.8))
                   + c * (0.03 * (1.0 - smoothstep(0.22, 0.45, px)) * cos(dot(sp, c) - uSeaTime * 2.3 + 0.7));
        normal = normalize(normal + (viewMatrix * vec4(-slope.x * uSeaMotion, 0.0, -slope.y * uSeaMotion, 0.0)).xyz);
      }`)
      .replace('#include <opaque_fragment>', `{
        // Sun glitter path (spec \u00a72: a narrow warm highlight toward the sun, no mirror reflection): world-space
        // reflection of the rippled facet normal against the fixed sun; fades with the sun at night and under foam.
        vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz), vW = normalize(cameraPosition - vSeaWorld);
        float rs = max(dot(reflect(-vW, nW), uSunDir), 0.0);
        // Far away the sparkles merge into a broader, dimmer path instead of aliasing into streaks.
        float far = smoothstep(0.15, 1.2, seaFootprint), sharp = mix(260.0, 40.0, far);
        outgoingLight += uGlint * (pow(rs, sharp) * mix(2.4, 0.5, far) + pow(rs, 28.0) * 0.12) * (1.0 - foam) * (1.0 - clear);
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'world-sea-cdlod-v5';
  return material;
}

/** The one shared quadrant patch: (quad + 1)^2 vertices in grid units (x, z = 0..quad), every cell split along the
 * same diagonal, which is what makes a fully morphed patch identical to the next coarser ring (CDLOD). */
export function createSeaGeometry(capacity = 1024) {
  const n = SEA_LOD.quad, pos = new Float32Array((n + 1) ** 2 * 3), normal = new Float32Array((n + 1) ** 2 * 3), idx: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const k = (j * (n + 1) + i) * 3; pos[k] = i; pos[k + 2] = j; normal[k + 1] = 1; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, d, a, d, b);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setIndex(new Uint16BufferAttribute(new Uint16Array(idx), 1));
  const patch = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  patch.setUsage(35048); // DynamicDrawUsage
  g.setAttribute('seaPatch', patch);
  g.instanceCount = 0;
  return g;
}
export const SEA_PATCH_TRIANGLES = SEA_LOD.quad * SEA_LOD.quad * 2;

/** Water occupancy on 4 m blocks over the shore lattice (summed-area table): a block is water when any node in it
 * is within 3 m of open water on the land side or beyond. Outside the lattice is open sea. */
const OCC_BLOCK = 4;
let occ: { nx: number; nz: number; sat: Int32Array } | null = null;
function occupancy() {
  if (occ) return occ;
  const { signed } = shoreField(), NX = SHORE_GRID.nx + 1, NZ = SHORE_GRID.nz + 1, per = Math.round(OCC_BLOCK / SHORE_CELL);
  const nx = Math.ceil(NX / per), nz = Math.ceil(NZ / per), sat = new Int32Array((nx + 1) * (nz + 1));
  for (let bz = 0; bz < nz; bz++) for (let bx = 0; bx < nx; bx++) {
    let water = 0;
    for (let j = bz * per; j < Math.min(NZ, bz * per + per + 1) && !water; j++) for (let i = bx * per; i < Math.min(NX, bx * per + per + 1); i++) if (signed[j * NX + i] > -3) { water = 1; break; }
    sat[(bz + 1) * (nx + 1) + bx + 1] = water + sat[bz * (nx + 1) + bx + 1] + sat[(bz + 1) * (nx + 1) + bx] - sat[bz * (nx + 1) + bx];
  }
  return (occ = { nx, nz, sat });
}
/** Does the world rectangle contain any water? */
function hasWater(x0: number, z0: number, size: number) {
  const o = occupancy();
  const fx0 = (x0 - SHORE_GRID.minX) / OCC_BLOCK, fz0 = (z0 - SHORE_GRID.minZ) / OCC_BLOCK, fx1 = fx0 + size / OCC_BLOCK, fz1 = fz0 + size / OCC_BLOCK;
  if (fx0 < 0 || fz0 < 0 || fx1 > o.nx || fz1 > o.nz) return true;
  const a = Math.floor(fx0), b = Math.floor(fz0), c = Math.ceil(fx1), d = Math.ceil(fz1), W = o.nx + 1;
  return o.sat[d * W + c] - o.sat[b * W + c] - o.sat[d * W + a] + o.sat[b * W + a] > 0;
}

const box = new Box3(), boxMin = new Vector3(), boxMax = new Vector3(), frustum = new Frustum(), viewProj = new Matrix4();
export type SeaSelection = { patches: number; triangles: number; byLevel: number[]; camera: number[] };
/** CDLOD selection for this camera into the patch attribute. Returns the stats (QA). */
export function selectSeaPatches(geometry: InstancedBufferGeometry, camera: Camera): SeaSelection {
  const attr = geometry.getAttribute('seaPatch') as InstancedBufferAttribute, arr = attr.array as Float32Array, cap = arr.length / 4;
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const c = camera.position, { cell, quad, r0, levels, maxDistance } = SEA_LOD;
  const range = (k: number) => r0 * 2 ** k, byLevel = new Array(levels).fill(0);
  let n = 0;
  const dist = (x0: number, z0: number, s: number) => Math.hypot(Math.max(x0 - c.x, 0, c.x - x0 - s), Math.max(Math.abs(c.y - WATER_Y) - .4, 0), Math.max(z0 - c.z, 0, c.z - z0 - s));
  const emit = (x0: number, z0: number, k: number) => {
    if (n >= cap || !hasWater(x0, z0, quad * cell * 2 ** k)) return;
    arr.set([x0, z0, cell * 2 ** k, range(k)], n * 4); n++; byLevel[k]++;
  };
  // Node at level k spans 2 quadrants of level k (= 2 * quad cells of size cell * 2^k).
  const select = (x0: number, z0: number, k: number): boolean => {
    const s = 2 * quad * cell * 2 ** k;
    if (dist(x0, z0, s) > Math.min(range(k), maxDistance)) return false;
    box.set(boxMin.set(x0, WATER_Y - .45, z0), boxMax.set(x0 + s, WATER_Y + .45, z0 + s));
    if (!frustum.intersectsBox(box) || !hasWater(x0, z0, s)) return true;
    const h = s / 2;
    if (k === 0 || dist(x0, z0, s) > range(k - 1)) { emit(x0, z0, k); emit(x0 + h, z0, k); emit(x0, z0 + h, k); emit(x0 + h, z0 + h, k); return true; }
    for (const [ox, oz] of [[0, 0], [h, 0], [0, h], [h, h]]) if (!select(x0 + ox, z0 + oz, k - 1)) emit(x0 + ox, z0 + oz, k);
    return true;
  };
  const K = levels - 1, root = 2 * quad * cell * 2 ** K, r = Math.ceil(maxDistance / root);
  const rx = Math.floor(c.x / root), rz = Math.floor(c.z / root);
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) select((rx + i) * root, (rz + j) * root, K);
  geometry.instanceCount = n;
  attr.clearUpdateRanges(); attr.addUpdateRange(0, n * 4); attr.needsUpdate = true;
  return { patches: n, triangles: n * SEA_PATCH_TRIANGLES, byLevel, camera: c.toArray().map(v => +v.toFixed(1)) };
}
