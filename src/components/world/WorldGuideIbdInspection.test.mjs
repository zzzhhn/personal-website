/** CPU-only G24 hierarchy and world matrices, with no WebGL, mesh decoding, browser or new assets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone,Group,Matrix4,PropertyBinding,Vector3 } from 'three';
import { GuideIbdInspectionLayer } from './WorldGuideIbdInspection.ts';
import { ibdCoilInspectAnchor } from './attractions/ibd-coil-inspection.ts';
import { createIbdYardGame } from './attractions/ibd-yard-game.ts';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import { CRANE_STAND,craneGripTarget } from './attractions/ibd-crane-control.ts';
import { advanceIbdInspectionAction,beginIbdInspectionAction,cancelIbdInspectionAction,ibdInspectionActor,
  ibdInspectionBody,ibdInspectionVisualSockets,IBD_INSPECTION_TIMING } from './attractions/ibd-inspection-motion.ts';
function rig(){
  const file=readFileSync(new URL('../../../public/assets/world/guide/G24.glb',import.meta.url));
  const gltf=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString()),joints=new Set(gltf.skins.flatMap(s=>s.joints));
  const nodes=gltf.nodes.map((n,i)=>{
    const o=joints.has(i)?new Bone():new Group();o.name=n.name??'';
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
    if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);return o;
  });
  gltf.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
  const scene=new Group();gltf.scenes[gltf.scene??0].nodes.forEach(i=>scene.add(nodes[i]));scene.updateWorldMatrix(true,true);return scene;
}
const anchor={stand:[0,0,0],yaw:0,leftTarget:[.38,1,-.12],rightTarget:[.38,1,.16]};
const action=(kind,patch={})=>({id:9,kind,phase:'perform',elapsed:.6,contactAt:.6,duration:1.2,anchor:structuredClone(anchor),
  reachStartAt:0,recoverDuration:.6,committed:false,contactWait:0,actorMode:'guide',...patch});
const distance=(a,b)=>new Vector3(...a).distanceTo(new Vector3(...b));
const count=scene=>{let n=0;scene.traverse(()=>n++);return n;};
test('real G24 palms reach both crane levers throughout their articulated travel without changing the feet',()=>{
  const scene=rig(),layer=new GuideIbdInspectionLayer(scene);
  for(const left of[-.18,0,.18])for(const right of[0,.18])for(const yaw of[-.06,0,.06]){
    layer.restore();scene.position.set(...CRANE_STAND);scene.rotation.y=Math.PI/2+yaw;scene.updateWorldMatrix(true,true);
    const a=action('crane-control',{...IBD_INSPECTION_TIMING['crane-control'],elapsed:.6,committed:true,
      anchor:{stand:CRANE_STAND,yaw:Math.PI/2,leftTarget:craneGripTarget(0,left),rightTarget:craneGripTarget(1,right)}});
    const before=scene.position.toArray(),s=layer.apply(a,null);
    assert.equal(s.reachable,true,`${left}/${right}/${yaw}`);assert.ok(s.contactError<=.025,`${left}/${right}/${yaw}: ${s.contactError}`);
    assert.deepEqual(scene.position.toArray(),before);
  }layer.dispose();
});
test('real G24 holds the coil torch at every approach heading and reaches a stable inspection pose',()=>{
  const scene=rig(),layer=new GuideIbdInspectionLayer(scene),game=createIbdYardGame();
  for(const x of[-101,-100,-99]){
    const position=[x,1.1+PLAYER_CENTER_HEIGHT,-178];
    const anchor=ibdCoilInspectAnchor(game,{kind:'scan',station:'coil-front',slot:'coil-front'},position);
    scene.position.set(...anchor.stand);scene.rotation.y=anchor.yaw;scene.updateWorldMatrix(true,true);
    const a=action('coil-check',{...IBD_INSPECTION_TIMING['coil-check'],anchor});
    for(const t of[0,.3,.6,1.5,2.5,2.8,3.1]){
      a.elapsed=t;const s=layer.apply(a,null);assert.equal(s.reachable,true,`${x}/${t}`);
      if(t>=.6&&t<=2.5)assert.ok(s.contactError<=.025,`${x}/${t}: ${s.contactError}`);
    }
    layer.restore();
  }
  layer.dispose();
});
test('real G24 left support and right push palms reach each contact and report actual world matrices',()=>{
  const scene=rig(),layer=new GuideIbdInspectionLayer(scene);
  for(const kind of['pickup','measure','return','empty']){
    const s=layer.apply(action(kind),kind==='measure'||kind==='return'?{spec:'M8'}:null);
    assert.equal(s.valid,true);assert.equal(s.reachable,true);assert.equal(s.sampledId,9);assert.equal(s.sampledElapsed,.6);
    assert.ok(s.leftContactError<=.025,`${kind} left ${s.leftContactError}`);assert.ok(s.rightContactError<=.025,`${kind} right ${s.rightContactError}`);
    for(const side of['left','right'])assert.ok(distance(s[`${side}Hand`],layer.arms[side].palm.getWorldPosition(new Vector3()).toArray())<1e-8);
  }layer.dispose();
});
test('only arm rotations change; bone lengths, lower-body world matrices and root remain exact; restore does not accumulate',()=>{
  const scene=rig(),layer=new GuideIbdInspectionLayer(scene),bones=[];scene.traverse(o=>{if(o.isBone)bones.push(o);});
  const before=bones.map(b=>({position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray(),matrix:b.matrixWorld.clone()}));
  const owned=new Set(Object.values(layer.arms).flatMap(a=>[a.upper,a.lower,a.hand]));
  const root=scene.matrixWorld.clone(),first=structuredClone(layer.apply(action('measure'),{spec:'M6'}));
  for(let i=0;i<25;i++)assert.ok(distance(layer.apply(action('measure'),{spec:'M6'}).leftHand,first.leftHand)<1e-8);
  bones.forEach((b,i)=>{
    assert.deepEqual(b.position.toArray(),before[i].position);assert.deepEqual(b.scale.toArray(),before[i].scale);
    if(!owned.has(b))assert.deepEqual(b.quaternion.toArray(),before[i].quaternion,b.name);
    if(/^(pelvis|thigh|shin|foot)/.test(b.name))assert.ok(b.matrixWorld.elements.every((v,j)=>Math.abs(v-before[i].matrix.elements[j])<1e-8),b.name);
  });assert.deepEqual(scene.matrixWorld.elements,root.elements);
  layer.restore();bones.forEach((b,i)=>assert.deepEqual(b.quaternion.toArray(),before[i].quaternion));layer.dispose();
});
test('transformed and uniformly scaled roots reach world targets; unreachable targets stay honest without stretching',()=>{
  const scene=rig();scene.position.set(5,.2,8);scene.rotation.y=1.2;scene.scale.setScalar(.9);scene.updateWorldMatrix(true,true);
  const layer=new GuideIbdInspectionLayer(scene),a=action('measure');
  for(const key of['leftTarget','rightTarget'])a.anchor[key]=scene.localToWorld(new Vector3(...anchor[key])).toArray();
  assert.ok(layer.apply(a,{spec:'M8'}).contactError<=.025);
  const lengths=Object.values(layer.arms).map(a=>[a.lower.position.length(),a.hand.position.length()]);
  a.anchor.rightTarget=[50,50,50];const s=layer.apply(a,{spec:'M8'});assert.equal(s.reachable,false);assert.ok(s.rightContactError>10);
  Object.values(layer.arms).forEach((a,i)=>assert.deepEqual([a.lower.position.length(),a.hand.position.length()],lengths[i]));layer.dispose();
});
test('builder presentation rail and caliper thumb-tab contacts are reachable for M6/M8 and the full jaw travel',()=>{
  const scene=rig();scene.position.set(10,.1,-9.52);scene.rotation.y=Math.PI/2;scene.updateWorldMatrix(true,true);
  const layer=new GuideIbdInspectionLayer(scene);
  for(const [spec,radius]of[['M6',.14],['M8',.23]])for(const gap of[.18,.28,.46,.54]){
    const a=action('measure');
    a.anchor.leftTarget=[10+radius-.23,1.105,-12+1.92+radius*1.5*Math.sin(Math.PI/3)];
    a.anchor.rightTarget=[10-.23+gap,1.28,-12+2.21];
    const s=layer.apply(a,{spec});
    assert.equal(s.reachable,true,`${spec} gap ${gap}: ${JSON.stringify({left:s.leftContactError,right:s.rightContactError})}`);
    assert.ok(s.leftContactError<=.025,`${spec} left ${s.leftContactError}`);
    assert.ok(s.rightContactError<=.025,`${spec} right ${s.rightContactError}`);
  }layer.dispose();
});
test('M6/M8 contact stays within tolerance across the permitted stand and heading residuals',()=>{
  const scene=rig(),layer=new GuideIbdInspectionLayer(scene);
  for(const [spec,radius]of[['M6',.14],['M8',.23]])for(const gap of[.18,.54])for(const angle of[0,Math.PI/2,Math.PI,Math.PI*1.5])for(const yaw of[-.06,.06]){
    layer.restore();scene.position.set(10+.02*Math.cos(angle),.1,-9.52+.02*Math.sin(angle));scene.rotation.y=Math.PI/2+yaw;scene.updateWorldMatrix(true,true);
    const a=action('measure');a.anchor.leftTarget=[10+radius-.23,1.105,-12+1.92+radius*1.5*Math.sin(Math.PI/3)];
    a.anchor.rightTarget=[10-.23+gap,1.28,-12+2.21];
    const s=layer.apply(a,{spec});assert.equal(s.reachable,true);assert.ok(s.contactError<=.025,`${spec} ${gap} ${angle} ${yaw}: ${s.contactError}`);
  }layer.dispose();
});
test('attachment groups follow actual hands, disabled/dispose remove all added nodes and repeated enabling is clean',()=>{
  const scene=rig();scene.traverse(o=>{o.name=PropertyBinding.sanitizeNodeName(o.name);});const before=count(scene),layer=new GuideIbdInspectionLayer(scene);
  assert.equal(count(scene),before);const sample=new Group(),grip=new Group();layer.arms.left.palm.add(sample);layer.arms.right.palm.add(grip);
  for(let i=0;i<5;i++){
    layer.apply(action('pickup'),null);assert.equal(layer.arms.left.palm.parent,layer.arms.left.hand);assert.equal(count(scene),before+4);
    assert.ok(distance(sample.getWorldPosition(new Vector3()).toArray(),layer.sockets.leftHand)<1e-8);
    assert.equal(layer.apply(null,{spec:'M6'},false).valid,false);assert.equal(count(scene),before);
  }
  layer.apply(action('measure'),{spec:'M8'});layer.dispose();layer.dispose();assert.equal(count(scene),before);
  assert.equal(layer.apply(action('pickup'),null).valid,false);
  const missing=new GuideIbdInspectionLayer(new Group());assert.equal(missing.apply(action('empty'),null).valid,false);missing.dispose();
});
test('pickup/empty hands wait for mechanical presentation; return/empty clear before the reverse tray path',()=>{
  const layer=new GuideIbdInspectionLayer(rig());
  for(const kind of['pickup','empty']){
    const a=action(kind,{...IBD_INSPECTION_TIMING[kind],elapsed:0});const rest=structuredClone(layer.apply(a,null));
    a.elapsed=1.4;const waiting=layer.apply(a,null);
    assert.ok(distance(waiting.leftHand,rest.leftHand)<1e-8);assert.ok(distance(waiting.rightHand,rest.rightHand)<1e-8);
    a.elapsed=a.contactAt;assert.ok(layer.apply(a,null).contactError<=.025);
  }
  for(const kind of['return','empty']){
    const a=action(kind,{...IBD_INSPECTION_TIMING[kind],elapsed:IBD_INSPECTION_TIMING[kind].contactAt});
    layer.apply(a,{spec:'M6'});a.elapsed=a.contactAt+a.recoverDuration;
    const cleared=structuredClone(layer.apply(a,null));a.elapsed=a.duration;
    const end=layer.apply(a,null);assert.ok(distance(cleared.leftHand,end.leftHand)<1e-8);assert.ok(distance(cleared.rightHand,end.rightHand)<1e-8);
  }layer.dispose();
});
test('pause repeats an identical pose; real sampled G24 palms drive pickup, measurement, return and empty contacts',()=>{
  cancelIbdInspectionAction();ibdInspectionBody.carried=null;
  Object.assign(ibdInspectionActor,{position:[0,PLAYER_CENTER_HEIGHT,0],yaw:0,grounded:true,available:true,mode:'guide'});
  const layer=new GuideIbdInspectionLayer(rig());let contacts=0;
  for(const kind of['pickup','measure','return','empty']){
    assert.ok(beginIbdInspectionAction(kind,anchor,()=>{contacts++;if(kind==='pickup')ibdInspectionBody.carried={spec:'M6'};if(kind==='return')ibdInspectionBody.carried=null;}));
    for(let i=0;i<300&&ibdInspectionBody.action;i++){
      const s=layer.apply(ibdInspectionBody.action,ibdInspectionBody.carried);Object.assign(ibdInspectionVisualSockets,s);
      if(i===10){const frozen=structuredClone(s),elapsed=ibdInspectionBody.action.elapsed;
        for(let p=0;p<5;p++){advanceIbdInspectionAction(1/60,true);assert.deepEqual(layer.apply(ibdInspectionBody.action,ibdInspectionBody.carried),frozen);}
        assert.equal(ibdInspectionBody.action.elapsed,elapsed);
      }
      advanceIbdInspectionAction(1/60);
    }assert.equal(ibdInspectionBody.action,null,kind);
  }assert.equal(contacts,4);assert.equal(ibdInspectionBody.carried,null);layer.dispose();cancelIbdInspectionAction();
});
