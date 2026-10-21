import { useEffect, useMemo } from 'react';
import { CircleGeometry, Color, MeshStandardMaterial, Vector2 } from 'three';
import { CAMP_CENTER, ISLAND_OUTLINE } from './layout';

/** Ground surfaces shaded from continuous world-space fields (no vertex colours, no per-face
 * tones): warped sand/grass transitions, 6-10 m grass patches, low-contrast 1.6 m and 0.45 m
 * detail, and a normal-only micro relief. Geometry stays exactly on the walkable collider
 * planes, so feet never float or sink; high-frequency terms fade out with screen derivatives. */

const NOISE = /* glsl */`
float tHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tRelief(vec2 p, float fine) { return 0.5 * tNoise(p / 2.2) + 0.25 * tNoise(p / 0.9) + fine * 0.12 * tNoise(p / 0.37); }
`;

const COMMON_FRAGMENT = /* glsl */`
varying vec3 vTerrainWorld;
varying float vTerrainUp;
uniform vec3 uGrassA; uniform vec3 uGrassB;
${NOISE}
vec3 terrainGrass(vec2 p) {
  float patches = smoothstep(0.38, 0.66, 0.7 * tNoise(p / 7.5) + 0.3 * tNoise(p / 3.1 + 11.0));
  return mix(uGrassA, uGrassB, patches);
}
`;

/** Shared material factory: `field` writes vec3 tc and float tRough (relief strength) from vec2 tp. */
function terrainMaterial(name: string, uniforms: Record<string, { value: unknown }>, declarations: string, field: string) {
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  material.name = name;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vTerrainWorld;\nvarying float vTerrainUp;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vTerrainUp = normalize(mat3(modelMatrix) * objectNormal).y;`);
    shader.fragmentShader = COMMON_FRAGMENT + declarations + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 tp = vTerrainWorld.xz;
      // Fade sub-metre terms once a texel covers more than ~25 cm of ground.
      float tFine = 1.0 - smoothstep(0.08, 0.25, length(fwidth(tp)));
      vec3 tc = vec3(1.0); float tRough = 0.0;
      ${field}
      float tDetail = (tNoise(tp / 1.6) - 0.5) * 0.07 + (tNoise(tp / 0.45) - 0.5) * 0.05 * tFine;
      diffuseColor.rgb = tc * (1.0 + tDetail);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vTerrainUp > 0.9 && tRough > 0.0) {
        float e = 0.12, h0 = tRelief(tp, tFine);
        float k = tRough * (0.35 + 0.65 * tFine);
        vec3 nW = normalize(vec3(-(tRelief(tp + vec2(e, 0.0), tFine) - h0) / e * k, 1.0, -(tRelief(tp + vec2(0.0, e), tFine) - h0) / e * k));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`);
  };
  material.customProgramCacheKey = () => name;
  return material;
}

const color = (hex: string) => ({ value: new Color(hex) });

/** C01: pit ash -> trodden sand -> warm plaza sand -> light sand band carrying path and pads ->
 * patchy olive grass -> sandy rim, with every boundary warped by noise and blended over 1-2 m. */
export function createCampGroundMaterial() {
  return terrainMaterial('camp-ground-terrain', {
    uGrassA: color('#7E8C3E'), uGrassB: color('#8A963F'),
    uCampCenter: { value: new Vector2(CAMP_CENTER[0], CAMP_CENTER[2]) },
    uPit: color('#A58D6A'), uTrodden: color('#B89A6A'), uPlaza: color('#C9A978'),
    uLip: color('#B39265'), uBand: color('#D2B98A'), uRim: color('#B99A6C'),
  }, 'uniform vec2 uCampCenter; uniform vec3 uPit; uniform vec3 uTrodden; uniform vec3 uPlaza; uniform vec3 uLip; uniform vec3 uBand; uniform vec3 uRim;\n', `
      float r = length(tp - uCampCenter);
      float warp = (tNoise(tp / 4.0) - 0.5) * 1.6 + (tNoise(tp / 1.7 + 7.0) - 0.5) * 0.5;
      float rw = r + warp;
      vec3 inner = mix(mix(uPit, uTrodden, smoothstep(1.4, 3.0, r + warp * 0.3)), uPlaza, smoothstep(2.8, 4.6, rw));
      tc = mix(inner, uBand, smoothstep(10.0, 11.0, rw));
      tc = mix(tc, uLip, 0.35 * smoothstep(9.6, 10.3, rw) * (1.0 - smoothstep(10.5, 11.3, rw)));
      float grassMask = smoothstep(16.6, 18.6, rw);
      tc = mix(tc, terrainGrass(tp), grassMask);
      float rimMask = smoothstep(22.4, 23.6, r + warp * 0.4);
      tc = mix(tc, uRim, rimMask);
      tRough = mix(mix(0.025, 0.055, smoothstep(3.0, 5.0, rw)), 0.11, grassMask * (1.0 - rimMask));`);
}

/** Island top (the existing extruded walk surface, unchanged collider): patchy grass that turns
 * to beach sand within a few metres of the coast; the slab sides read as earth/stone banding. */
export function createIslandGroundMaterial() {
  const outline = ISLAND_OUTLINE.map(([x, z]) => new Vector2(x, z));
  return terrainMaterial('island-ground-terrain', {
    uGrassA: color('#7E8C3E'), uGrassB: color('#8A963F'),
    uBeach: color('#D8C59E'), uSide: color('#8C8276'), uSideTop: color('#9A8466'),
    uOutline: { value: outline },
  }, `uniform vec3 uBeach; uniform vec3 uSide; uniform vec3 uSideTop; uniform vec2 uOutline[${outline.length}];
float coastDistance(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${outline.length}; i++) {
    vec2 a = uOutline[i], b = uOutline[(i + 1) % ${outline.length}], ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    d = min(d, length(p - a - ab * t));
  }
  return d;
}
`, `
      if (vTerrainUp > 0.5) {
        float coast = coastDistance(tp) + (tNoise(tp / 3.5) - 0.5) * 2.0;
        float grassMask = smoothstep(1.2, 4.5, coast);
        tc = mix(uBeach, terrainGrass(tp), grassMask);
        tRough = mix(0.05, 0.11, grassMask);
      } else {
        float band = smoothstep(-0.2, 0.8, vTerrainWorld.y) + (tNoise(vec2(tp.x + tp.y, vTerrainWorld.y * 3.0)) - 0.5) * 0.3;
        tc = mix(uSide, uSideTop, clamp(band, 0.0, 1.0));
      }`);
}

/** Camp plateau cap: a smooth 128-sided disc exactly at the cylinder collider top. */
export function CampGround({ radius, y }: { radius: number; y: number }) {
  const geometry = useMemo(() => new CircleGeometry(radius, 128).rotateX(-Math.PI / 2), [radius]);
  const material = useMemo(createCampGroundMaterial, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh name="camp-ground-C01" geometry={geometry} material={material} position={[CAMP_CENTER[0], y, CAMP_CENTER[2]]} receiveShadow />;
}
