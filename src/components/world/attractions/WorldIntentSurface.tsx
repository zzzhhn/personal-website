import type { MeshStandardMaterial } from 'three';
import { night } from '../WorldNight';

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
const compile = (shader: Shader) => {
  shader.uniforms.uIntentNight = night;
  shader.vertexShader = `attribute vec3 nightRadiance; varying vec3 vIntentNight;\n${shader.vertexShader}`
    .replace('#include <color_vertex>', '#include <color_vertex>\nvIntentNight = nightRadiance;');
  shader.fragmentShader = `uniform float uIntentNight; varying vec3 vIntentNight;\n${shader.fragmentShader}`
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vIntentNight * uIntentNight;');
};
const programKey = () => 'intent-baked-night-v2';
/** Lighting changes through the shared uniform, with no extra per-frame React state. */
export default function WorldIntentSurface({ roughness = .8, metalness = .12 }: { roughness?: number; metalness?: number }) {
  return <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} onBeforeCompile={compile} customProgramCacheKey={programKey} />;
}
