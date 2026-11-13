import dimensions from './transport-dimensions.json' with {type:'json'};
import {TransportDriver} from '../../rides/transport-driver.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import {AnimationMixer,Box3,Group,Quaternion,Vector3} from 'three';
import {alphaFerryRoute,alphaFerryGroundHeight} from './alpha-routes.ts';
import {alphaTerrainData} from '../alpha-terrain.ts';
import {ALPHA_ORIGIN} from '../alpha-layout.ts';
import {alphaMainlandPierStructure,alphaPierDecks} from '../alpha-mainland-pier.ts';
import {transportBoardingGeometry} from '../../rides/transport-boarding.ts';
import {rideFootRouteClear} from '../../rides/ride-clearance.ts';
import {findSafePlayerLanding} from '../../safe-landing.ts';
import {readWorldCraftGltf,disposeWorldCraftGltf} from '../../world-craft-gltf-test.mjs';
import {GuideAttractionFeet} from '../../WorldGuideAttraction.ts';
import {GuideSlopeFit,skinnedWorldPoint} from '../../WorldGuideStop.ts';
import {registerRideGround} from '../../rides/ride-contract.ts';
import {loadGuide} from '../../../../../tools/world/guide/boot-analysis.mjs';
await R.init();

test('ferry boarding, steps, canopy and exact safe exits clear actual boat and pier geometry at both ends',async context=>{
 const route=alphaFerryRoute(),asset=await readWorldCraftGltf(['public/assets/world/alpha-island/transports/ferry.glb']);
 assert.ok(asset);asset.scene.updateMatrixWorld(true);
 const pier=alphaMainlandPierStructure();
 for(const [index,terminal] of route.terminals.entries()){
  const world=new R.World({x:0,y:0,z:0}),labels=new Map();
  const mesh=(geometry,name,matrix)=>{
   const g=geometry.clone();if(matrix)g.applyMatrix4(matrix);
   const p=g.getAttribute('position'),vertices=new Float32Array(p.count*3);
   for(let i=0;i<p.count;i++)vertices.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);
   const indices=g.index?new Uint32Array(g.index.array):Uint32Array.from({length:p.count},(_,i)=>i);
   const c=world.createCollider(R.ColliderDesc.trimesh(vertices,indices));labels.set(c.handle,name);g.dispose();
  };
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),terminal.yaw),root=new Vector3(...terminal.vehicle);
  asset.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld),p=g.getAttribute('position');for(let i=0;i<p.count;i++){const v=new Vector3().fromBufferAttribute(p,i).applyQuaternion(q).add(root);p.setXYZ(i,v.x,v.y,v.z);}mesh(g,o.name);g.dispose();});
  const terrain=alphaTerrainData(),vertices=new Float32Array(terrain.positions);
  for(let i=0;i<vertices.length;i++)vertices[i]+=ALPHA_ORIGIN[i%3];
  labels.set(world.createCollider(R.ColliderDesc.trimesh(vertices,terrain.indices)).handle,'actual Alpha terrain');
  for(const part of pier.parts)mesh(part.geometry,'actual pier '+part.finish);
  for(const [i,deck]of alphaPierDecks.entries())labels.set(world.createCollider(R.ColliderDesc.cuboid(...deck.size.map(v=>v/2)).setTranslation(...deck.p)).handle,'pier deck '+i);
  for(const [i,part]of [...pier.posts,...pier.rails].entries())labels.set(world.createCollider(R.ColliderDesc.cuboid(...part.size.map(v=>v/2)).setTranslation(...part.p)).handle,'pier structure '+i);
  const boards=transportBoardingGeometry(route,index,alphaFerryGroundHeight);labels.set(world.createCollider(R.ColliderDesc.trimesh(boards.positions,boards.indices)).handle,'fixed gangway '+index);
  const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,-100,0));world.createCollider(R.ColliderDesc.capsule(.48,.34),body);world.step();
  for(const [name,path]of [['boarding',terminal.boarding],['egress',terminal.egress]]){
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],hit=world.castShape({x:a[0],y:a[1]+.832,z:a[2]},{x:0,y:0,z:0,w:1},{x:b[0]-a[0],y:b[1]-a[1],z:b[2]-a[2]},new R.Capsule(.48,.34),.004,1,false,undefined,undefined,undefined,body);
    assert.equal(!!hit,false,JSON.stringify({index,name,segment:i,part:hit?labels.get(hit.collider.handle):null,toi:hit?.time_of_impact}));
   }
   assert.ok(rideFootRouteClear(world,R,body,path),`${index} ${name} actual capsule`);
  }
  const landing=findSafePlayerLanding(world,R,body,[terminal.safeExit],-.7);
  assert.ok(landing,`${index} exact safe exit has support ring and swept escape`);
  const delta=landing[1]-.88-terminal.safeExit[1];assert.ok(Math.abs(delta)<.12,JSON.stringify({index,landing,delta}));
  const exit=terminal.safeExit,ray=world.castRay(new R.Ray({x:exit[0],y:exit[1]+.5,z:exit[2]},{x:0,y:-1,z:0}),1,true,undefined,undefined,undefined,body),centerFloor=ray?exit[1]+.5-ray.timeOfImpact:null,ikGround=boards.support(exit[0],exit[2]);assert.ok(centerFloor!==null&&Math.abs(ikGround-centerFloor)<.001,JSON.stringify({index,ikGround,centerFloor,ringMaximumFloor:landing[1]-.88}));
  context.diagnostic(JSON.stringify({index,segments:terminal.boarding.length+terminal.egress.length-2,landing,delta}));world.free();
 }
 pier.parts.forEach(p=>p.geometry.dispose());disposeWorldCraftGltf(asset.scene);
});

test('actual G24 helmet clears the ferry canopy from the highest boarding tread',async context=>{
 const {gltf:{scene,animations}}=await loadGuide(new URL('../../../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
 const root=new Group();root.add(scene);const mixer=new AnimationMixer(scene),clip=animations.find(c=>c.name==='Walk');assert.ok(clip);const action=mixer.clipAction(clip).play();let max=0;
 for(let i=0;i<=60;i++){action.time=clip.duration*i/60;mixer.update(0);root.updateWorldMatrix(true,true);const box=new Box3().setFromObject(scene,true);max=Math.max(max,box.max.y);}
 const asset=await readWorldCraftGltf(['public/assets/world/alpha-island/transports/ferry.glb']);let canopy;asset.scene.traverse(o=>{if(o.name.startsWith('passenger_canopy'))canopy=o;});assert.ok(canopy);asset.scene.updateMatrixWorld(true);const canopyBottom=new Box3().setFromObject(canopy,true).min.y,highestTread=Math.max(...dimensions.ferryBoardingSteps.map(p=>p.center[1]+p.size[1]/2)),clearance=canopyBottom-highestTread-max;
 context.diagnostic(JSON.stringify({actualWalkMaximumHeight:max,canopyBottom,highestTread,clearance}));assert.ok(clearance>.015,'actual walking helmet has physical canopy clearance');mixer.stopAllAction();disposeWorldCraftGltf(asset.scene);
});

test('ferry walking stance boots can lower onto the actual tread during a descending step',async context=>{
 const route=alphaFerryRoute(),{gltf:{scene,animations}}=await loadGuide(new URL('../../../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url)),parent=new Group(),root=new Group();parent.add(root);root.add(scene);const mixer=new AnimationMixer(scene),walk=animations.find(c=>c.name==='Walk'),action=mixer.clipAction(walk).play(),slope=new GuideSlopeFit(scene);let samples=0,max=0;
 for(const [index,t]of route.terminals.entries()){
  const ground=transportBoardingGeometry(route,index,alphaFerryGroundHeight),cleanup=registerRideGround('ferry-step-contact',ground.support),path=t.boarding,a=path.at(-4),b=path.at(-3),point=a.map((v,i)=>(v+b[i])/2),yaw=Math.atan2(a[2]-b[2],b[0]-a[0]);
  const driver=new TransportDriver(route,index);driver.capture(t.boarding[0],yaw);driver.step(.1,false);assert.ok(driver.frame.footLowering>0,'actual driver publishes physical stair budget');
  for(const phase of[0,.125,.25,.375,.5,.625,.75,.875]){
   action.time=walk.duration*phase;mixer.update(0);root.position.set(...point);root.rotation.set(0,yaw,0);root.updateWorldMatrix(true,true);const feet=new GuideAttractionFeet(),frame={...driver.frame,root:point,yaw,groundId:'ferry-step-contact'};
   const stance=Object.values(slope.legs).filter(leg=>Math.min(...leg.sole.map(p=>skinnedWorldPoint(p.mesh,p.index,new Vector3()).y))-point[1]<.03);feet.apply(slope,frame,1/60);root.updateWorldMatrix(true,true);
   for(const leg of stance){let gap=Infinity;for(const p of leg.sole){const v=skinnedWorldPoint(p.mesh,p.index,new Vector3()),y=ground.support(v.x,v.z);if(y!==null)gap=Math.min(gap,v.y-y);}assert.ok(gap>=-.011&&gap<=.035,JSON.stringify({index,phase,gap,point}));max=Math.max(max,gap);samples++;}feet.restore();
  }cleanup();
 }mixer.stopAllAction();assert.ok(samples>8);context.diagnostic(JSON.stringify({stanceSamples:samples,maximumStanceGap:max}));
});

test('one ferry foot solver holds its contact on obstruction and restores after continuous recovery',async context=>{
 const route=alphaFerryRoute(),t=route.terminals[0],ground=transportBoardingGeometry(route,0,alphaFerryGroundHeight),cleanup=registerRideGround('ferry-continuous',ground.support),{gltf:{scene,animations}}=await loadGuide(new URL('../../../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url)),parent=new Group(),root=new Group();parent.add(root);root.add(scene);const mixer=new AnimationMixer(scene),clip=animations.find(c=>c.name==='Walk'),action=mixer.clipAction(clip).play(),slope=new GuideSlopeFit(scene),feet=new GuideAttractionFeet(),driver=new TransportDriver(route,0);driver.capture(t.boarding[0],0);const path=driver.boardingPath,a=path.at(-4),b=path.at(-3),point=a.map((v,i)=>(v+b[i])/2),yaw=Math.atan2(a[2]-b[2],b[0]-a[0]);driver.step(.1,false);driver.frame={...driver.frame,root:point,yaw};driver.setMovementGuard(()=>false);driver.step(.1,false);assert.equal(driver.blockedMotion,true);assert.equal(driver.frame.clip,'Walk');assert.equal(driver.frame.footContactHold,true);
 const pose=(frame,time)=>{feet.restore();action.time=time;mixer.update(0);root.position.set(...frame.root);root.rotation.set(0,frame.yaw,0);root.updateWorldMatrix(true,true);feet.apply(slope,frame,1/60);return feet.debug();};
 const start={...driver.frame,footContactHold:false,groundId:'ferry-continuous'};pose(start,0);const held={...start,footContactHold:true,speed:0},trace=[];for(let i=0;i<60;i++)trace.push(pose(held,0));assert.ok(trace.every(v=>Math.abs(v.drop-trace[0].drop)<1e-9));assert.ok(trace.every(v=>Math.abs(v.pelvisWorldY-trace[0].pelvisWorldY)<1e-8));
 driver.setMovementGuard(()=>true);driver.step(.1,false);assert.equal(driver.frame.footContactHold,undefined);
 const target=t.boarding.at(-1);for(let i=1;i<=120;i++){const u=i/120,p=point.map((v,k)=>v+(target[k]-v)*u);trace.push(pose({...start,root:p,footContactHold:false},clip.duration*u));}for(let i=0;i<30;i++)trace.push(pose({...start,root:target,footContactHold:false},clip.duration));assert.ok(trace.every(v=>v.drop>=0&&v.drop<=route.footLowering));assert.ok(trace.at(-1).drop<.015);
 const turn=pose({...start,root:target,clip:'TurnR',footLowering:undefined},0);assert.equal(turn.drop,0);assert.ok(Math.abs(turn.pelvisWorldY-trace.at(-1).pelvisWorldY)<.015,'contact adapter reset stays within native sole correction');feet.restore();cleanup();mixer.stopAllAction();context.diagnostic(JSON.stringify({heldFrames:60,recoveryFrames:150,heldDrop:trace[0].drop,finalDrop:trace.at(-1).drop,maximumDrop:Math.max(...trace.map(v=>v.drop))}));
});
