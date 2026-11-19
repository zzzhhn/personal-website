import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import {DoubleSide,Mesh,MeshBasicMaterial,Quaternion,Raycaster,Vector3} from 'three';
import {buildStationControl,stationControlAngle,stationControlPivots} from './alpha-station-control.ts';
import {alphaActionTarget} from './alpha-action-reach.ts';
import {alphaWorld} from './alpha-layout.ts';
import {PLAYER_HALF_HEIGHT,PLAYER_RADIUS} from '../actor-physics.ts';

test('real bell shell, clapper and grip follow the swinging pivot; the wind crank stays reachable in all three positions',async t=>{
  await R.init();
  const world=new R.World({x:0,y:0,z:0});
  const material=new MeshBasicMaterial({side:DoubleSide});
  const capsule=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  let hits=0, openings=0, maxError=0;
  try {
    for(const kind of ['bell','wind']){
      const parts=buildStationControl(kind);
      const pivot=new Vector3(...alphaWorld(stationControlPivots[kind]));
      const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pivot.x,pivot.y,pivot.z));
      const draws=[], shapes=[];
      for(const p of parts){
        if(p.contact){
          shapes.push(world.createCollider(R.ColliderDesc.trimesh(p.contact.vertices,p.contact.indices),body));
          draws.push(new Mesh(p.geometry,material));
        }else assert.equal(p.finish,'rope','the loose cord alone yields');
      }
      for(const [i,angle] of (kind==='bell'?[0,.11,-.15]:[0,.7,1.4]).entries()){
        const q=new Quaternion().setFromAxisAngle(kind==='bell'?new Vector3(0,0,1):new Vector3(0,1,0),angle);
        body.setNextKinematicRotation(q);world.step();
        for(const mesh of draws){mesh.quaternion.copy(q);mesh.position.copy(pivot);mesh.updateMatrixWorld(true);}
        const samples=kind==='bell'
          ?[[0,-1.65,.4],[0,-.78,.4],[.19,-.85,.4],[.09,-1.25,.4],[0,-1.25,.4]]
          :[[.3,0,.6],[.6,0,.7],[0,0,.3],[.24,.13,.5],[.25,-.15,.5]];
        for(const [j,sample] of samples.entries()){
          const from=new Vector3(...sample).applyQuaternion(q).add(pivot), dir=new Vector3(0,0,-1).applyQuaternion(q);
          const draw=new Raycaster(from,dir,0,1.1).intersectObjects(draws,false)[0];
          const distances=shapes.map(c=>c.castRay(new R.Ray(from,dir),1.1,false)).filter(d=>d>=0);
          if(j>=3){assert.ok(!draw&&!distances.length,kind+' open gap');openings++;}
          else{
            assert.ok(draw&&distances.length,kind+' solid '+j);
            const delta=Math.abs(draw.distance-Math.min(...distances));
            assert.ok(delta<.00004,kind+' '+delta);
            maxError=Math.max(maxError,delta);hits++;
          }
        }
        if(kind==='wind'){
          const grip=new Vector3(.6,0,.4).applyQuaternion(q).add(pivot);
          const target=new Vector3(...alphaWorld(alphaActionTarget(kind,i)));
          assert.ok(grip.distanceTo(target)<1e-8);
          const operator={x:target.x+.5,y:target.y-.12,z:target.z};
          assert.equal(shapes.some(s=>s.intersectsShape(capsule,operator,{x:0,y:0,z:0,w:1})),false);
        }
      }
      world.removeRigidBody(body);parts.forEach(p=>p.geometry.dispose());
    }
    let angle=0;for(let i=0;i<130;i++)angle=stationControlAngle('wind',angle,1/60,100,2);
    assert.equal(angle,1.4);
    assert.equal(stationControlAngle('bell',.1,1/60,4,0),0);
    t.diagnostic(JSON.stringify({hits,openings,maxError}));
  }finally{world.free();material.dispose();}
});

test('both shelf lanterns rest on the installed plank, keeping the paper above a separate solid base',async t=>{
  const {createAlphaRack}=await import('./alpha-station-structures.ts');
  const {alphaLanternGeometry}=await import('./alpha-art.ts');
  const {rackPosition,shelfLanternPosition,shelfLanternGrip,lanternHandleHeight}=await import('./alpha-lantern-layout.ts');
  await R.init();
  const rack=createAlphaRack(), lantern=alphaLanternGeometry();
  const material=new MeshBasicMaterial({side:DoubleSide});
  const world=new R.World({x:0,y:0,z:0});
  try{
    const surfaces=rack.map(p=>{const mesh=new Mesh(p.geometry,material);mesh.position.set(...rackPosition);mesh.updateMatrixWorld();return mesh;});
    const foot=lantern.find(p=>p.finish==='darkwood');
    assert.ok(foot);
    foot.geometry.computeBoundingBox();
    for(const i of [0,1]){
      const [x,y,z]=shelfLanternPosition(i);
      const base=world.createCollider(R.ColliderDesc.convexHull(foot.geometry.attributes.position.array).setTranslation(x,y,z));
      const wood=new Mesh(foot.geometry,material);wood.position.set(x,y,z);wood.updateMatrixWorld();
      for(const [dx,dz] of [[0,0],[.13,0],[-.13,0],[0,.12],[0,-.1]]){
        const from=new Vector3(x+dx,y+.25,z+dz), down=new Vector3(0,-1,0);
        const ray=new Raycaster(from,down,0,.4), board=ray.intersectObjects(surfaces,false)[0], visible=ray.intersectObject(wood,false)[0];
        assert.ok(board&&visible);
        assert.ok(Math.abs(board.point.y-(y+foot.geometry.boundingBox.min.y))<.00002);
        const distance=base.castRay(new R.Ray(from,down),.4,true);
        assert.ok(distance>=0&&Math.abs(visible.distance-distance)<.00002);
      }
      assert.equal(base.castRay(new R.Ray({x:x+.4,y:y+.35,z},{x:-1,y:0,z:0}),.8,true),-1);
      const oldFoot=83.3+foot.geometry.boundingBox.min.y;
      assert.ok((y+foot.geometry.boundingBox.min.y)-oldFoot>.03);
      if(i===0)assert.deepEqual(shelfLanternGrip(),[x,y+lanternHandleHeight,z]);
    }
  }finally{world.free();material.dispose();[...rack,...lantern].forEach(p=>p.geometry.dispose());}
});
