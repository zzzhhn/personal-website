import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { attractionCameraPose, attractionLook, resetAttractionLook, turnAttractionLook, zoomAttractionLook } from './attraction-camera.ts';
import { coasterRidePose, COASTER_INVERSION } from './coaster-track.ts';

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
test('close third-person orbit stays above its pivot and outside the seat envelope', () => {
  for (const u of [.02,.11,.25,.38,COASTER_INVERSION.top,.8]) for(const pitch of [-1.15,0,1.15]) {
    const base=coasterRidePose(u,'chase');
    const pose=attractionCameraPose(base,{yaw:.9,pitch,zoom:.45});
    const offset=new Vector3(...pose.cameraPosition).sub(new Vector3(...pose.cameraTarget));
    assert.ok(offset.length()>=4.2-1e-8);
    assert.ok(offset.clone().normalize().dot(new Vector3(...pose.cameraUp))>=Math.sin(.12)-1e-8);
  }
});
test('manual view remains bounded, ignores invalid input and resets explicitly', () => {
  resetAttractionLook(); turnAttractionLook(30,100); zoomAttractionLook(900);
  assert.ok(Math.abs(attractionLook.yaw)<=Math.PI); assert.equal(attractionLook.pitch,1.15);assert.equal(attractionLook.zoom,1.8);
  const state={...attractionLook};turnAttractionLook(NaN,1);zoomAttractionLook(Infinity);assert.deepEqual(attractionLook,state);
  resetAttractionLook();const base=coasterRidePose(.5,'comfort');assert.equal(attractionCameraPose(base),base);
});
