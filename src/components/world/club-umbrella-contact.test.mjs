import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { createDjcUmbrellaVisual, DJC_UMBRELLA_PLACEMENTS } from './djc-umbrella-visual.ts';
import { clubFallbackContact, clubFixedAssetContact, declareClubFixedInstances } from './club-fixed-contact.ts';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';
import source from './club-umbrella-contact.generated.json' with {type:'json'};

const NAME='djc-umbrella-contact';
const shape=clubFixedAssetContact(source);
await R.init();

test('each actual parasol pole and tailored canopy matches the contact while open space stays clear',async t=>{
  const {scene}=await readWorldCraftGltf([source.source]),w=new R.World({x:0,y:0,z:0});
  assert.equal(source.sha256,createHash('sha256').update(await readFile(new URL(`../../../${source.source}`,import.meta.url))).digest('hex'));
  const material=new MeshBasicMaterial({side:DoubleSide}), drawing=new Scene();
  t.after(()=>{w.free();material.dispose();disposeWorldCraftGltf(scene);});
  scene.updateMatrixWorld(true);
  scene.traverse(node=>{if(!node.isMesh)return;const m=new Mesh(node.geometry,material);m.matrixAutoUpdate=false;m.matrix.copy(node.matrixWorld);drawing.add(m);});
  assert.ok(shape.indices.length/3<=3300);
  let worst=0;
  for(const [x,y,z] of DJC_UMBRELLA_PLACEMENTS){
    w.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices).setTranslation(x,y,z));w.step();
    drawing.position.set(x,y,z);drawing.updateMatrixWorld(true);
    for(const [label,offset,direction] of [
      ['pole from west',[-.4,.62,0],[1,0,0]], ['pole from south',[0,.62,.35],[0,0,-1]],
      ['raised canvas edge',[1.55,3.1,0],[0,-1,0]], ['tailored bias',[1.4,3.1,.52],[0,-1,0]],
      ['open aside canopy',[1.59,3.1,.42],[0,-1,0]], ['under canopy',[1.55,1.8,0],[0,1,0]],
    ]){
      const from=new Vector3(...offset).add(new Vector3(x,y,z)),dir=new Vector3(...direction);
      const visual=new Raycaster(from,dir,0,1).intersectObject(drawing,true)[0]?.distance;
      const contact=w.castRay(new R.Ray(from,dir),1,true)?.timeOfImpact;
      assert.equal(contact===undefined,visual===undefined,label);
      if(visual!==undefined)worst=Math.max(worst,Math.abs(contact-visual));
    }
  }
  assert.ok(worst<.007,`maximum rays discrepancy ${worst} m`);
  t.diagnostic(`${shape.indices.length/3} shared triangles; maximum discrepancy ${worst.toFixed(6)} m`);
});

test('the actual four material batches claim two placements, with a separate exact fallback',async t=>{
  const {scene}=await readWorldCraftGltf([source.source]), visual=createDjcUmbrellaVisual(scene),w=new Scene(),root=new Object3D();
  root.name=NAME;w.add(root);root.add(visual.root);
  t.after(()=>{visual.dispose();disposeWorldCraftGltf(scene);});
  declareClubFixedInstances(visual.instances,source,NAME,2);
  const supplies=[0,1].map(i=>{const b=new Object3D();b.name=`${NAME}-${i}`;root.add(b);return b;});
  const inv=collisionInventory(w,visual.instances,supplies,[NAME]);
  assert.deepEqual(inv.errors,[]);assert.equal(inv.registrations[NAME],2);
  const built=buildDjcClubGeometry({separateUmbrellas:true}),geometries=Object.values(built.umbrellas).filter(g=>g.attributes.position.count>0);
  const fallback=clubFallbackContact(geometries);
  try {assert.equal(fallback.indices.length/3,96);}
  finally {for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(built[name]).forEach(g=>g.dispose());built.pool.dispose();}
});
