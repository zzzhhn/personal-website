import { MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking, type Material, type Mesh } from 'three';
import { windUniforms } from './WorldWind';

/** Nature meshes carry _WIND from the authored branch hierarchy. All motion uses the world's
 * shared clock; stones have no attribute and remain rigid. Maximum displacement is <.13 m
 * before placement scaling (largest vegetation scale is 1). Roots have zero weights.
 * Source materials are never mutated. Each instanced draw retains one material. */
const declarations = `
attribute vec4 _wind;
uniform float uWindTime;
uniform float uWindStrength;
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
}`;
function patch(material: Material, normals: boolean) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = declarations + shader.vertexShader.replace('#include <begin_vertex>', positionChunk);
    if (normals) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      // Small normal response keeps leaf light moving with its bend; shadow geometry uses
      // the exact same position formula below. This is a stylized approximation, not cloth simulation.
      float na = uWindStrength * (0.025 * _wind.y + 0.055 * _wind.z) * sin(uWindTime * 2.1 + naturePhase());
      vec3 nd = natureLocalWind(vec3(0.8, 0.0, 0.6));
      objectNormal = normalize(objectNormal + nd * (na * objectNormal.y) - vec3(0.0, na * dot(objectNormal, nd), 0.0));`);
  };
  material.customProgramCacheKey = () => `world-nature-wind-v2-${normals ? 'surface' : 'shadow'}`;
  material.needsUpdate = true;
}

export function attachNatureWind(mesh: Mesh) {
  const geometry = mesh.geometry;
  if (!geometry.getAttribute('_wind')) return () => {};
  const source = mesh.material;
  const sources = Array.isArray(source) ? source : [source];
  const copies = sources.map(m => { const copy = m.clone(); patch(copy, copy instanceof MeshStandardMaterial); return copy; });
  mesh.material = Array.isArray(source) ? copies : copies[0];
  const oldDepth = mesh.customDepthMaterial, oldDistance = mesh.customDistanceMaterial;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), distance = new MeshDistanceMaterial();
  // Foliage cards are two sided in both color and shadow passes.
  depth.side = sources[0].side; distance.side = sources[0].side;
  patch(depth, false); patch(distance, false);
  mesh.customDepthMaterial = depth; mesh.customDistanceMaterial = distance;
  if (!geometry.userData.windBoundsExpanded) {
    geometry.computeBoundingBox(); geometry.boundingBox?.expandByScalar(.13);
    geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += .13;
    geometry.userData.windBoundsExpanded = true;
  }
  mesh.userData.windAmplitudeMax = .13;
  return () => {
    mesh.material = source; mesh.customDepthMaterial = oldDepth; mesh.customDistanceMaterial = oldDistance;
    copies.forEach(m => m.dispose()); depth.dispose(); distance.dispose();
  };
}
