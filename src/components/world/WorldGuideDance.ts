import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, SkinnedMesh, Vector3, VectorKeyframeTrack, type Bone, type Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import capture from './guide-data/cmu-club.json';

export type ClubDanceName = 'ClubGroove' | 'ClubDisco';
export interface ClubDanceEvidence {
  source: string; sourceUrl: string; licenseUrl: string; sourceFrames: number[];
  frames: number; loop: true; designSpeedMps: 0; contactL: number[]; contactR: number[];
  /** Captured style is stated honestly; display names do not certify a dance genre. */
  style: string;
  soleMode: 'rendered-boot' | 'G24-footprint-fallback';
  maxReachErrorM: number;
  maxFootRadiusM: number;
  adapted: string[];
}

const MAP: Record<string, string> = { pelvis: 'root', spine: 'upperback', chest: 'thorax', head: 'head',
  upperarmL: 'lhumerus', forearmL: 'lradius', upperarmR: 'rhumerus', forearmR: 'rradius', footL: 'lfoot', footR: 'rfoot' };
const SIDES = ['L', 'R'] as const;
const v = (a: number[]) => new Vector3().fromArray(a);
const q = (a: number[]) => new Quaternion().fromArray(a);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const key = (name: string) => name.replace(/[._]/g, '');

interface Limb { thigh: Bone; shin: Bone; foot: Bone; l1: number; l2: number; bind: Quaternion;
  thighDir: Vector3; shinDir: Vector3; sole: Vector3[] }
interface Row { hip: Vector3; targets: Record<'L' | 'R', Vector3>; poles: Record<'L' | 'R', Vector3>;
  feet: Record<'L' | 'R', Quaternion> }

function worldRotation(bone: Bone, rotation: Quaternion) {
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
  bone.updateMatrixWorld(true);
}

/** Pin each measured stance window and carry the correction smoothly across its swing.
 * Circular indexing is essential: contact is allowed to span the loop seam. */
function pinContacts(rows: Row[], side: 'L' | 'R', mask: number[]) {
  const n = rows.length - 1, start = mask.findIndex((on, i) => i < n && on && !mask[(i + n - 1) % n]);
  if (start < 0) return;
  const original = rows.slice(0, n).map(r => r.targets[side].clone());
  let offset = 0;
  while (offset < n) {
    const first = (start + offset) % n;
    let length = 0;
    while (offset + length < n && mask[(first + length) % n]) length++;
    if (!length) { offset++; continue; }
    const anchor = original[first].clone();
    for (let k = 0; k < length; k++) {
      const target = rows[(first + k) % n].targets[side];
      target.x = anchor.x; target.z = anchor.z;
    }
    const last = (first + length - 1) % n;
    let swing = 0;
    while (offset + length + swing < n && !mask[(first + length + swing) % n]) swing++;
    const correction = rows[last].targets[side].clone().sub(original[last]);
    // At the next touchdown the next stance anchor equals its source point.
    for (let k = 0; k < swing; k++) {
      const i = (first + length + k) % n;
      rows[i].targets[side].addScaledVector(correction, 1 - smooth((k + 1) / (swing + 1)));
    }
    offset += length + swing;
  }
  rows[n].targets[side].copy(rows[0].targets[side]);
}

/** Generate two private clips against the current G24 bind skeleton. Call before creating live
 * AnimationActions. Uses a private clone and restores no shared transforms because none are changed.
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

  return capture.clips.map(data => {
    const restore = () => { for (const [name, b] of bones) { const s = saved.get(name)!; b.position.copy(s.p); b.quaternion.copy(s.q); } work.updateMatrixWorld(true); };
    restore();
    const duration = data.duration, n = data.frames, times = Float32Array.from({ length: n + 1 }, (_, i) => i * duration / n);
    const sourceQ = (seg: string, i: number) => q((data.rotations as Record<string, number[][]>)[seg][i]);
    const offsets = new Map<string, Quaternion>();
    for (const [name, seg] of Object.entries(MAP)) {
      const b = bone(name), next = b.children.find(c => (c as Bone).isBone);
      // Foot roll/yaw comes from the captured segment; its sole frame is calibrated below.
      if (seg === 'root' || !next || name.startsWith('foot')) { offsets.set(name, new Quaternion()); continue; }
      const direction = next.getWorldPosition(new Vector3()).sub(b.getWorldPosition(new Vector3())).normalize();
      offsets.set(name, new Quaternion().setFromUnitVectors(direction, v((data.rest as Record<string, number[]>)[seg]).normalize()));
    }
    const rotation = (name: string, i: number) => sourceQ(MAP[name], i).multiply(offsets.get(name)!).multiply(saved.get(name)!.w);
    const footReference = {} as Record<'L' | 'R', Quaternion>;
    for (const side of SIDES) {
      const seg = side.toLowerCase() + 'tibia';
      const points = (data.points as Record<string, number[][]>)[seg];
      let low = 0;
      for (let i = 1; i < n; i++) if (points[i][1] + data.hip[i][1] < points[low][1] + data.hip[low][1]) low = i;
      footReference[side] = sourceQ(side.toLowerCase() + 'foot', low).invert();
    }
    const rows: Row[] = [];
    for (let i = 0; i <= n; i++) {
      const hip = v(data.hip[i]).multiplyScalar(legLength);
      const row = { hip, targets: {}, poles: {}, feet: {} } as Row;
      for (const side of SIDES) {
        const lower = side.toLowerCase(), points = data.points as Record<string, number[][]>;
        const target = hip.clone().addScaledVector(v(points[lower + 'tibia'][i]), legLength);
        // Wide G24 boots need a small fixed minimum track; source knees and weight shift remain.
        target.z = side === 'L' ? Math.min(-.125, target.z) : Math.max(.125, target.z);
        const deformation = sourceQ(lower + 'foot', i).multiply(footReference[side]);
        const angles = new Euler().setFromQuaternion(deformation, 'YXZ');
        angles.x = clamp(angles.x, -.18, .18); angles.y = clamp(angles.y, -.42, .42); angles.z = clamp(angles.z, -.38, .38);
        const foot = new Quaternion().setFromEuler(angles).multiply(legs[side].bind);
        let soleY = Infinity;
        for (const p of legs[side].sole) soleY = Math.min(soleY, p.clone().applyQuaternion(foot).y);
        // Source ankle lift is retained above a per-side measured stance minimum.
        const ankleHeights = points[lower + 'tibia'].map((p, j) => p[1] + data.hip[j][1]);
        const minimum = Math.min(...ankleHeights);
        const contact = (side === 'L' ? data.contacts.l : data.contacts.r)[i];
        target.y = -soleY + (contact ? 0 : Math.max(0, ankleHeights[i] - minimum) * legLength);
        row.targets[side] = target;
        row.poles[side] = hip.clone().addScaledVector(v(points[lower + 'femur'][i]), legLength);
        row.feet[side] = foot;
      }
      rows.push(row);
    }
    // A measured contact label is discrete; release/lift must be continuous between keys.
    // Ease only the source's vertical clearance over the first/last 100 ms of swing.
    for (const side of SIDES) {
      const mask = side === 'L' ? data.contacts.l : data.contacts.r;
      for (let i = 0; i < n; i++) {
        if (mask[i]) continue;
        let distance = 6;
        for (let d = 1; d <= 6; d++) if (mask[(i + d) % n] || mask[(i + n - d) % n]) { distance = d; break; }
        let soleY = Infinity;
        for (const p of legs[side].sole) soleY = Math.min(soleY, p.clone().applyQuaternion(rows[i].feet[side]).y);
        const clearance = rows[i].targets[side].y + soleY;
        rows[i].targets[side].y = -soleY + clearance * smooth(distance / 6);
      }
      rows[n].targets[side].copy(rows[0].targets[side]);
    }
    pinContacts(rows, 'L', data.contacts.l); pinContacts(rows, 'R', data.contacts.r);
    const values = new Map(required.map(name => [name, [] as number[]]));
    const pelvisPositions: number[] = [];
    let maxReachError = 0, maxFootRadius = 0;
    for (let i = 0; i <= n; i++) {
      restore();
      const row = rows[i], pelvisQ = rotation('pelvis', i);
      const hip = row.hip.clone();
      // Avoid unreachable targets by lowering the pelvis, preserving lengths. Both legs share it.
      const restOffset = restHip.clone().sub(saved.get('pelvis')!.point).applyQuaternion(pelvisQ.clone().multiply(saved.get('pelvis')!.w.clone().invert()));
      const pelPoint = hip.sub(restOffset);
      pelvis.position.copy(pelvis.parent!.worldToLocal(pelPoint)); worldRotation(pelvis, pelvisQ);
      for (const name of ['spine', 'chest', 'head']) worldRotation(bone(name), rotation(name, i));
      worldRotation(bone('neck'), bone('chest').getWorldQuaternion(new Quaternion()).slerp(bone('head').getWorldQuaternion(new Quaternion()), .5));
      for (const side of SIDES) {
        for (const part of ['upperarm', 'forearm']) worldRotation(bone(part + side), rotation(part + side, i));
        worldRotation(bone('hand' + side), bone('forearm' + side).getWorldQuaternion(new Quaternion()));
      }
      // Compute a common hip-height correction before the analytic two-bone solves.
      let lowerBy = 0;
      for (const side of SIDES) {
        const leg = legs[side], h = leg.thigh.getWorldPosition(new Vector3()), a = row.targets[side];
        const horizontal = Math.hypot(a.x - h.x, a.z - h.z), reach = leg.l1 + leg.l2 - .002;
        const maxHeight = Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal));
        lowerBy = Math.max(lowerBy, h.y - a.y - maxHeight);
      }
      if (lowerBy > 0) { const p = pelvis.getWorldPosition(new Vector3()); p.y -= lowerBy; pelvis.position.copy(pelvis.parent!.worldToLocal(p)); work.updateMatrixWorld(true); }
      for (const side of SIDES) {
        const leg = legs[side], h = leg.thigh.getWorldPosition(new Vector3()), target = row.targets[side];
        const delta = target.clone().sub(h), raw = delta.length(), d = clamp(raw, Math.abs(leg.l1 - leg.l2) + .001, leg.l1 + leg.l2 - .001);
        maxReachError = Math.max(maxReachError, Math.abs(raw - d));
        const axis = delta.normalize();
        let pole = row.poles[side].clone().sub(h).addScaledVector(axis, -row.poles[side].clone().sub(h).dot(axis));
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
      contactL: [...data.contacts.l], contactR: [...data.contacts.r], style: data.description,
      soleMode: rendered ? 'rendered-boot' : 'G24-footprint-fallback', maxReachErrorM: maxReachError, maxFootRadiusM: maxFootRadius,
      adapted: [...data.adaptations, 'minimum 25 cm boot track', 'bounded foot tilt', 'offline stance pin', 'analytic leg IK'] };
    Object.assign(clip, { userData: evidence });
    return clip;
  });
}
