import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { AnimationMixer, LoopOnce, LoopPingPong, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { GUIDE_SEAT_CONTACT_Y, guideSeatRootY, holdGuideSeatIdle } from './WorldGuideSeat.ts';
import { skinnedWorldPoint } from './WorldGuideStop.ts';
import { glb, loadGuide, motionDigest } from '../../../tools/world/guide/boot-analysis.mjs';

const source = process.env.G24_SOURCE ?? new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url);
const actual = { skip: !existsSync(source) && 'set G24_SOURCE to the local uncompressed G24 companion' };

test('seat contact overrides an elevated approach surface and StandUp reaches the current safe root', () => {
  const seatY = 1.45, safeExitY = 1;
  for (const approachY of [1, seatY, seatY + .3]) {
    const seated = guideSeatRootY(approachY, seatY, 1);
    assert.ok(Math.abs(seated + GUIDE_SEAT_CONTACT_Y - seatY) < 1e-10);
    assert.equal(guideSeatRootY(approachY, seatY, 0), approachY);
    const oldRoot = Math.max(approachY, seatY - GUIDE_SEAT_CONTACT_Y);
    if (approachY >= seatY) assert.ok(oldRoot + GUIDE_SEAT_CONTACT_Y - seatY >= .2393, 'old cached-ground clamp reproduces the floating sitter');
  }
  assert.equal(guideSeatRootY(safeExitY, seatY, 0), safeExitY, 'StandUp ends at fresh caller root, independent of old bench-top height');
  for (let i = 0; i <= 120; i++) {
    const w = i / 120, y = guideSeatRootY(safeExitY, seatY, w);
    assert.ok(y >= safeExitY && y <= seatY - GUIDE_SEAT_CONTACT_Y);
  }
});

async function fixture() {
  const asset = await loadGuide(source), production = glb(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url));
  assert.equal(motionDigest(asset), motionDigest(production), 'actual companion matches production rig and animation samples');
  const { scene, animations } = asset.gltf, points = [];
  // Same dominant-body criterion as the existing measure_sit.py, evaluated with actual GLTFLoader bones.
  scene.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const ids = o.geometry.getAttribute('skinIndex'), weights = o.geometry.getAttribute('skinWeight');
    for (let i = 0; i < ids.count; i++) {
      let dominant = 0;
      for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, dominant)) dominant = k;
      if (/^(pelvis|thigh[._]?[LR]|bag)$/.test(o.skeleton.bones[ids.getComponent(i, dominant)].name)) points.push({ mesh: o, index: i });
    }
  });
  assert.ok(points.length > 20);
  return { scene, animations, points };
}

function lowest(scene, points) {
  scene.updateMatrixWorld(true);
  return Math.min(...points.map(({ mesh, index }) => skinnedWorldPoint(mesh, index, new Vector3()).y));
}

test('actual G24 seated skin remains on the seat for ground, bench-top and elevated approaches', actual, async () => {
  const { scene, animations, points } = await fixture(), mixer = new AnimationMixer(scene);
  const clip = animations.find(c => c.name === 'SitIdle'), action = holdGuideSeatIdle(mixer.clipAction(clip)).play();
  assert.equal(clip.userData.loop, false); assert.ok(clip.duration > .5 && clip.duration < .55);
  let worst = 0, measuredEnd = 0;
  for (let i = 0; i <= 240; i++) {
    mixer.update(1 / 120); const buttock = lowest(scene, points);
    for (const approachY of [1, 1.45, 1.75]) worst = Math.max(worst, Math.abs(guideSeatRootY(approachY, 1.45, 1) + buttock - 1.45));
    if (i > 120) measuredEnd = buttock;
  }
  assert.ok(worst < .003, `existing measured contact remains within 3 mm through settling: ${worst}`);
  assert.ok(Math.abs(measuredEnd - GUIDE_SEAT_CONTACT_Y) < .0003, 'relaxed held pose contact within 0.3 mm');
  assert.ok(action.enabled && action.paused); assert.equal(action.getEffectiveWeight(), 1);
  console.log(JSON.stringify({ seatedSkinY: measuredEnd, maxSeatContactErrorM: worst, settlingSeconds: clip.duration }));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
});

test('old ping-pong replays the bow every second; new measured settle holds and can leave for StandUp', actual, async () => {
  const { scene, animations } = await fixture(), clip = animations.find(c => c.name === 'SitIdle');
  const chest = scene.getObjectByName('chest'), q = () => { scene.updateMatrixWorld(true); return chest.getWorldQuaternion(new Quaternion()).normalize(); };
  const mixer = new AnimationMixer(scene), old = mixer.clipAction(clip).setLoop(LoopPingPong, Infinity).play();
  mixer.update(clip.duration); const relaxed = q();
  mixer.update(clip.duration); const repeatedBow = q().angleTo(relaxed) * 180 / Math.PI;
  assert.ok(repeatedBow > 15, 'real source settling repeated backwards causes the reported bow');
  old.stop(); mixer.uncacheClip(clip);
  const idle = holdGuideSeatIdle(mixer.clipAction(clip)).play(); mixer.update(clip.duration + .01);
  const held = q(); let maxHeldMotion = 0;
  for (let i = 0; i < 1200; i++) { mixer.update(1 / 120); maxHeldMotion = Math.max(maxHeldMotion, q().angleTo(held)); }
  assert.ok(maxHeldMotion < 1e-7, 'no repeated bow over ten seated seconds');
  idle.stop(); const stand = mixer.clipAction(animations.find(c => c.name === 'StandUp')).setLoop(LoopOnce, 1);
  stand.clampWhenFinished = true; stand.play(); mixer.update(stand.getClip().duration);
  assert.ok(q().angleTo(held) > .1, 'original measured StandUp still replaces held SitIdle');
  console.log(JSON.stringify({ oldBowRangeDeg: repeatedBow, oldBowPeriodS: clip.duration * 2, newHeldMotionDeg: maxHeldMotion * 180 / Math.PI }));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
});
