/** CPU-only real-rig transforms; no browser, WebGL, image or mesh decoding. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Group, Matrix4, PropertyBinding, Vector3 } from 'three';
import { GuideExchangeLayer } from './WorldGuideExchange.ts';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import { advanceExchangeBodyAction, beginExchangeBodyAction, cancelExchangeBodyAction, exchangeActor, exchangeBody,
  exchangeVisualSockets } from './alpha-exchange-motion.ts';
function rig() {
  const file = readFileSync(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url));
  const gltf = JSON.parse(file.subarray(20,20 + file.readUInt32LE(12)).toString());
  const joints = new Set(gltf.skins.flatMap(skin => skin.joints));
  const nodes = gltf.nodes.map((node, i) => {
    const object = joints.has(i) ? new Bone() : new Group(); object.name = node.name ?? '';
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    if (node.matrix) new Matrix4().fromArray(node.matrix).decompose(object.position,object.quaternion,object.scale);
    return object;
  });
  gltf.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const scene = new Group(); gltf.scenes[gltf.scene ?? 0].nodes.forEach(i => scene.add(nodes[i])); scene.updateWorldMatrix(true,true);
  return scene;
}
const action = (kind, committed = false, target = [.5,1,0]) => ({ id: 7, kind, phase: 'perform', elapsed: .5,
  duration: 1.1, contactAt: .5, anchor: { stand: [0,0,0], yaw: 0, target }, committed, contactWait: 0 });
const distance = (a,b) => new Vector3(...a).distanceTo(new Vector3(...b));

test('real G24 palms reach every contact kind and report id/time from the supplied pose', () => {
  const scene = rig(), layer = new GuideExchangeLayer(scene);
  for (const kind of ['pickup','insert','adjust','seal','ring','collect']) {
    const result = layer.apply(action(kind), kind === 'insert' ? 'ticket' : null);
    assert.equal(result.valid,true); assert.equal(result.sampledId,7); assert.equal(result.sampledElapsed,.5);
    assert.ok(result.contactError <= .1, `${kind} contact ${result.contactError}`);
    assert.ok(distance(result.rightHand,layer.arms.right.palm.getWorldPosition(new Vector3()).toArray()) < 1e-8);
  }
  layer.dispose();
});

test('root, pelvis, knees and solved feet stay fixed; restore is exact and repeated poses do not accumulate', () => {
  const scene = rig(), layer = new GuideExchangeLayer(scene), bones = [];
  scene.traverse(object => { if (object.isBone) bones.push(object); });
  const before = bones.map(bone => ({ position: bone.position.toArray(), rotation: bone.quaternion.toArray() }));
  const fixed = ['pelvis','shin.R','shin.L','foot.R','foot.L'].map(name => ({ node: scene.getObjectByName(name), matrix: scene.getObjectByName(name).matrixWorld.clone() }));
  const root = scene.matrixWorld.clone(), first = structuredClone(layer.apply(action('ring'),null));
  for (let i=0;i<30;i++) assert.ok(distance(layer.apply(action('ring'),null).rightHand,first.rightHand) < 1e-7);
  for (const {node,matrix} of fixed) assert.ok(node.matrixWorld.elements.every((value,i) => Math.abs(value-matrix.elements[i]) < 1e-7),node.name);
  assert.deepEqual(scene.matrixWorld.elements,root.elements);
  layer.restore();
  bones.forEach((bone,i) => { assert.deepEqual(bone.position.toArray(),before[i].position); assert.deepEqual(bone.quaternion.toArray(),before[i].rotation); });
  layer.dispose();
});

test('paper follows carrying ownership, never the contact timestamp; disabled restores and hides', () => {
  const scene = rig(), layer = new GuideExchangeLayer(scene);
  layer.apply(action('pickup'),null); assert.equal(layer.paper.visible,false);
  layer.apply(action('pickup',true),'ticket'); assert.equal(layer.paper.visible,true); assert.equal(layer.paper.parent,layer.arms.right.palm);
  layer.apply(action('insert'), 'ticket'); assert.equal(layer.paper.visible,true);
  layer.apply(action('insert',true),null); assert.equal(layer.paper.visible,false);
  layer.apply(action('collect'),null); assert.equal(layer.paper.visible,false);
  layer.apply(action('collect',true),'receipt'); assert.equal(layer.paper.visible,true);
  const result=layer.apply(null,'receipt',false); assert.equal(result.valid,false); assert.equal(layer.paper.visible,false);
  layer.dispose();
});

test('world-space targets respect +X heading and root transforms; unreachable targets stay honest', () => {
  const scene = rig(); scene.position.set(5,.45,8); scene.rotation.y = Math.PI/2; scene.updateWorldMatrix(true,true);
  const layer = new GuideExchangeLayer(scene), target=scene.localToWorld(new Vector3(.5,1,0)).toArray();
  assert.ok(layer.apply(action('seal',false,target),null).contactError <= .1);
  const lengths=Object.values(layer.arms).map(arm => [arm.lower.position.length(),arm.hand.position.length()]);
  assert.ok(layer.apply(action('ring',false,[50,5,50]),null).contactError > 10);
  Object.values(layer.arms).forEach((arm,i) => assert.deepEqual([arm.lower.position.length(),arm.hand.position.length()],lengths[i]));
  layer.dispose();
});

test('sanitized names resolve; missing rigs and disposal leave no added bone children', () => {
  const scene=rig(); scene.traverse(object => { object.name=PropertyBinding.sanitizeNodeName(object.name); });
  let count=0; scene.traverse(() => count++);
  const layer=new GuideExchangeLayer(scene); assert.equal(layer.apply(action('ring'),null).valid,true);
  layer.dispose(); layer.dispose(); let after=0; scene.traverse(() => after++); assert.equal(after,count);
  assert.equal(layer.apply(action('ring'),'ticket').valid,false);
  const missing=new GuideExchangeLayer(new Group()); assert.equal(missing.apply(action('pickup'),null).valid,false); missing.dispose();
});

test('actual sampled G24 palm drives the motion contact gate through pickup and insertion', () => {
  cancelExchangeBodyAction(); exchangeBody.carried=null;
  Object.assign(exchangeActor,{position:[0,PLAYER_CENTER_HEIGHT,0],yaw:0,grounded:true,available:true});
  const layer=new GuideExchangeLayer(rig()); let commits=0;
  for (const kind of ['pickup','insert']) {
    assert.ok(beginExchangeBodyAction(kind,{stand:[0,0,0],yaw:0,target:[.5,1,0]},() => { commits++; }));
    for(let frame=0;frame<120&&exchangeBody.action;frame++) {
      Object.assign(exchangeVisualSockets,layer.apply(exchangeBody.action,exchangeBody.carried));
      advanceExchangeBodyAction(1/60);
    }
    assert.equal(exchangeBody.action,null);
    assert.equal(exchangeBody.carried,kind==='pickup'?'ticket':null);
  }
  assert.equal(commits,2); layer.dispose(); cancelExchangeBodyAction();
});
