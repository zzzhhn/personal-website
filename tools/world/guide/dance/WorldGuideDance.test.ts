import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { AnimationMixer, Bone, BufferAttribute, BufferGeometry, LoopOnce, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createClubDanceClips, type ClubDanceEvidence } from '../../../../src/components/world/WorldGuideDance.ts';
import { refineGuideBoots } from '../../../../src/components/world/WorldGuideShape.ts';

// Native Draco WASM, no browser, Web Worker, image, renderer or local server.
const require = createRequire(import.meta.url);
const draco = await require('draco3d').createDecoderModule({});
const loader = new GLTFLoader();
loader.setDRACOLoader({ preload() {}, decodeDracoFile(bytes: ArrayBuffer, done: (geometry: BufferGeometry) => void,
  attributes: Record<string, number>) {
  const decoder = new draco.Decoder(), input = new draco.DecoderBuffer(), mesh = new draco.Mesh();
  input.Init(new Int8Array(bytes), bytes.byteLength);
  const status = decoder.DecodeBufferToMesh(input, mesh);
  assert.ok(status.ok(), status.error_msg());
  const geometry = new BufferGeometry();
  for (const [name, id] of Object.entries(attributes)) {
    const attribute = decoder.GetAttributeByUniqueId(mesh, id), size = attribute.num_components();
    const decoded = new draco.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, decoded);
    const array = new Float32Array(mesh.num_points() * size);
    for (let i = 0; i < array.length; i++) array[i] = decoded.GetValue(i);
    geometry.setAttribute(name, new BufferAttribute(array, size)); draco.destroy(decoded);
  }
  const faces = new draco.DracoInt32Array(), indices = new Uint32Array(mesh.num_faces() * 3);
  for (let i = 0; i < mesh.num_faces(); i++) { decoder.GetFaceFromMesh(mesh, i, faces); for (let k = 0; k < 3; k++) indices[i * 3 + k] = faces.GetValue(k); }
  geometry.setIndex(new BufferAttribute(indices, 1));
  draco.destroy(faces); draco.destroy(mesh); draco.destroy(input); draco.destroy(decoder);
  done(geometry);
} } as never);
const bytes = readFileSync(new URL('../../../../public/assets/world/guide/G24.glb', import.meta.url));
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const scene = gltf.scene;
refineGuideBoots(scene);
const bones: Bone[] = [];
scene.traverse(o => { if ((o as Bone).isBone) bones.push(o as Bone); });
const before = bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray()]);
const clips = createClubDanceClips(scene);
assert.deepEqual(bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray()]), before, 'factory must not mutate caller');
assert.deepEqual(clips.map(c => c.name), ['ClubGroove', 'ClubDisco']);
const foot = (side: string) => bones.find(b => b.name.replace(/[._]/g, '') === 'foot' + side)!;
const soles: { mesh: SkinnedMesh; i: number; side: 'L' | 'R' }[] = [];
scene.traverse(o => {
  if (!(o instanceof SkinnedMesh)) return;
  const ids = o.geometry.getAttribute('skinIndex'), weights = o.geometry.getAttribute('skinWeight');
  for (let i = 0; i < ids.count; i++) for (const side of ['L', 'R'] as const) {
    let weight = 0;
    for (let k = 0; k < 4; k++) if (o.skeleton.bones[ids.getComponent(i, k)] === foot(side)) weight += weights.getComponent(i, k);
    if (weight > .98) soles.push({ mesh: o, i, side });
  }
});
assert.ok(soles.length > 20, 'must measure actual refined rendered boots');
const mixer = new AnimationMixer(scene), point = new Vector3();
for (const clip of clips) {
  assert.ok(clip.validate());
  const e = clip.userData as unknown as ClubDanceEvidence;
  assert.equal(e.soleMode, 'rendered-boot');
  assert.ok(e.maxFootRadiusM < 1, `dance must stay inside 1m: ${e.maxFootRadiusM}`);
  assert.ok(e.maxReachErrorM < .003, `must not stretch legs: ${e.maxReachErrorM}`);
  for (const track of clip.tracks) {
    const stride = track.getValueSize();
    for (let k = 0; k < stride; k++) assert.equal(track.values[k], track.values[track.values.length - stride + k], 'loop endpoint');
    assert.ok(Array.from(track.values).every(Number.isFinite));
  }
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  let minFloor = Infinity, maxContactGap = 0, maxContactSlip = 0, maxBoneStep = 0;
  const previous: Record<string, Vector3> = {}, contacts = { L: e.contactL, R: e.contactR };
  const legs = ['L', 'R'].map(s => ['thigh', 'shin', 'foot'].map(p => bones.find(b => b.name.replace(/[._]/g, '') === p + s)!));
  const lengths = legs.map(([h, k, a]) => [h.getWorldPosition(new Vector3()).distanceTo(k.getWorldPosition(new Vector3())), k.getWorldPosition(new Vector3()).distanceTo(a.getWorldPosition(new Vector3()))]);
  for (let frame = 0; frame <= e.frames * 2; frame++) {
    const t = clip.duration * frame / (e.frames * 2);
    mixer.setTime(t); scene.updateMatrixWorld(true);
    for (let side = 0; side < legs.length; side++) {
      const [h, k, a] = legs[side].map(b => b.getWorldPosition(new Vector3()));
      assert.ok(Math.abs(h.distanceTo(k) - lengths[side][0]) < 1e-5);
      assert.ok(Math.abs(k.distanceTo(a) - lengths[side][1]) < 1e-5);
    }
    const floor = { L: Infinity, R: Infinity };
    scene.traverse(o => { if (o instanceof SkinnedMesh) o.skeleton.update(); });
    for (const { mesh, i, side } of soles) {
      point.fromBufferAttribute(mesh.geometry.getAttribute('position'), i); mesh.applyBoneTransform(i, point); point.applyMatrix4(mesh.matrixWorld);
      floor[side] = Math.min(floor[side], point.y); minFloor = Math.min(minFloor, point.y);
    }
    for (const side of ['L', 'R'] as const) {
      const index = Math.min(e.frames, Math.round(frame / 2));
      if (contacts[side][index]) maxContactGap = Math.max(maxContactGap, floor[side]);
      const ankle = foot(side).getWorldPosition(new Vector3());
      if (previous[side] && frame > 1 && contacts[side][index] && contacts[side][Math.max(0, index - 1)]) {
        maxContactSlip = Math.max(maxContactSlip, Math.hypot(ankle.x - previous[side].x, ankle.z - previous[side].z));
      }
      previous[side] = ankle;
    }
    for (const b of bones) {
      const p = b.getWorldPosition(new Vector3()), id = 'bone:' + b.name;
      if (previous[id]) maxBoneStep = Math.max(maxBoneStep, p.distanceTo(previous[id]));
      previous[id] = p;
    }
  }
  const metrics = { clip: clip.name, duration: clip.duration, frames: e.frames, source: e.source,
    minFloor, maxContactGap, maxContactSlipPer120HzFrame: maxContactSlip, maxBoneStepPer120HzFrame: maxBoneStep,
    maxFootRadiusM: e.maxFootRadiusM, maxReachErrorM: e.maxReachErrorM };
  console.log(JSON.stringify(metrics));
  assert.ok(minFloor > -.008, `boot penetration: ${minFloor}`);
  assert.ok(maxContactGap < .012, `contact hover: ${maxContactGap}`);
  assert.ok(maxContactSlip < .012, `stance slip per frame: ${maxContactSlip}`);
  assert.ok(maxBoneStep < .065, `joint discontinuity: ${maxBoneStep}`);
  action.stop(); mixer.uncacheClip(clip);
}
// Exit requests may occur at any phase. Clips leave all travel/input ownership with
// WorldActors; verify normal Three fades are continuous at several non-beat boundaries.
const walk = gltf.animations.find(c => c.name === 'Walk')!;
assert.ok(walk);
let maxExitStep = 0;
for (const clip of clips) for (const phase of [.07, .31, .63, .91]) {
  mixer.stopAllAction();
  const dance = mixer.clipAction(clip).reset().play(); dance.time = clip.duration * phase;
  mixer.update(0); scene.updateMatrixWorld(true);
  const next = mixer.clipAction(walk).reset().setEffectiveWeight(1).play();
  dance.crossFadeTo(next, .22, false);
  let previous = bones.map(b => b.getWorldPosition(new Vector3()));
  for (let i = 0; i < 40; i++) {
    mixer.update(1 / 120); scene.updateMatrixWorld(true);
    const now = bones.map(b => b.getWorldPosition(new Vector3()));
    for (let j = 0; j < now.length; j++) {
      assert.ok(now[j].toArray().every(Number.isFinite));
      maxExitStep = Math.max(maxExitStep, now[j].distanceTo(previous[j]));
    }
    previous = now;
  }
  assert.ok(dance.getEffectiveWeight() < .001);
  assert.ok(next.getEffectiveWeight() > .999);
}
assert.ok(maxExitStep < .10, `dance-to-walk discontinuity: ${maxExitStep}`);
console.log(JSON.stringify({ exitBlendSeconds: .22, phasesPerClip: 4, maxJointStepPer120HzFrame: maxExitStep }));
mixer.stopAllAction(); mixer.uncacheRoot(scene);
console.log('PASS: independent mocap-derived clips, rendered-foot contacts, loop endpoints, fixed bone lengths and caller isolation');
