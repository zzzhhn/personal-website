import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, Group, LoopOnce, SkinnedMesh, Vector3 } from 'three';
import { GuideSeatContact } from './WorldGuideSeat.ts';
import { GUIDE_VEHICLE_TRANSITION_S, GuideVehicleUpperBody, guideVehicleApproach, guideVehicleRoot, guideVehicleSample } from './WorldGuideVehicle.ts';
import { skinnedWorldPoint } from './WorldGuideStop.ts';
import { glb, loadGuide, motionDigest } from '../../../tools/world/guide/boot-analysis.mjs';

test('vehicle windows keep the visible turn/flex and reverse the complete target path on exit', () => {
  assert.equal(GUIDE_VEHICLE_TRANSITION_S, 2.4);
  assert.equal(guideVehicleSample('enter', .20).stage, 'approach');
  assert.equal(guideVehicleSample('enter', .40).stage, 'turn');
  assert.equal(guideVehicleSample('enter', .60).stage, 'flex');
  assert.equal(guideVehicleSample('enter', .85).stage, 'transfer');
  const base = new Vector3(3, 1, 3), door = [3, 1, 1.2], cabin = [2.6, 1.57, .38], contact = new Vector3(-.46, .355, .007);
  let previous = null, maxStep = 0;
  for (let i = 0; i <= 240; i++) {
    const t = i / 240, enter = guideVehicleSample('enter', t), exit = guideVehicleSample('exit', 1 - t);
    for (const key of ['q', 'approach', 'turn', 'sit', 'transfer', 'opacity', 'duck']) assert.ok(Math.abs(exit[key] - enter[key]) < 1e-12);
    if (t <= .79) assert.equal(enter.opacity, 1, 'walk, measured pivot and flex remain fully visible');
    const a = guideVehicleRoot(base, door, cabin, 0, contact, enter, new Vector3());
    const b = guideVehicleRoot(base, door, cabin, 0, contact, exit, new Vector3());
    assert.ok(a.distanceTo(b) < 1e-10);
    if (previous) maxStep = Math.max(maxStep, a.distanceTo(previous)); previous = a;
    assert.ok(a.toArray().every(Number.isFinite));
  }
  assert.ok(maxStep < .04, `finite root path per 10 ms: ${maxStep}`);
  assert.equal(guideVehicleSample('enter', 1).opacity, 0); assert.equal(guideVehicleSample('exit', 1).opacity, 1);
});

test('actual G24 vehicle flex reaches three cabin targets at eight headings and restores the canopy layer', async () => {
  const asset = await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url));
  assert.equal(motionDigest(asset), motionDigest(glb(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url))));
  const { scene, animations } = asset.gltf, contact = new GuideSeatContact(scene, animations), upper = new GuideVehicleUpperBody(scene);
  const root = new Group(); root.add(scene); const mixer = new AnimationMixer(scene), clip = animations.find(c => c.name === 'SitDown');
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.update(clip.duration);
  const chest = scene.getObjectByName('chest'), baseChest = chest.quaternion.clone();
  const pelvis = scene.getObjectByName('pelvis'), basePelvis = pelvis.quaternion.clone();
  upper.apply(1); assert.ok(chest.quaternion.clone().normalize().angleTo(baseChest.clone().normalize()) > .1);
  assert.deepEqual(pelvis.quaternion.toArray(), basePelvis.toArray()); upper.restore(); assert.deepEqual(chest.quaternion.toArray(), baseChest.toArray());
  const targets = [[.05, 1.02, .42], [-.40, .57, .38], [1.18, 1.15, .45]];
  let error = 0;
  for (const target of targets) for (let k = 0; k < 8; k++) {
    root.rotation.y = k * Math.PI / 4; root.position.set(0, 0, 0); root.updateWorldMatrix(true, true);
    const offsetWorld = contact.sample(new Vector3()).sub(root.getWorldPosition(new Vector3()));
    const localContact = offsetWorld.clone().applyAxisAngle(new Vector3(0, 1, 0), -root.rotation.y);
    guideVehicleRoot(new Vector3(2, 0, 2), [0, 0, 1.2], target, root.rotation.y, localContact, guideVehicleSample('enter', 1), root.position);
    root.updateWorldMatrix(true, true); error = Math.max(error, contact.sample(new Vector3()).distanceTo(new Vector3(...target)));
  }
  assert.ok(error < 1e-6); console.log(JSON.stringify({ cabinTargets: targets.length, headings: 8, maxPosteriorTargetErrorM: error }));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
});

test('actual pre-transfer G24 root follows the safe rear-corner route without early cabin pull or shell entry', async () => {
  const { gltf: { scene, animations } } = await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url));
  const root = new Group(); root.add(scene);
  const mixer = new AnimationMixer(scene), contact = new GuideSeatContact(scene, animations), upper = new GuideVehicleUpperBody(scene);
  const meshes = []; scene.traverse(o => { if (o instanceof SkinnedMesh) meshes.push(o); });
  const origin = new Vector3(7, 1, -4), axis = new Vector3(0, 1, 0), point = new Vector3(), expected = new Vector3();
  let rootError = 0, shellVertices = 0, samples = 0, hipBefore = 0, hipAfter = 0;
  for (const side of [-1, 1]) for (let direction = 0; direction < 8; direction++) {
    const yaw = direction * Math.PI / 4;
    const world = p => new Vector3(...p).applyAxisAngle(axis, yaw).add(origin);
    const base = world([-3.3, 0, 0]), door = world([-.4, 0, side * 1.5]).toArray();
    const waypoints = [world([-3.3, 0, side * 1.5]).toArray()], cabin = world([-.4, .57, side * .38]).toArray();
    for (const q of [0, .06, .12, .18, .24, .30, .38, .46, .52, .60, .68]) {
      const sample = guideVehicleSample('enter', q); assert.equal(sample.transfer, 0, 'cabin target cannot act through q=0.68');
      const path = guideVehicleApproach(base, door, waypoints, sample.approach, expected);
      const heading = Math.atan2(-path.dz, path.dx), angle = Math.atan2(Math.sin(yaw - heading), Math.cos(yaw - heading));
      root.rotation.y = heading + angle * sample.turn;
      const name = sample.stage === 'approach' ? 'Walk' : sample.stage === 'turn' ? 'TurnL' : 'SitDown';
      const clip = animations.find(c => c.name === name), a = mixer.clipAction(clip);
      upper.restore(); mixer.stopAllAction(); a.reset().setLoop(LoopOnce, 1).play(); a.clampWhenFinished = true; a.paused = true;
      a.time = (name === 'Walk' ? (q / .3 * 3) % 1 : name === 'TurnL' ? sample.turn : sample.sit) * clip.duration;
      mixer.update(0); upper.apply(sample.duck);
      guideVehicleRoot(base, door, cabin, yaw, contact.reference, sample, root.position, waypoints); root.updateWorldMatrix(true, true);
      rootError = Math.max(rootError, root.getWorldPosition(point).distanceTo(expected), scene.getObjectByName('root').getWorldPosition(point).distanceTo(expected));
      for (const mesh of meshes) for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
        skinnedWorldPoint(mesh, i, point).sub(origin).applyAxisAngle(axis, -yaw);
        if (Math.abs(point.x) < 2.15 && Math.abs(point.z) < .95) shellVertices++;
      }
      if (side === 1 && direction === 0 && (q === .52 || q === .68)) {
        const height = scene.getObjectByName('pelvis').getWorldPosition(point).y - root.position.y;
        if (q === .52) hipBefore = height; else hipAfter = height;
      }
      samples++;
    }
  }
  assert.ok(rootError < 1e-7); assert.equal(shellVertices, 0, 'actual visible skin stays outside the coupe envelope before transfer');
  assert.ok(hipBefore - hipAfter > .12, 'source hips already descend by at least 12 cm before entering the shell');
  console.log(JSON.stringify({ preTransferSamples: samples, maxActualRootErrorM: rootError, earlyShellVertices: shellVertices, preTransferHipDescentM: hipBefore - hipAfter }));
  upper.restore(); mixer.stopAllAction(); mixer.uncacheRoot(scene);
});
