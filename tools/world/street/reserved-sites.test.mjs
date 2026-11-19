import test from 'node:test';
import assert from 'node:assert/strict';
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import R from '@dimforge/rapier3d-compat';
import {loadShippedDraco} from '../alpha-mine-tests/shipped-draco.mjs';
import {disposeWorldCraftGltf} from '../../../src/components/world/world-craft-gltf-test.mjs';
import {constructionSignGeometry} from '../../../src/components/world/WorldStreetConstructionSigns.tsx';

test('all three installed F04 signs support their printed face and leave the space below it clear',async t=>{
  await R.init();
  const {scene}=await loadShippedDraco(new URL('../../../public/assets/world/park/signs.glb',import.meta.url));
  const sign=constructionSignGeometry(scene.getObjectByName('F04'));
  const material=new MeshBasicMaterial({side:DoubleSide}),world=new R.World({x:0,y:0,z:0});
  t.after(()=>{world.free();material.dispose();sign.geometry.dispose();disposeWorldCraftGltf(scene);});
  assert.equal(sign.ranges.reduce((n,p)=>n+p.vertexCount,0),sign.geometry.attributes.position.count);
  assert.equal(sign.placements.length,3);
  let maxError=0, backing=0, clear=0;
  for(const [i,p] of sign.placements.entries()){
    const shape=sign.colliders[i],body=world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices));
    const draw=new Mesh(sign.geometry,material);draw.matrix.copy(p.matrix);draw.matrixAutoUpdate=false;draw.updateMatrixWorld(true);
    for(const x of [-.35,0,.35])for(const y of [.58,.78,.98]){
      const origin=new Vector3(x,y,.3).applyMatrix4(p.matrix),dir=new Vector3(0,0,-1);
      const hit=new Raycaster(origin,dir,0,.4).intersectObject(draw)[0],physical=body.castRay(new R.Ray(origin,dir),.4,true);
      assert.ok(hit && physical>=0 && physical<=.268);
      maxError=Math.max(maxError,Math.abs(hit.distance-physical));backing++;
    }
    for(const x of [-.14,0,.14]){
      const at=new Vector3(x,.34,.35).applyMatrix4(p.matrix);
      assert.equal(body.castRay(new R.Ray(at,{x:0,y:0,z:-1}),.7,true),-1);clear++;
    }
  }
  assert.ok(maxError<.00002);t.diagnostic(JSON.stringify({backing,clear,maxError}));
});
