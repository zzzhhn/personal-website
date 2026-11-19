import dimensions from './transport-dimensions.json' with {type:'json'};
import test from 'node:test';import assert from 'node:assert/strict';import R from '@dimforge/rapier3d-compat';import{DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Quaternion,Vector3}from'three';
import{ALPHA_TRANSPORT_ROUTES}from'./alpha-routes.ts';import{transportInfrastructure,transportBeamBatch,cableWireSegments,transportBeamGeometry,SLED_RAIL_RADIUS}from'./transport-infrastructure.ts';import{transportBoardingGeometry}from'../../rides/transport-boarding.ts';import{rideFootRouteClear}from'../../rides/ride-clearance.ts';import{TransportDriver}from'../../rides/transport-driver.ts';import{transportWorld}from'../../rides/transport-route.ts';
import{findSafePlayerLanding}from'../../safe-landing.ts';
import{verifyPhysicalBoardingJoins}from'../../rides/transport-joining-fixture.mjs';
import{alphaTerrainData,alphaGroundHeight}from'../alpha-terrain.ts';
import{readWorldCraftGltf,disposeWorldCraftGltf}from'../../world-craft-gltf-test.mjs';
await R.init();
test('sled shell supports the top, two sides and the actual underside along the full route',t=>{
 const d=transportInfrastructure(ALPHA_TRANSPORT_ROUTES[1]),world=new R.World({x:0,y:0,z:0});
 t.after(()=>world.free());
 const old=world.createCollider(R.ColliderDesc.trimesh(d.vertices,d.indices));
 const shell=world.createCollider(R.ColliderDesc.trimesh(d.renderVertices,d.renderIndices));
 let checked=0,oldBaseError=0,newBaseError=0,sideHits=0;
 for(let i=0;i<d.indices.length;i+=6){
  const [a,b,c]=[0,1,2].map(k=>new Vector3().fromArray(d.vertices,d.indices[i+k]*3));
  assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).normalize().y>.6);
  const center=a.clone().add(b).add(c).divideScalar(3);
  const top=new R.Ray(center.clone().add(new Vector3(0,.2,0)),{x:0,y:-1,z:0});
  const bottom=new R.Ray(center.clone().add(new Vector3(0,-.3,0)),{x:0,y:1,z:0});
  assert.ok(Math.abs(shell.castRay(top,.4,true)-.2)<.0001);
  oldBaseError=Math.max(oldBaseError,Math.abs(old.castRay(bottom,.4,true)-.18));
  newBaseError=Math.max(newBaseError,Math.abs(shell.castRay(bottom,.4,true)-.18));
  const side=c.clone().lerp(a,.5),out=a.clone().sub(b).normalize();
  side.y-=.06;const ray=new R.Ray(side.clone().addScaledVector(out,.1),out.negate());
  assert.ok(Math.abs(shell.castRay(ray,.15,true)-.1)<.0002);
  assert.equal(old.castRay(ray,.15,true),-1);checked++;sideHits++;
 }
 assert.ok(checked>100&&oldBaseError>.119&&newBaseError<.0001);
 t.diagnostic(JSON.stringify({sections:checked,sideHits,oldBaseError,newBaseError}));
});
test('cable and sled trestles meet the installed terrain on their full rims; wires, rails and braces keep their gaps',t=>{
 const material=new MeshBasicMaterial({side:DoubleSide});t.after(()=>material.dispose());
 const world=new R.World({x:0,y:0,z:0});t.after(()=>world.free());
 for(const route of ALPHA_TRANSPORT_ROUTES.filter(r=>r.kind!=='ferry')){
  const d=transportInfrastructure(route,alphaGroundHeight),cable=route.kind==='cable',r=cable?.09:.12;
  const poles=d.supports.filter(s=>Math.hypot(s.a[0]-s.b[0],s.a[2]-s.b[2])<1e-8
    && s.b[1]>s.a[1]+.1 && Math.abs(s.a[1]-alphaGroundHeight(s.a[0]-route.transform.origin[0],s.a[2]-route.transform.origin[2]))<.45);
  let maxOldGap=0,maxNewGap=-Infinity,feet=0,hits=0,gaps=0,maxFit=0;
  for(const {a} of poles){
   const x=a[0]-route.transform.origin[0],z=a[2]-route.transform.origin[2];
   for(let j=0;j<8;j++){const angle=j*Math.PI/4,ground=alphaGroundHeight(x+Math.cos(angle)*r,z+Math.sin(angle)*r);
    maxOldGap=Math.max(maxOldGap,alphaGroundHeight(x,z)-ground);maxNewGap=Math.max(maxNewGap,a[1]-ground);feet++;}
  }
  for(const [segments,radius,wood] of [[d.supports,r,!cable],cable?[cableWireSegments(route),.035,false]:[d.sledRails,SLED_RAIL_RADIUS,true]]){
   const data=transportBeamBatch(segments,radius,wood),mesh=new Mesh(data.geometry,material);
   const surface=world.createCollider(R.ColliderDesc.trimesh(data.vertices,data.indices));t.after(()=>data.geometry.dispose());
   for(let k=0;k<segments.length;k+=Math.max(1,Math.floor(segments.length/32))){
    const {a,b}=segments[k],mid=new Vector3(...a).lerp(new Vector3(...b),.5),axis=new Vector3(...b).sub(new Vector3(...a)).normalize();
    const radial=axis.clone().cross(Math.abs(axis.y)>.92?new Vector3(1,0,0):new Vector3(0,1,0)).normalize();
    for(const angle of [0,.37,1.3]){
     const dir=radial.clone().applyAxisAngle(axis,angle),from=mid.clone().addScaledVector(dir,radius+.35),towards=dir.clone().negate();
     const hit=surface.castRay(new R.Ray(from,towards),.55,true);
     const visible=new Raycaster(from,towards,0,.55).intersectObject(mesh)[0];assert.ok(hit>=0&&visible);hits++;
     maxFit=Math.max(maxFit,Math.abs(hit-visible.distance));
     if(surface.castRay(new R.Ray(from,dir),.15,true)<0)gaps++;
    }
   }
  }
  assert.ok(feet>=32&&maxNewGap<=.0001&&maxFit<.0001&&gaps>40,JSON.stringify({route:route.id,feet,maxNewGap,maxFit,gaps}));
  t.diagnostic(JSON.stringify({route:route.id,feet,maxOldGap,maxNewGap,maxFit,hits,gaps}));
 }
});
test('cable entry and short independent exit clear their canopy posts and closed panels',()=>{
 const route=ALPHA_TRANSPORT_ROUTES[0];for(const index of[0,1]){const t=route.terminals[index],q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.yaw),world=new R.World({x:0,y:0,z:0}),root=transportWorld(t.vehicle,route.transform),point=p=>new Vector3(...p).applyQuaternion(q).add(new Vector3(...root));
 const addBox=(p,s)=>world.createCollider(R.ColliderDesc.cuboid(...s).setTranslation(...point(p).toArray()).setRotation(q));addBox([0,-.1,0],[1.6,.1,1.2]);addBox([1.5,1.1,0],[.06,1.1,1.1]);addBox([-1.5,1.1,0],[.06,1.1,1.1]);addBox([0,1.1,-1.12],[1.5,1.1,.05]);addBox([0,2.25,0],[1.725,.1,1.325]);addBox([0,dimensions.cable.canopyHeight,0],[2.5,.125,2.5]);
 for(const x of[-2.1,2.1])for(const z of[-2.1,2.1])world.createCollider(R.ColliderDesc.cylinder((dimensions.cable.canopyHeight-.125)/2,.17).setTranslation(...point([x,(dimensions.cable.canopyHeight-.125)/2,z]).toArray()));
 const d=transportBoardingGeometry(route,index);world.createCollider(R.ColliderDesc.trimesh(d.positions,d.indices));const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...transportWorld(t.boarding[0],route.transform)));world.createCollider(R.ColliderDesc.capsule(.48,.34),body);world.step();const path=t.boarding.map(p=>transportWorld(p,route.transform)),exit=t.egress.map(p=>transportWorld(p,route.transform));assert.ok(rideFootRouteClear(world,R,body,path),'whole boarding capsule');assert.ok(rideFootRouteClear(world,R,body,exit),'whole egress capsule');
 assert.equal(verifyPhysicalBoardingJoins(world,R,body,route,index),6);
 const obstruction=world.createCollider(R.ColliderDesc.cuboid(.5,1,.5).setTranslation(...point([1,1,2.6]).toArray()));world.step();assert.equal(rideFootRouteClear(world,R,body,exit),false);world.removeCollider(obstruction,true);world.free();}
});
test('blocked station egress holds a standing rider until route is clear',()=>{const route=ALPHA_TRANSPORT_ROUTES[1],d=new TransportDriver(route,0);d.capture(transportWorld(route.terminals[0].boarding[0],route.transform),0);for(let i=0;i<2000&&d.phase!=='sit';i++)d.step(1/60,false);d.requestExit();d.setExitBlocked(true);for(let i=0;i<5000;i++)d.step(1/60,false);assert.equal(d.phase,'stand');assert.equal(d.frame.seatWeight,0);d.setExitBlocked(false);for(let i=0;i<5000&&d.phase!=='complete';i++)d.step(1/60,false);assert.equal(d.phase,'complete');});

test('an obstacle entering after walk-out starts stops the current segment and removal resumes',()=>{
 const world=new R.World({x:0,y:0,z:0});world.createCollider(R.ColliderDesc.cuboid(50,.1,50).setTranslation(10,-.1,0));const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-5,.82,3));world.createCollider(R.ColliderDesc.capsule(.48,.34),body);world.step();
 const terminal=x=>({id:String(x),vehicle:[x,0,0],yaw:0,boarding:[[x,0,3],[x,0,0]],egress:[[x,0,0],[x,0,3],[x+5,0,3]],safeExit:[x+5,0,3],seat:[0,.48,0],clearance:[3,3,4]}),route={id:'live-block',kind:'ferry',transform:{origin:[0,0,0],yaw:0},path:[[0,0,0],[20,0,0]],duration:4,terminals:[terminal(0),terminal(20)]};
 const d=new TransportDriver(route,0);d.capture([-5,0,3],0);d.setMovementGuard((a,b)=>rideFootRouteClear(world,R,body,[a,b]));for(let i=0;i<3000&&d.phase!=='walk-out';i++)d.step(1/60,false);assert.equal(d.phase,'walk-out');const obstacle=world.createCollider(R.ColliderDesc.cuboid(.6,1,.3).setTranslation(20,1,1.5));world.step();for(let i=0;i<600;i++)d.step(1/60,false);assert.equal(d.phase,'walk-out');assert.equal(d.blockedMotion,true);assert.ok(d.frame.root[2]<1);const stopped=[...d.frame.root];d.step(.1,false);assert.deepEqual(d.frame.root,stopped);world.removeCollider(obstacle,true);world.step();for(let i=0;i<3000&&d.phase!=='complete';i++)d.step(1/60,false);assert.equal(d.phase,'complete');world.free();
});

test('obstacle inserted on final approach step holds actor and camera until removed',()=>{
 const route={id:'last-step',kind:'cable',transform:{origin:[0,0,0],yaw:0},path:[[0,0,0],[20,0,0]],duration:4,terminals:[0,20].map(x=>({id:String(x),vehicle:[x,0,0],yaw:0,boarding:[[x-2,0,0],[x,0,0]],safeExit:[x-2,0,0],seat:[0,.48,0],clearance:[3,3,4]}))};
 const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-5,.82,0));world.createCollider(R.ColliderDesc.capsule(.48,.34),body);world.step();const d=new TransportDriver(route,0);d.capture([-2,0,0],0);d.step(.01,false);d.elapsed=2/1.35-.005;d.step(.001,false);const previous=[...d.frame.root];const obstacle=world.createCollider(R.ColliderDesc.cuboid(.03,1,.5).setTranslation(.35,1,0));world.step();d.setMovementGuard((a,b)=>rideFootRouteClear(world,R,body,[a,b]));const sample=d.step(.02,false);assert.equal(d.phase,'approach');assert.equal(d.blockedMotion,true);assert.deepEqual(d.frame.root,previous);assert.deepEqual(sample.pose.cameraTarget,[previous[0],previous[1]+.9,previous[2]]);world.removeCollider(obstacle,true);world.step();d.step(.02,false);assert.equal(d.phase,'turn-in');world.free();
});

test('sled walking paths clear the actual runtime footrest, runners, seat and backrest at both ends',async context=>{
 const route=ALPHA_TRANSPORT_ROUTES[1],asset=await readWorldCraftGltf(['public/assets/world/alpha-island/transports/sled.glb']);assert.ok(asset);asset.scene.updateMatrixWorld(true);
 for(const index of [0,1]){const terminal=route.terminals[index],world=new R.World({x:0,y:0,z:0}),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),terminal.yaw+route.transform.yaw),root=new Vector3(...transportWorld(terminal.vehicle,route.transform)),labels=new Map();
 asset.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld),position=g.getAttribute('position'),vertices=new Float32Array(position.count*3);for(let i=0;i<position.count;i++){const v=new Vector3().fromBufferAttribute(position,i).applyQuaternion(q).add(root);vertices.set(v.toArray(),i*3);}const indices=g.index?new Uint32Array(g.index.array):Uint32Array.from({length:position.count},(_,i)=>i);const collider=world.createCollider(R.ColliderDesc.trimesh(vertices,indices));labels.set(collider.handle,o.name);g.dispose();});
 const track=transportInfrastructure(route);
 world.createCollider(R.ColliderDesc.trimesh(track.renderVertices,track.renderIndices));
 for(const segment of track.sledRails){
  const guide=transportBeamGeometry(segment,SLED_RAIL_RADIUS);
  const physicalGuide=world.createCollider(R.ColliderDesc.trimesh(guide.attributes.position.array,Uint32Array.from(guide.index.array)));
  labels.set(physicalGuide.handle,'sled guide');guide.dispose();
 }
 const terrain=alphaTerrainData(),terrainVertices=new Float32Array(terrain.positions);for(let i=0;i<terrainVertices.length;i++)terrainVertices[i]+=route.transform.origin[i%3];world.createCollider(R.ColliderDesc.trimesh(terrainVertices,terrain.indices));const deck=transportBoardingGeometry(route,index);world.createCollider(R.ColliderDesc.trimesh(deck.positions,deck.indices));const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,-100,0));world.createCollider(R.ColliderDesc.capsule(.48,.34),body);world.step();
 assert.equal(verifyPhysicalBoardingJoins(world,R,body,route,index),6);
 for(const [name,path]of [['boarding',terminal.boarding],['egress',terminal.egress]]){const points=path.map(p=>transportWorld(p,route.transform));for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],hit=world.castShape({x:a[0],y:a[1]+.832,z:a[2]},{x:0,y:0,z:0,w:1},{x:b[0]-a[0],y:b[1]-a[1],z:b[2]-a[2]},new R.Capsule(.48,.34),.004,1,false,undefined,undefined,undefined,body);assert.equal(!!hit,false,JSON.stringify({index,name,segment:i,part:hit?labels.get(hit.collider.handle):null,toi:hit?.time_of_impact}));}assert.ok(rideFootRouteClear(world,R,body,points),`${index} ${name} actual sled body`);}const exit=transportWorld(terminal.safeExit,route.transform),landing=findSafePlayerLanding(world,R,body,[exit],-.7);assert.ok(landing,`${index} endpoint passes real safe-landing ring and escape sweep`);assert.ok(Math.abs(landing[1]-.88-exit[1])<.12,JSON.stringify({index,exit,landing}));world.free();}
 disposeWorldCraftGltf(asset.scene);
});
