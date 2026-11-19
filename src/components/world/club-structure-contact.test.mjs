import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { buildDjcBarProxy, DJC_BAR_ASSETS } from './djc-bar-layout.ts';
import { CLUB_DAYBEDS, CLUB_LANTERNS } from './djc-club-layout.ts';
import { DJC_DAYBED_ORIGIN_Y } from './djc-daybed-visual.ts';
import { clubDaybedContact } from './club-daybed-contact.ts';
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
      assert.equal(span.firstVertex,end,`${name}: no unclaimed triangles between explicit spans`);
      end=span.firstVertex+span.vertexCount;
      if(span.collision==='soft') { assert.equal(name,'foliage');continue; }
      if(span.collision==='none') { assert.ok(span.reason);continue; }
      for(let i=span.firstVertex;i<end;i+=3){
        assert.ok(contact[span.surfaceId].has(key([i,i+1,i+2].map(v=>point(positions,v)))),`${name} source triangle ${i/3}`);
        verified++;
      }
    }
    assert.equal(end,positions.count,`${name}: every rendered triangle has an owner or explicit surface role`);
  }
  assert.equal(scene.sources.stone.worldCollisionPartial,false);
  assert.equal(scene.sources.foliage.worldCollisionPartial,false);
  assert.ok(verified>10_000);
  t.diagnostic(`${verified} verified physical triangles across the original material draws`);
});

test('real low lantern cages, light covers and legacy bar glass have contact on their visible faces',t=>{
  const legacy=buildDjcClubGeometry({includeNorthBar:true,separateDaybeds:true,separateUmbrellas:true,separateFurniture:true,separatePoolLanterns:true});
  const material=new MeshBasicMaterial({side:DoubleSide}),world=worldWith(Object.values(scene.colliders)),oldBar=worldWith(Object.values(legacy.colliders));
  t.after(()=>{world.free();oldBar.free();material.dispose();for(const name of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(legacy[name]).forEach(g=>g.dispose());legacy.pool.dispose();});
  assert.equal(scene.batches.glass.attributes.position.count,0,'ordinary bar has its own loaded asset');
  assert.equal(legacy.sources.glass.worldCollisionPartial,false,'the archived visible bottles keep their physical source ranges');
  const visibleFixture=new Group();
  for(const kind of ['wood','amber','cyan','metal'])visibleFixture.add(new Mesh(scene.batches[kind],material));
  const lampCages=CLUB_LANTERNS.filter(p=>p[1]===1.95).map(([x,y,z])=>[[x+.31,y,z],[-1,0,0],.32]);
  const errors=[];
  for(const [origin,dir,span] of [...lampCages,[[43.5,7.8,48],[0,1,0],.13],[[43.5,7.8,62],[0,1,0],.13]]){
    const see=visible(visibleFixture,origin,dir,span),hit=physical(world,origin,dir,span);
    assert.ok(see!==undefined&&hit!==undefined,`${origin}: find the actual lamp body`);
    errors.push(Math.abs(see-hit));
  }
  const glass=new Mesh(legacy.batches.glass,material), amber=new Mesh(legacy.batches.amber,material);
  for(const [draw,origin,dir,span] of [[glass,[36.98,2.51,39.1],[0,0,-1],.33],[amber,[40.8,2.2,37.95],[0,0,1],.5]]){
    const see=visible(draw,origin,dir,span),hit=physical(oldBar,origin,dir,span);
    assert.ok(see!==undefined&&hit!==undefined,`${origin}: find the actual bar object`);
    errors.push(Math.abs(see-hit));
  }
  assert.ok(Math.max(...errors)<.001,`maximum real light and glass fit ${Math.max(...errors)} m`);
  t.diagnostic(JSON.stringify({probes:errors.length,maxErrorMm:Math.max(...errors)*1000}));
});

test('the separate DJ controller plate and platter tops own their visible contact, leaving the operator side open',t=>{
  const w=worldWith(Object.values(scene.colliders)), material=new MeshBasicMaterial({side:DoubleSide}), draw=new Mesh(scene.batches.metal,material);
  t.after(()=>{w.free();material.dispose();});
  for(const [origin,direction,far] of [
    [[34,2.99,55.3],[-1,0,0],1.5],
    [[32.72,3.4,54.42],[0,-1,0],.5],
    [[32.73,3.4,53.63],[0,-1,0],.5],
    [[32.73,3.4,55.93],[0,-1,0],.5],
  ]){
    const seen=visible(draw,origin,direction,far),actual=physical(w,origin,direction,far);
    assert.ok(seen!==undefined&&actual!==undefined&&Math.abs(actual-seen)<.001,`${origin}: seen ${seen}, hit ${actual}`);
  }
  assert.equal(physical(w,[31.05,2.85,54.9],[1,0,0],.65),undefined);
});

test('visible and physical mattress rims agree at all four beds while the timber entrance still reaches the rim',async t=>{
  const {scene:asset}=await readWorldCraftGltf(['public/assets/world/club/daybed/daybed-ao-v1.glb']);
  const material=new MeshBasicMaterial({side:DoubleSide}), mattress=asset.getObjectByName('Daybed_AO_working_geometry003');
  const drawing=new Mesh(mattress.geometry,material), world=worldWith(Object.values(scene.colliders));
  t.after(()=>{world.free();material.dispose();disposeWorldCraftGltf(asset);});
  const wood=new Mesh(scene.batches.wood,material);
  const shape=clubDaybedContact();
  for(const [x,z] of CLUB_DAYBEDS)world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices).setTranslation(x,DJC_DAYBED_ORIGIN_Y,z));
  world.step();
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
