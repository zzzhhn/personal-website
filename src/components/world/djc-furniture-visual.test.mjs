import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { createDjcFurnitureVisual, DJC_FURNITURE_PLACEMENTS, djcFurnitureLegacy } from './djc-furniture-visual.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

function disposeClub(g){for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(g[name]).forEach(v=>v.dispose());g.pool.dispose();}
test('three-family visual extraction keeps exact collisions, seats, approaches, controls and other accepted packs',()=>{
  const original=buildDjcClubGeometry({separateDaybeds:true,separatePoolLanterns:true,separateUmbrellas:true}),separated=buildDjcClubGeometry({separateDaybeds:true,separatePoolLanterns:true,separateUmbrellas:true,separateFurniture:true});
  try{
    assert.deepEqual(original.colliders,separated.colliders);assert.deepEqual(original.seats,separated.seats);assert.deepEqual(original.daybedApproaches,separated.daybedApproaches);
    for(const group of ['daybeds','poolLanterns','umbrellas'])for(const key of Object.keys(original[group]))assert.deepEqual(original[group][key].attributes.position.array,separated[group][key].attributes.position.array);
    let extracted=0;
    for(const key of Object.keys(original.batches)){
      const before=original.batches[key].attributes.position.count,after=separated.batches[key].attributes.position.count,p=separated.furniture[key].attributes.position;
      assert.equal(after+p.count,before);extracted+=p.count;
      if(['amber','cyan','glass','foliage','stone'].includes(key))assert.equal(p.count,0,'no control emission, stone or planting leaves the original batch');
    }
    assert.equal(extracted/3,1350,'two loungers, one carcass and two speakers only');
    assert.deepEqual(separated.batches.cyan.attributes.position.array,original.batches.cyan.attributes.position.array);
    assert.deepEqual(separated.batches.amber.attributes.position.array,original.batches.amber.attributes.position.array);
  }finally{disposeClub(original);disposeClub(separated);}
});

test('recursive named families preserve local transforms and share only owned material/sampler copies',()=>{
  const source=new Group(),geometry=new BoxGeometry(.1,.1,.1),map=new Texture(),env=new Texture(),material=new MeshStandardMaterial({map,roughness:.67});
  for(const family of Object.keys(DJC_FURNITURE_PLACEMENTS)){
    const root=new Group(),nested=new Group();root.name='DJC_Furniture_'+family;root.position.set(9,8,7);nested.position.set(.1,.2,.3);root.add(nested);nested.add(new Mesh(geometry,material));source.add(root);
  }
  let borrowed=0,owned=0;for(const item of [geometry,map,env,material])item.addEventListener('dispose',()=>borrowed++);
  const visual=createDjcFurnitureVisual(source,env,8);assert.equal(visual.instances.length,3);assert.equal(visual.materials.length,1);
  const m=visual.materials[0];assert.notEqual(m,material);assert.equal(m.envMap,env);assert.equal(m.map.source,map.source);assert.equal(m.map.anisotropy,4);
  const matrix=new Matrix4(),p=new Vector3();
  Object.entries(DJC_FURNITURE_PLACEMENTS).forEach(([family,placements],index)=>{
    assert.equal(visual.instances[index].count,placements.length);
    placements.forEach(([x,y,z],i)=>{visual.instances[index].getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);assert.ok(p.distanceTo(new Vector3(x+.1,y+.2,z+.3))<1e-5,`${family} family offset is stripped exactly once`);});
  });
  m.addEventListener('dispose',()=>owned++);m.map.addEventListener('dispose',()=>owned++);visual.setNight(1);assert.equal(m.envMapIntensity,.5);
  visual.dispose();visual.dispose();assert.equal(owned,2);assert.equal(borrowed,0);geometry.dispose();map.dispose();env.dispose();material.dispose();
});
test('legacy needs explicit QA and a missing family fails into fallback',()=>{
  assert.equal(djcFurnitureLegacy('?djcFurniture=legacy'),false);assert.equal(djcFurnitureLegacy('?qa=1&djcFurniture=legacy'),true);
  assert.throws(()=>createDjcFurnitureVisual(new Group()),/missing family lounger/);
});

test('actual GLB has three real roots with preserved family dimensions and five fixed placements',async t=>{
  const gltf=await readWorldCraftGltf(['public/assets/world/club/furniture/furniture-v1.glb','docs/world/phase-2-playground/djc-furniture-craft-20261101/furniture.glb']);
  if(!gltf){t.skip('furniture export not delivered');return;}
  let visual;
  try{
    const expected={lounger:[1.2,.355,2.4],console:[1.39,.92,5],speaker:[.953,1.675,.78]};
    for(const family of Object.keys(expected)){
      const node=gltf.scene.getObjectByName('DJC_Furniture_'+family);assert.ok(node);
      const size=new Box3().setFromObject(node).getSize(new Vector3()).toArray();
      size.forEach((value,i)=>assert.ok(value<=expected[family][i]+.001&&value>=expected[family][i]-.03,`${family} dimension${i}: ${value}`));
    }
    visual=createDjcFurnitureVisual(gltf.scene);assert.ok(visual.instances.length<=13);
    for(const item of visual.instances){assert.equal(item.count,item.name.includes('console')?1:2);for(const a of Object.values(item.geometry.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));}
    assert.ok(visual.materials.length>=5);for(const m of visual.materials)assert.equal(m.emissive.getHex(),0);
  }finally{visual?.dispose();disposeWorldCraftGltf(gltf.scene);}
});
