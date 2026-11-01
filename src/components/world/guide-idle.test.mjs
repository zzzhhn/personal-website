import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group } from 'three';
import { GuideIdleLayer } from './WorldGuideIdle.ts';

function rig(){const root=new Group();for(const name of ['head','chest','spine','upperarm.L','upperarm.R','pelvis','foot.L','foot.R']){const b=new Bone();b.name=name;root.add(b);}return root;}
test('idle schedule deterministically visits five gestures without consecutive repeats',()=>{
  const run=()=>{const layer=new GuideIdleLayer(rig()),seen=[];let previous=null;
    for(let i=0;i<6000;i++){const gesture=layer.advance(1/60,true);if(gesture&&gesture!==previous)seen.push(gesture);previous=gesture;}return seen;};
  const a=run();assert.deepEqual(a,run());assert.equal(new Set(a).size,5);assert.ok(a.every((x,i)=>x!==a[i-1]));
});
test('idle affects upper body only, restores exactly and resets fully on an action or motion',()=>{
  const root=rig(),layer=new GuideIdleLayer(root);const transforms=root.children.map(b=>b.quaternion.clone());
  for(let i=0;i<450;i++)layer.advance(1/60,true);
  assert.equal(layer.gesture,'look-left');layer.apply();
  assert.ok(root.getObjectByName('head').quaternion.angleTo(transforms[0])>.1);
  for(const name of ['pelvis','foot.L','foot.R']){const b=root.getObjectByName(name);assert.equal(b.quaternion.angleTo(transforms[root.children.indexOf(b)]),0);assert.deepEqual(b.position.toArray(),[0,0,0]);}
  layer.restore();root.children.forEach((b,i)=>assert.ok(b.quaternion.angleTo(transforms[i])<1e-8));
  layer.advance(1/60,false);assert.equal(layer.gesture,null);assert.equal(layer.elapsed,0);assert.equal(layer.waiting,0);
  for(let i=0;i<300;i++)layer.advance(1/60,true);assert.equal(layer.gesture,null,'fresh full rest before next gesture');
});
