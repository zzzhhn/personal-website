import assert from 'node:assert/strict';
import { AnimationMixer, Box3, LoopRepeat, SkinnedMesh, Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createClubGuestAppearance } from '../../../../src/components/world/WorldClubGuestAppearance';
import { createClubDanceClips, CLUB_DANCE_BEATS } from '../../../../src/components/world/WorldGuideDance';
import { advanceClubGuestClock, clubGuestAnimationInterval, clubGuestPlan, createClubGuestClock, createClubGuestGreeting } from '../../../../src/components/world/WorldClubDancePlan';
import { loadG24Fixture } from './load-g24-fixture';

const source = await loadG24Fixture(), originalMeshes: SkinnedMesh[] = [];
source.scene.traverse(o => { if (o instanceof SkinnedMesh) originalMeshes.push(o); });
const sharedGeometry = originalMeshes.map(o => o.geometry), sharedMaterials = originalMeshes.map(o => o.material);
// Compare actual bind vertices with the loaded G24, not appearance names/part counts.
originalMeshes[0].skeleton.pose(); source.scene.updateMatrixWorld(true);
const playerPoints: { point: Vector3; bone: string; material: string }[] = [];
for (const mesh of originalMeshes) {
  const p = mesh.geometry.getAttribute('position'), ids = mesh.geometry.getAttribute('skinIndex'), w = mesh.geometry.getAttribute('skinWeight');
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  for (let i = 0; i < p.count; i++) {
    let k = 0; for (let j = 1; j < 4; j++) if (w.getComponent(i, j) > w.getComponent(i, k)) k = j;
    playerPoints.push({ point: source.scene.worldToLocal(new Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)),
      bone: mesh.skeleton.bones[ids.getComponent(i, k)].name.replace(/[._]/g, ''), material: material.name });
  }
}
const playerSize = (filter: (p: typeof playerPoints[number]) => boolean) =>
  new Box3().setFromPoints(playerPoints.filter(filter).map(p => p.point)).getSize(new Vector3());
const playerHead = playerSize(p => p.material === 'guide_helmet_metal');
const playerHeight = playerSize(() => true).y;
const appearances: string[][] = [];
for (const variant of [0, 1] as const) {
  const scene = clone(source.scene), originalClones: SkinnedMesh[] = [];
  scene.traverse(o => { if (o instanceof SkinnedMesh) originalClones.push(o); });
  const guest = createClubGuestAppearance(scene, variant), rendered: SkinnedMesh[] = [];
  scene.traverse(o => { if (o instanceof SkinnedMesh) rendered.push(o); });
  assert.equal(rendered.length, 1); assert.equal(rendered[0], guest.mesh);
  assert.ok(originalClones.every(o => o.parent === null));
  assert.ok(sharedGeometry.every(g => g !== guest.mesh.geometry));
  assert.equal(guest.mesh.userData.reusedPlayerGeometry, false);
  assert.ok(guest.parts.includes('bare-face') && guest.parts.includes('nose'));
  assert.ok(variant ? guest.parts.includes('wide-hat-brim') && guest.parts.includes('navy-trouser-lower')
    : guest.parts.includes('curly-hair') && guest.parts.includes('olive-shorts'));
  assert.ok(guest.triangles < 6000); appearances.push(guest.parts);
  const geometry = guest.mesh.geometry, weights = geometry.getAttribute('skinWeight'), ids = geometry.getAttribute('skinIndex');
  const rangePoints = (name: string) => (guest.mesh.userData.partRanges as { name: string; start: number; count: number }[])
    .filter(p => p.name === name).flatMap(p => Array.from({ length: p.count }, (_, i) => new Vector3().fromBufferAttribute(geometry.getAttribute('position'), p.start + i)));
  const partSize = (name: string) => new Box3().setFromPoints(rangePoints(name)).getSize(new Vector3());
  geometry.computeBoundingBox();
  const guestHead = partSize('bare-face'), guestHeight = geometry.boundingBox!.getSize(new Vector3()).y;
  const ratio = (actual: number, expected: number, min: number, max: number, label: string) =>
    assert.ok(actual / expected >= min && actual / expected <= max, `${label}: ${actual / expected}`);
  ratio(guestHead.z, playerHead.z, .93, 1.02, 'same-species head width');
  ratio(guestHead.y, playerHead.y, .94, 1.02, 'same-species head height');
  ratio(guestHead.y / guestHeight, playerHead.y / playerHeight, .93, 1.06, 'head/body proportion');
  ratio(partSize(variant ? 'loose-linen-shirt' : 'sleeveless-seaglass-top').z,
    playerSize(p => p.material === 'guide_jacket_paint').z, 1, 1.16, 'torso width');
  const limbRatios: Record<string, number> = {};
  for (const [part, bone] of [['upper-arm', 'upperarmL'], ['forearm', 'forearmL'],
    [variant ? 'navy-trouser-upper' : 'exposed-thigh', 'thighL'], [variant ? 'navy-trouser-lower' : 'bare-calf', 'shinL'], ['bare-hand', 'handL']]) {
    limbRatios[part] = partSize(part).x / playerSize(p => p.bone === bone).x;
    assert.ok(limbRatios[part] >= .78 && limbRatios[part] <= 1.16, `${part} thickness ${limbRatios[part]}`);
  }
  // End caps and child joint volumes share exact skeleton pivots, so rotating an
  // arm/knee cannot separate their centers. Check real authored cap vertices.
  const attachments = ['L', 'R'].flatMap(side => [['upper-arm', 'forearm' + side], ['forearm', 'hand' + side],
    [variant ? 'navy-trouser-upper' : 'exposed-thigh', 'shin' + side],
    [variant ? 'navy-trouser-lower' : 'bare-calf', 'foot' + side]]);
  const attachmentVertices: { index: number; bone: typeof guest.mesh.skeleton.bones[number] }[] = [];
  for (const [part, boneName] of attachments) {
    const bone = guest.mesh.skeleton.bones.find(b => b.name.replace(/[._]/g, '') === boneName)!;
    const pivot = scene.worldToLocal(bone.getWorldPosition(new Vector3()));
    assert.ok(Math.min(...rangePoints(part).map(p => p.distanceTo(pivot))) < 1e-6, `${part} connected cap`);
    const ranges = guest.mesh.userData.partRanges as { name: string; start: number; count: number }[];
    let distance = Infinity, index = -1;
    for (const range of ranges.filter(r => r.name === part)) for (let i = range.start; i < range.start + range.count; i++) {
      const d = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), i).distanceTo(pivot);
      if (d < distance) { distance = d; index = i; }
    }
    attachmentVertices.push({ index, bone });
  }
  let maxAttachmentError = 0;
  console.log(JSON.stringify({ appearanceEvidence: variant, playerHeight, guestHeight, playerHead: playerHead.toArray(),
    guestHead: guestHead.toArray(), sourceFrame: guest.mesh.userData.sourceFrame, limbRatios, triangles: guest.triangles }));
  for (let i = 0; i < weights.count; i++) {
    let sum = 0; for (let k = 0; k < 4; k++) sum += weights.getComponent(i, k);
    assert.ok(Math.abs(sum - 1) < 1e-6);
  }
  const footprint: { i: number; side: 'L' | 'R' }[] = [];
  for (let i = 0; i < weights.count; i++) for (const side of ['L', 'R'] as const) {
    let total = 0;
    for (let k = 0; k < 4; k++) if (guest.mesh.skeleton.bones[ids.getComponent(i, k)]?.name.replace(/[._]/g, '') === 'foot' + side) total += weights.getComponent(i, k);
    if (total > .98) footprint.push({ i, side });
  }
  assert.ok(footprint.length >= 100);
  const clips = createClubDanceClips(scene), greeting = createClubGuestGreeting(scene), mixer = new AnimationMixer(scene);
  let floorMin = Infinity, contactGap = 0, contactStep = 0, idleMin = Infinity;
  const point = new Vector3();
  for (const clip of [...clips, source.animations.find(c => c.name === 'Idle')!]) {
    mixer.stopAllAction(); const action = mixer.clipAction(clip).reset().setLoop(LoopRepeat, Infinity).play();
    const previous = new Map<string, Vector3>();
    for (let i = 0; i < Math.ceil(clip.duration * 120); i++) {
      mixer.update(1 / 120); scene.updateMatrixWorld(true); guest.mesh.skeleton.update();
      // Appearance-only check throughout the real dance/Idle poses: rigid limb
      // caps stay inside the rotating joint volumes, rather than opening gaps.
      for (const attachment of attachmentVertices) {
        const p = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), attachment.index);
        guest.mesh.applyBoneTransform(attachment.index, p); p.applyMatrix4(guest.mesh.matrixWorld);
        maxAttachmentError = Math.max(maxAttachmentError, p.distanceTo(attachment.bone.getWorldPosition(new Vector3())));
      }
      const lows = { L: Infinity, R: Infinity };
      for (const foot of footprint) {
        point.fromBufferAttribute(geometry.getAttribute('position'), foot.i); guest.mesh.applyBoneTransform(foot.i, point); point.applyMatrix4(guest.mesh.matrixWorld);
        lows[foot.side] = Math.min(lows[foot.side], point.y);
      }
      if (clip.name === 'Idle') { idleMin = Math.min(idleMin, lows.L, lows.R); continue; }
      floorMin = Math.min(floorMin, lows.L, lows.R);
      const e = clip.userData, frame = Math.min(e.frames as number, Math.round(action.time / clip.duration * (e.frames as number)));
      for (const side of ['L', 'R'] as const) {
        const mask = e['contact' + side] as number[];
        const bone = guest.mesh.skeleton.bones.find(b => b.name.replace(/[._]/g, '') === 'foot' + side)!;
        const p = bone.getWorldPosition(new Vector3());
        if (mask[frame]) contactGap = Math.max(contactGap, lows[side]);
        if (mask[frame] && mask[Math.max(0, frame - 1)] && previous.has(side)) contactStep = Math.max(contactStep, Math.hypot(p.x - previous.get(side)!.x, p.z - previous.get(side)!.z));
        previous.set(side, p);
      }
    }
  }
  assert.ok(floorMin > -.003); assert.ok(contactGap < .006); assert.ok(contactStep < .006);
  assert.ok(idleMin > -.015, `guest idle floor ${idleMin}`);
  assert.ok(maxAttachmentError < 1e-6, `guest joint gap in animated poses ${maxAttachmentError}`);
  console.log(JSON.stringify({ appearanceJointEvidence: variant, maxAttachmentError }));
  // An additive greeting must not write a leg or pelvis, and starts/ends at identity.
  assert.equal(greeting.duration, 1.9);
  for (const track of greeting.tracks) {
    assert.ok(!/pelvis|thigh|shin|foot|root/.test(track.name));
    assert.ok(Array.from(track.values.slice(0, 3)).every(x => Math.abs(x) < 1e-8) && track.values[3] === 1);
    assert.ok(Array.from(track.values.slice(-4, -1)).every(x => Math.abs(x) < 1e-8) && track.values[track.values.length - 1] === 1);
  }
  // Exercise the complete authored phrase arrangement on the new skinned guest.
  // Normal move crossfades and the additive acknowledgement may overlap briefly.
  const idle = mixer.clipAction(source.animations.find(c => c.name === 'Idle')!).reset().play();
  const dances = clips.map(c => mixer.clipAction(c).reset().play());
  const hello = mixer.clipAction(greeting).reset().play();
  [idle, ...dances, hello].forEach(a => { a.paused = true; });
  const localClock = createClubGuestClock(), danceWeights = [0, 0];
  const boneList = guest.mesh.skeleton.bones;
  let lastPoints = boneList.map(b => b.getWorldPosition(new Vector3())), maxPhraseStep = 0, helloTime = 1.9, lastHello = -1, greetings = 0;
  for (let frame = 0; frame < 128 * 60; frame++) {
    const beat = frame / 60, plan = clubGuestPlan(beat, variant), dt = 1 / 120;
    const times = advanceClubGuestClock(localClock, beat, dt, clips.map(c => c.duration));
    dances.forEach((action, i) => {
      danceWeights[i] += ((plan.move === i ? 1 : 0) - danceWeights[i]) * (1 - Math.exp(-dt / .26));
      action.setEffectiveWeight(danceWeights[i]); action.time = times[i];
    });
    idle.setEffectiveWeight(Math.max(0, 1 - danceWeights[0] - danceWeights[1])); idle.time = (frame * dt) % idle.getClip().duration;
    if (plan.greet && lastHello !== plan.phrase) { helloTime = 0; lastHello = plan.phrase; greetings++; }
    helloTime = Math.min(1.9, helloTime + dt); hello.time = Math.min(1.8999, helloTime); hello.setEffectiveWeight(helloTime < 1.9 ? .8 : 0);
    mixer.update(0); scene.updateMatrixWorld(true);
    const points = boneList.map(b => b.getWorldPosition(new Vector3()));
    if (frame > 0) points.forEach((p, i) => maxPhraseStep = Math.max(maxPhraseStep, p.distanceTo(lastPoints[i])));
    lastPoints = points;
  }
  assert.ok(greetings >= 2 && greetings <= 4);
  assert.ok(maxPhraseStep < .035, `phrase pop ${maxPhraseStep}`);
  // The floor is sampled after applying the actual new skinned trainers, not player boot points.
  console.log(JSON.stringify({ variant, draws: rendered.length, triangles: guest.triangles, parts: guest.parts.length, floorMin, contactGap, contactStep, idleMin, greetings, maxPhraseStep }));
  let geometryDisposed = 0, materialDisposed = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++);
  (guest.mesh.material as any).addEventListener('dispose', () => materialDisposed++);
  mixer.stopAllAction(); mixer.uncacheRoot(scene); guest.dispose();
  assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1); assert.equal(guest.mesh.parent, null);
  assert.ok(originalClones.every(o => o.skeleton !== originalMeshes[0].skeleton));
  new Set(originalClones.map(o => o.skeleton)).forEach(s => s.dispose());
}
assert.notDeepEqual(appearances[0], appearances[1]);
assert.deepEqual(originalMeshes.map(o => o.geometry), sharedGeometry);
assert.deepEqual(originalMeshes.map(o => o.material), sharedMaterials);
for (const guest of [0, 1] as const) {
  const modes = new Set(Array.from({ length: 128 }, (_, beat) => clubGuestPlan(beat, guest).move));
  assert.ok(modes.has(0) && modes.has(1) && modes.has(-1));
  assert.ok(Array.from({ length: 128 }, (_, beat) => clubGuestPlan(beat, guest).greet).some(Boolean));
}
// Clock cursors stay continuous through a source seek and have bounded native speed.
const clock = createClubGuestClock(), durations = [2.6333333333333333, 1.3666666666666667];
for (let frame = 0; frame < 1000; frame++) {
  const old = [...clock.times], beat = frame / 60 + (frame >= 500 ? 40 : 0);
  advanceClubGuestClock(clock, beat, 1 / 120, durations);
  clock.times.forEach((time, i) => {
    const change = (time - old[i] + durations[i]) % durations[i];
    assert.ok(change <= .95 / 120 + 1e-6); assert.ok(change >= .55 / 120 - 1e-6);
  });
}
assert.deepEqual(CLUB_DANCE_BEATS, [8, 4]);
assert.equal(clubGuestAnimationInterval(18 * 18, false), 0);
assert.equal(clubGuestAnimationInterval(19 * 19, false), 1 / 15);
assert.equal(clubGuestAnimationInterval(48 * 48, false), 1 / 15);
assert.equal(clubGuestAnimationInterval(48.01 * 48.01, false), null);
assert.equal(clubGuestAnimationInterval(1, true), null);
assert.equal(clubGuestAnimationInterval(NaN, false), null);
console.log('PASS: distinct human guests, one draw each, actual trainer contacts, private disposal, phrase variety and seek-safe playback');
