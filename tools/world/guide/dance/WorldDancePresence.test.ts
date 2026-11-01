import assert from 'node:assert/strict';
import { AnimationMixer, Bone, LoopRepeat, Quaternion, Vector3 } from 'three';
import { loadG24Fixture } from './load-g24-fixture';
import { refineGuideBoots } from '../../../../src/components/world/WorldGuideShape';
import { clubDanceSampleTime, createClubDanceClips, type ClubDanceEvidence } from '../../../../src/components/world/WorldGuideDance';
import { advanceClubGuestClock, createClubGuestClock } from '../../../../src/components/world/WorldClubDancePlan';

// Measure the actual production G24 hierarchy through AnimationMixer, rather than
// reimplementing the choreography or testing only generated keyframe arrays.
const { scene } = await loadG24Fixture();
refineGuideBoots(scene);
const bones = new Map<string, Bone>();
scene.traverse(o => { if ((o as Bone).isBone) bones.set(o.name.replace(/[._]/g, ''), o as Bone); });
const original = [...bones.values()].map(b => [...b.position.toArray(), ...b.quaternion.toArray()]);
const clips = createClubDanceClips(scene), other = createClubDanceClips(scene);
assert.deepEqual([...bones.values()].map(b => [...b.position.toArray(), ...b.quaternion.toArray()]), original);
assert.ok(clips.every((c, i) => c !== other[i] && c.tracks.every((t, j) => t.values !== other[i].tracks[j].values)));
const mixer = new AnimationMixer(scene), dt = 1 / 120, beats = 16;
const results: any[] = [];
for (const bpm of [118, 138]) {
for (const [step, clip] of clips.entries()) {
  const evidence = clip.userData as unknown as ClubDanceEvidence;
  mixer.stopAllAction();
  const action = mixer.clipAction(clip).reset().setLoop(LoopRepeat, Infinity).play();
  action.paused = true;
  const observed = ['pelvis', 'footL', 'footR', 'shinL', 'shinR', 'handL', 'handR', 'chest'];
  const ranges = Object.fromEntries(observed.map(name => [name, { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) }]));
  const previous = new Map<string, Vector3>(), velocities = new Map<string, Vector3>(), rotations = new Map<string, Quaternion>();
  let peakSpeed = 0, peakAcceleration = 0, peakAngularSpeed = 0, stanceSlip = 0, peakSeamVelocityDelta = 0;
  let leftTransfers = 0, rightTransfers = 0, previousSupport = 0;
  let minimumFootSeparation = Infinity;
  const footSamples: number[][] = [];
  const frames = Math.ceil(beats / (bpm / 60) / dt);
  for (let frame = 0; frame <= frames; frame++) {
    const beat = frame * dt * bpm / 60;
    const oldTime = action.time;
    action.time = clubDanceSampleTime(step as 0 | 1, beat, clip.duration);
    mixer.update(0); scene.updateMatrixWorld(true);
    for (const name of observed) {
      const bone = bones.get(name)!, p = bone.getWorldPosition(new Vector3()), r = bone.getWorldQuaternion(new Quaternion());
      ranges[name].min.min(p); ranges[name].max.max(p);
      if (previous.has(name)) {
        const velocity = p.clone().sub(previous.get(name)!).divideScalar(dt);
        peakSpeed = Math.max(peakSpeed, velocity.length());
        if (velocities.has(name)) {
          const delta = velocity.distanceTo(velocities.get(name)!);
          peakAcceleration = Math.max(peakAcceleration, delta / dt);
          if (action.time < oldTime) peakSeamVelocityDelta = Math.max(peakSeamVelocityDelta, delta);
        }
        velocities.set(name, velocity);
        peakAngularSpeed = Math.max(peakAngularSpeed, r.angleTo(rotations.get(name)!) / dt);
        if (name.startsWith('foot')) {
          const side = name.endsWith('L') ? 'L' : 'R', mask = side === 'L' ? evidence.contactL : evidence.contactR;
          const index = Math.floor(action.time / clip.duration * evidence.frames);
          const lastIndex = Math.floor(oldTime / clip.duration * evidence.frames);
          if (frame > 1 && mask[index] && mask[lastIndex]) stanceSlip = Math.max(stanceSlip, Math.hypot(p.x - previous.get(name)!.x, p.z - previous.get(name)!.z));
        }
      }
      previous.set(name, p); rotations.set(name, r);
    }
    const hip = bones.get('pelvis')!.getWorldPosition(new Vector3());
    const support = hip.z < -.04 ? -1 : hip.z > .04 ? 1 : 0;
    if (support && support !== previousSupport) { if (support < 0) leftTransfers++; else rightTransfers++; previousSupport = support; }
    const a = bones.get('footL')!.getWorldPosition(new Vector3()), b = bones.get('footR')!.getWorldPosition(new Vector3());
    minimumFootSeparation = Math.min(minimumFootSeparation, Math.hypot(a.x - b.x, a.z - b.z));
    footSamples.push([a.x, a.z, b.x, b.z]);
  }
  const extent = (name: string) => ranges[name].max.clone().sub(ranges[name].min);
  const hip = extent('pelvis'), left = extent('footL'), right = extent('footR');
  assert.ok(hip.y < .03, 'presence must not come from repeated deep squat');
  assert.ok(peakSpeed < 2, `supported tempo joint speed ${peakSpeed}`);
  assert.ok(peakAngularSpeed < 7, `supported tempo angular snap ${peakAngularSpeed}`);
  assert.ok(peakAcceleration < 30, `velocity discontinuity ${peakAcceleration}`);
  assert.ok(peakSeamVelocityDelta < .14, `loop seam velocity jump ${peakSeamVelocityDelta}`);
  assert.ok(stanceSlip < .002, `planted ankle sliding ${stanceSlip}`);
  assert.ok(minimumFootSeparation > .20, `step-touch must leave room for production shoes ${minimumFootSeparation}`);
  assert.ok(extent('handL').length() > .15 && extent('handR').length() > .15, 'both arms must contribute readable movement');
  if (step === 0) {
    assert.ok(left.z > .22 && right.z > .22, 'both feet must step laterally, rather than standing sway');
    assert.ok(hip.z > .14 && leftTransfers >= 4 && rightTransfers >= 4, 'repeated left/right support transfer over 16 beats');
    assert.ok(left.x < .03 && right.x < .03, 'step-touch travels laterally');
  } else {
    assert.ok(left.x > .15 && right.x > .15, 'alternate forward foot taps must be readable');
    assert.ok(left.z < .03 && right.z < .03, 'second move must have a different footwork direction');
  }
  results.push({ clip: clip.name, beats, bpm, hip: hip.toArray(), leftFoot: left.toArray(), rightFoot: right.toArray(),
    leftHand: extent('handL').toArray(), rightHand: extent('handR').toArray(),
    leftTransfers, rightTransfers, peakSpeed, peakAngularSpeed, peakAcceleration, stanceSlip, minimumFootSeparation, peakSeamVelocityDelta, footSamples });
}
}
const footDifferences = [0, 2].map(start => Math.sqrt(results[start].footSamples.reduce((sum: number, p: number[], i: number) =>
  // Each observation contains two planar foot positions. Average squared distance
  // per foot, not per scalar coordinate, so this is an RMS distance in metres.
  sum + p.reduce((n, x, j) => n + (x - results[start + 1].footSamples[i][j]) ** 2, 0), 0) / (results[start].footSamples.length * 2)));
assert.ok(footDifferences.every(d => d > .09), `moves too similar in production skeleton ${footDifferences}`);
// A zero delta is an actual pause even if the next audio source has another beat.
const clock = createClubGuestClock();
advanceClubGuestClock(clock, 1, .1, clips.map(c => c.duration));
const paused = [...clock.times]; advanceClubGuestClock(clock, 50, 0, clips.map(c => c.duration));
assert.deepEqual(clock.times, paused);
for (const { footSamples, ...result } of results) console.log(JSON.stringify(result));
console.log(JSON.stringify({ footDifferenceRmsM: footDifferences, sourceCacheUnchanged: true, independentClipArrays: true, pauseFrozen: true }));
mixer.stopAllAction(); mixer.uncacheRoot(scene);
console.log('PASS: actual G24 16-beat directional footwork, support transfer, arm participation, continuity and distinct moves');
