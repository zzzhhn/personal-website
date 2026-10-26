import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, Box3, LoopOnce, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { VEHICLE_DOORS, vehicleDoorQuaternion, vehicleDoorStanding } from './WorldVehicleDoors.ts';
import { GuideDrivingPose, guideVehicleProgress, guideVehicleSample, GUIDE_VEHICLE_TRANSITION_S } from './WorldGuideVehicle.ts';
import { GuideSeatContact } from './WorldGuideSeat.ts';
import { skinnedWorldPoint } from './WorldGuideStop.ts';
import { glb, loadGuide } from '../../../tools/world/guide/boot-analysis.mjs';

test('mirrored butterfly doors both lift outwards and upwards; ordinary doors remain upright', () => {
  for(const id of Object.keys(VEHICLE_DOORS))for(const side of [-1,1]){
    const p=new Vector3(-.7,-.25,0),q=new Quaternion();
    const moved=p.clone().applyQuaternion(vehicleDoorQuaternion(id,side,1,q));
    assert.ok(moved.z*side>.2,`${id} ${side}: outward swing`);
    if(id==='coupe')assert.ok(moved.y>p.y+.4,`butterfly rises on side ${side}`);
    else assert.ok(Math.abs(moved.y-p.y)<1e-10);
    vehicleDoorQuaternion(id,side,0,q);assert.equal(q.angleTo(new Quaternion()),0);
    assert.ok(Math.abs(vehicleDoorStanding(id,side)[2])>2);
  }
});

test('door fully clears before body transfer and closes after seating, in both directions', () => {
  for(let i=0;i<=1000;i++){
    const t=i/1000,a=guideVehicleSample('enter',t),b=guideVehicleSample('exit',1-t);
    assert.ok(Math.abs(a.doorOpen-b.doorOpen)<1e-10);
    assert.equal(a.opacity,1,'visible throughout, never fade through closed shell');
    if(a.transfer>0&&a.transfer<1)assert.equal(a.doorOpen,1);
    if(a.doorOpen<1&&t>.5)assert.equal(a.transfer,1);
  }
  assert.equal(guideVehicleSample('enter',1).doorOpen,0);
  assert.equal(guideVehicleSample('exit',1).doorOpen,0);
  assert.equal(guideVehicleProgress('enter',4,4),.3,'long approaches do not prematurely open');
  assert.equal(guideVehicleProgress('enter',4+.7*GUIDE_VEHICLE_TRANSITION_S,4),1);
});

test('six shipped GLBs keep two independent door pivots outside the baked body', () => {
  for(const [id,asset] of Object.entries({offroad:'G25',coupe:'G26',van:'G27'}))for(const suffix of ['', '-lod1']){
    const {json}=glb(new URL(`../../../public/assets/world/vehicles/${asset}${suffix}.glb`,import.meta.url));
    const descendants=index=>[index,...(json.nodes[index].children??[]).flatMap(descendants)];
    const bodyIndex=json.nodes.findIndex(n=>n.name===`${asset}_body`);
    for(const [name,side] of [['door-left',-1],['door-right',1]]){
      const index=json.nodes.findIndex(n=>n.name===name);assert.ok(index>=0);
      assert.ok(!descendants(bodyIndex).includes(index),'door not swallowed by fixed-body bake');
      const node=json.nodes[index],pivot=VEHICLE_DOORS[id].hinge;
      node.translation.forEach((x,i)=>assert.ok(Math.abs(x-pivot[i]*(i===2?side:1))<1e-5));
      assert.ok(descendants(index).some(i=>json.nodes[i].mesh!==undefined));
    }
  }
});

test('actual seated G24 fits cabin height and footwell without changing its model scale', async () => {
  const {gltf:{scene,animations}}=await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
  const mixer=new AnimationMixer(scene),contact=new GuideSeatContact(scene,animations),pose=new GuideDrivingPose(scene);
  const clip=animations.find(c=>c.name==='SitDown'),action=mixer.clipAction(clip).setLoop(LoopOnce,1);
  action.clampWhenFinished=true;action.play();mixer.update(clip.duration);
  const originals=[];scene.traverse(o=>{if(o.isBone)originals.push([o,o.quaternion.clone()]);});
  const limits={offroad:{floor:.55,ceiling:1.735},coupe:{floor:.17,ceiling:1.225},van:{floor:.79,ceiling:1.955}};
  for(const id of Object.keys(limits)){
    pose.restore();pose.apply(id,1);scene.updateWorldMatrix(true,true);
    const posterior=contact.sample(new Vector3()),box=new Box3(),point=new Vector3();
    scene.traverse(m=>{if(m instanceof SkinnedMesh)for(let i=0;i<m.geometry.attributes.position.count;i++)
      box.expandByPoint(skinnedWorldPoint(m,i,point).sub(posterior));});
    const top=box.max.y+VEHICLE_DOORS[id].seat[1],sole=box.min.y+VEHICLE_DOORS[id].seat[1];
    assert.ok(top<limits[id].ceiling-.012,`${id}: head ${top} exceeds interior ceiling`);
    assert.ok(sole>=limits[id].floor-.012&&sole<limits[id].floor+.045,`${id}: boot ${sole} misses footwell`);
    assert.deepEqual(scene.scale.toArray(),[1,1,1]);
  }
  pose.restore();for(const [bone,q] of originals)assert.deepEqual(bone.quaternion.toArray(),q.toArray(),'exit restores source bones');
  mixer.stopAllAction();mixer.uncacheRoot(scene);
});
