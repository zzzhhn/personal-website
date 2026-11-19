import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { createDjcPoolLanternVisual, DJC_POOL_LANTERN_POSITIONS } from './djc-pool-lantern-visual.ts';
import { clubFallbackContact, clubFixedAssetContact, declareClubFixedInstances } from './club-fixed-contact.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';
import source from './club-pool-lantern-contact.generated.json' with {type:'json'};

const ROOT='djc-pool-lantern-contact';
const RAP=await R.init();
const zero={x:0,y:0,z:0};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ray=(world,o,d)=>world.castRay(new R.Ray(new Vector3(...o),new Vector3(...d)),1,true)?.timeOfImpact;
const shape=clubFixedAssetContact(source);

test('published lamp casing, cap and clear space agree with the compact fixed source across ten placements', async t => {
  const {scene}=await readWorldCraftGltf([source.source]), world=new R.World(zero), old=new R.World(zero);
  const mat=new MeshBasicMaterial({side:DoubleSide});
  t.after(()=>{world.free();old.free();mat.dispose();disposeWorldCraftGltf(scene);});
  assert.equal(source.sha256,hash(await readFile(new URL(`../../../${source.source}`,import.meta.url))));
  assert.ok(shape.indices.length/3<=1000);
  const root=new Scene();
  scene.updateMatrixWorld(true);
  scene.traverse(item=>{if(!item.isMesh)return;const mesh=new Mesh(item.geometry,mat);mesh.matrixAutoUpdate=false;mesh.matrix.copy(item.matrixWorld);root.add(mesh);});
  let worst=0;
  for(const [x,y,z] of DJC_POOL_LANTERN_POSITIONS){
    world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices).setTranslation(x,y,z));
    old.createCollider(R.ColliderDesc.cuboid(.15,.2,.15).setTranslation(x,y+.2,z));
    world.step();old.step();
    root.position.set(x,y,z);root.updateMatrixWorld(true);
    for(const [name,[a,b,c],direction] of [
      ['front timber post',[.105,.55,.6],[0,0,-1]],
      ['cap',[0,1,0],[0,-1,0]],
      ['pedestal',[.04,.2,.6],[0,0,-1]],
      ['upper shade',[0,.59,.6],[0,0,-1]],
      ['clear beside cap',[.16,.735,.6],[0,0,-1]],
    ]){
      const from=[x+a,y+b,z+c];
      const visual=new Raycaster(new Vector3(...from),new Vector3(...direction),0,1).intersectObject(root,true)[0]?.distance;
      const physical=ray(world,from,direction);
      assert.equal(physical===undefined,visual===undefined,name);
      if(visual!==undefined)worst=Math.max(worst,Math.abs(physical-visual));
      if(name==='front timber post')assert.equal(ray(old,from,direction),undefined);
      if(name==='cap')assert.ok(ray(old,from,direction)-physical>.35);
    }
  }
  assert.ok(worst<.002,`maximum ray discrepancy ${worst}`);
  t.diagnostic(`${shape.indices.length/3} shared source triangles; 50 ray comparisons; maximum discrepancy ${worst.toFixed(6)} m`);
});

test('one strict root covers each published mesh and each actual instance matrix', async t=>{
  const {scene}=await readWorldCraftGltf([source.source]), visual=createDjcPoolLanternVisual(scene);
  t.after(()=>{visual.dispose();disposeWorldCraftGltf(scene);});
  declareClubFixedInstances(visual.instances,source,ROOT,DJC_POOL_LANTERN_POSITIONS.length);
  const world=new Scene(), assembly=new Object3D();assembly.name=ROOT;
  world.add(assembly);assembly.add(visual.root);
  const objects=DJC_POOL_LANTERN_POSITIONS.map((_,i)=>{const node=new Object3D();node.name=`${ROOT}-${i}`;assembly.add(node);return node;});
  const review=()=>collisionInventory(world,visual.instances,objects,[ROOT]);
  assert.deepEqual(review().errors,[]);
  assert.equal(review().registrations[ROOT],10);
  visual.instances[0].instanceMatrix.array[12]+=.05;
  assert.ok(review().errors.some(x=>x.includes('invalid')),'a render instance moved independently of the real contact');
});

test('the loading and opt-in legacy fallback registers its exact procedural geometry', t=>{
  const built=buildDjcClubGeometry({separatePoolLanterns:true});
  const geometries=Object.values(built.poolLanterns).filter(g=>g.attributes.position.count>0);
  const material=new MeshBasicMaterial({side:DoubleSide}), drawn=new Scene(), stage=new Object3D();stage.name=ROOT;drawn.add(stage);
  const id=`${ROOT}-fallback`, source=new Object3D();source.name=id;stage.add(source);
  const surfaces=geometries.map(g=>{const mesh=new Mesh(g,material);mesh.userData={worldCollision:'solid',surfaceId:id,worldCollisionSharedSurface:true};stage.add(mesh);return mesh;});
  const fallback=clubFallbackContact(geometries),w=new R.World(zero);w.createCollider(R.ColliderDesc.trimesh(fallback.vertices,fallback.indices));w.step();
  t.after(()=>{w.free();material.dispose();for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(built[name]).forEach(g=>g.dispose());built.pool.dispose();});
  const inv=collisionInventory(drawn,surfaces,[source],[ROOT]);
  assert.deepEqual(inv.errors,[]);assert.equal(inv.registrations[ROOT],1);
  assert.equal(fallback.indices.length/3,1640);
  for(const [x,y,z]of DJC_POOL_LANTERN_POSITIONS){
    const from=[x,y+1,z],dir=[0,-1,0], visible=new Raycaster(new Vector3(...from),new Vector3(...dir),0,1).intersectObjects(surfaces)[0];
    assert.ok(Math.abs(visible.distance-ray(w,from,dir))<.0001);
  }
});
