import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { act,createElement as h } from 'react';
import * as THREE from 'three';
import { shippingAlphaTerrain } from '../../../../tools/world/alpha-mine-tests/shipping-alpha-terrain.mjs';
import { compileWorldComponent } from '../../../../tools/world/alpha-mine-tests/component-host.mjs';
import R from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS,PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import { createAlphaPathFence } from './alpha-path-fence.ts';
import * as art from './alpha-art.ts';
import * as layout from './alpha-layout.ts';
import * as terrain from './alpha-terrain.ts';
import * as rocks from './alpha-rocks.ts';
import * as materials from './alpha-materials.ts';
import * as placement from './alpha-trail-placement.ts';
import * as cairns from './alpha-summit-cairns.ts';
import * as ownedVisual from '../useOwnedWorldVisual.ts';
import * as structures from './alpha-station-structures.ts';
import * as nature from './alpha-nature.ts';
import * as lodgeLayout from './alpha-lodge-layout.ts';
import * as boarding from './alpha-boarding-mask.ts';
import * as batch2 from './alpha-batch2-layout.ts';
import * as staticSurfaces from '../static-surface-asset.ts';
import { surveyStationStructures } from '../../../../tools/world/alpha-mine-tests/station-structure-survey.mjs';
import { collisionInventory } from '../world-collision-inventory.ts';

const fiber=createRequire(import.meta.url)('@react-three/fiber');
fiber.extend(THREE);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const round=n=>+n.toFixed(6);
const load=compileWorldComponent(new URL('./AlphaScenery.tsx',import.meta.url));


async function mount(){
 const motion={time:0,bellAt:-100},empty=()=>null;
 const canvas=()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})});
 const rapier={RigidBody:({children,position,name,userData})=>h('group',{position,name,userData},children),CuboidCollider:()=>null,
  TrimeshCollider:({args,name})=>h('group',{name,userData:{colliderArgs:args}}),ConvexHullCollider:({args,name})=>h('group',{name,userData:{convexArgs:args}}),
  RoundCuboidCollider:({args,name,position,quaternion})=>h('group',{name,position,quaternion,userData:{roundBox:args}})};
 const Station=compileWorldComponent(new URL('./AlphaStationStructure.tsx',import.meta.url))({
  '@react-three/rapier':rapier,'./alpha-station-structures':structures,'./alpha-layout':layout,'./alpha-materials':materials,'../useOwnedWorldVisual':ownedVisual,
 }).default;
 const Nature=compileWorldComponent(new URL('./AlphaNature.tsx',import.meta.url))({
  '@react-three/rapier':rapier,'./alpha-nature':nature,'./alpha-terrain':terrain,'./alpha-layout':layout,
  './alpha-boarding-mask':boarding,'./alpha-materials':materials,'./alpha-batch2-layout':batch2,'./alpha-lodge-layout':lodgeLayout,
 }).default;
 const Fence=compileWorldComponent(new URL('./AlphaPathFence.tsx',import.meta.url))({
  '@react-three/rapier':rapier,'./alpha-path-fence':{createAlphaPathFence},'./alpha-materials':materials,'../useOwnedWorldVisual':ownedVisual,
 }).default;
 const Component=load({
  './alpha-sand-route':await import('./alpha-sand-route.ts'),
  './alpha-art':art,'./alpha-layout':layout,'./alpha-terrain':terrain,'./alpha-rocks':rocks,
  './alpha-station-structures':structures,'../static-surface-asset':staticSurfaces,
  './alpha-materials':materials,'./alpha-trail-placement':placement,
  './alpha-summit-cairns':cairns,'../useOwnedWorldVisual':ownedVisual,
  './AlphaGrammarTree':empty,'./AlphaVisitorWayfinding':empty,'./AlphaPathFence':Fence,'./AlphaStationStructure':Station,
  './alpha-state':{alphaMotion:motion,useAlphaStore:{getState:()=>({wind:0})}},
  '@react-three/rapier':rapier,
 },{createElement:canvas}).default;
 const root=fiber.createRoot({}),camera=new THREE.PerspectiveCamera();
 await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},capabilities:{getMaxAnisotropy:()=>4}},camera,frameloop:'never',dpr:1,size:{width:320,height:200,top:0,left:0}});
 let store;
 camera.position.set(172.8,5.25,156.9);camera.lookAt(171,4.35,152.8);camera.updateMatrixWorld();
 await act(async()=>{store=root.render(h('group',{position:layout.ALPHA_ORIGIN},h(Component),h(Nature)));});
 const scene=store.getState().scene;scene.updateMatrixWorld(true);
 return {scene,motion,camera,advance:async time=>act(async()=>{motion.time=time;store.getState().advance(time,false);}),dispose:async()=>act(async()=>root.unmount())};
}

test('shipping Alpha trail fixtures meet their terrain, collision and clearance contracts',async t=>{
 await R.init();
 const ground=shippingAlphaTerrain(),mounted=await mount(),{scene,motion}=mounted;
 try{
  await t.test('mounted trail structures account for the collider of every blocking range',()=>{
   const colliders=[];
   scene.traverse(node=>{if(node.userData.colliderArgs||node.userData.roundBox)colliders.push(node);});
   const report=collisionInventory(scene,[],colliders,['alpha-dock-lodge','alpha-lantern-rack','alpha-path-fence']);
   assert.deepEqual(report.errors,[]);
   assert.equal(report.registrations['alpha-dock-lodge']+report.registrations['alpha-lantern-rack'],247);
   assert.ok(report.registrations['alpha-path-fence']>0);
  });
  await t.test('every mountainside boulder matches its rendered triangles and the fixed hull on the path',child=>{
   const field=scene.getObjectByName('alpha-supported-boulder-field'),mesh=field.getObjectByProperty('isMesh',true);
   const nodes=[];field.traverse(n=>{if(n.userData.convexArgs)nodes.push(n);});
   const report=collisionInventory(scene,[mesh],nodes,['alpha-supported-boulder-field']);
   assert.deepEqual(report.errors,[]);assert.equal(report.registrations[field.name],32);
   const position=mesh.geometry.attributes.position,point=new THREE.Vector3();
   const world=new R.World({x:0,y:0,z:0});let maximum=0,checked=0;
   try {
    for(const range of mesh.userData.worldCollisionSources) {
     const args=nodes.find(n=>n.name===range.id).userData.convexArgs;
     assert.deepEqual(args[0],position.array.subarray(3*range.firstVertex,3*(range.firstVertex+range.vertexCount)));
     const collider=world.createCollider(R.ColliderDesc.convexHull(args[0]));
     for(let i=range.firstVertex;i<range.firstVertex+range.vertexCount;i+=3){
      point.fromBufferAttribute(position,i).add(new THREE.Vector3().fromBufferAttribute(position,i+1))
       .add(new THREE.Vector3().fromBufferAttribute(position,i+2)).divideScalar(3);
      const contact=collider.projectPoint(point,false).point;
      maximum=Math.max(maximum,point.distanceTo(contact));checked++;
     }
    }
    assert.ok(maximum<.012,'rendered rock surface to Rapier hull '+maximum);
    child.diagnostic(JSON.stringify({boulders:nodes.length,triangleCenters:checked,maxHullError:maximum}));
   } finally {world.free();}
  });
  await t.test('pine contact tracks individual bark instances across LOD and leaves empty space beside trunks',async child=>{
   const forest=scene.getObjectByName('alpha-crafted-alpine-forest');
   const nodes=[];forest.traverse(n=>{if(n.userData.colliderArgs)nodes.push(n);});
   const near=forest.children.filter(n=>n.name.endsWith('near-bark'));
   const total=near.reduce((n,mesh)=>n+mesh.userData.worldCollisionInstances.placements.length,0);
   assert.ok(total>0);assert.equal(nodes.length,total);
   const world=new R.World({x:0,y:0,z:0}),raycaster=new THREE.Raycaster(),direction=new THREE.Vector3(1,0,0);
   let probes=0,maxError=0,maxProxyError=0,upperMisses=0;const contacts=[];
   try {
    for(const mesh of near)for(const placement of mesh.userData.worldCollisionInstances.placements){
     const node=nodes.find(n=>n.name===placement.id),[vertices,indices]=node.userData.colliderArgs;
     const model=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
     model.matrixAutoUpdate=false;model.matrixWorld.copy(placement.matrix);
     const physical=world.createCollider(R.ColliderDesc.trimesh(vertices,indices));
     const pos=new THREE.Vector3().setFromMatrixPosition(placement.matrix);
     for(const localHeight of [.95,3.6]){
      const target=new THREE.Vector3(0,localHeight,0).applyMatrix4(placement.matrix);
      const from=target.clone().addScaledVector(direction,-3.5);
      raycaster.set(from,direction);const visible=raycaster.intersectObject(model,false)[0];
      assert.ok(visible,placement.id+' lacks a bark silhouette across its central trunk');
      const ray=new R.Ray(from,direction),t=physical.castRay(ray,7,false);
      assert.ok(t>=0 && t<=7);maxError=Math.max(maxError,Math.abs(visible.distance-t));probes++;
      if(localHeight===.95) {
       maxProxyError=Math.max(maxProxyError,Math.abs(visible.distance-(pos.x-.22-from.x)));
       contacts.push({id:placement.id,x:pos.x,z:pos.z,rayAboveGround:localHeight});
      } else if(target.y>pos.y+3.015)upperMisses++;
     }
     model.material.dispose();
    }
    assert.ok(maxError<.001);assert.ok(maxProxyError>.03);assert.ok(upperMisses>0);
    const witness=near.flatMap(m=>m.userData.worldCollisionInstances.placements)[0];
    const trunk=new THREE.Vector3().setFromMatrixPosition(witness.matrix).add(new THREE.Vector3(...layout.ALPHA_ORIGIN));
    for(const distance of [12,55,12]){
     mounted.camera.position.copy(trunk).add(new THREE.Vector3(0,4,distance));mounted.camera.lookAt(trunk);mounted.camera.updateMatrixWorld();
     await mounted.advance(distance);
     const report=collisionInventory(scene,forest.children,nodes,[forest.name]);
     assert.deepEqual(report.errors,[]);assert.equal(report.registrations[forest.name],total);
     const lod=distance<43?'near-bark':'far-bark';
     assert.ok(forest.children.filter(m=>m.name.endsWith(lod)).some(m=>m.userData.worldCollisionInstances.slots.some(i=>m.userData.worldCollisionInstances.placements[i].id===witness.id)));
    }
    child.diagnostic(JSON.stringify({trees:total,rays:probes,maxSurfaceError:maxError,oldSquareMaxEdgeError:maxProxyError,aboveOldBox:upperMisses,first:contacts[0]}));
   } finally {world.free();}
  });
  await t.test('lodge and lantern rack use the visible structure and leave their controls reachable', child => surveyStationStructures(scene,ground,child));
  await t.test('nearby alpine plants leave the lodge floor and entry ramp clear',async child=>{
   await mounted.advance(.01);
   const lodge=scene.getObjectByName('alpha-dock-lodge'),ramp=scene.getObjectByName('alpha-lodge-access-ramp');
   const floor=lodge.children.find(n=>n.name.endsWith('/lodgeFloor'));
   const range=floor.userData.worldCollisionSources.filter(p=>p.role==='floor'),boards=new THREE.Box3();
   const v=new THREE.Vector3();
   for(const p of range)for(let i=p.firstVertex;i<p.firstVertex+p.vertexCount;i++)
    boards.expandByPoint(v.fromBufferAttribute(floor.geometry.attributes.position,i).applyMatrix4(floor.matrixWorld));
   const floorTop=boards.max.y;
   boards.min.y=floorTop-.002;boards.max.y+=1.5;
   const walkway=new THREE.Box3().setFromObject(ramp),matrix=new THREE.Matrix4();
   const bad=[],counts={};
   for(const name of ['alpha-alpine-shrubs','alpha-path-grass']){
    const plants=scene.getObjectByName(name),verts=plants.geometry.attributes.position;
    assert.equal(plants.userData.worldCollision,'none');
    counts[name]=plants.count;assert.ok(plants.count>0,'nearby outdoor plants must be present');
    for(let i=0;i<plants.count;i++){
     plants.getMatrixAt(i,matrix);matrix.premultiply(plants.matrixWorld);
     for(let j=0;j<verts.count;j++){
      v.fromBufferAttribute(verts,j).applyMatrix4(matrix);
      if(boards.containsPoint(v)||(v.x>=walkway.min.x&&v.x<=walkway.max.x&&v.z>=walkway.min.z&&v.z<=walkway.max.z&&v.y>=walkway.min.y)){
       bad.push({name,root:[matrix.elements[12],matrix.elements[13],matrix.elements[14]],point:v.toArray()});break;
      }
     }
    }
   }
   assert.deepEqual(bad,[],'plants crossing the occupied lodge or ramp: '+JSON.stringify(bad));child.diagnostic(JSON.stringify(counts));
  });
  await t.test('four actual pole rims are embedded and the night-readable boards clear the terrain',async()=>{
   const poles=[];scene.traverse(node=>{if(node.isMesh&&node.geometry.type==='CylinderGeometry'&&node.parent.children.some(child=>child.isMesh&&child.material.map?.isCanvasTexture))poles.push(node);});
   assert.equal(poles.length,4);
   const evidence=[];
   for(const [i,pole]of poles.entries()){
    const pos=pole.geometry.attributes.position;pole.geometry.computeBoundingBox();
    let maxGap=-Infinity,minGap=Infinity,checks=0;
    for(let k=0;k<pos.count;k++){
     const point=new THREE.Vector3().fromBufferAttribute(pos,k);
     if(point.y>pole.geometry.boundingBox.min.y+1e-5)continue;
     point.applyMatrix4(pole.matrixWorld);const gap=point.y-ground.height(point.x,point.z);
     maxGap=Math.max(maxGap,gap);minGap=Math.min(minGap,gap);checks++;
    }
    assert.ok(checks>8);assert.ok(maxGap<=-.0249,`sign ${i} pole rim floats: ${maxGap}`);assert.ok(minGap>-.12,`sign ${i} excessively buried: ${minGap}`);
    const board=pole.parent.children.find(child=>child.isMesh&&child.material.map?.isCanvasTexture);
    assert.ok(board.material.emissiveMap?.isCanvasTexture,'lettering retains its separate night texture');
    let boardClearance=Infinity;
    for(let k=0;k<board.geometry.attributes.position.count;k++){
     const point=new THREE.Vector3().fromBufferAttribute(board.geometry.attributes.position,k).applyMatrix4(board.matrixWorld);
     boardClearance=Math.min(boardClearance,point.y-ground.height(point.x,point.z));
    }
    assert.ok(boardClearance>.3,`sign ${i} board buried: ${boardClearance}`);
    evidence.push({sign:i,maxRimGap:round(maxGap),minRimGap:round(minGap),boardClearance:round(boardClearance)});
   }
   const nightBefore=materials.alphaMaterialUniforms.night.value;
   try{
    materials.alphaMaterialUniforms.night.value=1;await mounted.advance(0);
    for(const pole of poles){const board=pole.parent.children.find(child=>child.isMesh&&child.material.map?.isCanvasTexture);assert.ok(board.material.emissiveIntensity>.4,'night text illumination must update');}
   }finally{materials.alphaMaterialUniforms.night.value=nightBefore;}
   t.diagnostic(JSON.stringify({signs:evidence}));
  });

  await t.test('nine actual stone lower bevels stay buried and instance lights remain aligned through the bell sequence',async()=>{
   const lamps=scene.getObjectByName('alpha-timber-trail-lamps'),lights=scene.getObjectByName('alpha-trail-lamp-sequence');
   assert.ok(lamps&&lights?.isInstancedMesh);assert.equal(lights.count,9);
   const stone=lamps.children.find(mesh=>mesh.material.name==='alpha-stone-v1');assert.ok(stone);
   const position=stone.geometry.attributes.position,index=stone.geometry.index;
   const vertices=Array.from({length:position.count},(_,k)=>new THREE.Vector3().fromBufferAttribute(position,k).applyMatrix4(stone.matrixWorld));
   const matrix=new THREE.Matrix4(),evidence=[];
   for(let i=0;i<lights.count;i++){
    lights.getMatrixAt(i,matrix);matrix.premultiply(lights.matrixWorld);
    const center=new THREE.Vector3().setFromMatrixPosition(matrix),scale=new THREE.Vector3().setFromMatrixScale(matrix);
    const height=ground.height(center.x,center.z);
    assert.ok(Math.abs(center.y-height-1.5)<1e-5,'light must remain on its post');
    assert.ok(scale.distanceTo(new THREE.Vector3(.25,.28,.25))<1e-6,'light volume changed');
    const inside=p=>Math.abs(p.x-center.x)<.191&&Math.abs(p.z-center.z)<.191;
    const foot=vertices.filter(inside);assert.ok(foot.length>0);
    const bottom=Math.min(...foot.map(p=>p.y)),top=Math.max(...foot.map(p=>p.y));
    assert.ok(Math.abs(top-height-.24)<1e-5,'stone top must meet the post');
    let gap=-Infinity,checks=0;
    for(let k=0;k<(index?.count??vertices.length);k+=3){
     const a=vertices[index?index.getX(k):k],b=vertices[index?index.getX(k+1):k+1],c=vertices[index?index.getX(k+2):k+2];
     if(![a,b,c].every(inside))continue;
     for(let u=0;u<=3;u++)for(let v=0;v<=3-u;v++){
      const point=a.clone().multiplyScalar(1-(u+v)/3).addScaledVector(b,u/3).addScaledVector(c,v/3);
      if(point.y<=bottom+.04001){gap=Math.max(gap,point.y-ground.height(point.x,point.z));checks++;}
     }
    }
    assert.ok(checks>=100);assert.ok(gap<=-.0099,`lamp ${i} lower bevel exposed: ${gap}`);
    for(const finish of ['wood','roof']){
     const mesh=lamps.children.find(node=>node.material.name===`alpha-${finish}-v1`);assert.ok(mesh);
     const nearby=[];for(let k=0;k<mesh.geometry.attributes.position.count;k++){
      const p=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,k).applyMatrix4(mesh.matrixWorld);
      if(Math.abs(p.x-center.x)<.21&&Math.abs(p.z-center.z)<.21)nearby.push(p.y);
     }
     assert.ok(nearby.length>0,`lamp ${i} ${finish} missing`);
     if(finish==='wood')assert.ok(Math.abs(Math.max(...nearby)-center.y)<1e-5,'post top must meet the glowing volume');
     else assert.ok(Math.abs((Math.min(...nearby)+Math.max(...nearby))/2-center.y-.18)<1e-5,'roof must cover the glowing volume');
    }
    evidence.push({lamp:i,maxLowerBevelGap:round(gap),checks,lightHeight:round(center.y-height)});
   }
   assert.equal(lights.material.emissiveIntensity,.5);
   const initialMatrices=lights.instanceMatrix.array.slice(),dark=new THREE.Color('#5a5544'),lit=new THREE.Color('#ffd893'),color=new THREE.Color();
   motion.bellAt=0;
   for(const [time,count]of [[.1,1],[.4,2],[2.1,9],[28.1,0]]){
    await mounted.advance(time);
    for(let i=0;i<lights.count;i++){
     lights.getColorAt(i,color);const expected=i<count?lit:dark;
     assert.ok(Math.hypot(color.r-expected.r,color.g-expected.g,color.b-expected.b)<1e-6,`lamp ${i} color at ${time}`);
    }
    assert.deepEqual(lights.instanceMatrix.array,initialMatrices,'bell animation must not move the glowing volumes');
   }
   t.diagnostic(JSON.stringify({lamps:evidence,bellSequenceLitCounts:[1,2,9,0]}));
  });

  await t.test('every guard span stops a walking capsule and admits a ray through the opening', () => {
   const fence=scene.getObjectByName('alpha-path-fence');
   assert.ok(fence?.userData.solid);
   const world=new R.World({x:0,y:-9.81,z:0});
   try{
    const meshes=[];
    fence.traverse(node=>{if(node.isMesh)meshes.push(node);});
    assert.equal(meshes.length,3);
    for(const mesh of meshes){
     assert.equal(mesh.userData.worldCollision,'solid');
     const collider=mesh.parent.children.find(node=>node.userData.colliderArgs);
     assert.ok(collider,mesh.name+' has no physics');
     assert.deepEqual(collider.matrixWorld.toArray(),mesh.matrixWorld.toArray());
     const [positions,indices]=collider.userData.colliderArgs;
     assert.equal(positions,mesh.geometry.attributes.position.array);
     assert.equal(indices.length,mesh.geometry.attributes.position.count);
     for(const [i,index] of indices.entries())assert.equal(index,i);
     const at=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
     collider.matrixWorld.decompose(at,q,scale);
     assert.deepEqual(scale.toArray(),[1,1,1]);
     world.createCollider(R.ColliderDesc.trimesh(positions,indices).setTranslation(at.x,at.y,at.z).setRotation(q));
    }
    world.step();
    const {spans,parts}=createAlphaPathFence();
    parts.forEach(p=>p.geometry.dispose());
    assert.ok(spans.length>0);
    let checkedFeet=0;
    for(const {a,b} of spans){
     const start=new THREE.Vector3(...layout.alphaWorld(a)),end=new THREE.Vector3(...layout.alphaWorld(b));
     const mid=start.clone().lerp(end,.5);
     const d=end.clone().sub(start),across=new THREE.Vector3(-d.z,0,d.x).normalize();
     const origin=mid.clone().addScaledVector(across,-1);
     const hitAt=height=>world.castRay(new R.Ray({...origin,y:mid.y+height},across),2,true);
     assert.ok(hitAt(.94),'upper rail');assert.ok(hitAt(.48),'lower rope');assert.equal(hitAt(.71),null,'opening');
     assert.ok(world.castShape({...origin,y:mid.y+PLAYER_CENTER_HEIGHT},{x:0,y:0,z:0,w:1},
       across,new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),.004,2,false),'player must stay behind guard');
     for(const p of [start,end]){
      const wood=meshes.find(m=>m.name.endsWith('/wood'));
      const pos=wood.geometry.attributes.position,ring=[];
      for(let i=0;i<pos.count;i++){
       const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(wood.matrixWorld);
       if(Math.hypot(v.x-p.x,v.z-p.z)<.097 && v.y<p.y)ring.push(v);
      }
      assert.ok(ring.length>=12,'post bottom missing');
      for(const v of ring)assert.ok(v.y<=ground.height(v.x,v.z)+.0002,'floating post foot');
      checkedFeet++;
     }
    }
    t.diagnostic(JSON.stringify({guardSpans:spans.length,checkedFeet}));
   }finally{world.free();}
  });

  await t.test('the base of every summit cairn meets the terrain and each upper stone rests on the visible facet below',()=>{
   const stones=scene.getObjectByName('alpha-summit-decorative-cairn-instances');
   assert.ok(stones?.isInstancedMesh);assert.equal(stones.userData.worldCollision,'none');
   const prior=new THREE.Mesh(stones.geometry,stones.material),matrix=new THREE.Matrix4();
   const position=new THREE.Vector3(),last=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
   const ray=new THREE.Raycaster();
   let baseCount=0,stackedCount=0,maxGap=-Infinity,minGap=Infinity;
   for(let i=0;i<stones.count;i++){
    stones.getMatrixAt(i,matrix);matrix.premultiply(stones.matrixWorld);
    position.setFromMatrixPosition(matrix);
    const bottom=new THREE.Vector3(0,-1,0).applyMatrix4(matrix);
    let support;
    if(i===0||Math.hypot(last.x-position.x,last.z-position.z)>1){
     support=ground.height(bottom.x,bottom.z);baseCount++;
    }else{
     ray.set(new THREE.Vector3(bottom.x,position.y+1,bottom.z),down);
     const hit=ray.intersectObject(prior,false)[0];
     assert.ok(hit,'stone '+i+' has no supporting facet');support=hit.point.y;stackedCount++;
    }
    const gap=bottom.y-support;
    assert.ok(gap<=.0001&&gap>=-.025,'stone '+i+' vertical separation '+gap);
    minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);
    last.copy(position);prior.matrixWorld.copy(matrix);
   }
   assert.ok(baseCount>0 && stackedCount>baseCount);
   t.diagnostic(JSON.stringify({baseCount,stackedCount,minGap:round(minGap),maxGap:round(maxGap)}));
  });
 }finally{await mounted.dispose();ground.dispose();}
});
