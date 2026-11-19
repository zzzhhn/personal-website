import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { loadShippedDraco } from '../alpha-mine-tests/shipped-draco.mjs';
import { disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';
import { buildParkSigns } from '../../../src/components/world/WorldParkSigns.tsx';
import { HUTS } from '../../../src/components/world/WorldParkLayout.ts';

test('the installed directory and hut signs have backed print faces, open leg gaps and registered frames',async t=>{
  await R.init();
  const asset = await loadShippedDraco(new URL('../../../public/assets/world/park/signs.glb',import.meta.url));
  const built = buildParkSigns(asset,[]);
  const world = new R.World({x:0,y:0,z:0});
  const material = new MeshBasicMaterial({side:DoubleSide});
  t.after(()=>{
    world.free(); material.dispose(); built.body.dispose(); built.faces.dispose(); disposeWorldCraftGltf(asset.scene);
  });
  const print = new Mesh(built.faces,material), frame = new Mesh(built.body,material);
  assert.equal(built.signs.length,HUTS.length+1);
  let vertices=0, indices=0, faceHits=0, clearRays=0, maxGap=0;
  for(const [i,sign] of built.signs.entries()){
    const source=built.frameSources[i], sheet=built.printSources[i];
    assert.equal(source.firstVertex,vertices);
    assert.equal(sheet.firstIndex,indices);
    assert.equal(sheet.surfaceId,source.surfaceId);
    assert.equal(source.vertexCount,built.colliders[i].indices.length);
    vertices+=source.vertexCount; indices+=sheet.indexCount;
    const collider=world.createCollider(R.ColliderDesc.trimesh(built.colliders[i].vertices,built.colliders[i].indices));
    const dir=new Vector3(0,0,-1).transformDirection(sign.matrix);
    for(const x of [-.35,0,.35]){
      for(const h of [.2,.5,.8]){
        const from=new Vector3(x*sign.width,sign.bottom+sign.height*h,.28).applyMatrix4(sign.matrix);
        const view=new Raycaster(from,dir,0,.5), label=view.intersectObject(print)[0], wood=view.intersectObject(frame)[0];
        const physical=collider.castRay(new R.Ray(from,dir),.5,true);
        assert.ok(wood&&label&&physical>=0,sign.id);
        assert.ok(Math.abs(physical-wood.distance)<.000025,sign.id);
        const gap=physical-label.distance;
        assert.ok(gap>=0&&gap<.002,sign.id);
        maxGap=Math.max(maxGap,gap); faceHits++;
      }
      const under=new Vector3(x*sign.width,.32,.35).applyMatrix4(sign.matrix);
      assert.equal(collider.castRay(new R.Ray(under,dir),.7,true),-1,sign.id);
      clearRays++;
    }
    for(const side of [-1,1]){
      const from=new Vector3(side*(sign.width/2+.085*.15),.14,.17).applyMatrix4(sign.matrix);
      const down=new R.Ray(from,{x:0,y:-1,z:0});
      assert.ok(collider.castRay(down,.17,true)>=0,sign.id+' foot');
    }
  }
  assert.equal(vertices,built.body.attributes.position.count);
  assert.equal(indices,built.faces.index.count);
  t.diagnostic(JSON.stringify({signs:built.signs.length,faceHits,clearRays,maxGap}));
});
