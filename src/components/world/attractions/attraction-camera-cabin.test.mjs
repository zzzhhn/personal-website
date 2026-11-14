import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { AttractionCabinCamera } from './attraction-camera-cabin.ts';
import { attractionCameraPose, attractionCabinFov, ATTRACTION_CABIN_FOV, AttractionCameraOrientation,
  attractionLook, resetAttractionLook, turnAttractionLook } from './attraction-camera.ts';
import { coasterRidePose, coasterFrame, coasterDistanceAt, COASTER_DURATION, COASTER_LENGTH,
  COASTER_DEFAULT_VIEW, coasterVisibleView } from './coaster-track.ts';
import { THRILL_CABIN_EYE_HEIGHT } from './coaster-thrill-frame.ts';
import { createCoasterCar, createCoasterStructure } from './coaster-geometry.ts';
import { COASTER_CAR_PANELS } from './coaster-access.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { cameraCollisionRadius } from '../camera-collision.ts';

await R.init();
const identity={x:0,y:0,z:0,w:1};
const poseAt=x=>({seat:[x,0,0],orientation:[0,0,0,1],yaw:0,firstPerson:true,fov:66,
  cameraPosition:[x,2,0],cameraTarget:[x+8,2,0],cameraUp:[0,1,0]});

test('cabin guard checks the actual eye, inter-frame path and widened near plane without retracting it',()=>{
  const world=new R.World({x:0,y:0,z:0}),camera=new AttractionCabinCamera();
  try {
    world.createCollider(R.ColliderDesc.cuboid(.05,2,2).setTranslation(0,2,0));world.step();
    assert.equal(camera.step(world,R,poseAt(-1),.22,1/60,'ride').safe,true);
    const crossing=camera.step(world,R,poseAt(1),.22,1/60,'ride');
    assert.deepEqual([crossing.safe,crossing.reason],[false,'path'],'two clear endpoints do not prove a safe path');
    const embedded=camera.step(world,R,poseAt(0),.22,1/60,'new-ride');
    assert.deepEqual([embedded.safe,embedded.reason],[false,'overlap'],'new lifecycle must still check eye overlap');
    camera.clear();
    const clear=poseAt(.35),saved=structuredClone(clear);
    assert.equal(camera.step(world,R,clear,.22,1/60,'zoom').safe,true);
    assert.equal(camera.step(world,R,clear,.4,0,'zoom').safe,false,'zoom cannot shrink or bypass its safety sphere');
    assert.deepEqual(clear,saved);
    camera.clear();
    assert.equal(camera.step(world,R,poseAt(2),.22,.5,'resume').safe,true);
  } finally {world.free();}
});

test('default cabin keeps free head look and optical zoom at a fixed eye; legacy view tokens still work',()=>{
  assert.equal(COASTER_DEFAULT_VIEW,'first-person');
  assert.equal(coasterRidePose(.3).firstPerson,true);
  assert.equal(coasterVisibleView('comfort'),'chase');
  assert.equal(coasterRidePose(.3,'chase').firstPerson,false);
  assert.equal(coasterRidePose(.3,'comfort').firstPerson,false);
  resetAttractionLook();turnAttractionLook(1.43,.6);
  const saved={...attractionLook};
  try {
    for(const u of [0,.1,.25,.5,.8,1]){
      const base=coasterRidePose(u),eye=new Vector3(...base.cameraPosition);
      for(const zoom of [.45,1,1.8]){
        const pose=attractionCameraPose(base,{...saved,zoom});
        assert.deepEqual(pose.cameraPosition,base.cameraPosition);
        assert.deepEqual(pose.seat,base.seat);assert.deepEqual(pose.orientation,base.orientation);
        assert.equal(pose.fov,attractionCabinFov(base.fov,zoom));
        assert.ok(pose.fov>=ATTRACTION_CABIN_FOV.min&&pose.fov<=ATTRACTION_CABIN_FOV.max);
        const localDirection=new Vector3(...pose.cameraTarget).sub(eye).normalize()
          .applyQuaternion(new Quaternion(...base.orientation).invert());
        const expected=new Vector3(1,0,0).applyAxisAngle(new Vector3(0,1,0),-saved.yaw);
        expected.applyAxisAngle(new Vector3().crossVectors(new Vector3(0,1,0),expected).normalize(),saved.pitch);
        assert.ok(localDirection.distanceTo(expected)<1e-8,'track motion must not recentre the manual look');
      }
      for(const view of ['chase','first-person','comfort','first-person'])attractionCameraPose(coasterRidePose(u,view));
      assert.deepEqual(attractionLook,saved,'view calculations cannot clear the user input');
    }
    assert.ok(attractionCabinFov(66,.45)<66&&attractionCabinFov(66,1.8)>66);
  } finally {resetAttractionLook();}
});

const meshDescriptor=geometry=>{
  const vertices=new Float32Array(geometry.getAttribute('position').array);
  const indices=geometry.index?new Uint32Array(geometry.index.array):Uint32Array.from({length:vertices.length/3},(_,i)=>i);
  return R.ColliderDesc.trimesh(vertices,indices);
};

test('real full-loop cabin eye and near plane clear visible structures, production colliders and all three actual cars',t=>{
  // One worst-case sphere covers every yaw/pitch, both FOV endpoints, portrait,
  // ordinary landscape and 32:9. It includes the eye-to-near-plane distance.
  const aspects=[9/16,16/9,1710/931,32/9],near=.1;
  const envelope=Math.max(...aspects.map(aspect=>cameraCollisionRadius(near,ATTRACTION_CABIN_FOV.max,aspect)));
  assert.ok(envelope>=.22);
  const structure=createCoasterStructure(true),carGeometry=createCoasterCar();
  const world=new R.World({x:0,y:0,z:0}),carWorld=new R.World({x:0,y:0,z:0}),labels=new Map(),reports=[];
  try {
    for(const [i,c] of structure.colliders.entries()){
      const collider=world.createCollider(coasterColliderDescriptor(R,c));labels.set(collider.handle,`production-${i}`);
    }
    for(const [name,geometry] of [['visible-steel',structure.steel],['visible-glow',structure.glow]]){
      const collider=world.createCollider(meshDescriptor(geometry));labels.set(collider.handle,name);
    }
    world.step();
    const cars=[0,1,2].map(()=>({mesh:carWorld.createCollider(meshDescriptor(carGeometry)),
      panels:COASTER_CAR_PANELS.map(p=>carWorld.createCollider(R.ColliderDesc.cuboid(...p.size.map(v=>v/2))))}));
    const localEye=new Vector3(0,THRILL_CABIN_EYE_HEIGHT,0),sphere=new R.Ball(envelope);
    for(const fps of [30,60,120]){
      const guard=new AttractionCabinCamera(),orientation=new AttractionCameraOrientation();
      let previous=null,maxWorldStep=0,maxSeatResidual=0,maxAngle=0,samples=0;
      const frames=Math.ceil(COASTER_DURATION*fps);
      for(let index=0;index<=frames;index++){
        const seconds=Math.min(index/fps,COASTER_DURATION),u=coasterDistanceAt(seconds),frame=coasterFrame(u);
        const look={yaw:Math.PI*Math.sin(seconds*.3),pitch:1.15*Math.sin(seconds*.2),zoom:1.125+.675*Math.sin(seconds*.4)};
        const base=coasterRidePose(u),pose=attractionCameraPose(base,look),eye=new Vector3(...pose.cameraPosition);
        assert.ok(eye.distanceTo(frame.point.clone().add(localEye.clone().applyQuaternion(frame.rotation)))<1e-9);
        const overlap=world.intersectionWithShape(eye,identity,sphere);
        assert.equal(overlap,null,`static ${labels.get(overlap?.handle)} at ${seconds}s/${fps}Hz`);
        const result=guard.step(world,R,pose,envelope,1/fps,'full-loop');
        assert.equal(result.safe,true,`cabin ${result.reason} at ${seconds}s/${fps}Hz`);
        assert.ok(result.position.distanceTo(eye)<1e-12,'safe output must not introduce collision correction');
        // Reproduce WorldIntentCoaster's three car transforms in the front car's
        // frame. Test real mesh (including restraint bars) and solid panel volume.
        const inverse=frame.rotation.clone().invert();
        cars.forEach((car,i)=>{
          const f=coasterFrame(u-i*3.55/COASTER_LENGTH),position=f.point.clone().sub(frame.point).applyQuaternion(inverse);
          const rotation=inverse.clone().multiply(f.rotation);
          car.mesh.setTranslation(position);car.mesh.setRotation(rotation);
          car.panels.forEach((panel,j)=>{
            panel.setTranslation(new Vector3(...COASTER_CAR_PANELS[j].at).applyQuaternion(rotation).add(position));
            panel.setRotation(rotation);
          });
        });
        carWorld.step();
        assert.equal(carWorld.intersectionWithShape(localEye,identity,sphere),null,`car/restraint at ${seconds}s/${fps}Hz`);
        const up=orientation.step(pose,eye,new Vector3(...pose.cameraTarget),1/fps,'full-loop');
        const q=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(eye,new Vector3(...pose.cameraTarget),up));
        if(previous){
          maxWorldStep=Math.max(maxWorldStep,eye.distanceTo(previous.eye));
          const transported=previous.eye.clone().sub(previous.point).applyQuaternion(previous.rotation.clone().invert())
            .applyQuaternion(frame.rotation).add(frame.point);
          maxSeatResidual=Math.max(maxSeatResidual,eye.distanceTo(transported));
          maxAngle=Math.max(maxAngle,q.angleTo(previous.q));
        }
        previous={eye,point:frame.point,rotation:frame.rotation,q};samples++;
      }
      assert.ok(maxSeatResidual<1e-8,'no seat-relative position jump or orbital compression is permitted');
      assert.ok(maxAngle<Math.PI/2,'no world-up orientation cut');
      reports.push({fps,samples,envelope,maxWorldStep,maxSeatResidual,maxAngle,collisionCorrections:0});
    }
    t.diagnostic(JSON.stringify({near,aspects,fov:ATTRACTION_CABIN_FOV,reports}));
  } finally {world.free();carWorld.free();structure.steel.dispose();structure.glow.dispose();carGeometry.dispose();}
});
