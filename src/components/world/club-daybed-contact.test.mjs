import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { CLUB_DAYBEDS } from './djc-club-layout.ts';
import { createDjcDaybedVisual, DJC_DAYBED_ORIGIN_Y } from './djc-daybed-visual.ts';
import { clubDaybedContact, CLUB_DAYBED_SOURCE } from './club-daybed-contact.ts';
import { clubFallbackContact, declareClubFixedInstances } from './club-fixed-contact.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

const NAME='djc-daybed-contact', zero={x:0,y:0,z:0};
const fixtures=[
  ['limestone side',[2.1,-.39,0],[-1,0,0],.8,.475],
  ['split-sector stone',[2.1,-.35,.9],[-1,0,0],.9,.7174],
  ['timber rim',[2.1,-.05,.8],[-1,0,0],.8,.6569],
  ['back cushion rear',[0,.51,1.8],[0,0,-1],.8,.6997],
  ['cushion front',[.72,.43,.15],[0,0,1],.7,.3869],
  ['top of cushion',[.65,.95,.93],[0,-1,0],.95,.2435],
  ['accent cushion',[.66,.39,.22],[0,0,1],.48,.3179],
  ['lamp cap',[-1.26,.9,.05],[0,-1,0],.65,.2045],
  ['tray skirt',[-1.82,.28,.05],[1,0,0],.7,.2362],
  ['open approach',[0,.57,-2],[0,0,1],1.2,undefined],
  ['mattress top',[0,.6,0],[0,-1,0],.8,.345],
];
await R.init();

test('actual daybed geometry owns the cushions, limestone and lantern without blocking the front approach',async t=>{
  const {scene}=await readWorldCraftGltf([CLUB_DAYBED_SOURCE.source]), material=new MeshBasicMaterial({side:DoubleSide});
  t.after(()=>{material.dispose();disposeWorldCraftGltf(scene);});
  const hash=createHash('sha256').update(await readFile(new URL(`../../../${CLUB_DAYBED_SOURCE.source}`,import.meta.url))).digest('hex');
  assert.equal(hash,CLUB_DAYBED_SOURCE.sha256);
  assert.equal(CLUB_DAYBED_SOURCE.materials.find(m=>m.name.startsWith('03 '))?.error,0,'keep the published mattress faces at the timber entrance');
  const shapes=clubDaybedContact(), drawing=new Scene(), w=new R.World(zero);
  t.after(()=>w.free());
  scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const draw=new Mesh(mesh.geometry,material);
    draw.matrixAutoUpdate=false;draw.matrix.copy(mesh.matrixWorld);drawing.add(draw);
  });
  for(const [x,z] of CLUB_DAYBEDS)w.createCollider(R.ColliderDesc.trimesh(shapes.vertices,shapes.indices).setTranslation(x,DJC_DAYBED_ORIGIN_Y,z));
  w.step();
  let worst=0;
  for(const [x,z] of CLUB_DAYBEDS){
    drawing.position.set(x,DJC_DAYBED_ORIGIN_Y,z);drawing.updateMatrixWorld(true);
    for(const [label,offset,direction,far,expected] of fixtures){
      const from=new Vector3(...offset).add(drawing.position), dir=new Vector3(...direction);
      const visible=new Raycaster(from,dir,0,far).intersectObject(drawing)[0]?.distance;
      const contact=w.castRay(new R.Ray(from,dir),far,true)?.timeOfImpact;
      assert.equal(contact===undefined,expected===undefined,`${label}: ${contact}`);
      assert.equal(visible===undefined,expected===undefined,`${label}: ${visible}`);
      if(visible!==undefined){
        assert.ok(Math.abs(visible-expected)<.001,`${label}: ${visible}`);
        const deviation=Math.abs(contact-visible);
        assert.ok(deviation<.01,`${label}: visual ${visible}, contact ${contact}`);
        worst=Math.max(worst,deviation);
      }
    }
  }
  t.diagnostic(`${fixtures.length*CLUB_DAYBEDS.length} probes; ${shapes.indices.length/3} reusable triangles; maximum discrepancy ${worst.toFixed(6)} m`);
});

test('all eight actual materials claim four same-root fixtures and the original fallback is separately exact',async t=>{
  const {scene}=await readWorldCraftGltf([CLUB_DAYBED_SOURCE.source]), visual=createDjcDaybedVisual(scene), drawing=new Scene(), root=new Group();
  root.name=NAME;drawing.add(root);root.add(visual.root);
  t.after(()=>{visual.dispose();disposeWorldCraftGltf(scene);});
  declareClubFixedInstances(visual.instances,CLUB_DAYBED_SOURCE,NAME,CLUB_DAYBEDS.length);
  const supplies=CLUB_DAYBEDS.map((_,i)=>{const collider=new Group();collider.name=`${NAME}-${i}`;root.add(collider);return collider;});
  const inv=collisionInventory(drawing,visual.instances,supplies,[NAME]);
  assert.deepEqual(inv.errors,[]);assert.equal(inv.registrations[NAME],4);
  const club=buildDjcClubGeometry({separateDaybeds:true});
  t.after(()=>{
    for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(club[name]).forEach(g=>g.dispose());
    club.pool.dispose();
  });
  const meshes=Object.values(club.daybeds).filter(g=>g.attributes.position.count>0), fallback=clubFallbackContact(meshes);
  assert.deepEqual(Array.from(fallback.vertices),meshes.flatMap(g=>Array.from(g.attributes.position.array)));
});
