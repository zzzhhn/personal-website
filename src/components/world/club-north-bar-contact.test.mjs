import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { buildClubBarStoolContact, DJC_NORTH_BAR_CONTACT,
  djcBarStructureSupply, djcBarStoolSupply } from './club-north-bar-contact.ts';
import { buildClubNorthBarContact, declareNorthBarContacts } from './club-north-bar-structure.ts';
import { buildDjcBarProxy } from './djc-bar-layout.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';
import source from './club-north-bar-contact.generated.json' with {type:'json'};

const down=[0,-1,0],fromFront=[0,0,-1],fromBack=[0,0,1];
const fixtures=[
  ['front deck boards',[5.15,.4,2.21],down,1],['deck seam',[0,.4,2.21],down,1],
  ['deck bevel which had no support',[2,.4,2.29],down,1],['air beside deck',[5.27,.4,.8],down,1],
  ['counter end',[4.47,1.4,-1.36],down,1],['counter shoulder',[3.97,.59,.16],fromFront,2],
  ['counter mid face',[0,.67,.16],fromFront,2],['counter stone bevel',[0,1.45,-.75],down,1],
  ['open area behind shelves',[0,.36,-2.5],fromBack,1],['correct post face',[4.65,1.2,2.3],fromFront,1],
  ['air beside post',[4.6,1.2,2.3],fromFront,1],
  ['roof underside',[.5,3.6,0],[0,1,0],1.2],['roof top',[.5,5.4,0],down,1.2],
  ['west planter body',[-5.05,.255,1.8],fromFront,1.2],['east planter body',[5.05,.255,-.1],fromFront,1.2],
  ['air west of planter',[-5.31,.25,1.355],down,.3],['air east of planter',[5.31,.25,-.545],down,.3],
  ['west stone rim',[-5.05,.7,1.34],down,.6],['east stone rim',[5.05,.7,-.56],down,.6],
  ['pot sloping wall',[-5.23,.09,1.8],fromFront,1],['open aisle',[2.2,.47,.72],fromFront,1],
];
await R.init();

test('both published bar LODs fit one physical structure and preserve four open stools',async t=>{
  const shapes=buildClubNorthBarContact(), stools=buildClubBarStoolContact(), world=new R.World({x:0,y:0,z:0});
  const old=buildDjcBarProxy(true),previous=new R.World({x:0,y:0,z:0}),material=new MeshBasicMaterial({side:DoubleSide});
  t.after(()=>{world.free();previous.free();material.dispose();stools.geometry.dispose();old.roof.dispose();});
  const support=world.createCollider(R.ColliderDesc.trimesh(shapes.surface.vertices,shapes.surface.indices));
  world.createCollider(R.ColliderDesc.trimesh(shapes.solid.vertices,shapes.solid.indices));
  for(const shape of [old.surface,old.solid])previous.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices));
  for(const [x,y,z] of stools.placements)world.createCollider(R.ColliderDesc.trimesh(stools.vertices,stools.indices).setTranslation(x,y,z));
  world.step();previous.step();
  assert.equal(world.castRay(new R.Ray({x:0,y:.6,z:1.5},{x:0,y:-1,z:0}),1,true)?.collider.handle,support.handle);
  let worst=0;
  for(const [lod,spec] of Object.entries(source.variants)){
    const {scene}=await readWorldCraftGltf([spec.url]);
    t.after(()=>disposeWorldCraftGltf(scene));
    const sha=createHash('sha256').update(await readFile(new URL(`../../../${spec.url}`,import.meta.url))).digest('hex');
    assert.equal(sha,spec.sha256);
    const assembly=new Group(),drawn=new Scene(),review=new Scene(),meshList=[];
    assembly.name=DJC_NORTH_BAR_CONTACT;review.add(assembly);assembly.add(scene);
    scene.updateMatrixWorld(true);declareNorthBarContacts(scene,lod);
    scene.traverse(node=>{
      if(!node.isMesh)return;
      meshList.push(node);
      const mesh=new Mesh(node.geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(node.matrixWorld);drawn.add(mesh);
    });
    drawn.updateMatrixWorld(true);
    const supplies=['surface','solid'].map(kind=>djcBarStructureSupply(kind)).concat(stools.placements.map((_,i)=>djcBarStoolSupply(i))).map(name=>{
      const node=new Group();node.name=name;assembly.add(node);return node;
    });
    const inv=collisionInventory(review,meshList,supplies,[DJC_NORTH_BAR_CONTACT]);
    assert.deepEqual(inv.errors,[]);assert.equal(inv.registrations[DJC_NORTH_BAR_CONTACT],6);
    for(const [label,o,d,far] of fixtures){
      const origin=new Vector3(...o),dir=new Vector3(...d),ray=new R.Ray(origin,dir);
      const visible=new Raycaster(origin,dir,0,far).intersectObject(drawn)[0]?.distance;
      const actual=world.castRay(ray,far,true)?.timeOfImpact;
      const legacy=previous.castRay(ray,far,true)?.timeOfImpact;
      assert.equal(actual===undefined,visible===undefined,`${lod} ${label}: seen ${visible}, hit ${actual}`);
      if(visible!==undefined){
        const difference=Math.abs(visible-actual);
        assert.ok(difference<.015,`${lod} ${label}: seen ${visible}, hit ${actual}`);
        worst=Math.max(worst,difference);
      }
      if(label==='open area behind shelves')assert.ok(actual-legacy>.5);
      if(label.startsWith('air ')&&label.endsWith('of planter'))assert.ok(legacy<.3);
      if(label==='deck bevel which had no support')assert.equal(legacy,undefined);
    }
  }
  const triangles=shapes.surface.indices.length/3+shapes.solid.indices.length/3;
  assert.ok(triangles<25000);
  t.diagnostic(`${2*fixtures.length} probes, ${triangles} shared triangles, maximum discrepancy ${worst.toFixed(6)} m`);
});
