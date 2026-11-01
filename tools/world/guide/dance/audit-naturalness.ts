import { AnimationMixer, LoopRepeat, Quaternion, Vector3 } from 'three';
import { loadG24Fixture } from './load-g24-fixture';
import { createClubDanceClips } from '../../../../src/components/world/WorldGuideDance';
import { refineGuideBoots } from '../../../../src/components/world/WorldGuideShape';

const gltf = await loadG24Fixture(), scene = gltf.scene;
refineGuideBoots(scene);
const bones = new Map<string, any>(); scene.traverse((o: any) => { if (o.isBone) bones.set(o.name.replace(/[._]/g, ''), o); });
const mixer = new AnimationMixer(scene), clips = createClubDanceClips(scene);
for (const clip of clips) {
  mixer.stopAllAction(); const action = mixer.clipAction(clip).reset().setLoop(LoopRepeat, Infinity).play();
  let peakJointSpeed = 0, peakAngularSpeed = 0, hipMin = Infinity, hipMax = -Infinity, kneeMin = 180, kneeMax = 0, peakKneeChange = 0;
  let peakKneeFrame = 0, peakBone = '', peakAngleBone = '';
  const previous = new Map(), qs = new Map(), flex = new Map();
  const steps = Math.round(clip.duration * 240);
  for (let i = 0; i <= steps; i++) {
    mixer.update(i ? 1 / 120 : 0); scene.updateMatrixWorld(true);
    const hip = bones.get('pelvis').getWorldPosition(new Vector3()).y;
    hipMin = Math.min(hipMin, hip); hipMax = Math.max(hipMax, hip);
    for (const [name, b] of bones) {
      const p = b.getWorldPosition(new Vector3()), q = b.getWorldQuaternion(new Quaternion());
      if (previous.has(name) && p.distanceTo(previous.get(name)) * 120 > peakJointSpeed) { peakJointSpeed = p.distanceTo(previous.get(name)) * 120; peakBone = name; }
      if (qs.has(name) && q.angleTo(qs.get(name)) * 120 > peakAngularSpeed) { peakAngularSpeed = q.angleTo(qs.get(name)) * 120; peakAngleBone = name; }
      previous.set(name, p); qs.set(name, q);
    }
    for (const s of ['L', 'R']) {
      const h = bones.get('thigh'+s).getWorldPosition(new Vector3()), k = bones.get('shin'+s).getWorldPosition(new Vector3()), a = bones.get('foot'+s).getWorldPosition(new Vector3());
      const f = Math.PI - h.sub(k).angleTo(a.sub(k)), degrees = f * 180 / Math.PI;
      kneeMin = Math.min(kneeMin, degrees); kneeMax = Math.max(kneeMax, degrees);
      if (flex.has(s) && Math.abs(f - flex.get(s)) * 120 * 180 / Math.PI > peakKneeChange) { peakKneeChange = Math.abs(f - flex.get(s)) * 120 * 180 / Math.PI; peakKneeFrame = i; }
      flex.set(s, f);
    }
  }
  const rateAt138Bpm = clip.duration * (138 / 60) / (clip.userData.beatsPerLoop as number);
  console.log(JSON.stringify({clip:clip.name, duration:clip.duration, peakJointSpeed, peakAngularSpeed, hipRange:hipMax-hipMin,
    hipMin, hipMax, kneeMin, kneeMax, peakKneeChangeDegreesPerSecond:peakKneeChange,
    peakKneeAt138Bpm: peakKneeChange * rateAt138Bpm, peakJointSpeedAt138Bpm: peakJointSpeed * rateAt138Bpm,
    peakKneeTime:peakKneeFrame/120, peakBone, peakAngleBone}));
  assert.ok(hipMax - hipMin < .03, 'deep-squat/bob regression');
  assert.ok(hipMin > .59, 'pelvis dropped below the approved shallow knee bend');
  assert.ok(kneeMin >= 10 && kneeMax <= 55, 'knee hyperextension or deep squat');
  assert.ok(peakKneeChange < 360, 'native knee hinge spike');
  assert.ok(peakKneeChange * rateAt138Bpm < 250, 'knee too fast in supported music range');
  assert.ok(peakAngularSpeed < 7, 'native angular snap');
  assert.ok(peakJointSpeed * rateAt138Bpm < 2, 'joint speed too fast in supported music range');
  action.stop();
}
import assert from 'node:assert/strict';
