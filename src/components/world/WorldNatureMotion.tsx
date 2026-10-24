import { MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking, Vector4, type Material, type Mesh } from 'three';
import { windUniforms } from './WorldWind';

/** nature-v4 soft-bush push: up to PUSH_MAX bodies (xyz world position, w = push radius m)
 * and a signed amplitude each (1 while inside; damped wobble back to 0 after exit), written
 * every physics step by the camp bush drag zones. Count 0 = no displacement. */
export const PUSH_MAX = 4;
export const pushUniforms = {
  uPushers: { value: Array.from({ length: PUSH_MAX }, () => new Vector4(0, -1000, 0, 0)) },
  uPushAmp: { value: new Array<number>(PUSH_MAX).fill(0) },
  uPushCount: { value: 0 },
};

/** Nature meshes carry _WIND from the authored branch hierarchy. All motion uses the world's
 * shared clock; stones have no attribute and remain rigid. Maximum displacement is <.13 m
 * before placement scaling (largest vegetation scale is 1). Roots have zero weights.
 * Source materials are never mutated. Each instanced draw retains one material. */
const declarations = `
attribute vec4 _wind;
uniform float uWindTime;
uniform float uWindStrength;
#ifdef NATURE_PUSH
uniform vec4 uPushers[4];
uniform float uPushAmp[4];
uniform int uPushCount;
#endif
float naturePhase() {
  vec3 p;
  #ifdef USE_INSTANCING
    p = (modelMatrix * instanceMatrix[3]).xyz;
  #else
    p = modelMatrix[3].xyz;
  #endif
  return dot(p.xz, vec2(0.37, 0.21)) + _wind.w * 6.2831853;
}
vec3 natureLocalWind(vec3 worldDirection) {
  mat3 m = mat3(modelMatrix);
  #ifdef USE_INSTANCING
    m = m * mat3(instanceMatrix);
  #endif
  // Instance transforms are uniform scale + rotation. Transpose normalized axes is inverse rotation.
  return vec3(dot(normalize(m[0]), worldDirection), dot(normalize(m[1]), worldDirection), dot(normalize(m[2]), worldDirection));
}
`;
const positionChunk = `#include <begin_vertex>
{
  float ph = naturePhase(), t = uWindTime;
  vec3 wind = natureLocalWind(vec3(0.8, 0.0, 0.6));
  vec3 crosswind = natureLocalWind(vec3(-0.6, 0.0, 0.8));
  float bend = 0.065 * _wind.x * sin(t * 1.7 + ph * 0.17);
  float branch = 0.035 * _wind.y * sin(t * 2.1 + ph);
  float flutter = 0.018 * _wind.z * sin(t * 2.9 + ph * 1.7);
  transformed += uWindStrength * (wind * (bend + branch) + crosswind * flutter + vec3(0.0, flutter * 0.25, 0.0));
  #ifdef NATURE_PUSH
  {
    // Soft bush: leaves part around bodies inside the drag zone, then spring back with a damped
    // wobble after exit (signed amplitude). Root rows stay put; displacement <= .32 m.
    mat4 nm = modelMatrix;
    #ifdef USE_INSTANCING
      nm = nm * instanceMatrix;
    #endif
    vec3 wp = (nm * vec4(transformed, 1.0)).xyz;
    float lift = smoothstep(0.05, 0.75, position.y);
    vec3 shove = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      if (i >= uPushCount) break;
      vec4 q = uPushers[i];
      vec2 d = wp.xz - q.xz;
      float dist = length(d);
      float fall = (1.0 - smoothstep(0.15, q.w + 0.55, dist)) * step(abs(wp.y - q.y), 2.5);
      vec2 dir = dist > 0.001 ? d / dist : vec2(1.0, 0.0);
      shove += vec3(dir.x, -0.35, dir.y) * (0.32 * fall * uPushAmp[i]);
    }
    shove *= lift;
    shove = clamp(shove, vec3(-0.32, -0.12, -0.32), vec3(0.32, 0.06, 0.32));
    transformed += natureLocalWind(shove);
  }
  #endif
}`;
function patch(material: Material, normals: boolean, push = false) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, windUniforms);
    if (push) { Object.assign(shader.uniforms, pushUniforms); shader.defines = { ...(shader.defines ?? {}), NATURE_PUSH: '' }; }
    shader.vertexShader = declarations + shader.vertexShader.replace('#include <begin_vertex>', positionChunk);
    if (normals) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      // Small normal response keeps leaf light moving with its bend; shadow geometry uses
      // the exact same position formula below. This is a stylized approximation, not cloth simulation.
      float na = uWindStrength * (0.025 * _wind.y + 0.055 * _wind.z) * sin(uWindTime * 2.1 + naturePhase());
      vec3 nd = natureLocalWind(vec3(0.8, 0.0, 0.6));
      objectNormal = normalize(objectNormal + nd * (na * objectNormal.y) - vec3(0.0, na * dot(objectNormal, nd), 0.0));`);
  };
  material.customProgramCacheKey = () => `world-nature-wind-v4-${normals ? 'surface' : 'shadow'}${push ? '-push' : ''}`;
  material.needsUpdate = true;
}

/** push=true (G19/G20 only) adds the soft-bush part-and-recover displacement to the colour,
 * depth and distance passes alike, so shadows follow the parted leaves. */
export function attachNatureWind(mesh: Mesh, push = false) {
  const geometry = mesh.geometry;
  if (!geometry.getAttribute('_wind')) return () => {};
  const source = mesh.material;
  const sources = Array.isArray(source) ? source : [source];
  const copies = sources.map(m => { const copy = m.clone(); patch(copy, copy instanceof MeshStandardMaterial, push); return copy; });
  mesh.material = Array.isArray(source) ? copies : copies[0];
  const oldDepth = mesh.customDepthMaterial, oldDistance = mesh.customDistanceMaterial;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), distance = new MeshDistanceMaterial();
  // Foliage cards are two sided in both color and shadow passes.
  depth.side = sources[0].side; distance.side = sources[0].side;
  patch(depth, false, push); patch(distance, false, push);
  mesh.customDepthMaterial = depth; mesh.customDistanceMaterial = distance;
  if (!geometry.userData.windBoundsExpanded) {
    const pad = push ? .45 : .13;
    geometry.computeBoundingBox(); geometry.boundingBox?.expandByScalar(pad);
    geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += pad;
    geometry.userData.windBoundsExpanded = true;
  }
  mesh.userData.windAmplitudeMax = .13;
  mesh.userData.softPush = push;
  return () => {
    mesh.material = source; mesh.customDepthMaterial = oldDepth; mesh.customDistanceMaterial = oldDistance;
    copies.forEach(m => m.dispose()); depth.dispose(); distance.dispose();
  };
}
