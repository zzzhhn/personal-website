import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Box3, Group, MeshStandardMaterial, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createIbdStaticCraft, cloneIbdCraftMaterial, updateIbdCraftEnvironment } from './ibd-static-craft-visual.ts';
import { createIbdCrateVisual, IBD_CRATE_LID_PIVOT } from './ibd-crate-visual.ts';
import { IBD_PACK_SLOTS } from './ibd-pack-layout.ts';
import { disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';

// Sparse worktrees omit heavy tracked binaries. Read that exact checkout's git
// blob in memory; placeholder image samplers prove channels, never image QA.
async function loadNative(path){
  let bytes;
  try{bytes=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;bytes=execFileSync('git',['show',`HEAD:${path}`],{maxBuffer:8*1024*1024});}
  const loader=new GLTFLoader();
  loader.register(()=>({name:'IBD_CPU_CHANNEL_AUDIT',loadTexture:()=>Promise.resolve(new Texture())}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const triangleCount=root=>{let count=0;root.traverse(mesh=>{if(mesh.isMesh)count+=mesh.geometry.index.count/3;});return count;};

test('native inspection, utility and control material batches retain texture channels and shared environment ownership',async()=>{
  const gltf=await loadNative('public/assets/world/ibd/static-craft/static-craft-v1.glb');
  const uniform={value:0},environment=new Texture(),visual=createIbdStaticCraft(gltf.scene,uniform);
  try{
    assert.equal(triangleCount(gltf.scene),10984,'native construction is unchanged');
    assert.equal(visual.materials.length,6);
    const original=[];gltf.scene.traverse(mesh=>{if(mesh.isMesh)original.push(mesh.material);});
    updateIbdCraftEnvironment(visual.materials,environment,0);
    for(const material of visual.materials){
      const source=original.find(item=>item.name===material.name);assert.ok(source);assert.notEqual(material,source);
      for(const channel of ['map','roughnessMap','normalMap','metalnessMap','aoMap'])assert.equal(material[channel],source[channel]);
      assert.equal(material.envMap,environment);assert.equal(source.envMap,null);assert.equal(material.envMapIntensity,.55);
      const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'};
      material.onBeforeCompile(shader,{});assert.equal(shader.uniforms.uIbdNight,uniform);assert.match(shader.vertexShader,/aIbdBake/);
    }
    updateIbdCraftEnvironment(visual.materials,environment,1);
    assert.ok(visual.materials.every(material=>Math.abs(material.envMapIntensity-.23)<1e-8));
    let borrowedDisposed=0,ownedDisposed=0;
    environment.addEventListener('dispose',()=>borrowedDisposed++);
    for(const material of new Set(original))material.addEventListener('dispose',()=>borrowedDisposed++);
    for(const material of visual.materials)material.addEventListener('dispose',()=>ownedDisposed++);
    visual.dispose();visual.dispose();assert.equal(ownedDisposed,6);assert.equal(borrowedDisposed,0);
  }finally{visual.dispose();disposeWorldCraftGltf(gltf.scene);environment.dispose();}
});

test('actual articulated crate retains native geometry, AO UV1, slot contacts and lid hinge while owning only cloned materials',async()=>{
  const gltf=await loadNative('public/assets/world/ibd/crate/crate-v1.glb'),uniform={value:1},environment=new Texture();
  const shell=createIbdCrateVisual(gltf.scene,'Shell',uniform),lid=createIbdCrateVisual(gltf.scene,'Lid',uniform);
  try{
    assert.equal(triangleCount(gltf.scene),23480);
    assert.equal(triangleCount(shell.root)+triangleCount(lid.root),23480);
    for(const visual of [shell,lid]){
      updateIbdCraftEnvironment(visual.materials,environment,1);
      visual.root.traverse(mesh=>{
        if(!mesh.isMesh)return;
        assert.ok(mesh.geometry.getAttribute('uv1'),'existing geometry AO channel');
        const original=gltf.scene.getObjectByName(mesh.name);assert.equal(mesh.geometry,original.geometry);
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],sources=Array.isArray(original.material)?original.material:[original.material];
        for(let i=0;i<materials.length;i++){
          assert.notEqual(materials[i],sources[i]);
          for(const channel of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])assert.equal(materials[i][channel],sources[i][channel]);
          if(materials[i].aoMap)assert.equal(materials[i].aoMap.channel,1);
          const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'};
          materials[i].onBeforeCompile(shader,{});assert.equal(shader.uniforms.uIbdNight,uniform);
          assert.match(shader.vertexShader,/mat3\(modelMatrix\)\*objectNormal/,'moving lid fill follows its actual orientation');
        }
      });
    }
    shell.root.updateMatrixWorld(true);
    const down=(x,z)=>new Raycaster(new Vector3(x,2,z),new Vector3(0,-1,0)).intersectObject(shell.root,true)[0];
    for(const slot of IBD_PACK_SLOTS){
      assert.ok(Math.abs(down(slot.at[0]-.08,slot.at[2]).point.y-.33)<.001);
      for(const side of [-1,1])assert.ok(Math.abs(down(slot.at[0]+side*.28,slot.at[2]+.05).point.y-.42)<.001);
    }
    const hinge=new Group();hinge.position.set(...IBD_CRATE_LID_PIVOT);hinge.add(lid.root);
    for(const angle of [0,-1,-2]){
      hinge.rotation.x=angle;hinge.updateMatrixWorld(true);const actual=new Box3().setFromObject(lid.root);
      const source=gltf.scene.getObjectByName('Lid').clone(true),expectedHinge=new Group();expectedHinge.position.copy(hinge.position);expectedHinge.rotation.x=angle;expectedHinge.add(source);expectedHinge.updateMatrixWorld(true);
      assert.ok(actual.min.distanceTo(new Box3().setFromObject(source).min)<1e-8);assert.ok(actual.max.distanceTo(new Box3().setFromObject(source).max)<1e-8);
    }
    let owned=0,borrowed=0;for(const material of shell.materials)material.addEventListener('dispose',()=>owned++);
    gltf.scene.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.addEventListener('dispose',()=>borrowed++);});
    shell.dispose();shell.dispose();assert.equal(owned,shell.materials.length);assert.equal(borrowed,0);
  }finally{shell.dispose();lid.dispose();disposeWorldCraftGltf(gltf.scene);environment.dispose();}
});

test('material cloning composes earlier shader hooks and cache identity',()=>{
  const source=new MeshStandardMaterial(),uniform={value:.4};
  source.onBeforeCompile=shader=>{shader.uniforms.previous={value:2};};source.customProgramCacheKey=()=> 'prior-hook-v1';
  const material=cloneIbdCraftMaterial(source,uniform,false);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'};
  material.onBeforeCompile(shader,{});assert.equal(shader.uniforms.previous.value,2);assert.equal(shader.uniforms.uIbdNight,uniform);assert.match(material.customProgramCacheKey(),/^prior-hook-v1\|/);
  material.dispose();source.dispose();
});
