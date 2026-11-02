import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import {
  BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, RepeatWrapping, Sphere, Uint32BufferAttribute, Vector3,
  SRGBColorSpace, TextureLoader, type Material, type Texture,
} from 'three';
import { BUILDINGS, FOUNDATIONS, GROUND_Y } from './layout';
import { LAYOUT_V4, keepOutV4 } from './layout-v4';
import { buildTerrain, createTerrainGeometry, grassCandidateJob, scatterCandidates, SHORE_GLSL, shoreUniforms, terrainColours, WORN_PATHS, type ScatterBlocker } from './WorldLandform';
import { useWorldStore } from './store';
import { weatherUniforms } from './WorldNight';
import { buildLodTiles, lodIndices } from './WorldTerrainLod';
import { chunkKey, paveClearance } from './WorldTerrainPaving';
import { useIsClaimed } from './WorldVisualClaims';
import { windUniforms } from './WorldWind';
import WorldGrass, { ActorTracker, actorState, grassDebug } from './WorldGrass';
import { seaSpotDebug } from './WorldSea';
import { useMineManifest } from './alpha-mine-assets';
import { mineLocalToWorld } from './alpha-mine-layout';
import { CLUB_SCATTER_BLOCKERS } from './djc-club-layout';
import { ALPHA_EXCHANGE_FOOTPRINT } from './alpha-exchange-layout';

/** quality-v3 island ground: one 0.5 m faceted terrain (WorldLandform) rendered with vertex
 * colours plus world-space detail and swash-driven wet sand, and the same triangles as the
 * Rapier ground (walk/drive tops `surface`, faces steeper than 25 deg `solid`). */

const NOISE = /* glsl */`
float tHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** Ground look, quality-v4 (Astra ruling, spec §13: PBR detail is the default, procedural v4 is
 * the fallback). Both keep the Art Lock palette and matte intent: per-vertex mottling
 * (WorldLandform), world-space patch noise in hue and value, slope/height material mixing, worn
 * paths, roughness 0.86-1.0 with weakened dielectric specular (F0 0.016, F90 0.4).
 * Default: CC0 ambientCG grass/sand/dirt detail on world-xz UVs, colour-preserving (texture /
 * its mean multiplies the vertex colour, so hue stays Art Lock), normal + roughness channels,
 * two-sample rotated tiling to break repetition, blended by per-vertex material weights. The
 * faceted micro relief is off here (Bobby: origami look up close); the normal map carries detail.
 * Fallback `?groundPbr=0`: no textures; 0.45 m triangular micro facets (<= 5 deg) instead. */
export const GROUND_PBR = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('groundPbr') !== '0';
const PBR_SETS = ['grass', 'sand', 'dirt'] as const;
/** Mean sRGB albedo of each downsized texture (public/assets/world/terrain/SOURCES.json). */
const PBR_MEAN: Record<(typeof PBR_SETS)[number], [number, number, number]> = { grass: [96.4, 108.6, 48.4], sand: [155.7, 138.7, 109.6], dirt: [152.4, 146.8, 87.5] };
const srgbToLinear = (c: number) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };

function loadPbr() {
  const loader = new TextureLoader(), tex: Texture[] = [];
  for (const k of PBR_SETS) for (const kind of ['albedo.jpg', 'nr.png']) {
    const t = loader.load(`/assets/world/terrain/${k}_${kind}`);
    t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4;
    if (kind === 'albedo.jpg') t.colorSpace = SRGBColorSpace;
    tex.push(t);
  }
  return tex;
}

function createGroundMaterial(pbr: Texture[] | null) {
  const legacy = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('natureCraft') === 'legacy';
  const facilityCraft = !legacy && (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('facilityCraft') !== 'legacy');
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: !pbr, roughness: 1, metalness: 0 });
  material.name = pbr ? 'island-terrain-v4-pbr' : 'island-terrain-v4';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shoreUniforms(), weatherUniforms, { uSeaTime: windUniforms.uWindTime, uSeaMotion: windUniforms.uWindStrength });
    if (pbr) {
      PBR_SETS.forEach((k, i) => {
        shader.uniforms[`uAlb${i}`] = { value: pbr[i * 2] }; shader.uniforms[`uNr${i}`] = { value: pbr[i * 2 + 1] };
        shader.uniforms[`uMean${i}`] = { value: PBR_MEAN[k].map(srgbToLinear) };
      });
    }
    shader.vertexShader = 'attribute vec4 groundMix;\nvarying vec4 vGroundMix;\nvarying vec3 vTerrainWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vGroundMix = groundMix;`);
    const pbrHead = pbr ? `
uniform sampler2D uAlb0; uniform sampler2D uAlb1; uniform sampler2D uAlb2;
uniform sampler2D uNr0; uniform sampler2D uNr1; uniform sampler2D uNr2;
uniform vec3 uMean0; uniform vec3 uMean1; uniform vec3 uMean2;
// Anti-tiling: three samples per texture (base, 37 deg rotated + offset at 1.13x, 71 deg
// rotated + offset at 0.87x) with noise weights that change over ~4-9 m, so the repeat
// never forms a visible grid (no square paving read on large plazas).
vec2 rotA(vec2 uv) { return mat2(0.7986, -0.6018, 0.6018, 0.7986) * uv * 1.13 + vec2(0.37, 0.71); }
vec2 rotB(vec2 uv) { return mat2(0.3256, 0.9455, -0.9455, 0.3256) * uv * 0.87 + vec2(0.61, 0.19); }
vec4 tileMix(sampler2D t, vec2 uv, vec3 w) { return texture2D(t, uv) * w.x + texture2D(t, rotA(uv)) * w.y + texture2D(t, rotB(uv)) * w.z; }
` : '';
    shader.fragmentShader = `varying vec3 vTerrainWorld;\nvarying vec4 vGroundMix;\nuniform float uSeaTime; uniform float uSeaMotion; uniform float uRain; uniform float uSnow;\n${NOISE}${SHORE_GLSL}${pbrHead}` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 tp = vTerrainWorld.xz;
      // Fade sub-metre terms once a pixel covers more than ~25 cm of ground.
      float tFine = 1.0 - smoothstep(0.08, 0.25, length(fwidth(tp)));
      float tWalk = clamp(vGroundMix.x + vGroundMix.y + vGroundMix.z, 0.0, 1.0);
      float sandWeight = clamp(vGroundMix.y, 0.0, 1.0);
      float rockWeight = clamp(vGroundMix.w, 0.0, 1.0);
      float groundBump = 0.0;
      // Millimetre detail is filtered before it becomes subpixel (avoids sparkling in motion).
      float grainFade = 1.0 - smoothstep(0.003, 0.025, length(fwidth(tp)));
      float detailFade = 1.0 - smoothstep(0.025, 0.11, length(fwidth(tp)));
      // Patch noise: value +-6 % at 1.6 m, +-5 % at 0.45 m, and a 9 m warm/cool hue drift.
      float hue = (tNoise(tp / 9.0 + 3.7) - 0.5) * 0.08;
      diffuseColor.rgb *= (1.0 + (tNoise(tp / 1.6) - 0.5) * 0.12 + (tNoise(tp / 0.45) - 0.5) * 0.1 * tFine) * vec3(1.0 + hue, 1.0, 1.0 - hue);
      // Grass reads cooler and darker in its low hollows, drier on crests (height mixing).
      diffuseColor.rgb *= mix(1.0, 0.92 + 0.12 * smoothstep(0.2, 0.8, tNoise(tp / 4.3 + 9.1)), vGroundMix.x);
      ${pbr ? `
      vec2 puv = tp / 2.5;
      vec3 pm = vec3(tNoise(tp / 4.3 + 21.0), tNoise(tp / 6.1 - 13.0), tNoise(tp / 8.7 + 5.0));
      pm = pm * pm * pm; pm /= pm.x + pm.y + pm.z;
      vec3 gw = vGroundMix.xyz / max(vGroundMix.x + vGroundMix.y + vGroundMix.z, 1e-3);
      // Dirt (Ground037) carries moss: use its luminance only so trodden ground stays Art Lock earth.
      vec3 dirt = tileMix(uAlb2, puv * 1.2, pm).rgb / uMean2;
      dirt = vec3(dot(dirt, vec3(0.299, 0.587, 0.114)));
      vec3 ratio = gw.x * tileMix(uAlb0, puv, pm).rgb / uMean0 + gw.y * tileMix(uAlb1, puv * 1.6, pm).rgb / uMean1 + gw.z * dirt;
      // Colour-preserving detail: the texture modulates the Art Lock vertex colour, faded far away.
      diffuseColor.rgb *= mix(vec3(1.0), clamp(ratio, 0.45, 1.6), tWalk * (0.35 + 0.65 * tFine));
      vec4 nrS = gw.x * tileMix(uNr0, puv, pm) + gw.y * tileMix(uNr1, puv * 1.6, pm) + gw.z * tileMix(uNr2, puv * 1.2, pm);` : ''}
      // Natural surfaces: warped wind ripples on dry sand and a quieter compacted wash zone.
      vec4 sh = shoreSample(tp);
      float landD = -shoreSigned(sh);
      float sandDry = smoothstep(0.8, 4.2, landD);
      float ripplePhase = dot(tp, vec2(0.84, 0.54)) * 27.0
        + 2.3 * tNoise(tp / 2.6) + 0.7 * sin(dot(tp, vec2(-0.36, 0.57)));
      float ripple = sin(ripplePhase) * 0.5 + 0.5;
      float rippleCrest = pow(ripple, 3.0);
      float sandGrain = tNoise(tp * 160.0 + 19.0);
      float mineral = smoothstep(0.72, 0.93, tNoise(tp / 0.13 + 7.0));
      float dunePatch = tNoise(tp / 3.8 + vec2(17.0, 8.0));
      diffuseColor.rgb *= 1.0 + sandWeight * ((rippleCrest - 0.32) * 0.16 * detailFade * sandDry
        + (sandGrain - 0.5) * 0.10 * grainFade + (dunePatch - 0.5) * 0.10 - 0.09 * mineral * detailFade);
      groundBump += sandWeight * (0.004 * rippleCrest * sandDry * detailFade
        + 0.00035 * sandGrain * grainFade);
      // Broad drying gradient persists between waves; the moving backwash only darkens its last 1.5 m.
      float tWet = 0.0;
      if (landD > -0.6 && vTerrainWorld.y < ${(GROUND_Y - .02).toFixed(2)}) {
        float shoreMask = sandWeight * (1.0 - sh.b);
        float reach = 1.5 * shoreSwash(tp, (uSeaTime - 0.8) * step(0.001, uSeaMotion)) + 0.15;
        float wash = 1.0 - smoothstep(reach - 0.25, reach + 0.25, landD);
        float drying = 1.0 - smoothstep(0.45, 3.6, landD + (dunePatch - 0.5) * 0.6);
        tWet = max(wash * 0.85, drying * 0.65) * shoreMask;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.66, 0.71, 0.75), tWet);
        float washLine = exp(-pow((landD - reach) / 0.15, 2.0));
        diffuseColor.rgb *= 1.0 - washLine * 0.07 * shoreMask;
      }
      // Stratified rock on existing exposed slopes: horizontal bedding bends slowly with the land,
      // with dark seams, pale mineral grains and iron stains. No displacement / collider change.
      float strataH = vTerrainWorld.y + 0.17 * sin(tp.x * 0.53 + tp.y * 0.16)
        + 0.12 * sin(tp.y * 0.61) + 0.13 * tNoise(tp / 1.6);
      float layer = fract(strataH / 0.32);
      float seam = (1.0 - smoothstep(0.025, 0.13, min(layer, 1.0 - layer)))
        * (0.35 + 0.65 * tNoise(tp / 0.8 + vTerrainWorld.y * 0.4));
      float rockGrain = tNoise(tp * 22.0 + vTerrainWorld.y * vec2(31.0, -23.0));
      float weather = tNoise(tp / 1.9 + vTerrainWorld.y * 0.3);
      diffuseColor.rgb *= 1.0 + rockWeight * ((rockGrain - 0.5) * 0.18 * detailFade
        + (weather - 0.5) * 0.20 - seam * 0.15 * detailFade);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.09, 0.99, 0.88), rockWeight * smoothstep(0.56, 0.76, weather) * 0.5);
      groundBump += rockWeight * (-0.006 * seam + 0.0015 * rockGrain) * detailFade;
      // Close grass soil is mottled in continuous patches, rather than per-triangle random brightness.
      float grassDry = smoothstep(0.42, 0.76, tNoise(tp / 3.4 + 6.0));
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.10, 1.025, 0.88), vGroundMix.x * grassDry * 0.6);
      diffuseColor.rgb *= 1.0 - uRain * .18 * tWalk;
      float snowDust = uSnow * tWalk * smoothstep(.32,.8,tNoise(tp/2.8+13.0)) * .48;
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.76,.82,.85),snowDust);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // Matte with variation: 0.86-1.0 (wet sand 0.72) instead of one uniform sheen.
      roughnessFactor = mix(0.86, 1.0, tNoise(tp / 1.1 + 5.3)) ${pbr ? '* mix(1.0, 0.75 + 0.25 * nrS.b, tWalk)' : ''};
      roughnessFactor = clamp(mix(roughnessFactor, 0.78, tWet), 0.78, 1.0);
      roughnessFactor = mix(roughnessFactor,.58,uRain*tWalk*.65);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        // Fallback only: faceted micro relief on walkable ground (skewed triangular 0.45 m lattice,
        // <= 5 deg hash tilt, calmed by 3 m noise). With PBR its weight is 0 and the texture normal
        // (0.55, faded with distance) gives the near-field relief instead.
        vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        if (nW.y > 0.82 && tWalk > 0.01) {
          vec2 q = mat2(1.0, 0.0, 0.57735, 1.1547) * (tp / 0.45);
          vec2 cell = floor(q), f = fract(q);
          float upper = step(f.y, f.x);
          vec2 id = cell * 2.0 + vec2(upper, 0.0);
          vec2 tilt = vec2(tHash(id + 17.0), tHash(id + 43.0)) - 0.5;
          float calm = 0.45 + 0.55 * tNoise(tp / 3.0 + 2.0);
          vec3 pert = vec3(tilt.x, 0.0, tilt.y) * ${pbr ? '0.0' : '0.17'} * calm * tFine * tWalk;
          ${pbr ? 'pert += vec3(nrS.r * 2.0 - 1.0, 0.0, -(nrS.g * 2.0 - 1.0)) * 0.55 * tWalk * (0.4 + 0.6 * tFine);' : ''}
          normal = normalize((viewMatrix * vec4(normalize(nW + pert), 0.0)).xyz);
        }
      }`)
      .replace('#include <lights_physical_fragment>', `
      // Derivative bump: filtered millimetre relief follows the final world-space surface.
      {
        vec3 dp = -vViewPosition, sx = dFdx(dp), sy = dFdy(dp);
        vec3 rx = cross(sy, normal), ry = cross(normal, sx);
        float det = dot(sx, rx);
        vec3 grad = sign(det) * (dFdx(groundBump) * rx + dFdy(groundBump) * ry);
        normal = normalize(abs(det) * normal - grad);
      }
      #include <lights_physical_fragment>
      // Weaker dielectric specular for soil/grass: removes the plastic grazing sheen.
      material.specularColor = vec3(0.016); material.specularColorBlended = vec3(0.016); material.specularF90 = 0.4;`);
    if (!legacy && pbr) {
      // Reuse the same 18 texture reads. Colour and normal share coverage and UV scale;
      // normal XY must follow the inverse of each anti-tiling sample rotation.
      shader.fragmentShader = shader.fragmentShader.replace('vec4 tileMix(sampler2D t, vec2 uv, vec3 w)', `vec4 tileNormalMix(sampler2D t, vec2 uv, vec3 w) {
  vec4 a = texture2D(t, uv), b = texture2D(t, rotA(uv)), c = texture2D(t, rotB(uv));
  vec2 slope = (a.rg * 2.0 - 1.0) * w.x
    + mat2(0.7986, 0.6018, -0.6018, 0.7986) * (b.rg * 2.0 - 1.0) * (1.13 * w.y)
    + mat2(0.3256, -0.9455, 0.9455, 0.3256) * (c.rg * 2.0 - 1.0) * (0.87 * w.z);
  return vec4(slope * 0.5 + 0.5, dot(vec3(a.b, b.b, c.b), w), 1.0);
}
vec4 tileMix(sampler2D t, vec2 uv, vec3 w)`)
        .replace('vec3 gw = vGroundMix.xyz / max(vGroundMix.x + vGroundMix.y + vGroundMix.z, 1e-3);', `// Derivative helper lanes extrapolate outside triangles, so even valid CPU weights
      // can be negative here. Clamp before fractional coverage powers: NaN would reach
      // sandWeight -> groundBump -> dFdx/dFdy and blacken the covered triangle edge.
      vec3 gw = max(vGroundMix.xyz, vec3(0.0));
      gw /= max(dot(gw, vec3(1.0)), 1e-3);`)
        .replace('vec3 dirt = tileMix(uAlb2, puv * 1.2, pm).rgb / uMean2;', `// Grass scan covers 1.85 m rather than 2.5 m; sand/dirt keep their established scale.
      vec3 grassDetail = tileMix(uAlb0, puv * 1.35, pm).rgb / uMean0;
      vec3 sandDetail = tileMix(uAlb1, puv * 1.6, pm).rgb / uMean1;
      vec3 dirt = tileMix(uAlb2, puv * 1.2, pm).rgb / uMean2;`)
        .replace('vec3 ratio = gw.x * tileMix(uAlb0, puv, pm).rgb / uMean0 + gw.y * tileMix(uAlb1, puv * 1.6, pm).rgb / uMean1 + gw.z * dirt;', `// Existing scan luminance supplies tuft/grain coverage, not a claimed height map.
      // Only mixed boundaries change: zero weights stay zero; the far field stays unchanged.
      vec3 coverage = clamp(vec3(dot(grassDetail, vec3(0.299, 0.587, 0.114)),
        dot(sandDetail, vec3(0.299, 0.587, 0.114)), dirt.r) - 1.0, -0.5, 0.5);
      vec3 edgeWeights = pow(gw * (1.0 + coverage * 0.7), vec3(1.35));
      edgeWeights /= max(dot(edgeWeights, vec3(1.0)), 1e-3);
      gw = mix(gw, edgeWeights, tFine * 0.75);
      sandWeight = gw.y * tWalk;
      vec3 ratio = gw.x * grassDetail + gw.y * sandDetail + gw.z * dirt;`)
        .replace('vec4 nrS = gw.x * tileMix(uNr0, puv, pm) + gw.y * tileMix(uNr1, puv * 1.6, pm) + gw.z * tileMix(uNr2, puv * 1.2, pm);', 'vec4 nrS = gw.x * tileNormalMix(uNr0, puv * 1.35, pm) + gw.y * tileNormalMix(uNr1, puv * 1.6, pm) + gw.z * tileNormalMix(uNr2, puv * 1.2, pm);');
    }
    if (facilityCraft && pbr) {
      // One bounded west-camp path sample. The route/scatter CPU mask and all terrain
      // vertices stay fixed. The explicit path core stays bare. Its shoulders can
      // contain actual new grass islands/soil gaps, including locally pure CPU weights.
      const westPath = WORN_PATHS[2];
      const pathDistances = westPath.slice(1).map((b, i) => {
        const a = westPath[i];
        return `d = min(d, naturePathSegment(p, vec2(${a[0].toFixed(4)}, ${a[1].toFixed(4)}), vec2(${b[0].toFixed(4)}, ${b[1].toFixed(4)})));`;
      }).join('\n');
      shader.fragmentShader = shader.fragmentShader.replace('vec4 tileNormalMix(', `// The same authored west path as CPU ground/scatter; no new route or collider.
float naturePathSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - a - ab * t);
}
float natureWestPath(vec2 p) {
  float d = 10000.0;
  ${pathDistances}
  return d;
}
// Union of jittered ellipses, not a noise-colored wash. Each grass island has
// 0.45-0.95 m extent with connected bare interstices; the boundary is pixel-filtered.
float natureGrassIsland(vec2 p) {
  vec2 q = p / 0.82, cell = floor(q);
  float nearest = 10.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = cell + vec2(float(x), float(y));
    float h = tHash(id + 17.31);
    vec2 jitter = vec2(h, tHash(id + 49.73));
    vec2 center = (id + 0.16 + 0.68 * jitter) * 0.82;
    vec2 axis = vec2(jitter.x - 0.47, jitter.y - 0.51) + vec2(0.013, -0.021);
    axis /= max(length(axis), 0.01);
    vec2 rel = p - center;
    vec2 islandLocal = vec2(dot(rel, axis), dot(rel, vec2(-axis.y, axis.x)));
    islandLocal.y *= 0.78 + h * 0.63;
    nearest = min(nearest, length(islandLocal) - (0.23 + 0.20 * tHash(id + 81.19)));
  }
  return nearest;
}
vec4 tileNormalMix(`);
      shader.fragmentShader = shader.fragmentShader
        .replace('vec2 puv = tp / 2.5;', `float natureSample = 1.0 - smoothstep(7.0, 10.0, length((tp - vec2(-61.5, 34.0)) / vec2(1.25, 1.0)));
      float naturePixel = length(fwidth(tp));
      float naturePathD = 1000.0;
      if (natureSample > 0.0 && tWalk > 0.001) naturePathD = natureWestPath(tp);
      float naturePatch = natureSample * (1.0 - smoothstep(2.4, 3.0, naturePathD)) * (1.0 - rockWeight);
      vec2 ecologicalWarp = vec2(0.0);
      if (naturePatch > 0.0) ecologicalWarp = vec2(tNoise(tp / 3.7 + vec2(5.2, 17.3)), tNoise(tp / 4.9 + vec2(31.1, 9.7))) - 0.5;
      vec2 patchP = tp + ecologicalWarp * 1.9;
      // A small continuous UV drift breaks a recurring scan motif without new reads.
      // Exactly the same UV goes into albedo and its reoriented normal/roughness.
      vec2 puv = (tp + ecologicalWarp * (0.32 * naturePatch)) / 2.5;`)
        .replace('pm = pm * pm * pm; pm /= pm.x + pm.y + pm.z;', 'pm = max(pm, vec3(0.0)); pm = pm * pm * pm; pm /= max(dot(pm, vec3(1.0)), 1e-5);')
        .replace('vec3 ratio = gw.x * grassDetail + gw.y * sandDetail + gw.z * dirt;', `// R3: remap the actual material boundary, instead of tinting the same
      // broad CPU gradient. No grass is introduced into the central worn corridor.
      if (natureSample > 0.0 && tWalk > 0.001) {
      float pathD = naturePathD;
      float patchScope = naturePatch;
      if (patchScope > 0.0) {
      vec3 beforePatch = gw;
      float edgeAA = max(0.025, naturePixel * 1.25);
      float island = 1.0 - smoothstep(-edgeAA, edgeAA, natureGrassIsland(patchP));
      // Individual islands coalesce into continuous turf farther from the path.
      // The middle metre stays walkable bare soil; only its shoulders are broken up.
      float grassCover = mix(island, 1.0, smoothstep(1.35, 2.6, pathD));
      grassCover *= smoothstep(0.55, 0.78, pathD);
      vec3 patchWeights = vec3(clamp(grassCover, 0.0, 1.0), 0.0, 1.0 - clamp(grassCover, 0.0, 1.0));
      gw = max(mix(gw, patchWeights, patchScope), vec3(0.0));
      gw /= max(dot(gw, vec3(1.0)), 1e-3);
      // Match the changed grass/soil pigment to its changed texture coverage rather
      // than laying dirt scan detail over an unchanged green vertex-color edge.
      vec3 grassPigment = vec3(0.23455, 0.28315, 0.04971);
      vec3 sandPigment = vec3(0.59062, 0.39676, 0.18782);
      vec3 soilPigment = vec3(0.39157, 0.27889, 0.16203);
      vec3 oldPigment = beforePatch.x * grassPigment + beforePatch.y * sandPigment + beforePatch.z * soilPigment;
      vec3 newPigment = gw.x * grassPigment + gw.y * sandPigment + gw.z * soilPigment;
      // Full grass<->soil pigment change is necessary on locally pure source weights;
      // the earlier 0.65..1.45 clamp suppressed it into an unreadable yellow-green wash.
      diffuseColor.rgb *= clamp(newPigment / max(oldPigment, vec3(0.015)), 0.24, 3.3);
      sandWeight = gw.y * tWalk;
      }
      }
      vec3 ratio = gw.x * grassDetail + gw.y * sandDetail + gw.z * dirt;`);
    }
  };
  material.customProgramCacheKey = () => pbr ? (facilityCraft ? 'island-terrain-batch5-west-path-islands-r3' : legacy ? 'island-terrain-v5-pbr' : 'island-terrain-v7-coverage-helper-safe-pbr') : 'island-terrain-v5';
  return material;
}

/** Footprints where ground detail must not appear (buildings, forecourts, foundations, blocks). */
const SCATTER_BLOCKERS: ScatterBlocker[] = [
  {minX:ALPHA_EXCHANGE_FOOTPRINT.minX-.5,maxX:ALPHA_EXCHANGE_FOOTPRINT.maxX+3,minZ:ALPHA_EXCHANGE_FOOTPRINT.minZ-.5,maxZ:ALPHA_EXCHANGE_FOOTPRINT.maxZ+.5},
  {minX:55.5,maxX:62,minZ:-56,maxZ:-43.5},
  ...(LAYOUT_V4 ? CLUB_SCATTER_BLOCKERS : []),
  ...BUILDINGS.flatMap(({ position: [x, , z], size: [w, , d] }) => [
    { minX: x - w / 2 - .6, maxX: x + w / 2 + .6, minZ: z - d / 2 - .6, maxZ: z + d / 2 + .6 },
    { minX: x + w / 2, maxX: x + w / 2 + 5.6, minZ: z - d / 2 - 1, maxZ: z + d / 2 + 3.6 },
  ]),
  ...FOUNDATIONS.map(({ position: [x, , z], size: [w, , d] }) => ({ minX: x - w / 2 - .4, maxX: x + w / 2 + .4, minZ: z - d / 2 - .4, maxZ: z + d / 2 + .4 })),
  ...(LAYOUT_V4 ? keepOutV4().map(([minX, minZ, maxX, maxZ]) => ({ minX: minX - .4, maxX: maxX + .4, minZ: minZ - .4, maxZ: maxZ + .4 })) : [
    ...[[-18, 8], [-13, -8], [-12, -24], [-4, -45]].map(([x, z]) => ({ minX: x - 4.4, maxX: x + 4.4, minZ: z - 3.9, maxZ: z + 3.9 })),
    { minX: 16, maxX: 24, minZ: 8, maxZ: 16 }, // coastal parking bay
  ]),
  { minX: -45, maxX: -39, minZ: 27, maxZ: 33 }, // fire pit
  { minX: -31, maxX: -29, minZ: 30, maxZ: 38 }, // camp exit lamps
];

function pebbleGeometry() {
  const g = new IcosahedronGeometry(.11, 0); // 20 triangles
  g.scale(1, .45, .8); g.translate(0, .02, 0);
  return g;
}
const SCATTER_RADIUS = 40;
/** One instanced draw per class; instances are refilled from fixed candidates within 40 m of
 * the camera focus whenever the focus moves more than 2 m (no per-frame matrix uploads). */
function Scatter({ name, data, geometry, material, tint, cap }: { name: string; data: Float32Array; geometry: BufferGeometry; material: Material; tint: (i: number) => Color; cap: number }) {
  const ref = useRef<InstancedMesh>(null);
  const count = data.length / 5;
  const last = useRef<[number, number]>([1e9, 1e9]);
  const refill = (fx: number, fz: number) => {
    const mesh = ref.current; if (!mesh) return;
    const dummy = new Object3D(); let n = 0;
    // Nearest first, capped (grass + pebbles budget); candidates beyond the cap are dropped.
    const near: [number, number][] = [];
    for (let i = 0; i < count; i++) { const d2 = (data[i * 5] - fx) ** 2 + (data[i * 5 + 2] - fz) ** 2; if (d2 <= SCATTER_RADIUS * SCATTER_RADIUS) near.push([d2, i]); }
    if (near.length > cap) { near.sort((a, b) => a[0] - b[0]); near.length = cap; }
    for (const [, i] of near) {
      const x = data[i * 5], z = data[i * 5 + 2];
      const s = .55 + data[i * 5 + 4] * 1.0;
      dummy.position.set(x, data[i * 5 + 1] - .015, z); dummy.rotation.set(0, data[i * 5 + 3], 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix); mesh.setColorAt(n, tint(i)); n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  useLayoutEffect(() => { const p = useWorldStore.getState().position; last.current = [p[0], p[2]]; refill(p[0], p[2]); });
  useFrame(({ camera }) => {
    const shot = useWorldStore.getState().shot, p = useWorldStore.getState().position;
    // QA shots look at the whole island: centre on the camera's ground target instead.
    const fx = shot ? camera.position.x - camera.position.y * .6 : p[0], fz = shot ? camera.position.z - camera.position.y * .6 : p[2];
    if (Math.hypot(fx - last.current[0], fz - last.current[1]) < 2) return;
    last.current = [fx, fz]; refill(fx, fz);
  });
  return <instancedMesh ref={ref} name={name} args={[geometry, material, Math.max(1, count)]} receiveShadow frustumCulled={false} />;
}

/** Wall-clock span of the sliced grass build (QA). */
const grassBuild = { ms: 0 };
/** Triangles per pebble (IcosahedronGeometry detail 0). */
const PEBBLE_TRIANGLES = 20;

/** QA entry only: expose ground/grass/sea-spot state (read-only) on window.__worldEnv. */
function EnvDebug() {
  const { scene } = useThree();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const w = window as unknown as { __worldEnv?: unknown };
    const hidden: { visible: boolean }[] = [];
    w.__worldEnv = { terrainLod: () => ({ ...terrainLodDebug }), grass: () => ({ ...grassDebug, trampleAt: undefined }), trampleAt: (x: number, z: number) => grassDebug.trampleAt(x, z), sea: () => seaSpotDebug.spots, actors: () => actorState.actors.map(a => ({ ...a })), groundPbr: GROUND_PBR,
      // A/B cost probe only: hide/show the grass draw.
      setGrassVisible: (on: boolean) => { const g = scene.getObjectByName('ground-grass-blades'); if (g) g.visible = on; return !!g; },
      // A/B cost probe only: hide every object whose name matches the RegExp source; restore() undoes it.
      hideByName: (pattern: string) => { const re = new RegExp(pattern), hit: { visible: boolean }[] = []; scene.traverse(o => { if (o.name && re.test(o.name) && o.visible) { o.visible = false; hit.push(o); } }); hidden.push(...hit); return hit.length; },
      restore: () => { for (const o of hidden.splice(0)) o.visible = true; },
      // Ground-detail budget (spec §3: grass + pebbles + other scatter <= 60k visible triangles).
      groundDetail: () => {
        const pebbles = (scene.getObjectByName('ground-pebbles') as InstancedMesh | undefined)?.count ?? 0;
        return { grassTufts: grassDebug.instances, grassTriangles: grassDebug.triangles, pebbles, pebbleTriangles: pebbles * PEBBLE_TRIANGLES,
          totalTriangles: grassDebug.triangles + pebbles * PEBBLE_TRIANGLES, budget: 40000, grassBuildMs: grassBuild.ms };
      } };
    return () => { delete w.__worldEnv; };
  }, [scene]);
  return null;
}

/** Layout v4 (spec §12.4): the visual terrain is four spatial chunks sharing one vertex buffer, each
 * with its own index buffer and culling sphere, and a crack-free render LOD (WorldTerrainLod): 16 m
 * tiles within 28 m of the focus keep the 0.5 m mesh, farther tiles draw 2 m fans stitched to their
 * fine neighbours. Indices are rebuilt only when the focus moves > 6 m. Colliders stay the full
 * 0.5 m trimesh pair (physics is unaffected). */
function TerrainLodChunks({ geometry, material }: { geometry: BufferGeometry; material: Material }) {
  // Blocks fully under opaque field paving (>= 0.6 m inside its outer edge) are skipped while `paved` is
  // claimed, i.e. while WorldTerrainRoads is actually mounted; otherwise the full ground is drawn.
  const tiles = useMemo(() => buildLodTiles(chunkKey, (x, z) => paveClearance(x, z) < -.6), []);
  const open = useIsClaimed('paved');
  const subs = useMemo(() => {
    const pos = geometry.getAttribute('position'), out: BufferGeometry[] = [];
    for (let c = 0; c < 4; c++) {
      const sub = new BufferGeometry();
      for (const name of Object.keys(geometry.attributes)) sub.setAttribute(name, geometry.getAttribute(name));
      // Culling sphere from the chunk's full-resolution tiles (LOD never leaves this box).
      const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity), v = new Vector3();
      for (const T of tiles) if (T.chunk === c) for (const i of T.fine) { v.fromBufferAttribute(pos, i); min.min(v); max.max(v); }
      const centre = min.clone().add(max).multiplyScalar(.5);
      sub.boundingSphere = new Sphere(centre, Number.isFinite(centre.x) ? centre.distanceTo(max) : 0);
      out.push(sub);
    }
    return out;
  }, [geometry, tiles]);
  const last = useRef<[number, number] | null>(null), openRef = useRef(open);
  openRef.current = open;
  const apply = (x: number, z: number) => {
    const L = lodIndices(tiles, x, z, undefined, openRef.current);
    subs.forEach((g, c) => { const idx = L.chunks.get(c) ?? new Uint32Array(0); g.setIndex(new Uint32BufferAttribute(idx, 1)); g.setDrawRange(0, idx.length); });
    terrainLodDebug.triangles = L.triangles; terrainLodDebug.fineTiles = L.fineTiles; terrainLodDebug.updates++;
    last.current = [x, z];
  };
  useLayoutEffect(() => { const p = useWorldStore.getState().position; apply(p[0], p[2]); }, [subs, open]);
  useFrame(({ camera }) => {
    const st = useWorldStore.getState(), p = st.position;
    // QA shots look at the whole island from far away: centre on the camera's ground target.
    const fx = st.shot ? camera.position.x - camera.position.y * .6 : p[0], fz = st.shot ? camera.position.z - camera.position.y * .6 : p[2];
    if (last.current && Math.hypot(fx - last.current[0], fz - last.current[1]) < 6) return;
    apply(fx, fz);
  });
  useEffect(() => () => subs.forEach(g => g.dispose()), [subs]);
  return <>{subs.map((g, i) => <mesh key={i} name={`island-terrain-v4-chunk-${i}`} geometry={g} material={material} receiveShadow />)}</>;
}
/** QA: current render LOD state. */
export const terrainLodDebug = { triangles: 0, fineTiles: 0, updates: 0 };

export function IslandTerrain() {
  const vegetation = useMineManifest(s=>s.manifest?.vegetation);
  const terrain = useMemo(buildTerrain, []);
  const geometry = useMemo(() => {
    const g = createTerrainGeometry();
    const { colours, groundMix } = terrainColours(g.getAttribute('normal').array);
    g.setAttribute('color', new Float32BufferAttribute(colours, 3));
    g.setAttribute('groundMix', new Float32BufferAttribute(groundMix, 4));
    return g;
  }, []);
  const pbr = useMemo(() => GROUND_PBR ? loadPbr() : null, []);
  const material = useMemo(() => createGroundMaterial(pbr), [pbr]);
  const scatter = useMemo(() => scatterCandidates(SCATTER_BLOCKERS), []);
  // Grass candidates (~1 s of CPU in one go) are built in <= 6 ms slices on idle callbacks, so the
  // first frames are not blocked; the grass fades in once the build completes.
  const [blades, setBlades] = useState(() => new Float32Array(0));
  const allBlades = useMemo(()=>{
    const extra = (vegetation ?? []).flatMap((v,j)=>Array.from({length:7},(_,i)=>{
      const a=i*2.399+j, r=i===0?0:.12+.16*(i%3)/2;
      return [...mineLocalToWorld([v.position[0]+Math.cos(a)*r,v.position[1],v.position[2]+Math.sin(a)*r]),v.yaw+a,Math.max(0,Math.min(1,(v.scale-.7)/.75))*(.65+.35*(i%3)/2),0];
    }).flat());
    const data = new Float32Array(blades.length+extra.length); data.set(blades); data.set(extra,blades.length); return data;
  },[blades,vegetation]);
  useEffect(() => {
    const job = grassCandidateJob(SCATTER_BLOCKERS), w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let handle = 0, done = false; const t0 = performance.now();
    const tick = () => {
      if (done) return;
      if (job.step(6)) { done = true; grassBuild.ms = Math.round(performance.now() - t0); setBlades(job.result()); return; }
      handle = w.requestIdleCallback ? w.requestIdleCallback(tick, { timeout: 50 }) : window.setTimeout(tick, 0);
    };
    tick();
    return () => { done = true; if (w.cancelIdleCallback) w.cancelIdleCallback(handle); else window.clearTimeout(handle); };
  }, []);
  const pebble = useMemo(pebbleGeometry, []);
  const pebbleMat = useMemo(() => new MeshStandardMaterial({ vertexColors: false, roughness: 1, flatShading: true }), []);
  const pebbleTint = useMemo(() => { const a = new Color('#8C8276'), b = new Color('#B4A896'), c = new Color(); return (i: number) => c.copy(a).lerp(b, scatter.pebbles[i * 5 + 4]); }, [scatter]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); pebble.dispose(); pebbleMat.dispose(); pbr?.forEach(t => t.dispose()); }, [geometry, material, pebble, pebbleMat, pbr]);
  return <group name="island-terrain-v4">
    {/* Same triangles as the mesh: tops are support-only `surface`, steep faces `solid`. */}
    <RigidBody name="island-terrain-surface" type="fixed" colliders={false} userData={{ surface: true }}>
      <TrimeshCollider name="island-terrain-surface-top" args={[terrain.positions, terrain.surface]} friction={.95} restitution={0} />
    </RigidBody>
    <RigidBody name="island-terrain-solid" type="fixed" colliders={false} userData={{ solid: true }}>
      <TrimeshCollider name="island-terrain-solid-faces" args={[terrain.positions, terrain.solid]} friction={.65} restitution={.05} />
    </RigidBody>
    {LAYOUT_V4 ? <TerrainLodChunks geometry={geometry} material={material} />
      : <mesh name="island-terrain-v3-mesh" geometry={geometry} material={material} receiveShadow />}
    <ActorTracker />
    <EnvDebug />
    <WorldGrass data={allBlades} />
    <Scatter name="ground-pebbles" data={scatter.pebbles} geometry={pebble} material={pebbleMat} tint={pebbleTint} cap={160} />
  </group>;
}
