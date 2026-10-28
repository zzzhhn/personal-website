import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { AnimationMixer, DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import ts from 'typescript';
import { COASTER_BOARDING as B, COASTER_STAIR_SPEED, advanceCoasterTransition, captureCoasterStart, coasterAtBoardingEntrance,
  coasterBoardingGround, coasterTransitionDuration, createCoasterTransition, returnCoasterToStation } from './coaster-transition.ts';
import { coasterRidePose } from './coaster-track.ts';
import { attractionRide, beginAttractionRide, completeAttractionRide, endAttractionRide, requestAttractionExit } from './attraction-ride.ts';
import { createCoasterCar, createCoasterStructure } from './coaster-geometry.ts';
import { settleGuideAttraction, GuideAttractionFeet } from '../WorldGuideAttraction.ts';
import { GuideSeatContact, holdGuideSeatIdle } from '../WorldGuideSeat.ts';
import { GuideSlopeFit, skinnedWorldPoint } from '../WorldGuideStop.ts';
import { GuidePhaseModel } from '../WorldGuidePhase.ts';
import { glb, loadGuide, motionDigest } from '../../../../tools/world/guide/boot-analysis.mjs';
const pose = coasterRidePose(0, 'chase');
function start() {
  const from = [B.approach[0] - .4, B.platformY, B.approach[2] + .2];
  const t = createCoasterTransition(from, 0, pose); captureCoasterStart(t, from, 0); return t;
}
function tick(t, dt = 1 / 60) { return advanceCoasterTransition(t, dt, false, pose); }
function until(t, target) {
  for (let i = 0; i < 6000 && t.phase !== target; i++) tick(t);
  assert.equal(t.phase, target);
}
test('click waits for the exact physics pose; boarding approaches, jogs, turns, sits and settles before dispatch', () => {
  const t = createCoasterTransition(B.approach, 0, pose);
  for (let i = 0; i < 60; i++) tick(t);
  assert.equal(t.elapsed, 0); assert.equal(t.phase, 'approach');
  const actual = [B.approach[0] - .1, B.platformY + .02, B.approach[2]];
  captureCoasterStart(t, actual, .4); assert.deepEqual(t.frame.root, actual);
  captureCoasterStart(t, [0, 0, 0], 0); assert.deepEqual(t.frame.root, actual);
  const visited = new Set(); let previous = t.frame.root;
  for (let i = 0; i < 3000 && t.phase !== 'riding'; i++) {
    const f = tick(t); visited.add(t.phase);
    if (t.phase !== 'riding') assert.ok(new Vector3(...f.root).distanceTo(new Vector3(...previous)) < .05, 'continuous station foot datum at 60 Hz');
    previous = f.root;
  }
  assert.deepEqual([...visited], ['approach', 'step-in', 'turn-in', 'sit', 'settle', 'riding']);
  assert.equal(t.frame.seatWeight, 1); assert.equal(t.frame.clip, 'SitIdle');
});
test('the stair jog traverses every tread in about two seconds and eases into the stationary turns', () => {
  for (const phase of ['step-in', 'step-out']) {
    const t = start(); t.phase = phase;
    const duration = coasterTransitionDuration(t);
    assert.ok(duration > 1.7 && duration < 2.4, `stair duration ${duration}`);
    let maximum = 0; const heights = new Set();
    for (let i = 0; i < 240; i++) {
      t.elapsed = i / 240 * duration;
      const f = tick(t, 1e-6);
      assert.equal(f.clip, 'Run'); maximum = Math.max(maximum, f.speed);
      assert.ok(f.speed <= COASTER_STAIR_SPEED + 1e-8);
      if (i === 0 || i === 239) assert.ok(f.speed < .1, 'no high-speed pop into the next pose');
      for (let j = 0; j < B.stairs.length; j++) if (Math.abs(f.root[1] - B.stairs[j].top) < .035) heights.add(j);
    }
    assert.equal(maximum, COASTER_STAIR_SPEED); assert.equal(heights.size, 6);
  }
});
test('pause, tab hiding and stale-frame gaps freeze every boarding and exit phase', () => {
  for (const phase of ['approach', 'step-in', 'turn-in', 'sit', 'settle', 'riding', 'stand', 'turn-out', 'step-out', 'walk-out']) {
    const t = start(); t.phase = phase; t.elapsed = .2; tick(t);
    for (const [dt, frozen] of [[.016, true], [1, false], [NaN, false], [-1, false], [0, false]]) {
      const before = structuredClone(t); advanceCoasterTransition(t, dt, frozen, pose); assert.deepEqual(t, before);
    }
  }
});
test('boarding cancellation never dispatches; moving exits do not jump to the station', () => {
  for (const phase of ['approach', 'step-in', 'turn-in', 'sit', 'settle']) {
    const t = start(); t.phase = phase; t.exitRequested = true;
    for (let i = 0; i < 6000 && t.phase !== 'complete'; i++) { tick(t); assert.notEqual(t.phase, 'riding'); }
    assert.equal(t.phase, 'complete'); assert.deepEqual(t.frame.root, B.exit);
  }
  const t = start(); until(t, 'riding'); t.exitRequested = true;
  for (let i = 0; i < 600; i++) tick(t);
  assert.equal(t.phase, 'riding'); assert.equal(t.frame.seatWeight, 1);
  returnCoasterToStation(t); const phases = new Set([t.phase]);
  for (let i = 0; i < 4000 && t.phase !== 'complete'; i++) { tick(t); phases.add(t.phase); }
  assert.deepEqual([...phases], ['stand', 'turn-out', 'step-out', 'walk-out', 'complete']);
  assert.equal(t.frame.seatWeight, 0); assert.deepEqual(t.frame.root, B.exit);
});
test('bridge exit requests retain ownership; explicit camp recovery invalidates it', () => {
  endAttractionRide(); assert.equal(beginAttractionRide(pose, B.exit, B.approach), true);
  const revision = attractionRide.revision; requestAttractionExit();
  assert.equal(attractionRide.active, true); assert.equal(attractionRide.revision, revision);
  assert.equal(attractionRide.transition.exitRequested, true);
  endAttractionRide(); assert.equal(attractionRide.active, false); assert.equal(attractionRide.transition, null);
  assert.ok(attractionRide.revision > revision);
  beginAttractionRide(pose, B.exit, B.approach); completeAttractionRide();
  assert.equal(attractionRide.completed, true); assert.equal(attractionRide.active, false); endAttractionRide();
});
test('the entry apron, six real tread tops and clear car opening agree with the animated route', () => {
  assert.ok(coasterAtBoardingEntrance(B.approach)); assert.equal(coasterAtBoardingEntrance(B.inside), false);
  const structure = createCoasterStructure(true), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(structure.steel, material); mesh.updateMatrixWorld(true);
  for (const tread of B.stairs) {
    assert.ok(tread.size[1] > 0);
    assert.ok(structure.colliders.some(c => c.surface && c.position.every((v, i) => Math.abs(v - tread.position[i]) < 1e-8)));
    const ray = new Raycaster(new Vector3(tread.position[0], tread.top + .1, tread.position[2]), new Vector3(0, -1, 0), 0, .2);
    const hit = ray.intersectObject(mesh)[0]; assert.ok(hit); assert.ok(Math.abs(hit.point.y - tread.top) < 1e-5);
    assert.ok(Math.abs(coasterBoardingGround(tread.position[0], tread.position[2]) - tread.top) < 1e-8);
  }
  assert.ok((B.floorY - B.platformY) / 6 < .21);
  const carGeometry = createCoasterCar(), car = new Mesh(carGeometry, material); car.updateMatrixWorld(true);
  for (const x of [.6, .82, 1.05]) for (const y of [.5, .85, 1.05]) {
    const ray = new Raycaster(new Vector3(x, y, -1.2), new Vector3(0, 0, 1), 0, 1.2);
    assert.equal(ray.intersectObject(car).length, 0, `clear side passage at ${x}, ${y}`);
  }
  assert.ok(new Vector3(...B.exit).distanceTo(new Vector3(...B.stairs[0].position)) > 1.2, 'exit has clearance from the bottom stair');
  structure.steel.dispose(); structure.glow.dispose(); carGeometry.dispose(); material.dispose();
});
const source = new URL('../../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url);
test('actual running boot soles clear all six treads going up and down', { skip: !existsSync(source) }, async context => {
  const { gltf } = await loadGuide(source), { scene, animations } = gltf;
  const parent = new Group(), root = new Group(); parent.add(root); root.add(scene);
  let design = { Walk: 1.5, Run: 3.6, Sprint: 6.2 };
  scene.traverse(o => { if (o.userData.clipDesignSpeedMps) design = { ...design, ...JSON.parse(o.userData.clipDesignSpeedMps) }; });
  const phaseModel = GuidePhaseModel.fromGLTF(gltf, { authoredSpeed: design, clips: ['Idle', 'Walk', 'Run', 'Sprint'] });
  const mixer = new AnimationMixer(scene), action = mixer.clipAction(animations.find(c => c.name === 'Run')).play();
  const contact = new GuideSeatContact(scene, animations), slope = new GuideSlopeFit(scene), feet = new GuideAttractionFeet();
  let minimum = Infinity, samples = 0;
  for (const phase of ['step-in', 'step-out']) for (const startPhase of [0, .3, .6]) {
    feet.restore(); feet.apply(slope, null, 0); action.reset().play(); action.time = startPhase * action.getClip().duration;
    const t = start(); t.phase = phase; let previous = null;
    while (t.phase === phase) {
      feet.restore(); const f = tick(t, 1 / 120); if (t.phase !== phase) break;
      const travel = previous ? Math.hypot(f.root[0] - previous[0], f.root[2] - previous[2]) : 0;
      action.setEffectiveTimeScale(phaseModel.timeScale('Run', action.time, travel, 1 / 120, 'contact'));
      mixer.update(1 / 120); settleGuideAttraction(root, contact, f); feet.apply(slope, f, 1 / 120); root.updateWorldMatrix(true, true);
      for (const leg of Object.values(slope.legs)) for (const p of leg.sole) {
        const v = skinnedWorldPoint(p.mesh, p.index, new Vector3()), ground = coasterBoardingGround(v.x, v.z);
        if (ground !== null) {
          const clearance = v.y - ground; minimum = Math.min(minimum, clearance); samples++;
          assert.ok(clearance >= -.01, `${phase}, clip phase ${startPhase}, tread penetration ${clearance}`);
        }
      }
      previous = [...f.root];
    }
  }
  mixer.stopAllAction(); context.diagnostic(`${samples} sole/tread samples; minimum clearance ${minimum.toFixed(6)} m`);
});
test('actual G24 seat patch follows full train rotation despite an interpolated parent; tread IK restores bones', { skip: !existsSync(source) }, async () => {
  const asset = await loadGuide(source);
  assert.equal(motionDigest(asset), motionDigest(glb(new URL('../../../../public/assets/world/guide/G24.glb', import.meta.url))));
  const { scene, animations } = asset.gltf, parent = new Group(), root = new Group(); parent.add(root); root.add(scene);
  const mixer = new AnimationMixer(scene), contact = new GuideSeatContact(scene, animations);
  const action = holdGuideSeatIdle(mixer.clipAction(animations.find(c => c.name === 'SitIdle'))).play(); mixer.update(1);
  for (let i = 0; i <= 40; i++) {
    const p = coasterRidePose(i / 40, 'first-person');
    parent.position.set(i / 3, 2, -4); parent.rotation.y = .3; parent.updateMatrixWorld(true);
    settleGuideAttraction(root, contact, { root: p.seat, seat: p.seat, seatWeight: 1, yaw: p.yaw, orientation: p.orientation, speed: 0, clip: 'SitIdle' });
    assert.ok(contact.sample(new Vector3()).distanceTo(new Vector3(...p.seat)) < 1e-6);
  }
  action.stop(); mixer.clipAction(animations.find(c => c.name === 'Run')).play(); mixer.update(.2);
  const slope = new GuideSlopeFit(scene), feet = new GuideAttractionFeet(), t = start(); t.phase = 'step-in'; t.elapsed = coasterTransitionDuration(t) * .4; tick(t);
  settleGuideAttraction(root, contact, t.frame);
  const bones = Object.values(slope.legs).flatMap(l => [l.thigh, l.shin, l.foot]);
  const before = bones.map(b => b.quaternion.clone()); feet.apply(slope, t.frame, 1 / 60);
  assert.ok(bones.every(b => b.quaternion.toArray().every(Number.isFinite)));
  feet.restore(); bones.forEach((b, i) => assert.ok(b.quaternion.angleTo(before[i]) < 1e-6));
  mixer.stopAllAction();
});
test('the changed React integration files have no TypeScript syntax diagnostics', () => {
  for (const name of ['../WorldActors.tsx', '../WorldGuide.tsx', 'WorldIntentCoaster.tsx', 'WorldIntentHud.tsx', 'intent-state.ts']) {
    const result = ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), { fileName: name, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } });
    assert.deepEqual(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), [], name);
  }
});
