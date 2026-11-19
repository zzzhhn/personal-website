import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide,Euler,Group,Mesh,MeshBasicMaterial,Object3D,Quaternion,Raycaster,Scene,Vector3 } from 'three';
import { buildIbdStatic,IBD_STATIC_YARD_CONTACT_ROOT } from './ibd-yard-geometry.ts';
import { ibdCraftOptions } from './ibd-craft-options.ts';
import { IBD_BOUNDARY_SEGMENTS,IBD_YARD } from './attraction-layout.ts';
import { collisionInventory } from '../world-collision-inventory.ts';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from '../actor-physics.ts';

await R.init();
const previous=buildIbdStatic({separateCraftShells:true,separateTruck:true,...ibdCraftOptions(null)});
const installed=buildIbdStatic({completeSiteContacts:true,...ibdCraftOptions(null)});
const material=new MeshBasicMaterial({side:DoubleSide}),rendered=new Mesh(installed.geometry,material);
test.after(()=>{
  material.dispose();
  for(const data of [previous,installed]){
    data.geometry.dispose();data.craftShellGeometry.dispose();data.truckGeometry.dispose();
  }
});

function stage(data){
  const world=new R.World({x:0,y:0,z:0}), shapes=new Map();
  for(const { id,vertices,indices } of data.contactSurfaces){
    const c=world.createCollider(R.ColliderDesc.trimesh(vertices,indices,R.TriMeshFlags.FIX_INTERNAL_EDGES));
    shapes.set(c.handle,id);
  }
  for(const s of data.solids){
    const c=R.ColliderDesc.cuboid(...s.size.map(n=>n/2)).setTranslation(...s.at);
    if(s.rotation)c.setRotation(new Quaternion().setFromEuler(new Euler(...s.rotation)));
    world.createCollider(c);
  }
  world.step();
  return {world,shapes};
}

test('all draw ranges of the full static yard have an actual matching solid or a sourced ground detail',t=>{
  const scene=new Scene(),root=new Group();root.name=IBD_STATIC_YARD_CONTACT_ROOT;scene.add(root);root.add(rendered);
  rendered.userData.worldCollisionSources=installed.collisionSources;
  const handles=installed.contactSurfaces.map(c=>{const n=new Object3D();n.name=c.id;root.add(n);return n;});
  const result=collisionInventory(scene,[rendered],handles,[root.name]);
  assert.equal(result.registrations[root.name],74);
  assert.deepEqual(result.errors,[]);
  assert.ok(collisionInventory(scene,[rendered],handles.slice(1),[root.name]).errors.length);
  assert.equal(installed.solids.length,0);
  assert.equal(previous.solids.length,153);
  assert.deepEqual(installed.geometry.index.array,previous.geometry.index.array);
  for(const attribute of Object.keys(installed.geometry.attributes))
    assert.deepEqual(installed.geometry.attributes[attribute].array,previous.geometry.attributes[attribute].array,attribute);
  const drawn=installed.geometry.index.count/3, contacts=installed.contactSurfaces.reduce((n,s)=>n+s.indexCount/3,0);
  assert.deepEqual(installed.collisionSources.filter(s=>s.collision==='soft').map(s=>s.id),[
    'soakaway-leaves','forecourt-planter-leaves-west','forecourt-planter-leaves-east',
  ]);
  t.diagnostic(JSON.stringify({oldBoxes:previous.solids.length,registrations:result.registrations[root.name],drawn,contacts}));
});

test('the visible fence diagonal, gallery post, entry panel and planter lip have physical contact',t=>{
  const before=stage(previous),after=stage(installed),raycaster=new Raycaster(), report=[];
  const {a,b:end}=IBD_BOUNDARY_SEGMENTS[0];
  const edge=new Vector3(end[0]-a[0],0,end[1]-a[1]).normalize(),across=new Vector3(-edge.z,0,edge.x);
  const diagonal=new Vector3(a[0]+(end[0]-a[0])/4-IBD_YARD.center[0],1.225,a[1]+(end[1]-a[1])/4-IBD_YARD.center[2]);
  try{
    for(const [id,origin,direction,distance] of [
      ['ibd-perimeter-fence-1',diagonal.clone().addScaledVector(across,-.45),across,.9],
      ['ibd-gallery-ramp-rails-and-posts',new Vector3(-21.8,2.95,-4.35),new Vector3(-1,0,0),.9],
      ['ibd-entry-sign-posts-and-panel',new Vector3(0,3.6,29),new Vector3(0,0,-1),1.3],
      ['ibd-forecourt-planter-west',new Vector3(-24,1,28.8),new Vector3(0,0,-1),1.05],
      ['ibd-control-hardware-scale-a',new Vector3(7,1.6,-10.9),new Vector3(0,0,-1),1.3],
    ]){
      raycaster.set(origin,direction);raycaster.far=distance;
      const {firstIndex,indexCount}=installed.collisionSources.find(r=>r.id===id);
      const seen=raycaster.intersectObject(rendered).find(h=>h.faceIndex*3>=firstIndex&&h.faceIndex*3<firstIndex+indexCount);
      const ray=new R.Ray(origin,direction), hit=after.world.castRay(ray,distance,false,undefined,undefined,undefined,undefined,c=>after.shapes.get(c.handle)===id);
      const prior=before.world.castRay(ray,distance,false);
      assert.ok(seen&&hit,`${id} requires actual draw and contact`);
      assert.ok(Math.abs(seen.distance-hit.timeOfImpact)<.00002,id);
      assert.equal(Boolean(prior),false,id+' old physical gap');
      report.push({id,old:prior?.timeOfImpact??null,new:hit.timeOfImpact});
    }
  }finally{before.world.free();after.world.free();}
  t.diagnostic(JSON.stringify(report));
});

test('real capsule still crosses the pedestrian entrance, drain setback and loading walkways',t=>{
  const after=stage(installed), shape=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS), q={x:0,y:0,z:0,w:1};
  try{
    for(const [x,y,z,dx,dz] of [[0,.98,32,0,-5],[25.4,.98,-2.7,7.2,0],[1,.98,12.12,4,0],[8,.99,0,12,0],[8,.99,4,12,0],[-24,4.98,-12.4,0,-2.2],[-12,4.98,-14.75,5,0]]){
      const hit=after.world.castShape({x,y,z},q,{x:dx,y:0,z:dz},shape,0,1,true);
      assert.ok(!hit,JSON.stringify({x,y,z,contact:after.shapes.get(hit?.collider.handle),time:hit?.time_of_impact}));
    }
    const oldDirect=after.world.castShape({x:-12,y:4.98,z:-14.1},q,{x:5,y:0,z:0},shape,0,1,true);
    assert.equal(after.shapes.get(oldDirect?.collider.handle),'ibd-gallery-observation-scopes');
  }finally{after.world.free();}
});
