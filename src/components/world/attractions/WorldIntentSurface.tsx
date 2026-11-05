import type { MeshStandardMaterial, Texture } from 'three';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { INTENT_CRAFT, INTENT_CRAFT_FRAGMENT, INTENT_CRAFT_VERTEX } from './intent-craft-surface';

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
const bakedNight = 'totalEmissiveRadiance += vIntentNight * uIntentNight;';
const compile = (shader: Shader) => {
  shader.uniforms.uIntentNight = night;
  shader.vertexShader = `attribute vec3 nightRadiance; varying vec3 vIntentNight;\n${shader.vertexShader}`
    .replace('#include <color_vertex>', '#include <color_vertex>\nvIntentNight = nightRadiance;');
  shader.fragmentShader = `uniform float uIntentNight; varying vec3 vIntentNight;\n${shader.fragmentShader}`
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${bakedNight}`);
};
const programKey = () => 'intent-baked-night-v2';
const compileCraft = (shader: Shader) => {
  compile(shader);
  shader.vertexShader = `${INTENT_CRAFT_VERTEX}\n${shader.vertexShader}`.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvIntentCraft = intentCraftSurface;\nvIntentCraftPoint = position;\nvIntentCraftNormal = normal;');
  shader.fragmentShader = `${INTENT_CRAFT_FRAGMENT}\n${shader.fragmentShader}`
    .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 bakedPigment = diffuseColor.rgb;\nIntentFinish finish = intentFinish(bakedPigment, roughness, metalness);\ndiffuseColor.rgb = finish.pigment;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = finish.roughness;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = finish.metalness;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (vIntentCraft > 16.5 && vIntentCraft < 17.5 && vIntentCraftNormal.y > .8) {
  normal = intentPavingNormal(-vViewPosition, normal, intentPavingHeight, gl_FrontFacing ? 1.0 : -1.0);
}`)
    .replace(bakedNight, `
vec3 nightRadiance = vIntentNight;
if (vIntentCraft > ${INTENT_CRAFT.roller - 0.5} && vIntentCraft < ${INTENT_CRAFT.roller + 0.5}) {
  // The roller bake already contains the original vertex pigment. Recover the
  // incident light and apply the finished steel's diffuse reflectance.
  vec3 steelDiffuse = finish.pigment * (1.0 - finish.metalness);
  nightRadiance = (vIntentNight / bakedPigment) * steelDiffuse;
}
if (vIntentCraft > 11.5 && vIntentCraft < 14.5) {
  vec3 incident = vIntentNight / max(bakedPigment, vec3(0.001));
  nightRadiance = incident * finish.pigment * (1.0 - finish.metalness);
}
if ((vIntentCraft > 16.5 && vIntentCraft < 17.5) || (vIntentCraft > 20.5 && vIntentCraft < 21.5)) {
  // The bake contains the old flat paving pigment. Retain its illumination,
  // while letting the actual joints and slab variation remain visible at night.
  nightRadiance *= finish.pigment / max(bakedPigment, vec3(0.001));
}
totalEmissiveRadiance += nightRadiance * uIntentNight;`);
};
const craftProgramKey = () => 'intent-baked-night-v2-local-craft-r11-paving';
const compileReflectiveCraft = (shader: Shader) => {
  compileCraft(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_fragment_maps>', `
#include <lights_fragment_maps>
#if defined(USE_ENVMAP)
  bool exposedSteel = (vIntentCraft > 2.5 && vIntentCraft < 3.5)
    || (vIntentCraft > 4.5 && vIntentCraft < 5.5)
    || (vIntentCraft > 11.5 && vIntentCraft < 12.5)
    || (vIntentCraft > 13.5 && vIntentCraft < 14.5);
  float reflection = mix(0.46, 0.065, uIntentNight);
  radiance *= exposedSteel ? reflection : 0.0;
  iblIrradiance *= exposedSteel ? reflection * 0.32 : 0.0;
#endif
`);
};
const reflectiveProgramKey = () => 'intent-baked-night-v2-local-craft-reflect-r6-paving';

type SurfaceProps = { roughness?: number; metalness?: number; craft?: boolean; environment?: Texture | null; reflective?: boolean };

/** Lighting changes through the shared uniform, with no extra per-frame React state. */
export default function WorldIntentSurface({ roughness = .8, metalness = .12, craft = false, environment, reflective = false }: SurfaceProps) {
  const onBeforeCompile = reflective ? compileReflectiveCraft : craft ? compileCraft : compile;
  const customProgramCacheKey = reflective ? reflectiveProgramKey : craft ? craftProgramKey : programKey;
  return <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} envMap={environment ?? null}
    onBeforeCompile={onBeforeCompile} customProgramCacheKey={customProgramCacheKey} />;
}

export function WorldIntentReflectiveSurface({ reflect = true, ...surface }: Pick<SurfaceProps, 'roughness' | 'metalness'> & { reflect?: boolean }) {
  const environment = useDjcFurnitureEnvironment();
  return <WorldIntentSurface {...surface} craft environment={reflect ? environment : null} reflective={reflect} />;
}
