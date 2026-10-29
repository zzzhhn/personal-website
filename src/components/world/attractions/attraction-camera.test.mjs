import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { attractionCameraPose, attractionLook, resetAttractionLook, turnAttractionLook, zoomAttractionLook } from './attraction-camera.ts';
import { coasterRidePose, COASTER_INVERSION, coasterDistanceAt, COASTER_DURATION } from './coaster-track.ts';
import { orbitDirection } from '../actor-physics.ts';

test('the same drag delta has the walking camera direction in orbit and first person', () => {
  for (const firstPerson of [false, true]) for (const yaw of [-2, -.5, .8, 2.4]) {
    const pitch = .45, pivot = new Vector3(5, 3, -8), direction = new Vector3(...orbitDirection(yaw, pitch));
    const base = { ...coasterRidePose(0, firstPerson ? 'first-person' : 'comfort'), firstPerson,
      orientation: undefined, cameraUp: [0, 1, 0], cameraPosition: (firstPerson ? pivot : pivot.clone().addScaledVector(direction, 8)).toArray(),
      cameraTarget: (firstPerson ? pivot.clone().sub(direction) : pivot).toArray() };
    for (const dx of [-.2, .2]) for (const dy of [-.12, .12]) {
      resetAttractionLook(); turnAttractionLook(dx, dy);
      const pose = attractionCameraPose(base);
      const expected = new Vector3(...orbitDirection(yaw + dx, pitch + dy));
      const actual = new Vector3(...pose.cameraPosition).sub(new Vector3(...pose.cameraTarget)).normalize();
      assert.ok(actual.distanceTo(expected) < 1e-8, `firstPerson=${firstPerson}, yaw=${yaw}, delta=${dx},${dy}`);
    }
  }
  resetAttractionLook();
});

test('full orbit during a real inversion changes the view without moving the rider or train', () => {
  const base=coasterRidePose(COASTER_INVERSION.top,'chase'),original=structuredClone(base);
  for(let yaw=-Math.PI;yaw<=Math.PI;yaw+=.2)for(const pitch of[-1,0,1]){
    const pose=attractionCameraPose(base,{yaw,pitch,zoom:.8});
    assert.ok([...pose.cameraPosition,...pose.cameraTarget].every(Number.isFinite));
    assert.deepEqual(pose.seat,base.seat); assert.deepEqual(pose.orientation,base.orientation);
    assert.ok(new Vector3(...pose.cameraPosition).distanceTo(new Vector3(...pose.cameraTarget))>1);
  }
  assert.deepEqual(base,original);
});
test('first-person head turn preserves its eye point even when inverted', () => {
  const base=coasterRidePose(COASTER_INVERSION.top,'first-person');
  const turned=attractionCameraPose(base,{yaw:Math.PI/2,pitch:.4,zoom:1.6});
  assert.deepEqual(turned.cameraPosition,base.cameraPosition);
  assert.ok(new Vector3(...turned.cameraTarget).distanceTo(new Vector3(...base.cameraTarget))>4);
  assert.deepEqual(turned.cameraUp,base.cameraUp);
});
test('close third-person orbit stays on the train passenger side through inversions', () => {
  for (const u of [.02,.11,.25,.38,COASTER_INVERSION.top,.8]) for(const pitch of [-1.15,0,1.15]) {
    const base=coasterRidePose(u,'chase');
    const pose=attractionCameraPose(base,{yaw:.9,pitch,zoom:.45});
    const up=new Vector3(0,1,0).applyQuaternion(new Quaternion(...base.orientation));
    const offset=new Vector3(...pose.cameraPosition).sub(new Vector3(...pose.seat));
    assert.ok(offset.dot(up)>=1.32-1e-8);
    assert.deepEqual(pose.cameraUp,[0,1,0]);
  }
});

test('tiny drags, pitch changes and the yaw wrap are continuous throughout the complete loop', () => {
  const epsilon=1e-5;
  for(let i=0;i<=1000;i++) for(const view of ['chase','comfort']) {
    const base=coasterRidePose(i/1000,view),length=new Vector3(...base.cameraPosition).distanceTo(new Vector3(...base.cameraTarget));
    for(const zoom of [.45,1,1.8]) for(const yaw of [-Math.PI,-1.43,0,1.43,Math.PI]) for(const pitch of [-1.15,0,1.15]) {
      const look={yaw,pitch,zoom},p=new Vector3(...attractionCameraPose(base,look).cameraPosition);
      const q=new Vector3(...attractionCameraPose(base,{...look,yaw:yaw+epsilon,pitch:pitch+epsilon}).cameraPosition);
      // A fixed seat-side fold is non-expansive, including directly under the
      // train. Two rotations bound displacement by radius * (|dyaw|+|dpitch|).
      assert.ok(p.distanceTo(q)<=Math.max(4.2,length*zoom)*epsilon*2+1e-7, `u=${i/1000}, ${view}, ${JSON.stringify(look)}`);
    }
    const left=attractionCameraPose(base,{yaw:-Math.PI,pitch:0,zoom:1});
    const right=attractionCameraPose(base,{yaw:Math.PI,pitch:0,zoom:1});
    assert.ok(new Vector3(...left.cameraPosition).distanceTo(new Vector3(...right.cameraPosition))<1e-8);
  }
});

test('first-person head look and explicit reset/view switching preserve their original contracts for a whole ride', () => {
  for(let seconds=0;seconds<=COASTER_DURATION;seconds+=.5) {
    const u=coasterDistanceAt(seconds),base=coasterRidePose(u,'first-person');
    for(const yaw of [-Math.PI,-1.43,0,1.43,Math.PI]) for(const pitch of [-1.15,0,1.15]) {
      const pose=attractionCameraPose(base,{yaw,pitch,zoom:1.8});
      const up=new Vector3(...base.cameraUp),direction=new Vector3(...base.cameraTarget).sub(new Vector3(...base.cameraPosition));
      direction.applyAxisAngle(up,-yaw);
      direction.applyAxisAngle(new Vector3().crossVectors(up,direction).normalize(),pitch);
      const expected=new Vector3(...base.cameraPosition).add(direction);
      assert.deepEqual(pose.cameraPosition,base.cameraPosition);
      assert.deepEqual(pose.cameraUp,base.cameraUp);
      assert.ok(new Vector3(...pose.cameraTarget).distanceTo(expected)<1e-8);
    }
    for(const view of ['chase','first-person','comfort','chase']) {
      turnAttractionLook(1.43,-1.15); zoomAttractionLook(3);
      resetAttractionLook(); // Same action used by the view buttons and reset.
      const pose=coasterRidePose(u,view);
      assert.deepEqual(attractionCameraPose(pose),attractionCameraPose(pose,{yaw:0,pitch:0,zoom:1}));
      assert.deepEqual(attractionLook,{yaw:0,pitch:0,zoom:1});
    }
  }
});

test('an authored view passing through world vertical does not flip its third-person pitch axis', () => {
  const seat=[0,0,0],target=[0,1.02,0],look={yaw:.7,pitch:1.15,zoom:1.8};
  const at=x=>attractionCameraPose({seat,yaw:0,orientation:[0,0,0,1],cameraUp:[0,1,0],
    cameraPosition:[x,9.02,0],cameraTarget:target,firstPerson:false,fov:58},look);
  assert.ok(new Vector3(...at(-1e-6).cameraPosition).distanceTo(new Vector3(...at(1e-6).cameraPosition))<1e-4);
  assert.ok(at(0).cameraPosition.every(Number.isFinite));
  // Exercise the actual moving source as well, including its near-vertical
  // camera at about 99.3 s. Previously the extreme view jumped over 10 m/frame.
  for(const look of [{yaw:0,pitch:0,zoom:1},{yaw:1.43,pitch:0,zoom:1},
    {yaw:-1.43,pitch:1.15,zoom:1.8},{yaw:Math.PI,pitch:-1.15,zoom:.45}]) {
    let previous=null;
    for(let seconds=0;seconds<=COASTER_DURATION;seconds+=1/60) {
      const pose=attractionCameraPose(coasterRidePose(coasterDistanceAt(seconds),'chase'),look);
      const camera=new Vector3(...pose.cameraPosition);
      if(previous) assert.ok(camera.distanceTo(previous)<2, `camera step at ${seconds}: ${JSON.stringify(look)}`);
      previous=camera;
    }
  }
});
test('manual view remains bounded, ignores invalid input and resets explicitly', () => {
  resetAttractionLook(); turnAttractionLook(30,100); zoomAttractionLook(900);
  assert.ok(Math.abs(attractionLook.yaw)<=Math.PI); assert.equal(attractionLook.pitch,1.15);assert.equal(attractionLook.zoom,1.8);
  const state={...attractionLook};turnAttractionLook(NaN,1);zoomAttractionLook(Infinity);assert.deepEqual(attractionLook,state);
  resetAttractionLook();const base=coasterRidePose(.5,'comfort');assert.equal(attractionCameraPose(base),base);
});
