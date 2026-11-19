import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { buildIbdCables,buildIbdCoil,buildIbdCrane,buildIbdHook,buildIbdLid } from './ibd-yard-geometry.ts';
import { buildIbdPackShell } from './ibd-pack-geometry.ts';
import { IBD_CRATE_LID_PIVOT,createIbdCratePart,ibdCrateAssetContact } from './ibd-crate-visual.ts';
import { ibdGeometryContact } from './ibd-static-contact.ts';
import { ibdHoistCableSources,ibdHoistPose,IBD_HOIST_CARRY_Y,IBD_COIL_SUPPORT_Y } from './ibd-hoist-contact.ts';
import { readWorldCraftGltf,disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdWorld } from './ibd-yard-layout.ts';
import { createIbdSafety } from './ibd-yard-safety.ts';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from '../actor-physics.ts';
import { CRANE_PIVOTS,CRANE_STAND } from './ibd-crane-control.ts';
import { buildIbdCraneLever } from './ibd-craft-geometry.ts';

await R.init();
const zero={x:0,y:0,z:0}, fit=g=>ibdGeometryContact(g,'test',0,g.index.count);
const desc=c=>R.ColliderDesc.trimesh(c.vertices,c.indices);
const shadowless=new MeshBasicMaterial({side:DoubleSide});
test.after(()=>shadowless.dispose());
const ray=(from,direction)=>new R.Ray(new Vector3(...from),new Vector3(...direction));
const cast=(shape,from,direction,max=8)=>shape.castRay(ray(from,direction),max,false);

test('steel coil uses the actual bore, recessed flaw and dolly wheels through its rotated pose',t=>{
  const world=new R.World(zero),geometry=buildIbdCoil(true,2), material=shadowless, draw=new Mesh(geometry,material), caster=new Raycaster();
  const old=world.createCollider(R.ColliderDesc.cuboid(2,2,1.4));
  const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  const collider=world.createCollider(desc(fit(geometry)),body);
  const report=[];
  try {
    for(const [role,from,direction,max] of [
      ['bore',[0,0,2],[0,0,-1],4],['dented winding',[-.72,.82,-2],[0,0,1],1.2],
      ['wheel shoulder',[2.25,-2.12,1.05],[-1,0,0],1],
    ]){
      const before=cast(old,from,direction,max),current=cast(collider,from,direction,max);
      caster.set(new Vector3(...from),new Vector3(...direction));caster.far=max;
      const drawn=caster.intersectObject(draw)[0];
      assert.equal(Boolean(drawn),current>=0,role);
      if(drawn)assert.ok(Math.abs(drawn.distance-current)<.00002,role);
      report.push({role,before,current});
    }
    assert.ok(report[0].before>0&&report[0].current<0);
    assert.ok(report[1].current-report[1].before>.10);
    assert.ok(report[2].before<0&&report[2].current>0);
    geometry.computeBoundingBox();
    assert.equal(geometry.boundingBox.min.y,IBD_COIL_SUPPORT_Y);
    assert.ok(Math.abs(IBD_HOIST_CARRY_Y+geometry.boundingBox.min.y-1.9)<.00001);
    body.setNextKinematicRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI));world.step();
    assert.equal(cast(collider,[0,0,-2],[0,0,1],4),-1,'the genuine void survives the inspection half-turn');
    t.diagnostic(JSON.stringify(report));
  }finally{world.free();geometry.dispose();}
});

test('the two cable lengths, trolley and hook keep their placed contact through the hoist motion',t=>{
  const cable=buildIbdCables(),sources=ibdHoistCableSources(cable),trolley=buildIbdCrane(),hook=buildIbdHook();
  const world=new R.World(zero), wireParent=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  const rods=sources.map(source=>world.createCollider(R.ColliderDesc.cylinder(.5,source.radius),wireParent));
  const rodDraw=new Mesh(cable,shadowless), caster=new Raycaster();
  const attachments=[trolley,hook].map(geometry=>{
    const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()),draw=new Mesh(geometry,shadowless);
    return {body,draw,shape:world.createCollider(desc(fit(geometry)),body)};
  });
  let largestError=0;
  try {
    assert.equal(sources.reduce((n,s)=>n+s.indexCount,0),cable.index.count);
    for(const point of [[-12,2.35,-4],[-12,IBD_HOIST_CARRY_Y,-4],[-16,IBD_HOIST_CARRY_Y,-4],[-20,2.35,-4]]){
      const pose=ibdHoistPose(point),[x,y,z]=pose.anchor;
      wireParent.setNextKinematicTranslation({x,y,z});
      for(const [i,{x}] of sources.entries()){
        rods[i].setHalfHeight(pose.cableLength/2);
        rods[i].setTranslationWrtParent({x,y:-pose.cableLength/2,z:0});
      }
      rodDraw.position.set(...pose.anchor);rodDraw.scale.y=pose.cableLength;rodDraw.updateMatrixWorld(true);
      for(const [i,row] of attachments.entries()){
        const at=i?pose.hook:pose.trolley;
        row.body.setNextKinematicTranslation({x:at[0],y:at[1],z:at[2]});row.draw.position.set(...at);row.draw.updateMatrixWorld(true);
      }
      world.step();
      for(const [i,source] of sources.entries()){
        for(const p of [.03,.5,.97]){
          for(const angle of [0,Math.PI/8]){
            const sx=Math.sin(angle),sz=Math.cos(angle),a=[x+source.x+sx,y-pose.cableLength*p,z+sz],d=[-sx,0,-sz];
            caster.set(new Vector3(...a),new Vector3(...d));caster.far=1.5;
            const observed=caster.intersectObject(rodDraw)[0],hit=cast(rods[i],a,d,1.5);
            assert.ok(observed&&hit>=0);
            largestError=Math.max(largestError,Math.abs(observed.distance-hit));
          }
        }
        assert.ok(cast(rods[i],[x+source.x,y-pose.cableLength-.02,z-1],[0,0,1],1.5)<0);
      }
      for(const [i,{draw,shape}] of attachments.entries()){
        const y=i?pose.hook[1]:pose.trolley[1]+.25,a=[x,y,z-3],d=[0,0,1];
        caster.set(new Vector3(...a),new Vector3(...d));caster.far=6;
        const seen=caster.intersectObject(draw)[0],hit=cast(shape,a,d,6);
        assert.ok(seen&&hit>=0);
        assert.ok(Math.abs(seen.distance-hit)<.00002);
      }
    }
    assert.ok(largestError<.00173);
    t.diagnostic(JSON.stringify({cableRadius:sources[0].radius,outerApproximation:largestError}));
  }finally{world.free();[cable,trolley,hook].forEach(g=>g.dispose());}
});

test('opening guards the closing arc around the true lid while leaving the floor operator clear',()=>{
  const game=createIbdYardGame();
  game.pending={token:1,seconds:.9,action:{kind:'open',station:'parts-a',slot:'parts-a'}};
  const guard=createIbdSafety(R,game),shape=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),rotation={x:0,y:0,z:0,w:1};
  const player=(point)=>{const [x,y,z]=ibdWorld(point);return {position:{x,y,z},rotation,shape,velocity:zero};};
  assert.ok(guard.blocked(0,1,player([10,3.25,-12.58])),'a player in the rising lid arc must veto the movement');
  assert.equal(guard.blocked(0,1,player([10,.98,-9.5])),false,'the intended aisle stance still allows opening');
});

test('the crane operator stance clears the actual lever caps through every fixed control direction',t=>{
  const world=new R.World(zero),geometry=buildIbdCraneLever(),contacts=fit(geometry);
  const controls=CRANE_PIVOTS.map(at=>world.createCollider(desc(contacts).setTranslation(...at)));
  const shape=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS), q=new Quaternion();
  const index={x:0,y:0,z:0,w:1};
  const contactsAt=z=>{
    const found=[];
    world.intersectionsWithShape({x:CRANE_STAND[0],y:CRANE_STAND[1]+PLAYER_HALF_HEIGHT+PLAYER_RADIUS,z},index,shape,c=>{found.push(c);return true;});
    return found.length;
  };
  try{
    world.step();
    assert.ok(contactsAt(.84)>0,'the previous stance overlapped the new real caps');
    for(const [left,right] of [[0,0],[-.18,0],[.18,0],[0,.18]]){
      controls[0].setRotation(q.setFromAxisAngle(new Vector3(1,0,0),left));
      controls[1].setRotation(q.setFromAxisAngle(new Vector3(0,0,1),right));
      world.step();
      assert.equal(contactsAt(CRANE_STAND[2]),0,JSON.stringify({left,right}));
    }
    t.diagnostic(JSON.stringify({oldZ:.84,newZ:CRANE_STAND[2]}));
  }finally{world.free();geometry.dispose();}
});

test('shipping crate and its fallback keep the open work cavity and follow the same rotating physical lid',async t=>{
  const asset=await readWorldCraftGltf(['public/assets/world/ibd/crate/crate-v1.glb']);
  const legacyShell=buildIbdPackShell(),legacyLid=buildIbdLid();
  try{
    for(const detailed of [false,true]){
      const world=new R.World(zero), old=world.createCollider(R.ColliderDesc.cuboid(1.4,.55,1.3).setTranslation(0,.45,0));
      const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
      const shell=world.createCollider(desc(detailed?ibdCrateAssetContact(asset.scene,'Shell'):fit(legacyShell)),body);
      const physical=world.createCollider(desc(detailed?ibdCrateAssetContact(asset.scene,'Lid'):fit(legacyLid))
        .setTranslation(...IBD_CRATE_LID_PIVOT),body);
      const lid=detailed?createIbdCratePart(asset.scene,'Lid'):new Group(), caster=new Raycaster();
      if(!detailed)lid.add(new Mesh(legacyLid,shadowless));
      if(detailed)lid.traverse(o=>{if(o.isMesh)o.material=shadowless;});
      const a=[0,2,0],d=[0,-1,0], oldDepth=cast(old,a,d),baked=cast(shell,a,d);
      assert.ok(baked-oldDepth>.3,`open shell ${baked} vs old box ${oldDepth}`);
      for(const angle of [0,-.4,-1,-1.6,-2,0]){
        physical.setRotationWrtParent(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle));world.step();
        lid.position.set(...IBD_CRATE_LID_PIVOT);lid.rotation.x=angle;lid.updateMatrixWorld(true);
        const from=new Vector3(.17,1,1.25).applyMatrix4(lid.matrixWorld);
        const direction=new Vector3(0,-1,0).transformDirection(lid.matrixWorld);
        caster.set(from,direction);caster.far=1.8;
        const art=caster.intersectObject(lid)[0], active=physical.castRay(new R.Ray(from,direction),1.8,false);
        assert.ok(art&&active>=0&&Math.abs(art.distance-active)<.00002,JSON.stringify({detailed,angle,art:art?.distance,active}));
      }
      t.diagnostic(JSON.stringify({detailed,previousSolidTop:2-oldDepth,openInterior:2-baked}));
      world.free();
    }
  }finally{legacyShell.dispose();legacyLid.dispose();disposeWorldCraftGltf(asset.scene);}
});
