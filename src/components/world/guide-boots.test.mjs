import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { AnimationMixer, Quaternion, Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { calibrateGuideBootClips } from './WorldGuideBoots.ts';
import { refineGuideBoots } from './WorldGuideShape.ts';
import { GuideSlopeFit, GuideStopStep, skinnedWorldPoint } from './WorldGuideStop.ts';
import { footReferences, glb, loadGuide, motionDigest } from '../../../tools/world/guide/boot-analysis.mjs';

const source = process.env.G24_SOURCE ?? new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url);
const available = existsSync(source), options = { skip: !available && 'set G24_SOURCE to the local uncompressed authoring companion' };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const deg = 180 / Math.PI;
const sourceBytes = clips => clips.map(c => c.tracks.map(t => [Array.from(t.times), Array.from(t.values)]));

async function fixture() {
  const asset = await loadGuide(source);
  const production = glb(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url));
  assert.equal(motionDigest(asset), motionDigest(production), 'companion rig and every source animation sample match production');
  assert.deepEqual(asset.json.animations.map(c => c.extras), production.json.animations.map(c => c.extras), 'production contact metadata also matches');
  const scene = clone(asset.gltf.scene), dispose = refineGuideBoots(scene), refs = footReferences(scene);
  const originals = asset.gltf.animations, before = sourceBytes(originals);
  const trs = []; scene.traverse(o => trs.push([o, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()]));
  const clips = calibrateGuideBootClips(scene, originals);
  assert.deepEqual(sourceBytes(originals), before, 'cached source clips stay immutable');
  for (const [o, p, q, s] of trs) {
    assert.deepEqual(o.position.toArray(), p); assert.deepEqual(o.quaternion.toArray(), q); assert.deepEqual(o.scale.toArray(), s);
  }
  return { scene, refs, originals, clips, dispose };
}

function sample(scene, refs, clip, count = 528) {
  const mixer = new AnimationMixer(scene), action = mixer.clipAction(clip).play(), out = { L: [], R: [] };
  for (let i = 0; i <= count; i++) {
    const time = clip.duration * (i % count) / count;
    mixer.setTime(time); scene.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const f = refs[side], q = f.bone.getWorldQuaternion(new Quaternion()).multiply(f.bindQuaternion.clone().invert());
      const pitch = new Quaternion(0, 0, q.z, q.w).normalize();
      const points = f.points.map(p => skinnedWorldPoint(p.mesh, p.index, new Vector3()));
      const ankle = f.bone.getWorldPosition(new Vector3()), knee = f.bone.parent.getWorldPosition(new Vector3());
      const hip = f.bone.parent.parent.getWorldPosition(new Vector3());
      const topY = Math.max(...f.points.map(p => p.bind.y)), crown = new Vector3(); let topCount = 0;
      f.points.forEach((p, k) => { if (p.bind.y > topY - .005) { crown.add(points[k]); topCount++; } }); crown.divideScalar(topCount);
      const shinAxis = knee.clone().sub(ankle).normalize(), crownOffset = crown.sub(ankle);
      crownOffset.addScaledVector(shinAxis, -crownOffset.dot(shinAxis));
      out[side].push({ time, pitch, angle: q.angleTo(pitch) * deg, points, low: Math.min(...points.map(p => p.y)),
        ankle, hip, shaftOffset: crownOffset.length(), lengths: [ankle.distanceTo(knee), knee.distanceTo(hip)],
        contact: !!clip.userData[`contact${side}`][Math.round(time / clip.duration * clip.userData.frames)] });
    }
  }
  action.stop(); mixer.uncacheRoot(scene); return out;
}

test('G24 boot calibration changes only private Run/Sprint leg rotations and constant hip height', options, async () => {
  const f = await fixture();
  for (const original of f.originals) {
    const clip = f.clips.find(c => c.name === original.name);
    if (!['Run', 'Sprint'].includes(clip.name)) { assert.equal(clip, original); continue; }
    assert.notEqual(clip, original); assert.equal(clip.duration, original.duration); assert.deepEqual(clip.userData, original.userData);
    const pelvisName = f.refs.L.bone.parent.parent.parent.name;
    for (const track of clip.tracks) {
      const old = original.tracks.find(t => t.name === track.name);
      if (!/^(thigh|shin|foot)[._]?[LR]\.quaternion$/.test(track.name) && track.name !== `${pelvisName}.position`) {
        assert.deepEqual(track.values, old.values); assert.deepEqual(track.times, old.times);
      } else {
        const size = track.getValueSize();
        assert.deepEqual(track.values.slice(0, size), track.values.slice(-size), 'closed loop TRS');
        if (size === 4) for (let i = 4; i < track.values.length; i += 4)
          assert.ok(new Quaternion().fromArray(track.values, i).dot(new Quaternion().fromArray(track.values, i - 4)) > .98, 'no quaternion interpolation flips');
      }
    }
  }
  f.dispose();
});

test('real skinned boots lose stance splay while preserving pitch, clearance, leg length and planted pivots', options, async () => {
  const f = await fixture();
  for (const name of ['Run', 'Sprint']) {
    const original = f.originals.find(c => c.name === name), clip = f.clips.find(c => c.name === name);
    const before = sample(f.scene, f.refs, original), after = sample(f.scene, f.refs, clip);
    for (const side of ['L', 'R']) {
      const a = after[side], b = before[side], stance = a.filter(x => x.contact);
      assert.ok(mean(b.filter(x => x.contact).map(x => x.angle)) > 20, 'regression reproduces the source defect');
      assert.ok(mean(stance.map(x => x.angle)) < 2, `${name}/${side}: stance mean`);
      assert.ok(Math.max(...stance.map(x => x.angle)) < 4, `${name}/${side}: stance peak`);
      assert.ok(Math.max(...a.map((x, i) => Math.abs(x.low - b[i].low))) < .0015, `${name}/${side}: actual sole clearance`);
      assert.ok(mean(a.map((x, i) => x.pitch.angleTo(b[i].pitch) * deg)) < 1.5, `${name}/${side}: measured sagittal motion retained`);
      const drop = a.map((x, i) => b[i].hip.y - x.hip.y);
      assert.ok(Math.max(...drop) < .025); assert.ok(Math.max(...drop) - Math.min(...drop) < 1e-6, 'constant small hip drop');
      assert.ok(Math.max(...a.map(x => x.shaftOffset)) < Math.max(...b.map(x => x.shaftOffset)), 'boot crown stays closer to the shin axis');
      for (let i = 0; i < a.length; i++) for (let k = 0; k < 2; k++)
        assert.ok(Math.abs(a[i].lengths[k] - b[i].lengths[k]) < 1e-6, 'bone lengths and ankle chain attachment stay intact');
      let slip = 0, worst;
      for (let i = 1; i < a.length - 1; i++) if (a[i].contact && a[i - 1].contact) {
        const current = a[i], previous = a[i - 1];
        const pivot = current.points.reduce((best, p, j) => p.y < current.points[best].y ? j : best, 0);
        if (previous.points[pivot].y > previous.low + .002) continue;
        const d = current.points[pivot].clone().sub(previous.points[pivot]);
        d.x += clip.userData.designSpeedMps * (current.time - previous.time); d.y = 0;
        if (d.length() > slip) { slip = d.length(); worst = { time: current.time, pivot, d: d.toArray(), low: [current.low, previous.low] }; }
      }
      console.log(JSON.stringify({ name, side, stanceBeforeDeg: mean(b.filter(x => x.contact).map(x => x.angle)),
        stanceAfterDeg: mean(stance.map(x => x.angle)), hipDropM: mean(drop),
        shaftOffsetBeforeM: Math.max(...b.map(x => x.shaftOffset)), shaftOffsetAfterM: Math.max(...a.map(x => x.shaftOffset)),
        maxClearanceChangeM: Math.max(...a.map((x, i) => Math.abs(x.low - b[i].low))), pivotStepSlipM: slip, worst }));
      assert.ok(slip < .0015, `${name}/${side}: planted pivot step slip ${slip} m`);
    }
  }
  f.dispose();
});

test('existing slope and stop writers preserve corrected moving feet on flat ground', options, async () => {
  const f = await fixture(), slope = new GuideSlopeFit(f.scene), stop = new GuideStopStep(f.scene, { scene: f.scene, animations: f.clips });
  const mixer = new AnimationMixer(f.scene), dt = 1 / 240;
  for (const name of ['Run', 'Sprint']) {
    const clip = f.clips.find(c => c.name === name), action = mixer.clipAction(clip).play();
    for (let i = 0; i < 240; i++) {
      const time = clip.duration * i / 240;
      stop.preUpdate({ animation: name, grounded: true, speedMps: clip.userData.designSpeedMps, facing: 0, visible: true, wantsMove: true });
      mixer.setTime(time); f.scene.updateMatrixWorld(true);
      const q = Object.values(f.refs).map(r => r.bone.getWorldQuaternion(new Quaternion()));
      const frame = Math.round(time / clip.duration * clip.userData.frames);
      const contact = { left: clip.userData.contactL[frame], right: clip.userData.contactR[frame] };
      slope.solve(dt, true, () => ({ y: 0, nx: 0, ny: 1, nz: 0 }), 0, contact, stop.pelvisDrop);
      stop.solve(dt);
      Object.values(f.refs).forEach((r, k) => assert.ok(q[k].normalize().angleTo(r.bone.getWorldQuaternion(new Quaternion()).normalize()) < 1e-6));
    }
    action.stop();
  }
  mixer.uncacheRoot(f.scene); stop.dispose(); f.dispose();
});

test('corrected Run/Sprint remain bounded through existing 15 degree uphill/downhill slope IK', options, async () => {
  const f = await fixture();
  for (const name of ['Run', 'Sprint']) for (const angle of [-15, 15]) {
    const reach = {}, stanceReach = {};
    for (const variant of ['before', 'after']) {
    const scene = clone(f.scene), slope = new GuideSlopeFit(scene), mixer = new AnimationMixer(scene);
    const clip = (variant === 'before' ? f.originals : f.clips).find(c => c.name === name), speed = clip.userData.designSpeedMps, dt = 1 / 120;
    const gradient = Math.tan(angle / deg), ny = Math.cos(angle / deg), nx = -Math.sin(angle / deg);
    const feet = footReferences(scene), baseLengths = Object.values(feet).map(f => {
      const a = f.bone.getWorldPosition(new Vector3()), b = f.bone.parent.getWorldPosition(new Vector3()), c = f.bone.parent.parent.getWorldPosition(new Vector3());
      return [a.distanceTo(b), b.distanceTo(c)];
    });
    mixer.clipAction(clip).play(); let maxReach = 0, maxStanceReach = 0;
    for (let i = 0; i < 240; i++) {
      mixer.setTime(i * dt); scene.position.set(speed * i * dt, gradient * speed * i * dt, 0); scene.updateMatrixWorld(true);
      const frame = Math.round((i * dt % clip.duration) / clip.duration * clip.userData.frames);
      const contact = { left: clip.userData.contactL[frame], right: clip.userData.contactR[frame] };
      const ahead = { ...contact };
      for (let k = 0; k <= Math.ceil(.08 / clip.duration * clip.userData.frames); k++) {
        const j = (frame + k) % clip.userData.frames;
        ahead.left = Math.max(ahead.left, clip.userData.contactL[j]); ahead.right = Math.max(ahead.right, clip.userData.contactR[j]);
      }
      slope.solve(dt, true, x => ({ y: gradient * x, nx, ny, nz: 0 }), scene.position.y, contact, 0, ahead);
      const debug = slope.debug(); assert.ok(debug.sharedPelvisDrop <= .0501);
      for (const leg of [debug.left, debug.right]) {
        assert.ok(Math.abs(leg.pitchDeg) <= 20 && Math.abs(leg.rollDeg) <= 20);
        assert.ok(Math.abs(leg.shift) <= .1001); assert.ok(Number.isFinite(leg.reachError)); maxReach = Math.max(maxReach, leg.reachError);
        if (leg.contact > .5) maxStanceReach = Math.max(maxStanceReach, leg.reachError);
      }
      Object.values(feet).forEach((f, k) => {
        const a = f.bone.getWorldPosition(new Vector3()), b = f.bone.parent.getWorldPosition(new Vector3()), c = f.bone.parent.parent.getWorldPosition(new Vector3());
        assert.ok(Math.abs(a.distanceTo(b) - baseLengths[k][0]) < 1e-6);
        assert.ok(Math.abs(b.distanceTo(c) - baseLengths[k][1]) < 1e-6);
      });
    }
    reach[variant] = maxReach; stanceReach[variant] = maxStanceReach;
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
    }
    console.log(JSON.stringify({ name, slopeDeg: angle, maxReachBeforeM: reach.before, maxReachAfterM: reach.after,
      maxStanceReachBeforeM: stanceReach.before, maxStanceReachAfterM: stanceReach.after }));
    assert.ok(stanceReach.after <= stanceReach.before + .001, `${name}/${angle}: existing stance reach error must not materially increase`);
  }
  f.dispose();
});

test('corrected Run/Sprint can enter and finish the existing visual stop step', options, async () => {
  const f = await fixture();
  for (const name of ['Run', 'Sprint']) {
    const scene = clone(f.scene), mixer = new AnimationMixer(scene), stop = new GuideStopStep(scene, { scene, animations: f.clips });
    const run = mixer.clipAction(f.clips.find(c => c.name === name)).play(), idle = mixer.clipAction(f.clips.find(c => c.name === 'Idle'));
    const dt = 1 / 120;
    for (let i = 0; i < 360; i++) {
      const moving = i < 72;
      stop.preUpdate({ animation: moving ? name : 'Idle', grounded: true, speedMps: moving ? run.getClip().userData.designSpeedMps : 0,
        facing: 0, visible: true, wantsMove: moving });
      if (i === 72) { idle.reset().play(); run.crossFadeTo(idle, .24, false); }
      mixer.update(dt); scene.updateMatrixWorld(true); stop.solve(dt);
      const d = stop.debug();
      for (const leg of [d.left, d.right]) { assert.ok(leg.boneLengthError < 1e-6); assert.ok(leg.kneeDot > 0); assert.ok(leg.maxReachError < .01); }
    }
    assert.equal(stop.debug().stopsStarted, 1); assert.equal(stop.active, false);
    mixer.stopAllAction(); mixer.uncacheRoot(scene); stop.dispose();
  }
  f.dispose();
});
