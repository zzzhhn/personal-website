import { MeshStandardMaterial, Vector3 } from 'three';
import { craftMaterial } from './WorldCraftMaterials';

/** Asset roles retain authored colors; metre-scale weathering survives the glTF boundary. */
export function mineSurfaceMaterial(source:MeshStandardMaterial,origin:readonly number[]=[0,0,0]) {
  if(/wood/i.test(source.name))return craftMaterial(source,'wood');
  const material=craftMaterial(source,'stone'), earth=/ground/i.test(source.name);
  const compile=material.onBeforeCompile, key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.uniforms.uMineOrigin={value:new Vector3(origin[0],origin[1],origin[2])};
    shader.vertexShader='uniform vec3 uMineOrigin;\n'+shader.vertexShader.replace('vCraftPosition = position;','vCraftPosition = position + uMineOrigin;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      vec3 mp = vCraftPosition;
      float minePixel = length(fwidth(mp));
      float mineFine = 1.0 - smoothstep(0.025,0.12,minePixel);
      float minePatch = craftNoise(mp * 1.1) * 0.6 + craftNoise(mp * 4.5 + 9.3) * 0.4;
      float mineGrit = craftNoise(mp * ${earth?'38.0':'17.0'});
      diffuseColor.rgb *= 0.83 + minePatch * 0.32 + (mineGrit - 0.5) * ${earth?'0.23':'0.13'} * mineFine;
      diffuseColor.rgb *= mix(vec3(0.95,0.97,1.0),vec3(1.08,1.02,0.94),minePatch);
    `);
  };
  material.customProgramCacheKey=()=>`${key}-quarry-${earth?'earth':'rock'}-v2`;
  return material;
}
