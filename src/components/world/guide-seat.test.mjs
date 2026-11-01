import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { AnimationMixer, Group, LoopOnce, Vector3 } from 'three';
import { GuideSeatContact, GuideSeatedIdle, GUIDE_SEAT_CONTACT_Y, guideSeatRootY, holdGuideSeatIdle } from './WorldGuideSeat.ts';
import { refineGuideBoots } from './WorldGuideShape.ts';
import { skinnedWorldPoint } from './WorldGuideStop.ts';
import { glb, loadGuide, motionDigest } from '../../../tools/world/guide/boot-analysis.mjs';

const source = process.env.G24_SOURCE ?? new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url);
const actual = { skip: !existsSync(source) && 'set G24_SOURCE to the local uncompressed G24 companion' };
async function fixture() {
  const asset = await loadGuide(source), production = glb(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url));
  assert.equal(motionDigest(asset), motionDigest(production), 'companion has production skeleton and animation samples');
  const { scene, animations } = asset.gltf, dispose = refineGuideBoots(scene);
  const contact = new GuideSeatContact(scene, animations), idle = new GuideSeatedIdle(scene), root = new Group(); root.add(scene);
  return { scene, animations, contact, idle, root, mixer: new AnimationMixer(scene), dispose };
}
function sampleHeld(f) {
  const clip = f.animations.find(c => c.name === 'SitIdle'), action = holdGuideSeatIdle(f.mixer.clipAction(clip)).play();
  f.mixer.update(clip.duration + .01); return action;
}
function align(f, target) {
  f.root.updateWorldMatrix(true, true);
  const offset = f.contact.sample(new Vector3()).sub(f.root.getWorldPosition(new Vector3()));
  f.root.position.copy(target).sub(offset); f.root.updateWorldMatrix(true, true);
}

test('seat support overrides elevated approach and StandUp reaches the fresh safe root', () => {
  for (const approach of [1, 1.45, 1.75]) {
    assert.equal(guideSeatRootY(approach, 1.45, 0), approach);
    assert.ok(Math.abs(guideSeatRootY(approach, 1.45, 1) + GUIDE_SEAT_CONTACT_Y - 1.45) < 1e-10);
  }
  assert.equal(guideSeatRootY(1, 1.45, 0), 1);
});

test('actual posterior patch reproduces the old 11 cm gap and aligns X/Y/Z at eight facings', actual, async () => {
  const f = await fixture(); sampleHeld(f);
  assert.ok(f.contact.points.length >= 4, 'bilateral contact patch, not the lowest thigh/shin vertex');
  const support = f.contact.sample(new Vector3());
  assert.ok(support.y > .35 && support.y < .365); assert.ok(support.x < -.44 && support.x > -.49);
  const oldGap = support.y - .2394; assert.ok(oldGap > .11, 'old height datum leaves the real rear buttocks airborne');
  const target = new Vector3(7, 1.45, -3); let maxError = 0, worstBand = 0;
  for (let i = 0; i < 8; i++) {
    f.root.rotation.y = i * Math.PI / 4; align(f, target);
    maxError = Math.max(maxError, f.contact.sample(new Vector3()).distanceTo(target));
    for (const p of f.contact.points) {
      const actual = skinnedWorldPoint(p.mesh, p.index, new Vector3()), local = actual.clone().sub(target).applyAxisAngle(new Vector3(0, 1, 0), -f.root.rotation.y);
      worstBand = Math.max(worstBand, Math.abs(actual.y - target.y));
      assert.ok(Math.abs(local.x) < .04 && Math.abs(local.z) < .13, 'rear contact stays over centre in side and oblique views');
    }
  }
  const bench = glb(new URL('../../../public/assets/world/camp/C06.glb', import.meta.url));
  const bounds = bench.json.accessors[bench.json.meshes[0].primitives[0].attributes.POSITION];
  assert.ok(bounds.max[0] > .37 && bounds.max[2] > 2.39, 'actual C06 cross-section and ±1 m seats contain this patch');
  assert.ok(maxError < 1e-6); assert.ok(worstBand < .006, 'posterior support band straddles the plane within 6 mm');
  console.log(JSON.stringify({ patchVertices: f.contact.points.length, reference: f.contact.reference.toArray(), oldRearGapM: oldGap, maxXYZErrorM: maxError, posteriorBandM: worstBand }));
  f.mixer.stopAllAction(); f.dispose();
});

test('held source settle gains breathing and slow gaze with fixed posterior support and clean exit', actual, async () => {
  const f = await fixture(), held = sampleHeld(f), target = new Vector3(0, 1.45, 0);
  const chest = f.scene.getObjectByName('chest'), head = f.scene.getObjectByName('head');
  const chestStart = chest.quaternion.clone(), headStart = head.quaternion.clone();
  const protectedBones = ['pelvis', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'].map(n => f.scene.getObjectByName(n));
  const bases = protectedBones.map(b => b.quaternion.clone());
  let chestMotion = 0, headMotion = 0, contactError = 0;
  for (let frame = 0; frame < 1500; frame++) {
    f.idle.restore(); f.mixer.update(1 / 60); f.idle.apply(1 / 60, true); align(f, target);
    chestMotion = Math.max(chestMotion, chest.quaternion.angleTo(chestStart)); headMotion = Math.max(headMotion, head.quaternion.angleTo(headStart));
    contactError = Math.max(contactError, f.contact.sample(new Vector3()).distanceTo(target));
    protectedBones.forEach((b, i) => assert.deepEqual(b.quaternion.toArray(), bases[i].toArray(), 'idle life leaves pelvis and legs untouched'));
  }
  assert.ok(held.enabled && held.paused); assert.ok(chestMotion > .01 && chestMotion < .04); assert.ok(headMotion > .12 && headMotion < .18); assert.ok(contactError < 1e-7);
  f.idle.reset(); assert.equal(f.idle.elapsed, 0); assert.ok(chest.quaternion.angleTo(chestStart) < 1e-7); assert.ok(head.quaternion.angleTo(headStart) < 1e-7);
  const seatedHip = protectedBones[0].position.y;
  held.stop(); const stand = f.mixer.clipAction(f.animations.find(c => c.name === 'StandUp')).setLoop(LoopOnce, 1); stand.clampWhenFinished = true; stand.play();
  f.mixer.update(stand.getClip().duration); assert.ok(Math.abs(protectedBones[0].position.y - seatedHip) > .1, 'measured StandUp replaces the seat layer');
  console.log(JSON.stringify({ breathingChestDeg: chestMotion * 180 / Math.PI, gazeHeadDeg: headMotion * 180 / Math.PI, maxContactErrorM: contactError }));
  f.mixer.stopAllAction(); f.dispose();
});
