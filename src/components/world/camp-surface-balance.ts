import { ShaderChunk, type MeshStandardMaterial } from 'three';

/** The camp already receives the island's hemisphere diffuse fill. Keep PMREM
 * specular reflections, but avoid adding a second full-strength diffuse sky. */
export function applyCampSurfaceBalance(material: MeshStandardMaterial, night: { value: number }, legacy =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('campSurface') === 'legacy') {
  if (legacy || material.userData.campSurfaceBalance) return;
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const maps = ShaderChunk.lights_fragment_maps.replace(
    'iblIrradiance += getIBLIrradiance( geometryNormal );',
    'iblIrradiance += getIBLIrradiance( geometryNormal ) * mix( 0.35, 1.0, uCampSurfaceNight );',
  );
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.uCampSurfaceNight = night;
    shader.fragmentShader = 'uniform float uCampSurfaceNight;\n' + shader.fragmentShader
      .replace('#include <lights_fragment_maps>', maps);
  };
  material.customProgramCacheKey = () => `${key}-camp-diffuse-balance-v1`;
  material.userData.campSurfaceBalance = true;
}
