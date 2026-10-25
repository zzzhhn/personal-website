import { MeshStandardMaterial, type Material } from 'three';

type Finish = 'stone' | 'wood';
/** Metre-scale detail on runtime copies. No image textures, geometry changes or extra draws.
 * Local coordinates follow the instanced asset, so wood grain rotates with each bench. */
export function craftMaterial(source: MeshStandardMaterial, finish: Finish): MeshStandardMaterial {
  const copy = source.clone();
  const previousKey = source.customProgramCacheKey();
  copy.onBeforeCompile = (shader, renderer) => {
    source.onBeforeCompile.call(copy, shader, renderer);
    shader.vertexShader = 'varying vec3 vCraftPosition; varying vec3 vCraftNormal;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCraftPosition = position; vCraftNormal = normal;');
    shader.fragmentShader = `varying vec3 vCraftPosition; varying vec3 vCraftNormal;
      float craftHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float craftNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(craftHash(i), craftHash(i+vec3(1,0,0)), f.x),
                       mix(craftHash(i+vec3(0,1,0)), craftHash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(craftHash(i+vec3(0,0,1)), craftHash(i+vec3(1,0,1)), f.x),
                       mix(craftHash(i+vec3(0,1,1)), craftHash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cp = vCraftPosition;
        float pixelM = length(fwidth(cp));
        float craftFine = 1.0 - smoothstep(0.002, 0.015, pixelM);
        float craftPatch = craftNoise(cp * 5.0);
        ${finish === 'stone' ? `
        float craftGrain = craftNoise(cp * 110.0);
        // Quiet weathering, with a slightly cooler, darker foot where stone meets earth.
        float craftFoot = 1.0 - smoothstep(0.04, 0.38, cp.y);
        diffuseColor.rgb *= (0.94 + 0.10 * craftPatch + (craftGrain - 0.5) * 0.07 * craftFine);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.90, 0.93, 0.91), craftFoot);
        ` : `
        // C06's authored long axis is +Z; the sawn ends carry broad growth rings.
        float craftWarp = craftNoise(vec3(cp.z * 0.7, cp.x * 3.0, cp.y * 3.0));
        float craftLines = sin(cp.x * 170.0 + cp.y * 75.0 + craftWarp * 9.0);
        float craftRings = sin(length(cp.xy + vec2(0.07, -0.06)) * 150.0 + craftWarp * 3.0);
        float craftEnd = smoothstep(0.65, 0.9, abs(normalize(vCraftNormal).z));
        float craftGrain = mix(craftLines, craftRings, craftEnd);
        diffuseColor.rgb *= 0.96 + 0.10 * craftPatch + 0.055 * craftGrain * craftFine;
        `}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (craftPatch - 0.5) * 0.09, ${finish === 'stone' ? '0.88, 0.99' : '0.76, 0.97'});`);
  };
  copy.customProgramCacheKey = () => `${previousKey}-craft-${finish}-v1`;
  return copy;
}

/** Only authored stone/wood slots are mapped; flame, metal, canvas and props keep their finish. */
export function campCraftMaterial(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial)) return material;
  if (/^camp_stone_/.test(material.name)) return craftMaterial(material, 'stone');
  if (/^(camp_wood_|props_wood_)/.test(material.name)) return craftMaterial(material, 'wood');
  return material;
}
