import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, SkinnedMesh, Vector3, VectorKeyframeTrack, type Bone, type Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import capture from './guide-data/cmu-club.json';

export type ClubDanceName = 'ClubGroove' | 'ClubDisco';
/** Deliberate half-time choreography. Captures remain available at their original duration. */
export const CLUB_DANCE_BEATS = [8, 4] as const;
export function clubDanceSampleTime(step: 0 | 1, beat: number, duration: number, phase = 0) {
  const cycle = beat / CLUB_DANCE_BEATS[step] + phase;
  return ((cycle % 1 + 1) % 1) * duration;
}
export interface ClubDanceEvidence {
  source: string; sourceUrl: string; licenseUrl: string; sourceFrames: number[];
  frames: number; loop: true; designSpeedMps: 0; contactL: number[]; contactR: number[];
  /** Captured style is stated honestly; display names do not certify a dance genre. */
  style: string;
  soleMode: 'rendered-boot' | 'G24-footprint-fallback';
  maxReachErrorM: number;
  maxFootRadiusM: number;
  sourceDurationSeconds: number;
  beatsPerLoop: number;
  maxPelvisCorrectionM: number;
  adapted: string[];
}

const SIDES = ['L', 'R'] as const;
const v = (a: number[]) => new Vector3().fromArray(a);
const q = (a: number[]) => new Quaternion().fromArray(a);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const easeStep = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const key = (name: string) => name.replace(/[._]/g, '');

/** Authored footwork in G24 world axes: +X forward, Z lateral. This replaces the
 * capture's small, retargeted ankle residuals, not its provenance. A beat contains
 * one supported swing with zero velocity/acceleration at lift-off and touchdown. */
function dancePhrase(step: number, beat: number) {
  const b = ((beat % 4) + 4) % 4, part = Math.floor(b), f = b - part;
  const u = clamp((f - .08) / .84, 0, 1), blend = easeStep(u);
  const at = (a: number, z: number) => a + (z - a) * blend;
  const moving: 'L' | 'R' = step === 0 ? (part === 0 || part === 3 ? 'L' : 'R') : (part < 2 ? 'L' : 'R');
  const feet = step === 0
    ? { L: new Vector3(0, 0, part === 0 ? at(.015, -.225) : part === 3 ? at(-.225, .015) : -.225),
      R: new Vector3(0, 0, part === 1 ? at(.225, -.015) : part === 2 ? at(-.015, .225) : .225) }
    : { L: new Vector3(part === 0 ? at(-.02, .14) : part === 1 ? at(.14, -.02) : -.02, 0, -.13),
      R: new Vector3(part === 2 ? at(-.02, .14) : part === 3 ? at(.14, -.02) : -.02, 0, .13) };
  const phase = b * Math.PI / 2;
  // Transfer over two beats, while the stepping foot moves over one. A one-beat
  // pelvis snap made the support knee extend too fast even with planted ankles.
  const weight = Math.cos(phase);
  return { feet, moving, contact: u === 0 || u === 1, lift: .020 * Math.sin(Math.PI * u) ** 2,
    hip: step === 0 ? new Vector3(.008 * Math.sin(phase), 0, .075 * weight)
      : new Vector3(.045 + .015 * Math.sin(phase), 0, .035 * Math.cos(phase)),
    phase, weight };
}

interface Limb { thigh: Bone; shin: Bone; foot: Bone; l1: number; l2: number; bind: Quaternion;
  thighDir: Vector3; shinDir: Vector3; sole: Vector3[] }
interface Row { hip: Vector3; targets: Record<'L' | 'R', Vector3>; poles: Record<'L' | 'R', Vector3>;
  feet: Record<'L' | 'R', Quaternion> }

function worldRotation(bone: Bone, rotation: Quaternion) {
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
  bone.updateMatrixWorld(true);
}

/** Circular low-pass filtering includes the seam. No near-zero knee pole or captured
 * endpoint correction is allowed to become a one-frame direction reversal. */
function filteredVectors(samples: number[][], n: number) {
  const weights = [1, 4, 7, 10, 12, 10, 7, 4, 1], sum = weights.reduce((a, b) => a + b, 0);
  return Array.from({ length: n + 1 }, (_, i) => {
    const out = new Vector3();
    weights.forEach((w, k) => out.addScaledVector(v(samples[(i + n + k - 4) % n]), w / sum));
    return out;
  });
}

function filteredRotations(samples: number[][], n: number) {
  const weights = [1, 4, 7, 10, 12, 10, 7, 4, 1];
  return Array.from({ length: n + 1 }, (_, i) => {
    const ref = q(samples[i % n]), out = [0, 0, 0, 0];
    weights.forEach((w, k) => {
      const a = q(samples[(i + n + k - 4) % n]);
      a.toArray().forEach((x, c) => out[c] += x * w * (ref.dot(a) < 0 ? -1 : 1));
    });
    return new Quaternion(...out as [number, number, number, number]).normalize();
  });
}

/** Generate two private clips against the current G24 bind skeleton. Call before creating live
 * AnimationActions. Uses a private clone and restores no shared transforms because none are changed.
 * This is an authored anatomical retarget of real captured curves, not verbatim mocap replay:
 * source upper-body residuals and shallow vertical phrasing remain; horizontal
 * footwork/support transfer and arm coordination are explicitly authored edits.
 * No browser, worker, audio context, timers, root translation or model export is involved.
 * The caller owns LoopRepeat, fades, music phase, input and switching off idle/stop/mine writers. */
export function createClubDanceClips(scene: Object3D): AnimationClip[] {
  const work = clone(scene), bones = new Map<string, Bone>();
  work.traverse(o => { if (o instanceof SkinnedMesh) o.skeleton.pose(); });
  work.updateMatrixWorld(true);
  work.traverse(o => { if ((o as Bone).isBone) bones.set(key(o.name), o as Bone); });
  const required = ['pelvis', 'spine', 'chest', 'neck', 'head', ...SIDES.flatMap(s => ['thigh', 'shin', 'foot', 'upperarm', 'forearm', 'hand'].map(n => n + s))];
  for (const name of required) if (!bones.has(name)) throw new Error(`Club dance requires G24 bone ${name}`);
  const bone = (n: string) => bones.get(n)!;
  const saved = new Map([...bones].map(([name, b]) => [name, { p: b.position.clone(), q: b.quaternion.clone(),
    w: b.getWorldQuaternion(new Quaternion()), point: b.getWorldPosition(new Vector3()) }]));
  const legs = {} as Record<'L' | 'R', Limb>;
  const restHip = new Vector3();
  for (const side of SIDES) {
    const thigh = bone('thigh' + side), shin = bone('shin' + side), foot = bone('foot' + side);
    const h = thigh.getWorldPosition(new Vector3()), k = shin.getWorldPosition(new Vector3()), a = foot.getWorldPosition(new Vector3());
    restHip.addScaledVector(h, .5);
    legs[side] = { thigh, shin, foot, l1: h.distanceTo(k), l2: k.distanceTo(a), bind: saved.get('foot' + side)!.w,
      thighDir: k.clone().sub(h).normalize(), shinDir: a.clone().sub(k).normalize(), sole: [] };
  }
  work.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const ids = o.geometry.getAttribute('skinIndex'), weights = o.geometry.getAttribute('skinWeight');
    if (!ids || !weights) return;
    o.skeleton.update();
    for (let i = 0; i < ids.count; i++) for (const side of SIDES) {
      const leg = legs[side]; let weight = 0;
      for (let k = 0; k < 4; k++) if (o.skeleton.bones[ids.getComponent(i, k)] === leg.foot) weight += weights.getComponent(i, k);
      if (weight < .98) continue;
      const p = new Vector3().fromBufferAttribute(o.geometry.getAttribute('position'), i);
      o.applyBoneTransform(i, p); p.applyMatrix4(o.matrixWorld);
      leg.sole.push(p.sub(saved.get('foot' + side)!.point).applyQuaternion(leg.bind.clone().invert()));
    }
  });
  const rendered = SIDES.every(s => legs[s].sole.length >= 4);
  // Only skeleton-only QA fixtures need this documented G24 boot envelope.
  if (!rendered) for (const side of SIDES) legs[side].sole = [-.096, .145].flatMap(x => [-.085, .085].map(z =>
    new Vector3(x, -.095, z).applyQuaternion(legs[side].bind.clone().invert())));
  const legLength = (legs.L.l1 + legs.L.l2 + legs.R.l1 + legs.R.l2) / 2;
  const pelvis = bone('pelvis');

  return capture.clips.map((data, step) => {
    const restore = () => { for (const [name, b] of bones) { const s = saved.get(name)!; b.position.copy(s.p); b.quaternion.copy(s.q); } work.updateMatrixWorld(true); };
    restore();
    const duration = data.duration, n = data.frames, times = Float32Array.from({ length: n + 1 }, (_, i) => i * duration / n);
    const rotations = Object.fromEntries(Object.entries(data.rotations).map(([name, samples]) => [name, filteredRotations(samples, n)]));
    const sourceQ = (seg: string, i: number) => rotations[seg][i].clone();
    const hips = filteredVectors(data.hip, n);
    const meanHip = hips.slice(0, n).reduce((sum, p) => sum.addScaledVector(p, 1 / n), new Vector3());
    const means = Object.fromEntries(Object.entries(rotations).map(([name, samples]) => {
      const mean = [0, 0, 0, 0], ref = samples[0];
      samples.slice(0, n).forEach(a => a.toArray().forEach((x, c) => mean[c] += x * (ref.dot(a) < 0 ? -1 : 1)));
      return [name, new Quaternion(...mean as [number, number, number, number]).normalize()];
    }));
    const posture = (name: string, seg: string, i: number, amplitude: number) => {
      const d = sourceQ(seg, i).multiply(means[seg].clone().invert());
      const angles = new Euler().setFromQuaternion(d, 'YXZ');
      angles.x = clamp(angles.x * amplitude, -.055, .055);
      angles.y = clamp(angles.y * amplitude, -.19, .19);
      angles.z = clamp(angles.z * amplitude, -.07, .07);
      return new Quaternion().setFromEuler(angles).multiply(saved.get(name)!.w);
    };
    const armCurves = {} as Record<'L' | 'R', Vector3[]>;
    for (const side of SIDES) {
      const lower = side.toLowerCase();
      const samples = Array.from({ length: n + 1 }, (_, i) => {
        const upper = v((data.rest as Record<string, number[]>)[lower + 'humerus']).applyQuaternion(sourceQ(lower + 'humerus', i)).normalize();
        const fore = v((data.rest as Record<string, number[]>)[lower + 'radius']).applyQuaternion(sourceQ(lower + 'radius', i)).normalize();
        return [clamp(Math.atan2(upper.x, Math.abs(upper.y) + .12), -.25, .65),
          clamp(Math.asin(clamp(upper.z * (side === 'L' ? -1 : 1), -1, 1)), .53, .88), clamp(upper.angleTo(fore), .3, 1.25)];
      });
      // Filtering the anatomical angles after projection also removes angle-branch
      // edges. Quaternion filtering alone cannot repair an atan2/hinge branch crossing.
      armCurves[side] = filteredVectors(filteredVectors(samples, n).map(p => p.toArray()), n);
    }
    const phrases = Array.from({ length: n + 1 }, (_, i) => dancePhrase(step, i / n * CLUB_DANCE_BEATS[step as 0 | 1]));
    const contacts = { L: [] as number[], R: [] as number[] };
    const rows: Row[] = [];
    for (let i = 0; i <= n; i++) {
      const phrase = phrases[i];
      // Source vertical phrasing remains shallow; lateral support transfer is authored.
      // Extra width is absorbed by a common IK height correction, never bone scaling.
      const hip = phrase.hip.clone();
      hip.y = restHip.y - (step === 0 ? .028 : .030) + clamp((hips[i].y - meanHip.y) * legLength * .05, -.003, .003);
      const row = { hip, targets: {}, poles: {}, feet: {} } as Row;
      for (const side of SIDES) {
        const lower = side.toLowerCase(), target = phrase.feet[side].clone();
        const deformation = sourceQ(lower + 'foot', i).multiply(means[lower + 'foot'].clone().invert());
        const angles = new Euler().setFromQuaternion(deformation, 'YXZ');
        const contact = side !== phrase.moving || phrase.contact;
        contacts[side].push(Number(contact));
        const airborne = contact ? 0 : phrase.lift / .020;
        angles.x = clamp(angles.x * .15, -.035, .035) * airborne;
        angles.y = clamp(angles.y * .3, -.12, .12) * airborne;
        angles.z = clamp(angles.z * .25, -.07, .07) * airborne;
        const foot = new Quaternion().setFromEuler(angles).multiply(legs[side].bind);
        let soleY = Infinity;
        for (const p of legs[side].sole) soleY = Math.min(soleY, p.clone().applyQuaternion(foot).y);
        target.y = -soleY + (contact ? 0 : phrase.lift);
        row.targets[side] = target;
        row.poles[side] = new Vector3(1, 0, side === 'L' ? -.08 : .08);
        row.feet[side] = foot;
      }
      rows.push(row);
    }
    // Authored stance positions are constant already. Do not re-pin with CMU contact
    // labels: those describe the old source footwork and would erase these steps.
    const values = new Map(required.map(name => [name, [] as number[]]));
    const pelvisPositions: number[] = [];
    let maxReachError = 0, maxFootRadius = 0, maxPelvisCorrection = 0;
    for (let i = 0; i <= n; i++) {
      restore();
      const phrase = phrases[i], row = rows[i];
      const pelvisQ = new Quaternion().setFromEuler(new Euler(-.025 * phrase.weight,
        (step === 0 ? .035 : .10) * Math.sin(phrase.phase), 0)).multiply(posture('pelvis', 'root', i, step === 0 ? .32 : .22));
      const hip = row.hip.clone();
      // Avoid unreachable targets by lowering the pelvis, preserving lengths. Both legs share it.
      const restOffset = restHip.clone().sub(saved.get('pelvis')!.point).applyQuaternion(pelvisQ.clone().multiply(saved.get('pelvis')!.w.clone().invert()));
      const pelPoint = hip.sub(restOffset);
      pelvis.position.copy(pelvis.parent!.worldToLocal(pelPoint)); worldRotation(pelvis, pelvisQ);
      for (const [name, seg] of [['spine', 'upperback'], ['chest', 'thorax'], ['head', 'head']]) {
        const counter = name === 'head' ? .25 : 1;
        worldRotation(bone(name), new Quaternion().setFromEuler(new Euler(.045 * phrase.weight * counter,
          (step === 0 ? -.055 : -.16) * Math.sin(phrase.phase) * counter, 0)).multiply(posture(name, seg, i, .4)));
      }
      worldRotation(bone('neck'), bone('chest').getWorldQuaternion(new Quaternion()).slerp(bone('head').getWorldQuaternion(new Quaternion()), .5));
      for (const side of SIDES) {
        const arm = bone('upperarm' + side), fore = bone('forearm' + side);
        const captured = armCurves[side][i], sign = side === 'L' ? -1 : 1;
        const pulse = Math.sin(phrase.phase + (side === 'L' ? 0 : Math.PI));
        const swing = captured.x * .35 + (step === 0 ? .30 * pulse : .25 + .30 * pulse);
        const abduction = step === 0 ? .63 + .10 * pulse + (captured.y - .7) * .25
          : .88 + .16 * pulse + (captured.y - .7) * .25;
        const flexion = step === 0 ? .85 - .23 * pulse + (captured.z - .8) * .25
          : 1.05 + .28 * sign * Math.cos(phrase.phase) + (captured.z - .8) * .25;
        const direction = new Vector3(Math.cos(abduction) * Math.sin(swing), -Math.cos(abduction) * Math.cos(swing), Math.sin(abduction) * (side === 'L' ? -1 : 1));
        const armRest = saved.get('forearm' + side)!.point.clone().sub(saved.get('upperarm' + side)!.point).normalize();
        worldRotation(arm, new Quaternion().setFromUnitVectors(armRest, direction).multiply(saved.get('upperarm' + side)!.w));
        const bend = new Vector3(1, 0, 0).addScaledVector(direction, -direction.x).normalize();
        const foreDirection = direction.clone().multiplyScalar(Math.cos(flexion)).addScaledVector(bend, Math.sin(flexion));
        const foreRest = saved.get('hand' + side)!.point.clone().sub(saved.get('forearm' + side)!.point).normalize();
        worldRotation(fore, new Quaternion().setFromUnitVectors(foreRest, foreDirection).multiply(saved.get('forearm' + side)!.w));
        worldRotation(bone('hand' + side), bone('forearm' + side).getWorldQuaternion(new Quaternion()));
      }
      // Compute a common hip-height correction before the analytic two-bone solves.
      let lowerBy = 0;
      for (const side of SIDES) {
        const leg = legs[side], h = leg.thigh.getWorldPosition(new Vector3()), a = row.targets[side];
        const horizontal = Math.hypot(a.x - h.x, a.z - h.z), reach = (leg.l1 + leg.l2) * Math.cos(Math.PI / 20);
        const maxHeight = Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal));
        lowerBy = Math.max(lowerBy, h.y - a.y - maxHeight);
      }
      maxPelvisCorrection = Math.max(maxPelvisCorrection, lowerBy);
      if (lowerBy > 0) { const p = pelvis.getWorldPosition(new Vector3()); p.y -= lowerBy; pelvis.position.copy(pelvis.parent!.worldToLocal(p)); work.updateMatrixWorld(true); }
      for (const side of SIDES) {
        const leg = legs[side], h = leg.thigh.getWorldPosition(new Vector3()), target = row.targets[side];
        const delta = target.clone().sub(h), raw = delta.length(), d = clamp(raw, Math.abs(leg.l1 - leg.l2) + .001, leg.l1 + leg.l2 - .001);
        maxReachError = Math.max(maxReachError, Math.abs(raw - d));
        const axis = delta.normalize();
        // A stable forward knee hinge replaces the nearly collinear captured knee pole.
        // The latter flipped by up to 180 degrees near extension and made the knees chatter.
        let pole = row.poles[side].clone().addScaledVector(axis, -row.poles[side].dot(axis));
        if (pole.lengthSq() < 1e-8) pole = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x);
        pole.normalize();
        const along = (leg.l1 * leg.l1 - leg.l2 * leg.l2 + d * d) / (2 * d);
        const knee = h.clone().addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, leg.l1 * leg.l1 - along * along)));
        worldRotation(leg.thigh, new Quaternion().setFromUnitVectors(leg.thighDir, knee.clone().sub(h).normalize()).multiply(saved.get('thigh' + side)!.w));
        worldRotation(leg.shin, new Quaternion().setFromUnitVectors(leg.shinDir, target.clone().sub(knee).normalize()).multiply(saved.get('shin' + side)!.w));
        worldRotation(leg.foot, row.feet[side]);
        maxFootRadius = Math.max(maxFootRadius, Math.hypot(target.x, target.z));
      }
      for (const name of required) bone(name).quaternion.toArray(values.get(name)!, values.get(name)!.length);
      pelvis.position.toArray(pelvisPositions, pelvisPositions.length);
    }
    // Explicit duplicate endpoint prevents quaternion sign/seam ambiguity in LoopRepeat.
    for (const a of values.values()) for (let k = 0; k < 4; k++) a[a.length - 4 + k] = a[k];
    for (let k = 0; k < 3; k++) pelvisPositions[pelvisPositions.length - 3 + k] = pelvisPositions[k];
    const tracks = required.map(name => new QuaternionKeyframeTrack(`${bone(name).name}.quaternion`, times, values.get(name)!));
    const clip = new AnimationClip(data.name, duration, [...tracks, new VectorKeyframeTrack(`${pelvis.name}.position`, times, pelvisPositions)]);
    const evidence: ClubDanceEvidence = { source: data.source, sourceUrl: data.sourceUrl, licenseUrl: data.licenseUrl,
      sourceFrames: data.sourceFrames, frames: n, loop: true, designSpeedMps: 0,
      contactL: contacts.L, contactR: contacts.R,
      style: `${data.description}; authored ${step === 0 ? 'lateral step-touch and support transfer' : 'alternating forward taps, torso twist and raised arms'}`,
      soleMode: rendered ? 'rendered-boot' : 'G24-footprint-fallback', maxReachErrorM: maxReachError, maxFootRadiusM: maxFootRadius,
      sourceDurationSeconds: data.duration, beatsPerLoop: CLUB_DANCE_BEATS[step as 0 | 1], maxPelvisCorrectionM: maxPelvisCorrection,
      adapted: [...data.adaptations, 'circular 133ms source filtering', 'proportion-normalized hip height',
        'authored supported footwork and contact labels replacing source ankles', 'authored lateral/forward support transfer',
        'capture-derived upper-body residual with authored shoulder/arm coordination',
        'stable sagittal knee hinges', 'anatomical arm hinges', 'analytic leg IK'] };
    Object.assign(clip, { userData: evidence });
    return clip;
  });
}
