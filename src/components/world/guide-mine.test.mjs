/** CPU-only kinematics. Socket fixtures below are test transforms, never shipped tool geometry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bone, Group, Matrix4, Object3D, Vector3 } from 'three';
import { GuideMineLayer, minePose } from './WorldGuideMine.ts';
const id = 'REVERSAL_5';
function glbNodes(path, bones = false) {
  const file = readFileSync(path);
  const g = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString());
  const joints = new Set(bones ? g.skins.flatMap(s => s.joints) : []);
  const nodes = g.nodes.map((n, i) => {
    const o = joints.has(i) ? new Bone() : new Group(); o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (n.matrix) new Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    return o;
  });
  g.nodes.forEach((n, i) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const scene = new Group(); g.scenes[g.scene ?? 0].nodes.forEach(i => scene.add(nodes[i]));
  scene.updateWorldMatrix(true, true);
  return scene;
}
function rig() { return glbNodes(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url), true); }
function asset(name, sockets) {
  const root = new Group(); root.name = name;
  for (const [key, pos] of Object.entries(sockets)) { const p = new Object3D(); p.name = key; p.position.fromArray(pos); root.add(p); }
  return root;
}
function assets() {
  return { detector: asset('detector', { grip_R: [0,0,0], scan_origin: [.12,.18,0] }),
    pickaxe: asset('pickaxe', { grip_R: [0,0,0], grip_L: [0,.17,0], head_contact: [.23,.60,0] }),
    ore: asset('ore', { grip_R: [0,0,.15], grip_L: [0,0,-.15], release: [0,0,0] }),
    colors: { REVERSAL_5: '#b7864d', ROC20_RANK: '#5c9b91', LOW_STD_20: '#9ba8b1' } };
}
function state(kind, elapsed, target = [.85,1.07,0], contact = false) {
  return { equipped: true, carried: kind === 'deposit' || (kind === 'pickup' && contact) ? id : null,
    action: { kind, elapsed, duration: { equip: .8, scan: 1.1, strike: 1.05, pickup: .85, deposit: 1.4 }[kind],
      target, origin: [0,0,0], factorId: id, contact, bay: 0 } };
}
function setup() { const scene = rig(), layer = new GuideMineLayer(scene); layer.installAssets(assets()); return { scene, layer }; }
const distance = (a, b) => new Vector3(...a).distanceTo(new Vector3(...b));

test('authored strike has distinct preparation, contact at .57, and follow-through', () => {
  const pre = minePose(state('strike', .4)), contact = minePose(state('strike', .57)), follow = minePose(state('strike', .73));
  assert.equal(pre.tool, 'pickaxe'); assert.equal(contact.target, 1); assert.equal(follow.target, 0);
  assert.ok(pre.tilt > contact.tilt && contact.tilt > follow.tilt);
  assert.deepEqual(minePose(state('scan', .5)), minePose(state('scan', .5)), 'no private visual clock advances');
});
test('actual G24 hand chain drives both fixture pickaxe grips and the contact socket', () => {
  const { scene, layer } = setup(); const result = layer.apply(state('strike', .57));
  const pick = scene.getObjectByName('mine-pickaxe');
  assert.ok(result.assetsReady && result.valid); assert.equal(pick.parent, layer.arms.right.palm);
  assert.ok(distance(pick.getObjectByName('grip_R').getWorldPosition(new Vector3()).toArray(), result.rightHand) < 1e-6);
  assert.ok(result.contactError < .025, `head contact ${result.contactError}`);
  assert.ok(result.leftReachError < .025, `left grip ${result.leftReachError}`);
  assert.equal(result.sampledActionKind, 'strike'); assert.equal(result.sampledElapsed, .57);
  layer.dispose();
});
test('upper-body scanning leaves pelvis and both foot transforms untouched', () => {
  const { scene, layer } = setup(); const names = ['pelvis', 'foot.R', 'foot.L'];
  const before = names.map(n => scene.getObjectByName(n).matrixWorld.clone());
  layer.apply(state('scan', .65));
  names.forEach((n, i) => assert.ok(scene.getObjectByName(n).matrixWorld.elements.every((v, k) => Math.abs(v - before[i].elements[k]) < 1e-7)));
  layer.dispose();
});
test('pickup crouch keeps final solved foot positions and restores all bone transforms', () => {
  const { scene, layer } = setup(), bones = []; scene.traverse(o => { if (o.isBone) bones.push(o); });
  const before = bones.map(b => ({ p: b.position.toArray(), q: b.quaternion.toArray() }));
  const feet = ['foot.R', 'foot.L'].map(n => scene.getObjectByName(n).getWorldPosition(new Vector3()));
  const result = layer.apply(state('pickup', .48, [.50,.70,0], true));
  assert.ok(result.rightReachError < .035, `pickup right ${result.rightReachError}`);
  assert.ok(result.leftReachError < .035, `pickup left ${result.leftReachError}`);
  ['foot.R', 'foot.L'].forEach((n, i) => assert.ok(scene.getObjectByName(n).getWorldPosition(new Vector3()).distanceTo(feet[i]) < 1e-6));
  layer.restore(); bones.forEach((b, i) => { assert.deepEqual(b.position.toArray(), before[i].p); assert.deepEqual(b.quaternion.toArray(), before[i].q); });
  layer.dispose();
});
test('repeating a held pose never accumulates rotation or changes arm lengths', () => {
  const { layer } = setup(), s = state('pickup', .48, [.50,.70,0], true);
  const lengths = Object.values(layer.arms).map(a => [a.lower.position.length(), a.hand.position.length()]);
  const first = structuredClone(layer.apply(s));
  for (let i = 0; i < 30; i++) assert.ok(distance(layer.apply(s).oreRelease, first.oreRelease) < 1e-7);
  Object.values(layer.arms).forEach((a, i) => assert.deepEqual([a.lower.position.length(), a.hand.position.length()], lengths[i]));
  layer.dispose();
});
test('unreachable targets are reported without stretching bones or spoofing the tip', () => {
  const { layer } = setup(); const result = layer.apply(state('strike', .57, [4,1.1,0]));
  assert.ok(result.contactError > 1 && result.rightReachError > 1); layer.dispose();
});
test('deposit retains the actual ore through preparation then hides it only on release', () => {
  const { scene, layer } = setup();
  layer.apply(state('deposit', .47)); const held = scene.getObjectByName('mine-REVERSAL_5'); assert.ok(held.visible);
  assert.ok(distance(layer.sockets.oreRelease, held.getObjectByName('release').getWorldPosition(new Vector3()).toArray()) < 1e-6);
  const released = state('deposit', .48, [2,1,0], true); released.carried = null; layer.apply(released); assert.equal(held.visible, false);
  layer.hide(); assert.equal(layer.sockets.valid, false); layer.dispose();
});
test('put-down lowers the ore with anchored feet and reports an unreachable ground target honestly', () => {
  const { scene, layer } = setup();
  const s = state('deposit', .48, [.55,0,0]); delete s.action.bay;
  const feet = ['foot.R', 'foot.L'].map(n => scene.getObjectByName(n).getWorldPosition(new Vector3()));
  assert.equal(minePose(s).target, 1); assert.ok(minePose(s).right[1] < minePose(state('deposit', .48)).right[1]);
  const result = layer.apply(s);
  assert.ok(result.oreRelease[1] < .6 && result.rightReachError > .1);
  ['foot.R', 'foot.L'].forEach((n, i) => assert.ok(scene.getObjectByName(n).getWorldPosition(new Vector3()).distanceTo(feet[i]) < 1e-6));
  layer.dispose();
});

// Main integration can run this against the delivered art without decoding mesh buffers or opening WebGL.
const artDirectory = process.env.ALPHA_MINE_ASSET_DIR;
test('delivered tool sockets fit both G24 hands and strike contact at facility stand distances', { skip: !artDirectory }, t => {
  const source = assets();
  for (const name of ['detector', 'pickaxe', 'ore']) {
    source[name] = glbNodes(join(artDirectory, `${name}.glb`)).getObjectByName(name);
    assert.ok(source[name], `${name}: named asset root`);
  }
  const layer = new GuideMineLayer(rig()); layer.installAssets(source);
  const hit = layer.apply(state('strike', .57));
  assert.ok(hit.contactError < .025, `delivered pickaxe head ${hit.contactError}`);
  assert.ok(hit.rightReachError < .035 && hit.leftReachError < .035, `delivered pickaxe grips ${hit.rightReachError}/${hit.leftReachError}`);
  const pickup = layer.apply(state('pickup', .48, [.5,.7,0], true));
  assert.ok(pickup.rightReachError < .035 && pickup.leftReachError < .035, `delivered ore grips ${pickup.rightReachError}/${pickup.leftReachError}`);
  const samples = [];
  for (const x of [.6, .7, .8, .9, 1, 1.1]) {
    const r = layer.apply(state('strike', .57, [x,1.3,0]));
    samples.push({ kind: 'strike', x, y: 1.3, tip: r.contactError, right: r.rightReachError, left: r.leftReachError });
  }
  for (const kind of ['pickup', 'put-down']) for (const x of [.5, .6, .7]) {
    const s = state(kind === 'pickup' ? 'pickup' : 'deposit', .48, [x,.7,0], kind === 'pickup');
    if (kind === 'put-down') delete s.action.bay;
    const r = layer.apply(s);
    samples.push({ kind, x, y: .7, right: r.rightReachError, left: r.leftReachError });
  }
  t.diagnostic(JSON.stringify(samples.map(row => Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [key, typeof value === 'number' ? +value.toFixed(4) : value])))));
  const facilityStrike = samples.find(row => row.kind === 'strike' && row.x === 1);
  assert.ok(facilityStrike.tip <= .16 && facilityStrike.left <= .16, `facility strike unreachable: ${JSON.stringify(facilityStrike)}`);
  const oreSamples = samples.filter(row => row.kind !== 'strike');
  assert.ok(oreSamples.every(row => row.right <= .16), `facility ore reach: ${JSON.stringify(oreSamples)}`);
  layer.dispose();
});
