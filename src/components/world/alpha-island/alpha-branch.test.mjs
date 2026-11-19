import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createAlphaGrammarTree,treePullParts,twigContactGroups} from './alpha-grammar-tree';
import {AlphaBadBranchController,alphaBadBranchProbe} from './alpha-bad-branch';
import {alphaTerrainData,alphaHeight} from './alpha-terrain';
import {ALPHA_ORIGIN,ALPHA_STATIONS,alphaWorld,alphaLocal} from './alpha-layout';
await RAPIER.init();
function fixture(){const tree=createAlphaGrammarTree(),s=tree.breakaway,w=new RAPIER.World({x:0,y:-9.81,z:0}),dt=1/60;w.timestep=dt;const t=alphaTerrainData(),land=w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...ALPHA_ORIGIN));w.createCollider(RAPIER.ColliderDesc.trimesh(t.positions,t.indices),land);const home=alphaWorld(ALPHA_STATIONS.tree.map((n,i)=>n+s.anchor[i])),body=w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...home).setCcdEnabled(true).setLinearDamping(.45).setAngularDamping(.7));
 const station=alphaWorld(ALPHA_STATIONS.tree), fixed=w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...station));
 const bark=tree.barkContacts.map(c=>w.createCollider(RAPIER.ColliderDesc.trimesh(c.vertices,c.indices).setCollisionGroups(c.groups),fixed));
 for(const c of s.contacts)w.createCollider(RAPIER.ColliderDesc.convexHull(c.vertices).setMass(c.mass).setCollisionGroups(twigContactGroups).setFriction(.72).setRestitution(.08),body);
 w.step();const controller=new AlphaBadBranchController(body,w,RAPIER,s,()=>bark[1].handle);Object.assign(alphaBadBranchProbe,{drops:0,resets:0,minPathMargin:Infinity});let time=0,trigger=-100;const tick=(n,paused=false)=>{for(let i=0;i<n;i++){if(!paused)time+=dt;controller.tick(time,trigger,paused,true);if(!paused)w.step();}};const close=()=>{tree.parts.forEach(p=>p.geometry.dispose());tree.breakaway.parts.forEach(p=>p.geometry.dispose());tree.pulse.dispose();w.free();};return{w,body,controller,home,s,tree,bark,tick,close,trigger:()=>{trigger=time;},get time(){return time;}};}
test('one real twig falls off route, pauses without elapsed deadline and restores after18 world seconds',t=>{const f=fixture();try{f.trigger();f.tick(420);assert.equal(f.controller.phase,'fallen',JSON.stringify(alphaBadBranchProbe));assert.ok(f.body.translation().y<f.home[1]-5,JSON.stringify({position:f.body.translation(),home:f.home,center:f.s.boundCenter}));assert.ok(alphaBadBranchProbe.minPathMargin>0,'actual transformed bound entered main route');const age=f.time-f.controller.droppedAt,p=f.body.translation();f.tick(600,true);assert.equal(f.time-f.controller.droppedAt,age);assert.deepEqual(f.body.translation(),p);f.trigger();f.tick(60);assert.equal(alphaBadBranchProbe.drops,1,'repeatE duplicated a fall/body');f.tick(1020);assert.equal(f.controller.phase,'attached');assert.equal(alphaBadBranchProbe.resets,1);assert.ok(Math.hypot(...f.home.map((v,i)=>v-[f.body.translation().x,f.body.translation().y,f.body.translation().z][i]))<1e-4);t.diagnostic(JSON.stringify({drops:alphaBadBranchProbe.drops,resets:alphaBadBranchProbe.resets,minPathMargin:alphaBadBranchProbe.minPathMargin}));}finally{f.close();}});
test('a72kg walking capsule physically contacts and pushes the fallen twig',t=>{const f=fixture();try{f.trigger();f.tick(420);const p=f.body.translation(),local=alphaLocal([p.x,p.y,p.z]),start=[p.x+1.1,alphaHeight(local[0]+1.1,local[2])+.83,p.z],player=f.w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...start).lockRotations().setCcdEnabled(true));const capsule=f.w.createCollider(RAPIER.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0),player);let contacts=0;const before=f.body.translation();for(let k=0;k<100;k++){const vel=player.linvel();player.setLinvel({x:-1.6,y:vel.y,z:0},true);f.tick(1);for(let i=0;i<f.body.numColliders();i++)f.w.contactPairsWith(f.body.collider(i),other=>{if(other.handle===capsule.handle)contacts++;});}const after=f.body.translation(),moved=Math.hypot(after.x-before.x,after.z-before.z);assert.ok(contacts>0,'no physical player/twig contact');assert.ok(moved>.1,`twig displacement${moved}`);assert.equal(f.controller.phase,'fallen');assert.ok(alphaBadBranchProbe.minPathMargin>0);t.diagnostic(JSON.stringify({contacts,moved,minPathMargin:alphaBadBranchProbe.minPathMargin,position:after}));}finally{f.close();}});
test('blocked attachment defers restoration and releases safely when obstruction leaves',()=>{const f=fixture();try{f.trigger();f.tick(420);const local=f.s.leafCenter,block=f.w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.home[0]+local[0],f.home[1]+local[1],f.home[2]+local[2]));f.w.createCollider(RAPIER.ColliderDesc.ball(.4),block);f.tick(1000);assert.equal(f.controller.phase,'reset-wait');assert.equal(alphaBadBranchProbe.restoreBlocked,true);assert.ok(f.body.translation().y<f.home[1]-5,JSON.stringify({position:f.body.translation(),home:f.home,center:f.s.boundCenter}));f.w.removeRigidBody(block);f.tick(2);assert.equal(f.controller.phase,'attached');assert.equal(alphaBadBranchProbe.restoreBlocked,false);}finally{f.close();}});

test('all fixed wood, the hand grip and the gaps between the roots agree with the visible tree',t=>{
  const f=fixture(), material=new MeshBasicMaterial({side:DoubleSide}), rope=treePullParts();
  t.after(()=>{f.close();material.dispose();rope.forEach(p=>p.geometry.dispose());});
  const [x,y,z]=alphaWorld(ALPHA_STATIONS.tree),treeMesh=new Mesh(f.tree.parts[0].geometry,material);
  treeMesh.position.set(x,y,z);treeMesh.updateMatrixWorld();
  const grip=rope.find(p=>p.finish==='darkwood');
  const handle=f.w.createCollider(RAPIER.ColliderDesc.convexHull(grip.geometry.getAttribute('position').array).setTranslation(x,y,z));
  let maxError=0,hits=0,gaps=0;
  for(const height of [.08,.2,.45,.85,1.5,2.15,2.5,3.2,5.1,7.7,9.3])
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16, direction=new Vector3(-Math.cos(a),0,-Math.sin(a));
      const from=new Vector3(x-direction.x*4.6,y+height,z-direction.z*4.6);
      const visible=new Raycaster(from,direction,0,9.2).intersectObject(treeMesh)[0];
      const physical=f.bark.map(c=>c.castRay(new RAPIER.Ray(from,direction),9.2,true)).filter(t=>t>=0);
      if(!visible){assert.equal(physical.length,0);gaps++;continue;}
      hits++;assert.ok(physical.length);maxError=Math.max(maxError,Math.abs(visible.distance-Math.min(...physical)));
    }
  const q={x:0,y:0,z:0,w:1};const stand={x:x-1.15,y:y+.83,z:z+1.15};
  assert.ok([...f.bark,handle].every(c=>!c.intersectsShape(new RAPIER.Capsule(.48,.34),stand,q)));
  assert.ok(handle.castRay(new RAPIER.Ray({x:x-.7,y:y+1.2,z:z+2},{x:0,y:0,z:-1}),1,true)>0);
  assert.equal(handle.castRay(new RAPIER.Ray({x:x-.7,y:y+1.62,z:z+2},{x:0,y:0,z:-1}),1,true),-1);
  assert.ok(hits>270&&maxError<.001,JSON.stringify({hits,gaps,maxError}));
  t.diagnostic(JSON.stringify({hits,gaps,maxError,attachedWoodTriangles:f.tree.barkContacts.reduce((n,c)=>n+c.indices.length/3,0)}));
});

test('moving twig contacts follow the bark and the rounded leaf instead of filling its rectangular bounds',t=>{
  const f=fixture();t.after(f.close);
  const origin=new Vector3(...f.home),maxErrorByPart=[];
  for(const [i,part] of f.s.parts.entries()){
    const pos=part.geometry.getAttribute('position'),index=part.geometry.index;
    let maxError=0;
    for(let k=0;k<index.count;k+=3){
      const point=new Vector3();
      for(let j=0;j<3;j++)point.add(new Vector3().fromBufferAttribute(pos,index.getX(k+j)));
      point.multiplyScalar(1/3).add(origin);
      const id=i===1?part.policy.surfaceId:part.policy.worldCollisionSources.find(r=>k>=r.firstIndex&&k<r.firstIndex+r.indexCount).surfaceId;
      const c=f.body.collider(f.s.contacts.findIndex(c=>c.id===id)),nearest=c.projectPoint(point,false).point;
      maxError=Math.max(maxError,Math.hypot(nearest.x-point.x,nearest.y-point.y,nearest.z-point.z));
    }
    maxErrorByPart.push(maxError);
  }
  const leaf=f.s.parts[1].geometry.boundingBox, half=leaf.getSize(new Vector3()).multiplyScalar(.5);
  const old=f.w.createCollider(RAPIER.ColliderDesc.cuboid(half.x,half.y,half.z).setTranslation(...leaf.getCenter(new Vector3()).add(origin).toArray()));
  const newLeaf=f.body.collider(f.s.contacts.length-1);
  let open=0;
  for(let i=1;i<20;i++)for(let j=1;j<20;j++){
    const ray=new RAPIER.Ray({x:origin.x+leaf.min.x+(leaf.max.x-leaf.min.x)*i/20,y:origin.y+leaf.min.y+(leaf.max.y-leaf.min.y)*j/20,z:origin.z+leaf.max.z+.1},{x:0,y:0,z:-1});
    if(old.castRay(ray,2,true)>=0&&newLeaf.castRay(ray,2,true)<0)open++;
  }
  assert.ok(maxErrorByPart[0]<.015&&maxErrorByPart[1]<.05&&open>25,JSON.stringify({maxErrorByPart,open}));
  t.diagnostic(JSON.stringify({maxErrorByPart,oldLeafBoxFalseHits:open,rays:361}));
});
