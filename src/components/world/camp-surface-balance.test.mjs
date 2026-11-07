import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshStandardMaterial, ShaderLib, Texture } from 'three';
import { applyCampSurfaceBalance } from './camp-surface-balance.ts';

test('camp fill correction composes with an existing hook and retains PBR channels', () => {
  const material=new MeshStandardMaterial({color:'#a78d62',metalness:.45,roughness:.7});
  const texture=new Texture(); material.map=material.normalMap=material.roughnessMap=material.envMap=texture;
  material.onBeforeCompile=shader=>{shader.uniforms.existing={value:2};};
  const color=material.color.clone(), night={value:0};
  applyCampSurfaceBalance(material,night,false);
  const key=material.customProgramCacheKey();
  applyCampSurfaceBalance(material,night,false);
  assert.equal(key,material.customProgramCacheKey());
  const shader={fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.existing.value,2);
  assert.equal(shader.uniforms.uCampSurfaceNight,night);
  assert.match(shader.fragmentShader,/iblIrradiance \+= getIBLIrradiance\( geometryNormal \) \* mix/);
  assert.match(shader.fragmentShader,/radiance \+= iblRadiance;/);
  assert.equal(material.map,texture); assert.equal(material.normalMap,texture);
  assert.equal(material.roughnessMap,texture); assert.equal(material.envMap,texture);
  assert.ok(material.color.equals(color));assert.equal(material.metalness,.45);
  night.value=1;assert.equal(shader.uniforms.uCampSurfaceNight.value,1);
  material.dispose();texture.dispose();
});

test('legacy switch leaves the original material program untouched',()=>{
  const material=new MeshStandardMaterial(), hook=material.onBeforeCompile, key=material.customProgramCacheKey();
  applyCampSurfaceBalance(material,{value:0},true);
  assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey(),key);
  material.dispose();
});
