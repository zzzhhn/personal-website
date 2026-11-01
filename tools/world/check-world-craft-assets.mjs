import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const identity=(value,expected)=>value===undefined||value.length===expected.length&&value.every((n,i)=>Number.isFinite(n)&&Math.abs(n-expected[i])<1e-6);
const identityNode=node=>identity(node.translation,[0,0,0])&&identity(node.rotation,[0,0,0,1])&&identity(node.scale,[1,1,1])
  &&identity(node.matrix,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const sourceUrl=path=>{
  const source=readFileSync(new URL(`../../src/components/world/${path}`,import.meta.url),'utf8');
  const urls=[...source.matchAll(/['"]([^'"]+\.glb)['"]/g)].map(match=>match[1]);
  if(urls.length!==1)throw new Error(`Review the production asset URL in ${path}.`);
  return urls[0];
};

/** Static export contract only. Actual contact/pivot geometry is checked by the
 * focused tests; image appearance and residency still require runtime review. */
export function checkWorldCraftAsset(file,kind,root=dirname(resolve(file))){
  const bytes=readFileSync(file);
  if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)
    throw new Error(`Invalid ${kind} GLB: ${file}`);
  const jsonEnd=20+bytes.readUInt32LE(12);
  if(jsonEnd>bytes.length)throw new Error(`Truncated ${kind} GLB JSON.`);
  const doc=JSON.parse(bytes.subarray(20,jsonEnd).toString()),nodes=doc.nodes??[],meshes=doc.meshes??[],materials=doc.materials??[];
  if(jsonEnd+8>bytes.length||bytes.readUInt32LE(jsonEnd+4)!==0x004e4942||jsonEnd+8+bytes.readUInt32LE(jsonEnd)!==bytes.length
    ||doc.buffers?.length!==1||doc.buffers[0].uri||!doc.buffers[0].byteLength||doc.buffers[0].byteLength>bytes.readUInt32LE(jsonEnd))
    throw new Error(`${kind} requires its complete embedded geometry buffer.`);
  const scene=doc.scenes?.[doc.scene??0],roots=(scene?.nodes??[]).map(index=>nodes[index]);
  if(!roots.length||roots.some(node=>!node||!identityNode(node)))throw new Error(`${kind} scene roots must have identity transforms.`);
  if(doc.animations?.length||doc.skins?.length||doc.cameras?.length||doc.extensions?.KHR_lights_punctual||doc.extensionsUsed?.includes('KHR_lights_punctual'))
    throw new Error(`${kind} must contain no animation rig, camera or real-time lights.`);
  const independentParts=new Set(['sample','caliperfixed','caliperjaw','rigmast','rigboom','rigtether']);
  for(const node of nodes){
    if(node.skin!==undefined||node.camera!==undefined||node.extensions?.KHR_lights_punctual||independentParts.has((node.name??'').toLowerCase()))
      throw new Error(`${kind} exported a runtime-owned inspection part, rig, camera or light.`);
  }
  const primitives=meshes.flatMap(mesh=>mesh.primitives??[]);
  if(!primitives.length||primitives.some(p=>p.attributes?.POSITION===undefined||p.attributes.NORMAL===undefined||p.attributes.JOINTS_0!==undefined||p.attributes.WEIGHTS_0!==undefined||p.targets?.length||(p.mode??4)!==4))
    throw new Error(`${kind} requires static triangle meshes with positions and normals.`);
  if(!materials.length||materials.some(material=>(material.alphaMode??'OPAQUE')!=='OPAQUE'||material.extensions?.KHR_materials_transmission)||doc.extensionsUsed?.includes('KHR_materials_transmission'))
    throw new Error(`${kind} requires opaque PBR materials without a transmission pass.`);
  if(kind==='umbrella'){
    if(materials.length!==4||primitives.length!==4||roots.some(node=>node.mesh===undefined))
      throw new Error('Umbrella requires its four native material batches at the pole-root origin.');
  }else if(kind==='crate'){
    if(roots.length!==2||roots.filter(node=>node.name==='Shell').length!==1||roots.filter(node=>node.name==='Lid').length!==1)
      throw new Error('Crate requires independent identity Shell and Lid scene roots.');
    const hasMesh=node=>node.mesh!==undefined||(node.children??[]).some(index=>hasMesh(nodes[index]));
    if(roots.some(node=>!hasMesh(node)))throw new Error('Both crate parts must contain visible meshes.');
  }else throw new Error(`Unknown world craft asset kind: ${kind}`);
  let images=0;
  for(const image of doc.images??[]){
    if(image.uri){
      if(image.uri.startsWith('data:'))continue;
      const path=resolve(dirname(file),image.uri),pathFromRoot=relative(resolve(root),path);
      if(pathFromRoot.startsWith('..')||!statSync(path).isFile()||statSync(path).size===0)throw new Error(`Missing ${kind} image: ${image.uri}`);
      images++;
    }else if(image.bufferView===undefined||!doc.bufferViews?.[image.bufferView]?.byteLength)throw new Error(`Missing embedded ${kind} image bytes.`);
  }
  return {glbs:1,externalImages:images,materials:materials.length,primitives:primitives.length};
}

export function checkWorldCraftAssets(root='public'){
  const entries=[['umbrella',sourceUrl('djc-umbrella-visual.ts')],['crate',sourceUrl('attractions/ibd-crate-visual.ts')]];
  return entries.map(([kind,url])=>({kind,url,...checkWorldCraftAsset(resolve(root,`.${url}`),kind,root)}));
}

if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  const assets=checkWorldCraftAssets(resolve(process.argv[2]??'public'));
  console.log(`World craft: ${assets.length} production GLBs present; ${assets.map(asset=>`${asset.kind} ${asset.primitives} batches`).join(', ')}.`);
}
