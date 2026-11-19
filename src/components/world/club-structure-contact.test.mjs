import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { buildDjcBarProxy, DJC_BAR_ASSETS } from './djc-bar-layout.ts';
import { CLUB_DAYBEDS } from './djc-club-layout.ts';
import { buildClubBarStoolContact } from './club-north-bar-contact.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

await R.init();
const scene=buildDjcClubGeometry({separateDaybeds:true,separateUmbrellas:true,separateFurniture:true});
const zero={x:0,y:0,z:0};
function worldWith(contacts){
  const world=new R.World(zero);
  for(const shape of contacts)world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices));
  world.step();return world;
}
const physical=(w,o,d,max)=>w.castRay(new R.Ray(new Vector3(...o),new Vector3(...d)),max,true)?.timeOfImpact;
const visible=(mesh,o,d,max)=>new Raycaster(new Vector3(...o),new Vector3(...d),0,max).intersectObject(mesh,true)[0]?.distance;
const point=(p,i)=>[p.getX(i),p.getY(i),p.getZ(i)];
const key=points=>points.map(p=>p.map(v=>Math.round(v*1e5)).join(',')).sort().join('|');
test.after(()=>{for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(scene[name]).forEach(g=>g.dispose());scene.pool.dispose();});

test('provenance on the approved material batches maps physical source triangles to the real walking and solid meshes', t=>{
  const contact=Object.fromEntries(Object.entries(scene.colliders).map(([kind,{vertices}])=>{
    const triangles=new Set();
    for(let i=0;i<vertices.length;i+=9)triangles.add(key([0,3,6].map(offset=>Array.from(vertices.subarray(i+offset,i+offset+3)))));
    return [`djc-${kind}-same-mesh`,triangles];
  }));
  let verified=0;
  for(const [name,data] of Object.entries(scene.sources)){
    const positions=scene.batches[name].attributes.position;
    let end=0;
    for(const span of data.worldCollisionSources??[]){
      assert.ok(span.firstVertex>=end);
      end=span.firstVertex+span.vertexCount;
      if(span.collision==='soft') { assert.equal(name,'foliage');continue; }
      for(let i=span.firstVertex;i<end;i+=3){
        assert.ok(contact[span.surfaceId].has(key([i,i+1,i+2].map(v=>point(positions,v)))),`${name} source triangle ${i/3}`);
        verified++;
      }
    }
  }
  assert.equal(scene.sources.stone.worldCollisionPartial,false);
  assert.equal(scene.sources.foliage.worldCollisionPartial,false);
  assert.ok(verified>10_000);
  t.diagnostic(`${verified} verified physical triangles across the original material draws`);
});

test('visible and physical mattress rims agree at all four beds while the timber entrance still reaches the rim',async t=>{
  const {scene:asset}=await readWorldCraftGltf(['public/assets/world/club/daybed/daybed-ao-v1.glb']);
  const material=new MeshBasicMaterial({side:DoubleSide}), mattress=asset.getObjectByName('Daybed_AO_working_geometry003');
  const drawing=new Mesh(mattress.geometry,material), world=worldWith(Object.values(scene.colliders));
  t.after(()=>{world.free();material.dispose();disposeWorldCraftGltf(asset);});
  const wood=new Mesh(scene.batches.wood,material);
  let max=0;
  for(const [x,z] of CLUB_DAYBEDS){
    drawing.position.set(x,1.5,z);drawing.updateMatrixWorld(true);
    for(const [dx,dz] of [[-1,0],[1,0],[0,1]])for(const y of [1.61,1.67,1.75]){
      const o=[x+2.25*dx,y,z+2.25*dz], d=[-dx,0,-dz];
      const seen=visible(drawing,o,d,1.5), actual=physical(world,o,d,1.5);
      assert.ok(seen!==undefined&&actual!==undefined);
      max=Math.max(max, Math.abs(actual-seen));
    }
    for(const offset of [-.63,0,.63])for(const dz of [-1.78,-1.55,-1.3]){
      const o=[x+offset,2.2,z+dz],dir=[0,-1,0];
      const seen=Math.min(visible(drawing,o,dir,.55)??Infinity,visible(wood,o,dir,.55)??Infinity);
      const actual=physical(world,o,dir,.55);
      assert.ok(Number.isFinite(seen)&&actual!==undefined);
      max=Math.max(max,Math.abs(actual-seen));
    }
  }
  assert.ok(max<.001,`rim/landing error ${max}`);
  t.diagnostic(`72 real rim and landing probes, maximum discrepancy ${max.toFixed(6)} m`);
});

test('the four open bar stools fit both shipped LODs with gaps below each seat',async t=>{
  const variants=await Promise.all(Object.values(DJC_BAR_ASSETS).map(url=>readWorldCraftGltf([`public${url}`])));
  const stool=buildClubBarStoolContact(), proxy=buildDjcBarProxy(true), old=buildDjcBarProxy(), world=worldWith([proxy.surface,proxy.solid]);
  const legacy=worldWith([old.surface,old.solid]);
  const material=new MeshBasicMaterial({side:DoubleSide});
  t.after(()=>{for(const v of variants)disposeWorldCraftGltf(v.scene);world.free();legacy.free();proxy.roof.dispose();old.roof.dispose();stool.geometry.dispose();material.dispose();});
  for(const [x,y,z] of stool.placements)world.createCollider(R.ColliderDesc.trimesh(stool.vertices,stool.indices).setTranslation(x,y,z));
  world.step();
  for(const model of variants){
    const drawing=new Group();
    model.scene.updateMatrixWorld(true);
    model.scene.traverse(mesh=>{if(!mesh.isMesh)return;const copy=new Mesh(mesh.geometry,material);copy.matrixAutoUpdate=false;copy.matrix.copy(mesh.matrixWorld);drawing.add(copy);});
    drawing.updateMatrixWorld(true);
    for(const [x,,z] of stool.placements){
      const origin=[x+1.1,.3,z],across=[-1,0,0];
      assert.equal(visible(drawing,origin,across,1.9),undefined);
      assert.equal(physical(world,origin,across,1.9),undefined);
      assert.ok(physical(legacy,origin,across,1.9)<.8);
      // Both LODs retain this solid rim. Their open woven centres can have
      // different zero-width rays through the individual strands.
      const topRay=[x+.31,1.1,z], down=[0,-1,0];
      const drawn=visible(drawing,topRay,down,.5), hit=physical(world,topRay,down,.5);
      assert.ok(Math.abs(drawn-hit)<.003,`seat top ${x}: drawn ${drawn}, contact ${hit}`);
    }
  }
});
