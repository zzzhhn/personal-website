import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Group, Matrix4, Object3D, Vector3 } from 'three';
import { build } from 'esbuild';
import { WorldGuidePresentation } from './world-guide-presentation.ts';
import { GuideMineLayer } from './WorldGuideMine.ts';
import { GuideExchangeLayer } from './WorldGuideExchange.ts';
import { GuideIbdInspectionLayer } from './WorldGuideIbdInspection.ts';
import { GuideCampLayer } from './WorldGuideCamp.ts';
import { useWorldStore } from './store.ts';
import { useAlphaMineStore, mineVisualSockets } from './alpha-mine-state.ts';
import { exchangeBody, exchangeVisualSockets } from './alpha-exchange-motion.ts';
import { ibdInspectionBody, ibdInspectionVisualSockets } from './attractions/ibd-inspection-motion.ts';
import { ibdInspectionHands } from './attractions/ibd-inspection-hands.ts';
import { campPropActor, campPropHand } from './camp-prop-interactions.ts';
import { guideActionHand } from './rides/guide-action-hand.ts';
import { FACTORY_STATIONS, factoryWorld } from './factory/factory-layout.ts';
import { factoryConsoleHandTarget } from './factory/factory-operator-pose.ts';

// Actual shipped bone hierarchy, decoded without loading Draco meshes or WebGL.
const bytes = readFileSync(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
function rig() {
  const joints = new Set(gltf.skins.flatMap(s => s.joints));
  const nodes = gltf.nodes.map((n, i) => {
    const o = joints.has(i) ? new Bone() : new Group(); o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (n.matrix) new Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    return o;
  });
  gltf.nodes.forEach((n, i) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const scene = new Group(); gltf.scenes[gltf.scene ?? 0].nodes.forEach(i => scene.add(nodes[i]));
  scene.updateWorldMatrix(true, true); return scene;
}
function bones(scene) {
  const result = [];
  scene.traverse(n => { if (n.isBone) result.push([n.name, ...n.position.toArray(), ...n.quaternion.toArray()]); });
  return result;
}
function mineAssets() {
  const asset = (name, sockets) => {
    const root = new Group(); root.name = name;
    for (const [name, xyz] of Object.entries(sockets)) {
      const socket = new Object3D(); socket.name = name; socket.position.fromArray(xyz); root.add(socket);
    }
    return root;
  };
  return { detector: asset('detector', { grip_R: [0,0,0], scan_origin: [.12,.18,0] }),
    pickaxe: asset('pickaxe', { grip_R: [0,0,0], grip_L: [0,.17,0], head_contact: [.23,.60,0] }),
    ore: asset('ore', { grip_R: [0,0,.15], grip_L: [0,0,-.15], release: [0,0,0] }),
    colors: { REVERSAL_5: '#b7864d', ROC20_RANK: '#5c9b91', LOW_STD_20: '#9ba8b1' } };
}
const frame = { shown: true, frozen: false, contactAllowed: true, facing: 0, speedMps: 0 };
const originalWorld = useWorldStore.getState(), originalMine = useAlphaMineStore.getState();
function reset() {
  useWorldStore.setState({ card: null, factoryStation: null, position: [0,0,0] });
  useAlphaMineStore.setState({ equipped: false, carried: null, action: null });
  Object.assign(exchangeBody, { action: null, carried: null });
  Object.assign(ibdInspectionBody, { action: null, carried: null });
  Object.assign(campPropActor, { available: true });
  Object.assign(campPropHand, { target: null, palm: null, mode: 'reach' });
  Object.assign(guideActionHand, { owner: null, target: null, palm: null, mode: 'reach' });
}
afterEach(() => { reset(); useWorldStore.setState(originalWorld); useAlphaMineStore.setState(originalMine); });
function apply(p, overrides = {}, hands = true, sitting = false) {
  p.prepare({ ...frame, ...overrides }); p.restoreContactPose(); p.restoreActivityPose();
  p.applyActivityPose(hands, sitting); p.applyContactPose(1 / 60);
}
const mineAction = kind => ({ kind, elapsed: kind === 'strike' ? .57 : .48, duration: 1.4,
  target: [.5,.7,0], origin: [0,0,0], factorId: 'REVERSAL_5', contact: kind === 'pickup', bay: 0 });
const exchangeAction = kind => ({ id: 7, kind, phase: 'perform', elapsed: .5,
  duration: 1.1, contactAt: .5, anchor: { stand: [0,0,0], yaw: 0, target: [.5,1,0] }, committed: false });
const inspectionAction = kind => ({ id: 8, kind, phase: 'perform', elapsed: .6,
  duration: 1.1, contactAt: .6, reachStartAt: 0, recoverDuration: .3, committed: false,
  anchor: { stand: [0,0,0], yaw: 0, leftTarget: [.38,1,-.12], rightTarget: [.38,1,.16] } });

test('world composition preserves G24 bones and sockets from each existing venue pose solver', () => {
  const cases = [
    ...['equip', 'scan', 'strike', 'pickup', 'deposit'].map(kind => ({ venue: 'mine', kind })),
    ...['pickup', 'insert', 'adjust', 'seal', 'ring', 'collect', 'review'].map(kind => ({ venue: 'exchange', kind })),
    ...['pickup', 'measure', 'return', 'empty', 'coil-check', 'crane-control'].map(kind => ({ venue: 'inspection', kind })),
  ];
  for (const { venue, kind } of cases) {
    reset();
    const scene = rig(), reference = rig(), p = new WorldGuidePresentation(scene), initial = bones(scene);
    let layer, expected;
    if (venue === 'mine') {
      layer = new GuideMineLayer(reference); layer.installAssets(mineAssets()); p.mine.installAssets(mineAssets());
      useAlphaMineStore.setState({ equipped: true, carried: kind === 'deposit' ? 'REVERSAL_5' : null, action: mineAction(kind) });
      expected = layer.apply(useAlphaMineStore.getState());
    } else if (venue === 'exchange') {
      layer = new GuideExchangeLayer(reference); exchangeBody.action = exchangeAction(kind);
      expected = layer.apply(exchangeBody.action, null);
    } else {
      layer = new GuideIbdInspectionLayer(reference); ibdInspectionBody.action = inspectionAction(kind);
      expected = layer.apply(ibdInspectionBody.action, null);
    }
    // Repeated frames must not accumulate rotations or advance logical action clocks.
    for (let i = 0; i < 4; i++) {
      apply(p);
      assert.deepEqual(bones(scene), bones(reference), `${venue}/${kind} bone pose`);
      const actual = venue === 'mine' ? mineVisualSockets : venue === 'exchange' ? exchangeVisualSockets : ibdInspectionVisualSockets;
      for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `${venue}/${kind}/${key}`);
    }
    p.restoreContactPose(); p.restoreActivityPose();
    assert.deepEqual(bones(scene), initial, `${venue}/${kind} restored`);
    p.dispose(); layer.dispose();
  }
});

test('contact ownership excludes simultaneous venue hands and keeps completed feet anchored', () => {
  reset();
  const scene = rig(), p = new WorldGuidePresentation(scene);
  p.mine.installAssets(mineAssets());
  useAlphaMineStore.setState({ equipped: true, action: mineAction('strike') });
  exchangeBody.carried = 'ticket'; ibdInspectionBody.carried = { spec: 'M8' };
  guideActionHand.owner = 'alpha-lamp'; guideActionHand.target = [.45,.95,.12];
  campPropHand.target = [.3,.8,-.2];
  const feet = [];
  scene.traverse(n => { if (n.isBone && /^foot[._]?[LR]$/.test(n.name)) feet.push([n, n.getWorldPosition(new Vector3())]); });
  assert.equal(feet.length, 2);
  for (let i = 0; i < 20; i++) apply(p);
  assert.ok(guideActionHand.palm);
  assert.ok(new Vector3(...guideActionHand.palm).distanceTo(new Vector3(...guideActionHand.target)) < .025);
  assert.equal(campPropHand.palm, null);
  assert.equal(mineVisualSockets.valid, false); assert.equal(exchangeVisualSockets.valid, false);
  assert.equal(ibdInspectionVisualSockets.valid, false);
  for (const [foot, anchor] of feet) assert.ok(foot.getWorldPosition(new Vector3()).distanceTo(anchor) < 1e-6);
  guideActionHand.owner = null; guideActionHand.target = null; campPropHand.target = null;
  apply(p); // Conflicting carried venue states do not authorize two simultaneous solvers.
  assert.equal(exchangeVisualSockets.valid, false); assert.equal(ibdInspectionVisualSockets.valid, false);
  ibdInspectionBody.carried = null; apply(p);
  assert.equal(exchangeVisualSockets.valid, true); assert.equal(mineVisualSockets.valid, false);
  exchangeBody.carried = null; apply(p);
  assert.equal(mineVisualSockets.valid, true);
  p.dispose();
});

test('hidden, occupied, unavailable and card states clear contact output without changing action ownership', () => {
  reset(); const scene = rig(), p = new WorldGuidePresentation(scene);
  guideActionHand.owner = 'alpha-lamp'; guideActionHand.target = [.45,.95,.12];
  for (const overrides of [{ contactAllowed: false }, { shown: false }]) {
    apply(p); assert.ok(guideActionHand.palm);
    apply(p, overrides); assert.equal(guideActionHand.palm, null);
    assert.equal(guideActionHand.owner, 'alpha-lamp');
  }
  apply(p, {}, false); assert.equal(guideActionHand.palm, null);
  apply(p, {}, true, true); assert.equal(guideActionHand.palm, null);
  campPropActor.available = false; apply(p); assert.equal(guideActionHand.palm, null);
  // Pausing preserves the target; WorldGuide does not execute pose phases while frozen.
  p.prepare({ ...frame, frozen: true }); assert.equal(p.blocksIdle, true);
  campPropActor.available = true;
  useWorldStore.setState({ card: { kind: 'about', id: 'about' } });
  apply(p); assert.equal(guideActionHand.palm, null);
  useWorldStore.setState({ card: null }); apply(p);
  p.prepare({ ...frame, shown: false }); p.hide();
  assert.equal(guideActionHand.palm, null); assert.equal(mineVisualSockets.valid, false);
  assert.equal(exchangeVisualSockets.valid, false); assert.equal(ibdInspectionVisualSockets.valid, false);
  p.dispose(); assert.equal(ibdInspectionHands.left, null); assert.equal(ibdInspectionHands.right, null);
});

test('every factory console retains its world grip and release leaves hands clear', () => {
  for (const station of FACTORY_STATIONS) {
    reset(); const scene = rig(), reference = rig();
    const position = factoryWorld(station.at), facing = station.yaw - Math.PI / 2;
    for (const s of [scene, reference]) { s.position.fromArray(position); s.rotation.y = facing; s.updateWorldMatrix(true, true); }
    const p = new WorldGuidePresentation(scene), layer = new GuideCampLayer(reference);
    useWorldStore.setState({ factoryStation: station.id, position });
    const target = factoryConsoleHandTarget(station.id, position, facing, 0);
    for (let i = 0; i < 12; i++) {
      layer.restore(); if (target) layer.apply(target, 'grip', 1 / 60);
      apply(p, { facing });
      assert.deepEqual(bones(scene), bones(reference), station.id);
      assert.equal(campPropHand.palm, null, 'factory cannot publish a camp pickup palm');
      assert.equal(p.blocksIdle, true);
    }
    p.dispose(); layer.reset();
  }
});

test('idle inhibition and unmount cleanup follow live items without clearing a replacement palm', () => {
  reset(); const p = new WorldGuidePresentation(rig());
  p.prepare(frame); assert.equal(p.blocksIdle, false);
  for (const state of [{ equipped: true }, { equipped: false, carried: 'REVERSAL_5' },
    { carried: null, action: mineAction('pickup') }]) {
    useAlphaMineStore.setState(state); assert.equal(p.blocksIdle, true);
  }
  useAlphaMineStore.setState({ action: null }); assert.equal(p.blocksIdle, false);
  guideActionHand.owner = 'alpha-lamp'; guideActionHand.target = [.45,.95,.12]; apply(p);
  assert.ok(guideActionHand.palm); p.dispose(); assert.equal(guideActionHand.palm, null);
  const replacement = [1,2,3]; guideActionHand.palm = replacement;
  p.dispose(); assert.equal(guideActionHand.palm, replacement);
});

test('bundled guide contains its actual pose solvers but no world store or venue implementation', async () => {
  const result = await build({ entryPoints: [new URL('./WorldGuide.tsx', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', packages: 'external', metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(p => p.endsWith('/WorldGuideStop.ts')));
  assert.ok(inputs.some(p => p.endsWith('/WorldGuideVehicle.ts')));
  assert.deepEqual(inputs.filter(p => /(?:\/store\.ts|\/attractions\/|\/factory\/|\/alpha-island\/|\/alpha-(?:mine|exchange)|\/camp-prop-|\/world-guide-|WorldGuide(?:Mine|Exchange|IbdInspection|Camp))/.test(p)), []);
});
