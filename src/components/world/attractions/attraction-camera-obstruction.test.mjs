import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion } from 'three';
import { AttractionCameraObstruction, ATTRACTION_CAMERA_RECOVERY_SPEED } from './attraction-camera-obstruction.ts';
import { attractionCameraPose, attractionCameraSweepOrigin, resetAttractionLook } from './attraction-camera.ts';
import { coasterRidePose, coasterDistanceAt, COASTER_DURATION, coasterFrame } from './coaster-track.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { sweepCamera, cameraCollisionRadius } from '../camera-collision.ts';

await R.init();
const identity = { x: 0, y: 0, z: 0, w: 1 }, solid = c => !c.isSensor();
const vector = p => new Vector3(p.x, p.y, p.z);
const base = { seat: [0, 0, 0], yaw: 0, orientation: [0, 0, 0, 1], cameraUp: [0, 1, 0],
  cameraTarget: [0, 2, 0], cameraPosition: [0, 2, 10], firstPerson: false, fov: 58 };

test('recovery follows the current train-relative ray at a bounded rate; new walls compress immediately', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), camera = new AttractionCameraObstruction();
  try {
    let wall = world.createCollider(R.ColliderDesc.cuboid(2, 3, .1).setTranslation(0, 2, 5)); world.step();
    const first = camera.step(world, R, base, .22, 1/60, '1:riding');
    assert.ok(first.distance < 5); assert.equal(first.recovering, false);
    world.removeCollider(wall, true); world.step();
    const pose = { ...base, seat: [1,0,0], cameraTarget: [1,2,0], cameraPosition: [11,2,0],
      orientation: new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray() };
    const next = camera.step(world, R, pose, .22, 1/60, '1:riding');
    assert.equal(next.recovering, true);
    assert.ok(Math.abs(next.distance-first.distance-ATTRACTION_CAMERA_RECOVERY_SPEED/60)<1e-6);
    assert.ok(Math.abs(next.position.z)<1e-8, 'current input direction, no angular/world-position lerp');
    assert.ok(Math.abs(next.position.x-1-next.distance)<1e-8, 'moves with the current seat');
    for(let i=0;i<120;i++) camera.step(world,R,pose,.22,1/60,'1:riding');
    const restored = camera.step(world,R,pose,.22,1/60,'1:riding');
    assert.ok(Math.abs(restored.distance-10)<1e-6); assert.equal(restored.recovering,false);
    wall=world.createCollider(R.ColliderDesc.cuboid(.1,3,2).setTranslation(4,2,0));world.step();
    const compressed=camera.step(world,R,pose,.22,1/60,'1:riding');
    assert.equal(compressed.forcedCompression,true);assert.ok(compressed.distance<3);
    assert.equal(compressed.distance,compressed.limit);
    assert.equal(world.intersectionWithShape(compressed.position,identity,new R.Ball(.22)),null);
    const invalidEase=attractionCameraSweepOrigin(pose).add(new Vector3(9,0,0));
    assert.ok(sweepCamera(world,R,attractionCameraSweepOrigin(pose),invalidEase,.22,undefined,solid).distance<3,
      'an eased point beyond this wall is not reachable along the current camera ray');
  } finally { world.free(); }
});

test('new ride/phase, reset, first person, view mode, exit, seek and stale frames cannot reuse old obstruction state', () => {
  const world = new R.World({ x:0,y:0,z:0 });
  try {
    for(const event of ['ride','phase','reset','first','mode','exit','seek','stale','zero']) {
      const camera=new AttractionCameraObstruction();
      const wall=world.createCollider(R.ColliderDesc.cuboid(2,3,.1).setTranslation(0,2,5));world.step();
      assert.ok(camera.step(world,R,base,.22,1/60,'1:riding').distance<5);
      world.removeCollider(wall,true);world.step();
      let pose=base,key='1:riding',delta=1/60;
      if(event==='ride')key='2:riding';
      if(event==='phase')key='1:stand';
      if(event==='reset')resetAttractionLook();
      if(event==='first'){
        const first={...base,firstPerson:true};
        assert.deepEqual(camera.step(world,R,first,.22,1/60,key).position.toArray(),first.cameraPosition);
      }
      if(event==='mode')pose={...base,fov:52};
      if(event==='exit')camera.clear();
      if(event==='seek')pose={...base,seat:[100,0,0],cameraTarget:[100,2,0],cameraPosition:[100,2,10]};
      if(event==='stale')delta=.5;
      if(event==='zero')delta=0;
      const result=camera.step(world,R,pose,.22,delta,key);
      assert.ok(Math.abs(result.distance-10)<1e-6,event);assert.equal(result.recovering,false,event);
    }
  } finally { world.free(); }
});

test('half-second release is frame-rate independent and live zoom remains collision checked', () => {
  const world=new R.World({x:0,y:0,z:0});
  try {
    for(const fps of [30,60,120]) {
      const camera=new AttractionCameraObstruction();
      const wall=world.createCollider(R.ColliderDesc.cuboid(2,3,.1).setTranslation(0,2,5));world.step();
      const start=camera.step(world,R,base,.22,1/fps,'1:riding').distance;
      world.removeCollider(wall,true);world.step();
      let end;
      for(let frame=0;frame<fps/2;frame++)end=camera.step(world,R,base,.22,1/fps,'1:riding');
      assert.ok(Math.abs(end.distance-start-ATTRACTION_CAMERA_RECOVERY_SPEED*.5)<1e-6);
      const post=world.createCollider(R.ColliderDesc.cuboid(2,3,.1).setTranslation(0,2,7));world.step();
      for(const distance of [4.2,18,4.2,18]) {
        const pose={...base,cameraPosition:[0,2,distance]};
        const actual=camera.step(world,R,pose,.22,1/fps,'1:riding');
        assert.equal(world.intersectionWithShape(actual.position,identity,new R.Ball(.22)),null);
        assert.ok(actual.distance<=actual.limit+1e-6);
      }
      world.removeCollider(post,true);world.step();
    }
  } finally {world.free();}
});

test('real complete rides keep every recovered near plane safe and quantify release versus forced compression', t => {
  const structure=createCoasterStructure(true),world=new R.World({x:0,y:0,z:0});
  const looks=[{yaw:0,pitch:0,zoom:1},{yaw:1.43,pitch:0,zoom:1},
    {yaw:-1.43,pitch:1.15,zoom:1.8},{yaw:Math.PI,pitch:-1.15,zoom:.45}];
  const reports=[],events=[];
  try {
    for(const c of structure.colliders)world.createCollider(coasterColliderDescriptor(R,c));
    world.createCollider(R.ColliderDesc.trimesh(structure.track.vertices,structure.track.indices));
    world.createCollider(R.ColliderDesc.trimesh(structure.relief.vertices,structure.relief.indices));world.step();
    for(const view of ['chase','comfort'])for(const look of looks){
      const camera=new AttractionCameraObstruction();
      let previous=null,oldPrevious=null,maxStep=0,maxStepAt=0,maxRelease=0,maxRawRelease=0,forced=0,recovery=0,samples=0,minHeight=Infinity;
      for(let seconds=0;seconds<=COASTER_DURATION;seconds+=1/60){
        const u=coasterDistanceAt(seconds),pose=attractionCameraPose(coasterRidePose(u,view),look),frame=coasterFrame(u);
        const radius=cameraCollisionRadius(.1,pose.fov,1710/931),origin=attractionCameraSweepOrigin(pose);
        const raw=sweepCamera(world,R,origin,new Vector3(...pose.cameraPosition),radius,undefined,solid);
        const result=camera.step(world,R,pose,radius,1/60,'1:riding'),point=vector(result.position);
        assert.equal(world.intersectionWithShape(point,identity,new R.Ball(radius)),null,`${seconds},${view},${JSON.stringify(look)}`);
        const height=point.clone().sub(new Vector3(...pose.seat)).dot(frame.up);minHeight=Math.min(minHeight,height);
        assert.ok(height>=1.32-1e-6,'recovery stays on the passenger side');
        const actualSweep=sweepCamera(world,R,origin,point,radius,undefined,solid);
        assert.ok(actualSweep.distance>=origin.distanceTo(point)-1e-5,'final rendered point itself is reachable');
        if(previous){
          const jump=point.distanceTo(previous),oldJump=vector(raw.position).distanceTo(oldPrevious);
          if(jump>maxStep){maxStep=jump;maxStepAt=seconds;}
          if(jump>2){
            assert.equal(result.forcedCompression,true,'large remaining steps must be hard compression');
            assert.ok(raw.hit!==null,'hard compression must be backed by a real static hit');
          }
          if(result.recovering){maxRelease=Math.max(maxRelease,jump);maxRawRelease=Math.max(maxRawRelease,oldJump);}
          if(view==='chase'&&look.zoom===1.8&&seconds>3.98&&seconds<3.99){
            assert.ok(oldJump>10);assert.ok(jump<.5);assert.equal(result.recovering,true);
            events.push({seconds,look,before:oldJump,after:jump,limit:result.limit,distance:result.distance,forced:result.forcedCompression});
          }
          if(view==='chase'&&look.yaw===1.43&&seconds>79.81&&seconds<79.83){
            assert.equal(result.forcedCompression,true);assert.ok(Math.abs(result.distance-result.limit)<1e-6);
            assert.ok(raw.hit!==null,'79.82 s is an actual obstruction, not a smoothing artefact');
            events.push({seconds,look,before:oldJump,after:jump,limit:result.limit,distance:result.distance,forced:result.forcedCompression});
          }
        }
        forced+=+result.forcedCompression;recovery+=+result.recovering;samples++;
        previous=point;oldPrevious=vector(raw.position);
      }
      reports.push({view,look,samples,forced,recovery,maxStep,maxStepAt,maxRelease,maxRawRelease,minHeight});
    }
    t.diagnostic(JSON.stringify({events,reports}));
  } finally {world.free();structure.steel.dispose();structure.glow.dispose();}
});
