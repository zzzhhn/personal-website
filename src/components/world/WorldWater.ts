import { MeshStandardMaterial } from 'three';
import { windUniforms } from './WorldWind';

/** Slow surface ripples share the wind clock. This changes lighting normals only, leaving
 * the water level and the two-second recovery boundary exactly where physics expects them. */
export function createWorldWaterMaterial(color: string) {
  const material = new MeshStandardMaterial({ color, emissive: '#17424A', emissiveIntensity: 0, roughness: .82, metalness: 0 });
  material.name = 'world-water-ripples';
  material.onBeforeCompile = shader => {
    shader.uniforms.uSeaTime = windUniforms.uWindTime;
    shader.uniforms.uSeaMotion = windUniforms.uWindStrength;
    shader.vertexShader = 'varying vec2 vSeaWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = 'varying vec2 vSeaWorld;\nuniform float uSeaTime;\nuniform float uSeaMotion;\n' + shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec2 a = vec2(0.72, 0.36);
      vec2 b = vec2(-0.34, 1.10);
      vec2 c = vec2(1.95, 1.30);
      // Filter the smallest ripples as their world footprint becomes sub-pixel.
      float fine = 1.0 - smoothstep(0.12, 0.45, length(fwidth(vSeaWorld)));
      float t = uSeaTime;
      vec2 slope = a * (0.075 * cos(dot(vSeaWorld, a) - t * 0.70))
                 + b * (0.035 * cos(dot(vSeaWorld, b) - t * 0.47 + 1.8))
                 + c * (0.010 * fine * cos(dot(vSeaWorld, c) - t * 0.92));
      vec3 seaNormal = normalize(vec3(-slope.x * uSeaMotion, 1.0, -slope.y * uSeaMotion));
      normal = normalize((viewMatrix * vec4(seaNormal, 0.0)).xyz);`);
  };
  material.customProgramCacheKey = () => 'world-water-ripples-v1';
  return material;
}
