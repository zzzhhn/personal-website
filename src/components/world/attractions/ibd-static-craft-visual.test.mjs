import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import R from '@dimforge/rapier3d-compat';
import { Box3,BoxGeometry,DoubleSide,Euler,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,Object3D,Quaternion,Raycaster,Scene,Texture,Vector3 } from 'three';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { createIbdStaticCraft,ibdStaticCraftLegacy,IBD_STATIC_CRAFT_ROOTS } from './ibd-static-craft-visual.ts';
import { readWorldCraftGltf,disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
import { collisionInventory } from '../world-collision-inventory.ts';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from '../actor-physics.ts';
import { IBD_WORKSTATION_FIXTURES_ROOT } from './ibd-workstation-fixtures.ts';

const digest=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
test('shell separation replaces only the 26 equipment box proxies and preserves all rendered vertices',()=>{
  const full=buildIbdStatic(),split=buildIbdStatic({separateCraftShells:true});
  try{
    assert.equal(full.solids.length-split.solids.length,26);
    assert.deepEqual(full.solids.filter(s=>split.solids.some(other=>String(s.at)===String(other.at))),split.solids);
    assert.equal(split.workstationContacts.length,14);
    assert.equal(split.workstationContacts.reduce((n,c)=>n+c.indexCount,0),split.craftShellGeometry.index.count);
    for(const key of ['vertices','indices'])for(const surface of ['walkSurface','groundSurface'])assert.equal(digest(split[surface][key]),digest(full[surface][key]),surface+'/'+key);
    assert.equal(full.geometry.index.count,split.geometry.index.count+split.craftShellGeometry.index.count);
    // Compare complete records, including UV/material attributes, independent of
    // builder vertex indices. Controls/rollers are required to survive exactly.
    const records=g=>{const keys=Object.keys(g.attributes).filter(k=>k!=='aIbdBake').sort();const out=new Map();for(let i=0;i<g.attributes.position.count;i++){
      const r=keys.map(k=>Array.from(g.attributes[k].array.subarray(i*g.attributes[k].itemSize,(i+1)*g.attributes[k].itemSize)).join(',')).join('|');out.set(r,(out.get(r)||0)+1);
    }return out;};
    const expected=records(full.geometry),actual=records(split.geometry);
    for(const [r,n]of records(split.craftShellGeometry))actual.set(r,(actual.get(r)||0)+n);
    assert.deepEqual(actual,expected);
  }finally{full.geometry.dispose();split.geometry.dispose();split.craftShellGeometry.dispose();}
});

test('the full and fallback assets each own 14 matching placed contacts and preserve worksite openings',async t=>{
  await R.init();
  const source=await readWorldCraftGltf(['public/assets/world/ibd/static-craft/static-craft-v1.glb']);
  const asset=createIbdStaticCraft(source.scene,{value:0});
  const prior=buildIbdStatic(), split=buildIbdStatic({separateCraftShells:true});
  const detailedWorld=new R.World({x:0,y:0,z:0}), fallbackWorld=new R.World({x:0,y:0,z:0}), oldWorld=new R.World({x:0,y:0,z:0});
  const scene=new Scene(), root=new Group(), displayMaterial=new MeshBasicMaterial({side:DoubleSide});
  root.name=IBD_WORKSTATION_FIXTURES_ROOT;scene.add(root);
  const fallback=new Mesh(split.craftShellGeometry,displayMaterial);
  fallback.userData.worldCollisionSources=split.workstationContacts.map(({id,firstIndex,indexCount})=>({id,firstIndex,indexCount,collision:'solid'}));
  t.after(()=>{
    prior.geometry.dispose();split.geometry.dispose();split.craftShellGeometry.dispose();displayMaterial.dispose();
    asset.dispose();disposeWorldCraftGltf(source.scene);detailedWorld.free();fallbackWorld.free();oldWorld.free();
  });
  for(const box of prior.solids){
    const shape=R.ColliderDesc.cuboid(...box.size.map(x=>x/2)).setTranslation(...box.at);
    if(box.rotation)shape.setRotation(new Quaternion().setFromEuler(new Euler(...box.rotation)));
    oldWorld.createCollider(shape);
  }
  oldWorld.step();
  const detailedIds=asset.contacts.map(c=>c.id).sort(),fallbackIds=split.workstationContacts.map(c=>c.id).sort();
  assert.deepEqual(detailedIds,fallbackIds);
  for(const [world,render,active] of [[detailedWorld,asset.group,asset.contacts],[fallbackWorld,fallback,split.workstationContacts]]){
    root.clear();root.add(render);
    const draws=[],shapes=[];
    render.traverse(node=>{if(node.isMesh){draws.push(node);node.material.side=DoubleSide;}});
    for(const {id,vertices,indices} of active){
      const shape=new Object3D();shape.name=id;root.add(shape);shapes.push(shape);
      world.createCollider(R.ColliderDesc.trimesh(vertices,indices,R.TriMeshFlags.FIX_INTERNAL_EDGES));
      const count=draws.flatMap(draw=>draw.userData.worldCollisionSources).filter(range=>(range.surfaceId??range.id)===id).reduce((sum,r)=>sum+r.indexCount,0);
      assert.equal(count,indices.length,id);
    }
    world.step();
    const audit=collisionInventory(scene,draws,shapes,[root.name]);
    assert.deepEqual(audit.errors,[]);assert.equal(audit.registrations[root.name],14);
    assert.ok(collisionInventory(scene,draws,shapes.slice(1),[root.name]).errors.length);
    const capsule=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS), pose={x:0,y:0,z:0,w:1};
    for(const [x,z] of [[-3,27.18],[-6,20.18],[10,-9.8],[18,-9.8]]) {
      const front={x,y:.96,z};
      assert.ok(!world.castShape(front,pose,{x:0,y:0,z:-.12},capsule,0,1,false),'standing space in front of '+x);
      assert.ok(world.castShape(front,pose,{x:0,y:0,z:-1.2},capsule,0,1,false),'visual tabletop stops the capsule at '+x);
    }
  }
  const cases=[
    ['inspection deck',[10,1.6,-12],[0,-1,0],1.2],
    ['receiving backstop',[-3,.94,25],[0,0,1],.9],
    ['workbench backstop',[-6,1.24,18],[0,0,1],.9],
    ['scale cap',[7,1.29,-11],[0,0,-1],.7],
    ['working space between supports',[-3,.42,24.7],[0,0,1],2.6],
  ];
  const report=[];
  for(const [name,origin,direction,max] of cases){
    const from=new Vector3(...origin), dir=new Vector3(...direction), ray=new R.Ray(from,dir);
    const old=oldWorld.castRay(ray,max,false)?.timeOfImpact??null;
    const read=(world,render)=>{
      const drawing=new Raycaster(from,dir,0,max).intersectObject(render)[0], result=world.castRay(ray,max,false);
      assert.equal(Boolean(result),Boolean(drawing),name);
      if(result)assert.ok(Math.abs(result.timeOfImpact-drawing.distance)<.00001,`${name}: ${result.timeOfImpact} vs ${drawing.distance}`);
      return result?.timeOfImpact??null;
    };
    const detail=read(detailedWorld,asset.group), legacy=read(fallbackWorld,fallback);
    if(name==='inspection deck')assert.ok(old-detail>.12&&Math.abs(detail-legacy)<.00001);
    else if(name==='working space between supports')assert.deepEqual([old,detail,legacy],[null,null,null]);
    else assert.ok(old===null&&detail!==null&&legacy!==null,name);
    report.push({name,old,detail,legacy});
  }
  t.diagnostic(JSON.stringify(report));
});
test('static equipment QA flag requires explicit opt-in',()=>{
  assert.equal(ibdStaticCraftLegacy('?ibdStatic=legacy'),false);assert.equal(ibdStaticCraftLegacy('?qa=1&ibdStatic=legacy'),true);assert.equal(ibdStaticCraftLegacy('?qa=1'),false);
});
test('all 14 placements batch by borrowed physical material and cleanup is idempotent',()=>{
  const source=new Group(),geometry=new BoxGeometry(.5,.5,.5),texture=new Texture(),material=new MeshStandardMaterial({map:texture,roughness:.47,metalness:.76});
  for(const name of IBD_STATIC_CRAFT_ROOTS){
    const root=new Group();root.name=name;source.add(root);
    if(name==='InspectionBench')root.add(new Mesh(geometry,material));
    else for(const variant of name==='UtilityBench'?['Receiving','Tools']:['Standard','Crane']){const child=new Group();child.name=variant;child.add(new Mesh(geometry,material));root.add(child);}
  }
  const before=digest(geometry.attributes.position.array),data=createIbdStaticCraft(source,{value:0});
  assert.equal(data.group.children.length,1);const batch=data.group.children[0];assert.equal(batch.geometry.index.count,geometry.index.count*14);
  const bounds=new Box3().setFromObject(data.group);assert.equal(bounds.min.x,-8.25);assert.equal(bounds.max.x,21.25);assert.equal(bounds.min.z,-12.25);assert.equal(bounds.max.z,26.25);
  assert.equal(batch.material.map,texture);assert.equal(batch.material.roughness,.47);assert.equal(batch.material.metalness,.76);assert.equal(digest(geometry.attributes.position.array),before);
  let own=0,borrowed=0;batch.geometry.addEventListener('dispose',()=>own++);for(const value of [geometry,material,texture])value.addEventListener('dispose',()=>borrowed++);
  data.dispose();data.dispose();assert.equal(own,1);assert.equal(borrowed,0);geometry.dispose();material.dispose();texture.dispose();
});
test('actual portable three-family pack preserves original inspection/utility/control envelopes and owns batching resources',async t=>{
  const gltf=await readWorldCraftGltf(['public/assets/world/ibd/static-craft/static-craft-v1.glb']);
  if(!gltf){t.skip('pack pending authorized Blender slot');return;}
  let crafted;
  try{
    assert.deepEqual(gltf.scene.children.map(x=>x.name).sort(),[...IBD_STATIC_CRAFT_ROOTS].sort());
    const roots=Object.fromEntries(gltf.scene.children.map(root=>[root.name,root]));
    for(const [name,width,depth,top]of [['InspectionBench',3.6,3.2,1]]){
      const b=new Box3().setFromObject(roots[name]);assert.ok(b.min.x>=-width/2-.002&&b.max.x<=width/2+.002);assert.ok(b.min.z>=-depth/2-.002&&b.max.z<=depth/2+.002);assert.ok(Math.abs(b.max.y-top)<.002);
    }
    roots.InspectionBench.updateMatrixWorld(true);
    for(const x of [-1.3,0,1.3])for(const z of [-1.2,0,1.2]){const hit=new Raycaster(new Vector3(x,2,z),new Vector3(0,-1,0)).intersectObject(roots.InspectionBench,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-1)<.002);}
    for(const [name,top]of [['Receiving',.88],['Tools',1.18]]){
      const variant=roots.UtilityBench.getObjectByName(name);assert.ok(variant);variant.updateMatrixWorld(true);
      const hit=new Raycaster(new Vector3(0,2,0),new Vector3(0,-1,0)).intersectObject(variant,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-top)<.002);
      const b=new Box3().setFromObject(variant);assert.ok(b.min.x>=-1.102&&b.max.x<=1.102);assert.ok(b.min.z>=-.602&&b.max.z<=.602);
    }
    for(const [name,top]of [['Standard',1.33],['Crane',.93]]){const root=roots.ControlPedestal.getObjectByName(name);assert.ok(root);const b=new Box3().setFromObject(root);assert.ok(Math.abs(b.max.y-top)<.002);assert.ok(b.min.x>=-.502&&b.max.x<=.502&&b.min.z>=-.452&&b.max.z<=.452);}
    const sources=[];gltf.scene.traverse(o=>{if(o.isMesh)sources.push(o);});
    const timber=sources.find(o=>o.material.name==='IBD static | wood')?.material;assert.ok(timber?.map);assert.equal(timber.color.getHex(),0xffffff,'the photographed base color must not be double tinted');assert.equal(timber.metalness,0);
    crafted=createIbdStaticCraft(gltf.scene,{value:0});assert.ok(crafted.group.children.length<=6,'one runtime batch for each shared physical material');
    for(const mesh of crafted.group.children){assert.ok(!sources.some(s=>s.geometry===mesh.geometry||s.material===mesh.material));assert.ok(mesh.geometry.getAttribute('aIbdBake'));for(const k of ['position','normal','uv'])assert.ok(mesh.geometry.getAttribute(k));}
    const first=sources[0],geometry=first.geometry,material=first.material;let disposed=false;geometry.addEventListener('dispose',()=>disposed=true);
    let ownDisposals=0;crafted.group.children[0].geometry.addEventListener('dispose',()=>ownDisposals++);
    crafted.dispose();crafted.dispose();crafted=null;assert.equal(ownDisposals,1);assert.equal(disposed,false);assert.equal(first.material,material);
  }finally{crafted?.dispose();disposeWorldCraftGltf(gltf.scene);}
});
