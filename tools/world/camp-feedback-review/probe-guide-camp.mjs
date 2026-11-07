import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GuideCampLayer } from '../../../src/components/world/WorldGuideCamp.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const asset = 'public/assets/world/guide/G24.glb';
const git = (...args) => execFileSync('git', args, { cwd: repo });
const glb = git('show', `HEAD:${asset}`);
const jsonLength = glb.readUInt32LE(12);
const definition = JSON.parse(glb.subarray(20, 20 + jsonLength));
// Keep the shipped skeleton and animation accessors. Omit the Draco skin meshes
// so Node can sample the bones without a WebGL renderer or a Draco worker.
for (const node of definition.nodes) {
  delete node.mesh;
  delete node.skin;
}
delete definition.meshes;
delete definition.extensionsRequired;
delete definition.extensionsUsed;
const json = Buffer.from(JSON.stringify(definition));
const header = Buffer.alloc(20 + Math.ceil(json.length / 4) * 4, 32);
glb.copy(header, 0, 0, 20);
header.writeUInt32LE(header.length + glb.length - 20 - jsonLength, 8);
header.writeUInt32LE(header.length - 20, 12);
json.copy(header, 20);
const packed = new Uint8Array(Buffer.concat([header, glb.subarray(20 + jsonLength)]));
const { scene, animations } = await new GLTFLoader().parseAsync(packed.buffer, '');

const rootPosition = [-42, 4.9, 29];
const yawRadians = [0, 1.6, -2.1];
const idleTimesSeconds = [.05, .72, 1.3];
const poseTimesSeconds = [.15, .22];
const targets = [
  ['floor-.36', [.36, .1001, 0], 'reach'],
  ['floor-.50', [.50, .1001, 0], 'reach'],
  ['floor-.60', [.60, .1001, 0], 'reach'],
  ['floor-.62 side', [.60, .1001, .15], 'reach'],
  ['floor-.65', [.65, .1001, 0], 'grip'],
  ['tool-.60', [.60, .85, 0], 'reach'],
  ['tool-.66', [.66, .95, 0], 'reach'],
  ['suitcase-.66', [.66, .846, 0], 'grip'],
  ['carry', [.35, .86, .31], 'grip'],
].map(([label, localTarget, mode]) => ({ label, localTarget, mode, maxPalmErrorCm: {} }));

const outer = new Group();
outer.add(scene);
outer.position.set(...rootPosition);
const mixer = new AnimationMixer(scene);
mixer.clipAction(animations.find(clip => clip.name === 'Idle')).play();
const layer = new GuideCampLayer(scene);
const bones = ['pelvis', 'spine', 'chest', 'upperarmR', 'forearmR', 'handR', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL']
  .map(name => scene.getObjectByName(name));
const ankles = [bones[8], bones[11]];
const links = [[3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11]];
const position = bone => bone.getWorldPosition(new Vector3());
const orientation = bone => bone.getWorldQuaternion(new Quaternion()).normalize();
const segmentLength = ([a, b]) => position(bones[a]).distanceTo(position(bones[b]));
let samples = 0;
let maxAnkleDriftM = 0, maxAnkleRotationRad = 0, maxSegmentLengthChangeM = 0;
let maxRestoredLocalPositionErrorM = 0, maxRestoredLocalRotationErrorRad = 0;

for (const yaw of yawRadians) for (const idleTime of idleTimesSeconds) for (const elapsed of poseTimesSeconds) {
  outer.rotation.y = yaw;
  mixer.setTime(idleTime);
  for (const target of targets) {
    const point = outer.localToWorld(new Vector3(...target.localTarget));
    const saved = bones.map(bone => [bone.position.clone(), bone.quaternion.clone()]);
    const feet = ankles.map(bone => [position(bone), orientation(bone)]);
    const lengths = links.map(segmentLength);
    const palm = layer.apply(point.toArray(), target.mode, elapsed);
    const timeMs = Math.round(elapsed * 1000);
    target.maxPalmErrorCm[timeMs] = Math.max(target.maxPalmErrorCm[timeMs] ?? 0, new Vector3(...palm).distanceTo(point) * 100);
    samples++;
    ankles.forEach((bone, i) => {
      maxAnkleDriftM = Math.max(maxAnkleDriftM, position(bone).distanceTo(feet[i][0]));
      maxAnkleRotationRad = Math.max(maxAnkleRotationRad, orientation(bone).angleTo(feet[i][1]));
    });
    links.forEach((link, i) => {
      maxSegmentLengthChangeM = Math.max(maxSegmentLengthChangeM, Math.abs(segmentLength(link) - lengths[i]));
    });
    layer.reset();
    bones.forEach((bone, i) => {
      maxRestoredLocalPositionErrorM = Math.max(maxRestoredLocalPositionErrorM, bone.position.distanceTo(saved[i][0]));
      maxRestoredLocalRotationErrorRad = Math.max(maxRestoredLocalRotationErrorRad, bone.quaternion.angleTo(saved[i][1]));
    });
  }
}

for (const target of targets) for (const time of Object.keys(target.maxPalmErrorCm)) {
  target.maxPalmErrorCm[time] = Number(target.maxPalmErrorCm[time].toFixed(2));
}
const implementation = new URL('../../../src/components/world/WorldGuideCamp.ts', import.meta.url);
console.log(JSON.stringify({
  method: 'Shipped G24 skeleton and Idle clip sampled offline. Mesh, boot calibration, physics, props and WebGL are outside this probe.',
  gitHead: git('rev-parse', '--short', 'HEAD').toString().trim(),
  asset,
  assetGitBlob: git('rev-parse', `HEAD:${asset}`).toString().trim(),
  implementationSha256: createHash('sha256').update(readFileSync(implementation)).digest('hex'),
  nodeVersion: process.version,
  rootPosition, yawRadians, idleTimesSeconds, poseTimesSeconds, samples, targets,
  maxAnkleDriftM, maxAnkleRotationRad, maxSegmentLengthChangeM, maxRestoredLocalPositionErrorM, maxRestoredLocalRotationErrorRad,
}, null, 2));
