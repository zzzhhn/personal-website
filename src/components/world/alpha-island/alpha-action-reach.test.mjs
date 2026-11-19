/** CPU checks against the shipping terrain and the G24 joint hierarchy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { act, createElement as h, Suspense } from 'react';
import R from '@dimforge/rapier3d-compat';
import { Bone,Group,Matrix4,Mesh,MeshStandardMaterial,Object3D,PerspectiveCamera,Vector3 } from 'three';
import { GuideCampLayer } from '../WorldGuideCamp.ts';
import { PLAYER_RADIUS,PLAYER_HALF_HEIGHT } from '../actor-physics.ts';
import { findPickupStand, pickupGroundRoute } from '../pickup-approach.ts';
import { alphaWorld,ALPHA_ORIGIN,ALPHA_WIND_GATE_Y } from './alpha-layout.ts';
import { shippingAlphaTerrain } from '../../../../tools/world/alpha-mine-tests/shipping-alpha-terrain.mjs';
import { compileWorldComponent } from '../../../../tools/world/alpha-mine-tests/component-host.mjs';
import { alphaActionTarget,alphaActionCanReach,alphaActionLabel,alphaActionNotice,alphaStonePlacementTarget,
  alphaMeasuredHandError,alphaLanternCarryTarget,alphaLanternReleaseInteraction,alphaPickupApproach } from './alpha-action-reach.ts';

import { actorActivities, interactionActor } from '../actor-activities.ts';
import { registerCampActivity } from '../camp-actor-activity.ts';
import { campPropActor, startCampPropInteraction } from '../camp-prop-interactions.ts';
import { alphaStationInteraction } from './alpha-station-interaction.ts';
import { advanceAlphaHand, alphaMotion, cancelAlphaHand, useAlphaStore } from './alpha-state.ts';
import { alphaPersonalStones, ALPHA_CAIRN_STANCE_RADIUS, createPersonalCairnGeometry } from './alpha-personal-cairn.ts';
import * as personalCairn from './alpha-personal-cairn.ts';
import * as alphaState from './alpha-state.ts';
import { collisionInventory } from '../world-collision-inventory.ts';
import { handleWorldEscape, useWorldStore } from '../store.ts';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual.ts';

const centreHeight=PLAYER_RADIUS+PLAYER_HALF_HEIGHT;
let guideSource;
function rig(){
  if(!guideSource){const data=readFileSync(new URL('../../../../public/assets/world/guide/G24.glb',import.meta.url));guideSource=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());}
  const gltf=guideSource,joints=new Set(gltf.skins.flatMap(s=>s.joints));
  const nodes=gltf.nodes.map((n,i)=>{const o=joints.has(i)?new Bone():new Group();o.name=n.name??'';
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
    if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);return o;});
  gltf.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));const scene=new Group();
  gltf.scenes[gltf.scene??0].nodes.forEach(i=>scene.add(nodes[i]));return scene;
}
function palmPosition(stand,target){
  const scene=rig();scene.position.fromArray(stand);scene.rotation.y=Math.atan2(stand[2]-target[2],target[0]-stand[0]);scene.updateMatrixWorld(true);
  const layer=new GuideCampLayer(scene);let palm;
  for(let i=0;i<15;i++)palm=layer.apply(target,'grip',.05);
  return new Vector3(...palm);
}
const palmAt=(stand,target)=>palmPosition(stand,target).distanceTo(new Vector3(...target));
const ground=shippingAlphaTerrain();
test.after(()=>ground.dispose());
function physicalSupport(x,z) {
  const [wx,,wz]=alphaWorld([x,0,z]);
  return ground.support(wx,wz);
}
function assertFlatStance(x,z,y) {
  for (const [dx,dz] of [[0,0],[PLAYER_RADIUS,0],[-PLAYER_RADIUS,0],[0,PLAYER_RADIUS],[0,-PLAYER_RADIUS]]) {
    const support=physicalSupport(x+dx,z+dz);
    assert.ok(Math.abs(support.height-y)<1e-5 && support.normalY>.9999,'stance footprint at '+[x+dx,z+dz]);
  }
}
const actor=(stand)=>alphaWorld([stand[0],stand[1]+centreHeight,stand[2]]);

test('the summit rack respects a busy camp prop and survives unloading the camp during pickup', t => {
  const position = actor([-8.65,83,41.17]);
  const unregister = registerCampActivity();
  t.after(() => { unregister(); cancelAlphaHand(); actorActivities.sync({available:false,grounded:false}); });
  let starts=0, releases=0;
  const rack=alphaStationInteraction('lantern',0,()=>{starts++;});
  actorActivities.sync({position,yaw:0,grounded:true,available:true});
  startCampPropInteraction({id:'fixture',anchor:position,release:()=>{releases++;}});
  actorActivities.sync({grounded:true});
  assert.equal(rack.enabled(),false);
  rack.onInteract();
  assert.equal(releases,0);
  assert.equal(starts,0);
  unregister();
  actorActivities.sync({grounded:true});
  assert.equal(campPropActor.available,false);
  assert.equal(rack.enabled(),true);
  assert.ok(rack.approach.ready(position));
  rack.onInteract();
  const unload = registerCampActivity();
  actorActivities.sync({position,yaw:0,grounded:true,available:true});
  unload();
  assert.equal(campPropActor.available,false);
  for(let i=0;i<8;i++)advanceAlphaHand(.06,position,interactionActor.available);
  assert.equal(useAlphaStore.getState().carried,true);
  assert.equal(starts,1);
  const hook=[...rack.position];
  alphaMotion.handTarget[0]+=1;
  assert.deepEqual(rack.position,hook);
  cancelAlphaHand();
  actorActivities.sync({available:false});
  rack.onInteract();
  assert.equal(starts,1);
});

test('paper-lantern entrance is capsule-clear, physically supported and reachable by real G24 palm',()=>{
  const stand=[-8.65,83,41.17],target=alphaActionTarget('lantern');assertFlatStance(stand[0],stand[2],83);
  // Existing rack slab front at z=41.575; its leg bases end at z=41.65.
  assert.ok(41.575-stand[2]>PLAYER_RADIUS,'capsule overlaps the preserved rack slab');
  assert.ok(41.65-stand[2]>PLAYER_RADIUS,'capsule overlaps the preserved leg bases');
  assert.equal(alphaActionCanReach('lantern',actor(stand),true),true);
  const error=palmAt(stand,target);assert.ok(error<.06,`paper-lantern contact ${error}`);
  const far=[stand[0],83,target[2]-1.3];
  assert.equal(alphaActionCanReach('lantern',actor(far),true),false);
  assert.ok(palmAt(far,target)>.5,'reproduce old discovery-radius failure');
  console.log(JSON.stringify({lanternStand:stand,palmError:error,contactThreshold:.06}));
});

test('each wind grip has a natural supported stance; labels and feedback describe the actual next effect',()=>{
  const evidence=[];
  for(let wind=0;wind<3;wind++){
    const target=alphaActionTarget('wind',wind),support=physicalSupport(target[0]+.5,target[2]),stand=[target[0]+.5,support.height,target[2]];
    assert.equal(target[1],ALPHA_WIND_GATE_Y+1.05,'contact and visible crank share the gate datum');
    assert.ok(support.normalY>.64,'wind operator requires walkable physical triangles');
    assert.equal(alphaActionCanReach('wind',actor(stand),true,wind),true);
    const error=palmAt(stand,target);assert.ok(error<.06,`wind ${wind}: ${error}`);
    assert.equal(alphaActionCanReach('wind',actor([stand[0]+1,stand[1],stand[2]]),true,wind),false);
    const accepted=[];let maxError=0,minBaseClearance=Infinity;
    for(let ix=0;ix<=6;ix++)for(let iz=0;iz<=6;iz++){
      const dx=.38+ix*.03,dz=-.15+iz*.05,x=target[0]+dx,z=target[2]+dz,surface=physicalSupport(x,z),sample=[x,surface.height,z];
      if(!alphaActionCanReach('wind',actor(sample),true,wind))continue;
      assert.ok(surface.normalY>.64,'offered stance has no walkable ground');
      for(const footX of [15,17]){
        const clearance=Math.hypot(Math.max(0,Math.abs(x-footX)-.3),Math.max(0,Math.abs(z+44)-.325))-PLAYER_RADIUS;
        assert.ok(clearance>.02,'operator clips an extended stone footing');minBaseClearance=Math.min(minBaseClearance,clearance);
      }
      const contactError=palmAt(sample,target);assert.ok(contactError<.06,`wind ${wind} grid ${dx},${dz}: ${contactError}`);
      maxError=Math.max(maxError,contactError);accepted.push({dx,dz});
    }
    assert.ok(accepted.length>=30,'retain a usable area, not one exact stance');
    const dxRange=[Math.min(...accepted.map(p=>p.dx)),Math.max(...accepted.map(p=>p.dx))],dzRange=[Math.min(...accepted.map(p=>p.dz)),Math.max(...accepted.map(p=>p.dz))];
    assert.ok(dxRange[1]-dxRange[0]>=.14&&dzRange[1]-dzRange[0]>=.29,'natural approach area was narrowed too far');
    const oldLabel=alphaActionLabel('wind',wind),newLabel=alphaActionLabel('wind',(wind+1)%3);
    assert.notEqual(oldLabel,newLabel);assert.notEqual(oldLabel.zh,newLabel.zh);
    evidence.push({wind,stand,palmError:error,accepted:accepted.length,maxGridPalmError:maxError,minBaseClearance,dxRange,dzRange,nextNotice:alphaActionNotice('wind',(wind+1)%3)});
  }
  assert.match(alphaActionNotice('wind',2).zh,/路牌/);
  assert.match(alphaActionNotice('wind',1).zh,/旗面/);
  assert.match(alphaActionNotice('wind',0).zh,/平静/);
  console.log(JSON.stringify({wind:evidence}));
});

test('first cairn addition keeps its existing curve and ends at the actual terrain-set grip',()=>{
  const stand=alphaPersonalStones[0].stand;assertFlatStance(stand[0],stand[2],83);
  // Within the existing summit's 3m decorative-cairn exclusion and far from the rack.
  assert.ok(Math.hypot(stand[0]-2,stand[2]-39)<3);
  assert.ok(Math.hypot(stand[0]+8,stand[2]-42)>4);
  let maxError=0;
  for(let i=0;i<=16;i++){
    const f=i/16,target=alphaStonePlacementTarget(0,f);
    assert.ok(Math.abs(target[1]-(83.35+(.099301+.08-.35)*f+Math.sin(Math.PI*f)*.55))<1e-8);
    assert.ok(Math.abs(target[2]-(40+(-.8+.15)*f))<1e-8);
    maxError=Math.max(maxError,palmAt(stand,target));
  }
  assert.ok(maxError<.06,`first stone arc unreachable: ${maxError}`);
  console.log(JSON.stringify({firstStoneStand:stand,maxPalmError:maxError,contactThreshold:.06}));
});

test('all 32 stone prefixes sit on shipping summit geometry, clear their G24 stance, and offer a reachable next grip',async t=>{
  await R.init();
  const world=new R.World({x:0,y:-9.81,z:0}),visual=createPersonalCairnGeometry();
  t.after(()=>{world.free();visual.dispose();});
  const vector=([x,y,z])=>({x,y,z});
  const q={x:0,y:0,z:0,w:1},down={x:0,y:-1,z:0};
  const base=[ground.data.surface,ground.data.solid].map(indices=>world.createCollider(R.ColliderDesc.trimesh(ground.data.positions,indices).setTranslation(...ALPHA_ORIGIN)));
  const avatar=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  const playerShape=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),installed=[];
  world.step();
  let minStanceClearance=Infinity,maxPenetration=0,maxHandError=0,maxHeldOverlap=0,maxTop=0,previous=null,direct=0;
  const route=(from,to)=>pickupGroundRoute(world,R,avatar,from,to)?.every(Number.isFinite)===true;
  function outer(stand){
    const aim=[236,83+centreHeight+.002,229.13],dx=stand[0]-aim[0],dz=stand[2]-aim[2],d=Math.hypot(dx,dz);
    return [aim[0]+dx/d*1.55,aim[1],aim[2]+dz/d*1.55];
  }
  const centre=[236,229.13];
  const around=(from,to)=>{
    const origin=outer(from),destination=outer(to);
    if(!route(from,origin)||!route(destination,to))return false;
    const start=Math.atan2(origin[2]-centre[1],origin[0]-centre[0]),end=Math.atan2(destination[2]-centre[1],destination[0]-centre[0]);
    const delta=Math.atan2(Math.sin(end-start),Math.cos(end-start));
    const count=Math.max(1,Math.ceil(Math.abs(delta)/.27));
    let last=origin;
    for(let i=1;i<=count;i++){
      const a=start+delta*i/count,next=[centre[0]+1.55*Math.cos(a),to[1],centre[1]+1.55*Math.sin(a)];
      if(!route(last,next))return false;
      last=next;
    }
    return true;
  };
  const evidence=[];
  for(const [i,stone] of alphaPersonalStones.entries()){
    const position=alphaWorld(stone.position),stand=actor(stone.stand);
    stand[1]+=.002;
    assertFlatStance(stone.stand[0],stone.stand[2],stone.stand[1]);
    assert.ok(findPickupStand(world,R,avatar,outer(stand),alphaPickupApproach('stone',0,i)),`stone ${i+1} has a floor-checked ordinary approach`);
    if(previous){
      if(route(previous,stand))direct++;
      else assert.ok(around(previous,stand),`stone ${i+1} can be reached without climbing the existing pile`);
    }
    const rotation={...q,y:Math.sin(stone.yaw/2),w:Math.cos(stone.yaw/2)};
    const desc=R.ColliderDesc.convexHull(visual.hulls[i]);
    const start={...vector(position),y:86};
    const rest=world.castShape(start,rotation,down,desc.shape,0,4,false);
    assert.ok(rest,`stone ${i+1} has an actual horizontal support`);
    const penetration=86-rest.time_of_impact-position[1];
    assert.ok(penetration>=-.0001&&penetration<.0011,`stone ${i+1} has ${penetration}m of support contact`);
    maxPenetration=Math.max(maxPenetration,penetration);
    maxTop=Math.max(maxTop,stone.position[1]+stone.scale[1]-83);
    const footprint=[...installed].map(c=>c.contactShape(playerShape,vector(stand),q,.2)).filter(Boolean);
    const current=desc.shape.contactShape(vector(position),rotation,playerShape,vector(stand),q,.2);
    const clearance=Math.min(...footprint.map(hit=>hit.distance),current?.distance??.2);
    assert.ok(clearance>ALPHA_CAIRN_STANCE_RADIUS,`stone ${i+1} intersects the accepted stance: ${clearance}`);
    minStanceClearance=Math.min(minStanceClearance,clearance);
    let handError=0;
    for(const [ox,oz] of [[0,0],[.039,0],[-.039,0],[0,.039],[0,-.039]]){
      const placedStand=[stone.stand[0]+ox,stone.stand[1],stone.stand[2]+oz];
      for(let sample=0;sample<=16;sample++){
        const target=alphaStonePlacementTarget(i,sample/16),palm=palmPosition(placedStand,target);
        handError=Math.max(handError,palm.distanceTo(new Vector3(...target)));
        if(ox||oz||sample===16)continue;
        const prop=alphaWorld([palm.x,palm.y-stone.gripLift,palm.z]);
        for(const hull of installed){
          const touch=hull.contactShape(desc.shape,vector(prop),rotation,0);
          if(touch)maxHeldOverlap=Math.max(maxHeldOverlap,-touch.distance);
        }
      }
    }
    assert.ok(handError<.06,`stone ${i+1} palm error ${handError}`);
    maxHandError=Math.max(maxHandError,handError);
    const collider=world.createCollider(desc.setRotation(rotation).setTranslation(...position));
    for(const prior of installed){
      const contact=prior.contactShape(desc.shape,vector(position),rotation,0);
      assert.ok(!contact||contact.distance>-.0011,`stone ${i+1} buries part of an earlier stone`);
    }
    installed.push(collider);world.step();previous=stand;
    evidence.push({i:i+1,position,stand,penetration,clearance,handError,support:base.includes(rest.collider)?'summit':1+installed.indexOf(rest.collider)});
  }
  assert.equal(installed.length,32);
  assert.ok(maxHeldOverlap<.01,`a carried stone enters a prior stone by ${maxHeldOverlap} m before the release`);
  assert.ok(maxTop<.65);
  function walk(from,velocity){
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setCcdEnabled(true).lockRotations().setTranslation(...from));
    const collider=world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72),body);
    const touches=new Set();
    for(let frame=0;frame<140;frame++){
      body.setLinvel({x:frame<10?0:velocity[0],y:body.linvel().y,z:frame<10?0:velocity[1]},true);
      world.step();world.contactPairsWith(collider,c=>touches.add(c.handle));
    }
    const end={...body.translation()};world.removeRigidBody(body);
    return {end,ground:base.some(c=>touches.has(c.handle)),pile:installed.some(c=>touches.has(c.handle))};
  }
  const bypass=walk([237.2,83+centreHeight+.002,231.4],[0,-2]);
  const approach=walk([238,83+centreHeight+.002,229.21],[-2,0]);
  assert.ok(bypass.ground&&!bypass.pile&&bypass.end.z<227.2,JSON.stringify(bypass));
  assert.ok(approach.ground&&approach.pile&&approach.end.x>236.9,JSON.stringify(approach));
  t.diagnostic(JSON.stringify({direct,walkAround:31-direct,minStanceClearance,maxPenetration,maxHandError,maxHeldOverlap,maxTop,bypass,approach,evidence}));
});

test('the stone station commits each E acceptance once, preserves all saved counts and cancels an abandoned stone',t=>{
  const saved=useAlphaStore.getState();
  const nativeStorage=globalThis.localStorage,writes=[];
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(key,value)=>writes.push({key,value})}});
  t.after(()=>{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:nativeStorage});
    cancelAlphaHand();useAlphaStore.setState(saved);actorActivities.sync({available:false,grounded:false});
  });
  useAlphaStore.setState({stones:0,action:null,carried:false,visits:[]});
  let primes=0;
  for(const [i,stone] of alphaPersonalStones.entries()){
    const position=actor(stone.stand),stand=[position[0]+.35,position[1],position[2]];
    const station=alphaStationInteraction('stone',0,()=>{primes++;},i);
    actorActivities.sync({position:stand,yaw:0,grounded:true,available:true});
    station.onInteract();assert.equal(useAlphaStore.getState().action,null);
    actorActivities.sync({position,yaw:0,grounded:true,available:true});
    station.onInteract();assert.equal(useAlphaStore.getState().action,'stone');
    if(i===16){
      for(let frame=0;frame<10;frame++)advanceAlphaHand(.06,position,true);
      advanceAlphaHand(.06,stand,true);
      assert.equal(useAlphaStore.getState().action,null);
      assert.equal(useAlphaStore.getState().stones,i);
      assert.equal(JSON.parse(writes.at(-1).value).stones,i);
      station.onInteract();assert.equal(useAlphaStore.getState().action,'stone');
      for(let frame=0;frame<12;frame++)advanceAlphaHand(.06,position,true);
      const paused=useWorldStore.getState().paused;
      handleWorldEscape();
      assert.equal(useWorldStore.getState().paused,paused);
      assert.equal(useAlphaStore.getState().action,null);
      assert.equal(useAlphaStore.getState().stones,i);
      assert.equal(JSON.parse(writes.at(-1).value).stones,i);
      station.onInteract();assert.equal(useAlphaStore.getState().action,'stone');
    }
    station.onInteract();
    for(let frame=0;frame<28;frame++)advanceAlphaHand(.06,position,true);
    assert.equal(useAlphaStore.getState().stones,i+1);
    assert.equal(useAlphaStore.getState().action,null);
    assert.equal(station.enabled(),false,'a stale offer cannot place the next stone');
    assert.equal(JSON.parse(writes.at(-1).value).stones,i+1);
  }
  assert.ok(writes.every(({key})=>key==='alpha-island-progress-v1'));
  assert.equal(alphaStationInteraction('stone',0,()=>{},32).enabled(),false);
  assert.equal(primes,34);
});

test('the rendered cairn loads any saved prefix with stable named Rapier hulls and unmounts cleanly',async()=>{
  const require=createRequire(import.meta.url),fiber=require('@react-three/fiber'),physics=require('@react-three/rapier');
  const wasm=createRequire(require.resolve('@react-three/rapier'))('@dimforge/rapier3d-compat');
  await wasm.init();
  fiber.extend({Group,Mesh,MeshStandardMaterial,Object3D});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const canvas=fiber.createRoot({}),previous=useAlphaStore.getState().stones,rootName='alpha-personal-cairn';
  const renderHost={render(){},setSize(){},setPixelRatio(){},capabilities:{getMaxAnisotropy:()=>4}};
  await canvas.configure({gl:renderHost,camera:new PerspectiveCamera(),frameloop:'never',dpr:1,size:{width:320,height:200,top:0,left:0}});
  const {PlayerCairn}=compileWorldComponent(new URL('AlphaInteractions.tsx',import.meta.url))({
    '@react-three/fiber':fiber,'@react-three/rapier':physics,'./alpha-state':alphaState,'./alpha-personal-cairn':personalCairn,
    '../useOwnedWorldVisual':{useOwnedWorldVisual},'./alpha-sand-route':{},'./alpha-wind-flag-stand':{},'../WorldInteract':{},
    '../store':{},'../actor-activities':{},'../rides/guide-action-hand':{},'./alpha-layout':{},'./alpha-trail':{},'./alpha-materials':{},
    './alpha-art':{},'./alpha-audio':{},'./alpha-lantern-layout':{},'./alpha-action-reach':{},'./alpha-station-interaction':{},'../accepted-action':{},
    './AlphaTumblingSign':{default:()=>null},'./AlphaLantern':{default:()=>null},
  });
  let context,state;
  function WorldReader(){context=physics.useRapier();return null;}
  try{
    useAlphaStore.setState({stones:0});
    await act(async()=>{
      state=canvas.render(h(Suspense,{fallback:null},h(physics.Physics,{paused:true,colliders:false},h(WorldReader),
        h('group',{position:ALPHA_ORIGIN},h(PlayerCairn)))));
    });
    const handles=new Map(),scene=state.getState().scene;
    for(const count of [0,1,2,16,32,0,26]){
      await act(async()=>{useAlphaStore.setState({stones:count});});
      context.step(1/60);
      const nodes=[...context.colliderStates.values()].map(entry=>entry.object);
      assert.equal(nodes.length,count);
      const report=collisionInventory(scene,[],nodes,count?[rootName]:[]);
      assert.deepEqual(report.errors,[]);
      assert.equal(report.mounted.meshes,count);
      assert.equal(report.registrations[rootName],count||undefined);
      if(!count){assert.equal(scene.getObjectByName(rootName),undefined);handles.clear();continue;}
      for(const [handle,{object}] of context.colliderStates){
        const stone=alphaPersonalStones.find(entry=>entry.id===object.name),shape=context.world.getCollider(handle);
        assert.equal(shape.shapeType(),wasm.ShapeType.ConvexPolyhedron);
        assert.equal(shape.parent().isFixed(),true);
        const translation=shape.translation();
        const expected=alphaWorld(stone.position);
        const draw=scene.getObjectByName(stone.id+'-mesh').getWorldPosition(new Vector3());
        assert.ok(draw.distanceTo(new Vector3(...expected))<.00002);
        assert.ok(new Vector3(translation.x,translation.y,translation.z).distanceTo(new Vector3(...expected))<.00002,
          JSON.stringify({name:stone.id,translation,expected,parent:shape.parent().translation()}));
        if(handles.has(stone.id))assert.equal(handle,handles.get(stone.id),'earlier stones preserve their mounted handles');
        handles.set(stone.id,handle);
      }
    }
  }finally{await act(async()=>canvas.unmount());useAlphaStore.setState({stones:previous});}
});

test('carry release uses the live player anchor and preserves ownership and single use without a palm gate',()=>{
  let position=[226.35,83.82,231.17],carried=true,owner='alpha-island',count=0;
  const canRelease=()=>carried&&owner==='alpha-island';
  const item=alphaLanternReleaseInteraction(()=>position,canRelease,()=>{count++;carried=false;});
  const first=item.position;
  position=[250,84,250];
  assert.deepEqual(item.position,position);assert.notEqual(item.position,first);
  assert.deepEqual(first,[226.35,83.82,231.17],'previous anchor is a snapshot');
  for(const invalid of [()=>{owner='alpha-echo-cave';},()=>{owner='alpha-island';carried=false;}]){
    invalid();assert.equal(item.enabled(),false);item.onInteract();assert.equal(count,0);
  }
  carried=true;assert.equal(item.enabled(),true);item.onInteract();assert.equal(count,1);
  item.onInteract();assert.equal(count,1,'one carried lantern releases once');
});

test('unchanged carried-lantern palm target remains reachable while the release anchor moves',()=>{
  const position=[0,centreHeight,0],target=alphaLanternCarryTarget(position,0),scene=rig(),layer=new GuideCampLayer(scene);
  scene.updateMatrixWorld(true);let palm;
  for(let i=0;i<15;i++)palm=layer.apply(target,'grip',.05);
  const error=alphaMeasuredHandError(palm,target,'alpha-island');
  assert.ok(error<.06,`carrying grip cannot settle: ${error}`);
  assert.equal(alphaMeasuredHandError(palm,target,'alpha-echo-cave'),Infinity);
});
