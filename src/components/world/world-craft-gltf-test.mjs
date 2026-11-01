import { readFile } from 'node:fs/promises';
import { Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** CPU geometry/material audit of the actual export. Texture decoding and WebGL
 * appearance remain browser checks; placeholder samplers never claim image QA. */
export async function readWorldCraftGltf(paths){
  let bytes;
  for(const path of paths){
    try{bytes=await readFile(new URL(`../../../${path}`,import.meta.url));break;}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(!bytes)return null;
  const loader=new GLTFLoader();
  loader.register(()=>({name:'CRAFT_CPU_TEXTURE_AUDIT',loadTexture:()=>Promise.resolve(new Texture())}));
  const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return loader.parseAsync(data,'');
}
export function disposeWorldCraftGltf(source){
  const geometry=new Set(),materials=new Set(),textures=new Set();
  source.traverse(mesh=>{if(!mesh.isMesh)return;geometry.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }});
  geometry.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());
}
