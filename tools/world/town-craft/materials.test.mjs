import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,BufferAttribute,Texture,Mesh,MeshStandardMaterial,SRGBColorSpace,NoColorSpace} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {preserveTownChannels,createTownSurfaceLibrary,TOWN_SURFACE_URLS,updateTownEnvironment,bindTownDrawEnvironment} from '../../../src/components/world/town-craft-materials.ts';

test('town batching retains authored UVs and wind, including missing-wind trunk geometry',()=>{
 const leaf=new BoxGeometry(),trunk=new BoxGeometry();const uv=Array.from(leaf.attributes.uv.array);
 leaf.setAttribute('_wind',new BufferAttribute(new Float32Array(leaf.attributes.position.count*4).fill(.3),4));
 preserveTownChannels(leaf,true);preserveTownChannels(trunk,true);
 assert.deepEqual(Array.from(leaf.attributes.uv.array),uv);
 const merged=mergeGeometries([leaf,trunk]);assert.ok(merged);assert.equal(merged.attributes._wind.count,merged.attributes.position.count);
 assert.equal(merged.attributes._wind.getX(0),Math.fround(.3));assert.equal(merged.attributes._wind.getX(leaf.attributes.position.count),0);
});
test('surface library shares maps across material instances and never disposes borrowed cached textures',()=>{
 const loaded=TOWN_SURFACE_URLS.map(()=>new Texture());let borrowedDisposed=0,ownedDisposed=0;
 loaded.forEach(t=>t.addEventListener('dispose',()=>borrowedDisposed++));
 const library=createTownSurfaceLibrary(loaded);library.textures.forEach(t=>t.addEventListener('dispose',()=>ownedDisposed++));
 const a=new MeshStandardMaterial(),b=new MeshStandardMaterial();a.name=b.name='town_wood';library.apply(a);library.apply(b);
 assert.equal(a.map,b.map);assert.notEqual(a.map,loaded[6]);assert.equal(a.map.colorSpace,SRGBColorSpace);assert.equal(a.normalMap.colorSpace,NoColorSpace);assert.equal(a.map.flipY,false);
 library.dispose();assert.equal(ownedDisposed,TOWN_SURFACE_URLS.length);assert.equal(borrowedDisposed,0);
});
test('local reflection changes do not mutate source GLB materials and dim at night',()=>{
 const source=new MeshStandardMaterial({metalness:.3}),owned=source.clone();owned.name='town_metal';const environment=new Texture();
 updateTownEnvironment([owned],environment,0);const day=owned.envMapIntensity;updateTownEnvironment([owned],environment,1);
 assert.equal(source.envMap,null);assert.equal(owned.envMap,environment);assert.ok(owned.envMapIntensity<day);assert.ok(owned.envMapIntensity>0);
});
test('draw binding updates later wind and occlusion clones, including an environment arriving after mount',()=>{
 const source=new MeshStandardMaterial(),mesh=new Mesh(new BoxGeometry(),source.clone());
 const state=bindTownDrawEnvironment([mesh]);
 const draw=()=>mesh.onBeforeRender(null,null,null,mesh.geometry,mesh.material,null);
 draw();assert.equal(mesh.material.envMap,null);
 mesh.material=mesh.material.clone();state.map=new Texture();draw();
 assert.equal(mesh.material.envMap,state.map);const day=mesh.material.envMapIntensity;
 state.night=1;draw();assert.ok(mesh.material.envMapIntensity<day);
 assert.equal(source.envMap,null);
});
