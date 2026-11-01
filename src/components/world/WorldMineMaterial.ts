import { MeshStandardMaterial, Vector3 } from 'three';
import { craftMaterial } from './WorldCraftMaterials';
import { night } from './WorldNight';

/** Linear albedo multipliers [vertical, upward], only on mine-owned material copies. */
export const MINE_NIGHT_BOUNCE = { earth:[.026,.026], wood:[.012,.038], rock:[.018,.052] } as const;

/** Asset roles retain authored colors; metre-scale weathering survives the glTF boundary. */
export function mineSurfaceMaterial(source:MeshStandardMaterial,origin:readonly number[]=[0,0,0]) {
  const wood=/wood/i.test(source.name),earth=/ground/i.test(source.name);
  const material=craftMaterial(source,wood?'wood':'stone');
  const bounce=MINE_NIGHT_BOUNCE[earth?'earth':wood?'wood':'rock'];
  const compile=material.onBeforeCompile, key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.uniforms.uMineOrigin={value:new Vector3(origin[0],origin[1],origin[2])};
    shader.uniforms.uMineNight=night;
    shader.vertexShader='uniform vec3 uMineOrigin;\nvarying float vMineUp;\n'+shader.vertexShader.replace('vCraftPosition = position;',`vCraftPosition = position + uMineOrigin;
      vMineUp = clamp(dot(normalize(normalMatrix * normal), normalize(mat3(viewMatrix) * vec3(0.0,1.0,0.0))),0.0,1.0);`);
    shader.fragmentShader='uniform float uMineNight;\nvarying float vMineUp;\n'+shader.fragmentShader;
    if(!wood)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      vec3 mp = vCraftPosition;
      float minePixel = length(fwidth(mp));
      float mineFine = 1.0 - smoothstep(0.025,0.12,minePixel);
      float minePatch = craftNoise(mp * 1.1) * 0.6 + craftNoise(mp * 4.5 + 9.3) * 0.4;
      float mineGrit = craftNoise(mp * ${earth?'38.0':'17.0'});
      diffuseColor.rgb *= 0.83 + minePatch * 0.32 + (mineGrit - 0.5) * ${earth?'0.23':'0.13'} * mineFine;
      diffuseColor.rgb *= mix(vec3(0.95,0.97,1.0),vec3(1.08,1.02,0.94),minePatch);
    `);
    // A small albedo-tinted night floor on quarry copies only. Upward treads retain more
    // moon bounce than vertical risers, without lights, extra draws or a glowing white rim.
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(0.72,0.82,1.0) * uMineNight
        * mix(${bounce[0].toFixed(3)},${bounce[1].toFixed(3)},vMineUp);
    `);
  };
  material.customProgramCacheKey=()=>`${key}-quarry-${earth?'earth':wood?'wood':'rock'}-v3-night-treads`;
  return material;
}
