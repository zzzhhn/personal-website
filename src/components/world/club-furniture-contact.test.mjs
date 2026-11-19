import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { clubFallbackContact, clubFixedAssetContact, declareClubFixedInstances } from './club-fixed-contact.ts';
import { createDjcFurnitureVisual, DJC_FURNITURE_PLACEMENTS } from './djc-furniture-visual.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';
import lounger from './club-furniture-lounger-contact.generated.json' with {type:'json'};
import consoleContact from './club-furniture-console-contact.generated.json' with {type:'json'};
import speaker from './club-furniture-speaker-contact.generated.json' with {type:'json'};

const NAME='djc-furniture-contact';
const sources={lounger,console:consoleContact,speaker};
const fixtures={
  lounger:[
    ['leg side',[1,.01,0],[-1,0,0],.400], ['uncovered timber edge',[.59,.5,0],[0,-1,0],.400],
    ['canvas center',[0,.5,0],[0,-1,0],.205], ['outside lounger',[.66,.5,0],[0,-1,0],undefined],
  ],
  console:[
    ['front battens',[1.8,.55,0],[-1,0,0],1.090], ['side of booth',[1.8,.58,-1],[-1,0,0],1.090],
    ['operator bay',[-1.8,.55,0],[1,0,0],undefined],
  ],
  speaker:[
    ['woofer grille',[1.4,.8,0],[-1,0,0],.9055], ['upper grille',[1.4,1.39,0],[-1,0,0],.9055],
    ['cabinet top',[0,1.9,0],[0,-1,0],.225], ['aside cabinet',[1.4,.8,.43],[-1,0,0],undefined],
  ],
};
await R.init();

test('the five placed furniture shapes match the published asset without closing empty spaces',async t=>{
  const {scene}=await readWorldCraftGltf([lounger.source]);
  const material=new MeshBasicMaterial({side:DoubleSide});
  t.after(()=>{material.dispose();disposeWorldCraftGltf(scene);});
  const sha256=createHash('sha256').update(await readFile(new URL(`../../../${lounger.source}`,import.meta.url))).digest('hex');
  scene.updateMatrixWorld(true);
  let worst=0, exactTriangles=0, sourceTriangles=0;
  for(const [family,source] of Object.entries(sources)){
    assert.equal(source.sha256,sha256);
    const node=scene.getObjectByName(source.node),inverse=node.matrixWorld.clone().invert();
    const shape=clubFixedAssetContact(source), drawing=new Scene();
    exactTriangles+=shape.indices.length/3;
    sourceTriangles+=source.materials.reduce((count,entry)=>count+entry.sourceTriangles,0);
    node.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const draw=new Mesh(mesh.geometry,material);
      draw.matrixAutoUpdate=false;draw.matrix.multiplyMatrices(inverse,mesh.matrixWorld);drawing.add(draw);
    });
    for(const placed of DJC_FURNITURE_PLACEMENTS[family]){
      const [x,y,z]=placed;
      const world=new R.World({x:0,y:0,z:0});
      try{
        world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices).setTranslation(x,y,z));world.step();
        drawing.position.set(x,y,z);drawing.updateMatrixWorld(true);
        for(const [name,offset,direction,expected] of fixtures[family]){
          const from=new Vector3(...offset).add(drawing.position),dir=new Vector3(...direction);
          const far=name==='operator bay'?2:1.9;
          const visual=new Raycaster(from,dir,0,far).intersectObject(drawing,true)[0]?.distance;
          const contact=world.castRay(new R.Ray(from,dir),far,true)?.timeOfImpact;
          assert.equal(contact===undefined,expected===undefined,`${family} ${name}: contact = ${contact}`);
          assert.equal(visual===undefined,expected===undefined,`${family} ${name}: visual = ${visual}`);
          if(visual!==undefined){
            assert.ok(Math.abs(visual-expected)<.002,`${family} ${name}: visual = ${visual}`);
            assert.ok(Math.abs(contact-visual)<.006,`${family} ${name}: visual ${visual}, contact ${contact}`);
            worst=Math.max(worst,Math.abs(contact-visual));
          }
        }
      }finally{world.free();}
    }
  }
  assert.ok(exactTriangles<6000);
  t.diagnostic(`${exactTriangles} generated from ${sourceTriangles} shared triangles; maximum discrepancy ${worst.toFixed(6)} m`);
});

test('all actual material instances have a unique registered physical placement, with one complete fallback',async t=>{
  const {scene}=await readWorldCraftGltf([lounger.source]), visual=createDjcFurnitureVisual(scene), drawing=new Scene(), root=new Group();
  root.name=NAME;drawing.add(root);root.add(visual.root);
  t.after(()=>{visual.dispose();disposeWorldCraftGltf(scene);});
  const supplies=[];
  for(const [family,source] of Object.entries(sources)){
    const count=DJC_FURNITURE_PLACEMENTS[family].length,prefix=`${NAME}-${family}`;
    declareClubFixedInstances(visual.instances.filter(mesh=>mesh.name.startsWith(`djc-${family}-`)),source,prefix,count);
    for(let i=0;i<count;i++){
      const collider=new Group();collider.name=`${prefix}-${i}`;root.add(collider);supplies.push(collider);
    }
  }
  const inv=collisionInventory(drawing,visual.instances,supplies,[NAME]);
  assert.deepEqual(inv.errors,[]);assert.equal(inv.registrations[NAME],5);
  const built=buildDjcClubGeometry({separateFurniture:true});
  t.after(()=>{
    for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(built[name]).forEach(g=>g.dispose());
    built.pool.dispose();
  });
  const geometries=Object.values(built.furniture).filter(geometry=>geometry.attributes.position.count>0);
  const fallback=clubFallbackContact(geometries);
  assert.equal(fallback.indices.length/3,1350);
  assert.deepEqual(Array.from(fallback.vertices),geometries.flatMap(geometry=>Array.from(geometry.attributes.position.array)));
});
