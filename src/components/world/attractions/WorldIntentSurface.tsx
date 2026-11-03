import type { MeshStandardMaterial } from 'three';
import { night } from '../WorldNight';
import { INTENT_CRAFT_FRAGMENT, INTENT_CRAFT_VERTEX } from './intent-craft-surface';

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
const compile = (shader: Shader) => {
  shader.uniforms.uIntentNight = night;
  shader.vertexShader = `attribute vec3 nightRadiance; varying vec3 vIntentNight;\n${shader.vertexShader}`
    .replace('#include <color_vertex>', '#include <color_vertex>\nvIntentNight = nightRadiance;');
  shader.fragmentShader = `uniform float uIntentNight; varying vec3 vIntentNight;\n${shader.fragmentShader}`
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vIntentNight * uIntentNight;');
};
const programKey = () => 'intent-baked-night-v2';
const compileCraft = (shader: Shader) => {
  compile(shader);
  shader.vertexShader = `${INTENT_CRAFT_VERTEX}\n${shader.vertexShader}`.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvIntentCraft = intentCraftSurface;\nvIntentCraftPoint = position;\nvIntentCraftNormal = normal;');
  shader.fragmentShader = `${INTENT_CRAFT_FRAGMENT}\n${shader.fragmentShader}`
    .replace('#include <color_fragment>', '#include <color_fragment>\nIntentFinish finish = intentFinish(diffuseColor.rgb, roughness, metalness);\ndiffuseColor.rgb = finish.pigment;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = finish.roughness;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = finish.metalness;');
};
const craftProgramKey = () => 'intent-baked-night-v2-local-craft-r3';
/** Lighting changes through the shared uniform, with no extra per-frame React state. */
export default function WorldIntentSurface({ roughness = .8, metalness = .12, craft = false }: { roughness?: number; metalness?: number; craft?: boolean }) {
  return <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness}
    onBeforeCompile={craft ? compileCraft : compile} customProgramCacheKey={craft ? craftProgramKey : programKey} />;
}
