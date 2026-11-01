import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';
import { Vector3 } from 'three';
const out='docs/world/phase-2-playground/camp-props-craft-20261101/';
const previous=out+'r1-evidence/camp-props-v1.glb',current='public/assets/world/camp/craft/camp-props-v1.glb';
const hash=data=>createHash('sha256').update(data).digest('hex');
function parse(path){const bytes=readFileSync(path),length=bytes.readUInt32LE(12);return {g:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};}
function familyFingerprint(path,family){
  const {g,bin}=parse(path);
  const image=index=>{const item=g.images[index],v=g.bufferViews[item.bufferView];return {sha256:hash(bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)),mime:item.mimeType};};
  const texture=item=>{const t=g.textures[item.index],copy={...item};delete copy.index;return {...copy,image:image(t.source),sampler:g.samplers?.[t.sampler]??null};};
  const material=index=>{const m=structuredClone(g.materials[index]);for(const key of Object.keys(m))if(key.endsWith('Texture'))m[key]=texture(m[key]);for(const key of Object.keys(m.pbrMetallicRoughness??{}))if(key.endsWith('Texture'))m.pbrMetallicRoughness[key]=texture(m.pbrMetallicRoughness[key]);return m;};
  const accessor=index=>{const a=g.accessors[index],v=g.bufferViews[a.bufferView],start=(v.byteOffset??0)+(a.byteOffset??0),types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},bytes={5121:1,5123:2,5125:4,5126:4};assert.ok(!v.byteStride,'audit expects existing tightly packed export');return {type:a.type,component:a.componentType,count:a.count,normalized:a.normalized??false,sha256:hash(bin.subarray(start,start+a.count*types[a.type]*bytes[a.componentType]))};};
  const visit=index=>{const n=g.nodes[index];return {name:n.name,translation:n.translation,rotation:n.rotation,scale:n.scale,matrix:n.matrix,mesh:n.mesh===undefined?null:g.meshes[n.mesh].primitives.map(p=>({indices:accessor(p.indices),attributes:Object.fromEntries(Object.entries(p.attributes).sort().map(([k,v])=>[k,accessor(v)])),material:material(p.material)})),children:(n.children??[]).map(visit).sort((a,b)=>a.name.localeCompare(b.name))};};
  return visit(g.nodes.findIndex(n=>n.name===family));
}
const old=await readWorldCraftGltf([previous]),next=await readWorldCraftGltf([current]);
assert.ok(old&&next);
try{
  const result={previous:hash(readFileSync(previous)),current:hash(readFileSync(current)),unaffected:{}};
  for(const family of ['C06','C07']){
    const a=familyFingerprint(previous,family),b=familyFingerprint(current,family);assert.deepEqual(b,a,`${family} geometry, UVs, materials, image bytes and samplers remain exact`);result.unaffected[family]={exact:true,fingerprint:hash(JSON.stringify(a))};
  }
  function triangles(scene){scene.updateMatrixWorld(true);const rows=[],v=new Vector3();scene.getObjectByName('C05').traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,index=o.geometry.index;for(let i=0;i<index.count;i+=3){const points=[];for(let j=0;j<3;j++){v.fromBufferAttribute(p,index.getX(i+j)).applyMatrix4(o.matrixWorld);points.push(v.toArray().map(x=>x.toFixed(6)).join(','));}rows.push(points.sort().join('|'));}});return rows.sort();}
  const a=triangles(old.scene),b=triangles(next.scene);assert.deepEqual(b,a,'C05 triangle positions unchanged despite split char/ash material batch');result.c05={unchangedTriangles:a.length,positionsExactToMeters:1e-6};
  const names=new Set();next.scene.getObjectByName('C05').traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])names.add(m.name);});
  for(const required of ['C05 Rock Face 03','C05 charcoal','C05 pale granular ash'])assert.ok([...names].some(name=>name.startsWith(required)),required);
  result.c05.materials=[...names];
  writeFileSync(out+'c05-r2-contract.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{disposeWorldCraftGltf(old.scene);disposeWorldCraftGltf(next.scene);}
