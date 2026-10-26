import { AnimationMixer, Quaternion, SkinnedMesh, Vector3, type AnimationClip, type Bone, type Object3D } from 'three';
import { skinnedWorldPoint } from './WorldGuideStop.ts';

type Side = 'L' | 'R';
interface Leg { thigh: Bone; shin: Bone; foot: Bone; bind: Quaternion; sole: Vector3[] }
interface Sample { hip: Vector3; knee: Vector3; ankle: Vector3; thigh: Quaternion; shin: Quaternion; foot: Quaternion;
  target: Vector3; rotated: Vector3[]; contact: boolean }
const UP = new Vector3(0, 1, 0), FORWARD = new Vector3(1, 0, 0);
const smooth = (x: number) => x * x * (3 - 2 * x);

function worldRotation(bone: Bone, q: Quaternion) {
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(q));
  bone.updateMatrixWorld(true);
}

/** One-time G24 clip calibration, before phase/sole tables and live actions are created.
 * The mocap foot segment alone leaves the wide boot's bind frame underdetermined. Remove its
 * constant stance-frame twist in BOOT space, keeping the measured sagittal heel/toe motion.
 * Re-bake contact pivots and two-bone legs into private clips; no live per-frame correction or
 * mutation of useLoader's cached clips/geometry. Idle, Walk, turns and jumps retain their tracks. */
export function calibrateGuideBootClips(scene: Object3D, clips: readonly AnimationClip[]): AnimationClip[] {
  scene.updateMatrixWorld(true);
  const bones = new Map<string, Bone>();
  scene.traverse(o => { if ((o as Bone).isBone) bones.set(o.name.replace(/[._]/g, ''), o as Bone); });
  const pelvis = bones.get('pelvis');
  if (!pelvis) return [...clips];
  const legs = {} as Record<Side, Leg>;
  for (const side of ['L', 'R'] as const) {
    const thigh = bones.get(`thigh${side}`), shin = bones.get(`shin${side}`), foot = bones.get(`foot${side}`);
    if (!thigh || !shin || !foot) return [...clips];
    legs[side] = { thigh, shin, foot, bind: foot.getWorldQuaternion(new Quaternion()), sole: [] };
  }
  // Work from the actual refined rendered boot, including GLTFLoader's sanitized bone names.
  scene.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const ids = o.geometry.getAttribute('skinIndex'), weights = o.geometry.getAttribute('skinWeight');
    if (!ids || !weights) return;
    for (const side of ['L', 'R'] as const) {
      const leg = legs[side], ankle = leg.foot.getWorldPosition(new Vector3()), inv = leg.bind.clone().invert();
      for (let i = 0; i < ids.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (o.skeleton.bones[ids.getComponent(i, k)] === leg.foot) w += weights.getComponent(i, k);
        if (w >= .98) leg.sole.push(skinnedWorldPoint(o, i, new Vector3()).sub(ankle).applyQuaternion(inv));
      }
    }
  });
  if (legs.L.sole.length < 4 || legs.R.sole.length < 4) return [...clips];
  const saved: { node: Object3D; p: Vector3; q: Quaternion; s: Vector3 }[] = [];
  scene.traverse(node => saved.push({ node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }));
  const mixer = new AnimationMixer(scene);
  try {
    return clips.map(source => {
      if (source.name !== 'Run' && source.name !== 'Sprint') return source;
      const extras = source.userData as { frames?: number; contactL?: number[]; contactR?: number[] };
      const frames = extras.frames;
      const speed = (source.userData as { designSpeedMps?: number }).designSpeedMps;
      if (!frames || !extras.contactL || !extras.contactR || !speed || !Number.isFinite(speed)) return source;
      const result = source.clone(); result.userData = { ...source.userData };
      const action = mixer.clipAction(source).play(), samples = { L: [], R: [] } as Record<Side, Sample[]>;
      // Four samples per authored 60 Hz frame keep the contact IK accurate between source keys.
      const count = frames * 4, times = Float32Array.from({ length: count + 1 }, (_, i) => source.duration * i / count);
      const corrections = {} as Record<Side, Quaternion>;
      for (const side of ['L', 'R'] as const) {
        const residuals: Quaternion[] = [], leg = legs[side], contact = extras[`contact${side}`]!;
        for (let i = 0; i < frames; i++) if (contact[i]) {
          mixer.setTime(source.duration * i / frames); scene.updateMatrixWorld(true);
          const d = leg.foot.getWorldQuaternion(new Quaternion()).multiply(leg.bind.clone().invert());
          const sagittal = new Quaternion(0, 0, d.z, d.w).normalize();
          residuals.push(sagittal.invert().multiply(d));
        }
        if (residuals.length < 2) { action.stop(); mixer.uncacheClip(source); return source; }
        const sum = [0, 0, 0, 0];
        for (const q of residuals) q.toArray().forEach((v, k) => sum[k] += v * (q.dot(residuals[0]) < 0 ? -1 : 1));
        corrections[side] = new Quaternion(sum[0], sum[1], sum[2], sum[3]).normalize().invert();
      }
      for (let i = 0; i < count; i++) {
        mixer.setTime(times[i]); scene.updateMatrixWorld(true);
        for (const side of ['L', 'R'] as const) {
          const leg = legs[side], ankle = leg.foot.getWorldPosition(new Vector3());
          const old = leg.foot.getWorldQuaternion(new Quaternion());
          const deform = old.clone().multiply(leg.bind.clone().invert());
          const corrected = deform.clone().multiply(corrections[side]);
          // Noncommuting frame correction can add a few degrees of pitch during recovery. Keep the
          // source's measured sagittal twist exactly, changing only the residual side orientation.
          const pitch = new Quaternion(0, 0, deform.z, deform.w).normalize();
          const correctedPitch = new Quaternion(0, 0, corrected.z, corrected.w).normalize();
          const foot = pitch.multiply(correctedPitch.invert()).multiply(corrected).multiply(leg.bind);
          const rotated = leg.sole.map(p => p.clone().applyQuaternion(foot));
          const low = Math.min(...leg.sole.map(p => p.clone().applyQuaternion(old).y));
          const target = ankle.clone(); target.y += low - Math.min(...rotated.map(p => p.y));
          samples[side].push({ hip: leg.thigh.getWorldPosition(new Vector3()), knee: leg.shin.getWorldPosition(new Vector3()), ankle,
            thigh: leg.thigh.getWorldQuaternion(new Quaternion()), shin: leg.shin.getWorldQuaternion(new Quaternion()), foot,
            target, rotated, contact: !!extras[`contact${side}`]![Math.round(i / 4)] });
        }
      }
      for (const side of ['L', 'R'] as const) {
        const rows = samples[side], start = rows.findIndex((r, i) => r.contact && !rows[(i + count - 1) % count].contact);
        if (start < 0) continue;
        let length = 0, pivot = -1, anchor = new Vector3(), previous: Sample | undefined;
        // Include the lift-off boundary key: interpolation must remain pinned up to that boundary,
        // rather than leaking the source's sideways recovery into the final contact interval.
        while (length < count && (rows[(start + length) % count].contact
          || (length > 0 && rows[(start + length - 1) % count].contact))) {
          const k = start + length, row = rows[k % count], minY = Math.min(...row.rotated.map(p => p.y));
          if (pivot < 0 || row.rotated[pivot].y > minY + .001) {
            pivot = row.rotated.reduce((best, p, i) => p.y < row.rotated[best].y ? i : best, 0);
            anchor = previous ? previous.target.clone().add(previous.rotated[pivot]).addScaledVector(FORWARD, speed * (k - 1) * source.duration / count)
              : row.target.clone().add(row.rotated[pivot]).addScaledVector(FORWARD, speed * k * source.duration / count);
          }
          row.target.x = anchor.x - speed * k * source.duration / count - row.rotated[pivot].x;
          row.target.z = anchor.z - row.rotated[pivot].z;
          previous = row; length++;
        }
        // Carry horizontal pivot correction through recovery without an abrupt lift-off reset.
        const last = rows[(start + length - 1) % count], first = rows[start];
        for (let k = 1; k <= count - length; k++) {
          const row = rows[(start + length - 1 + k) % count], a = smooth(k / (count - length + 1));
          for (const axis of ['x', 'z'] as const) row.target[axis] = row.ankle[axis]
            + (last.target[axis] - last.ankle[axis]) * (1 - a) + (first.target[axis] - first.ankle[axis]) * a;
        }
      }
      // A small constant hip drop keeps the lowered soles reachable without stretching bones.
      let drop = 0;
      for (const rows of Object.values(samples)) for (const row of rows) {
        // Leave 3 mm of bend/reach reserve for interpolation and the existing slope solver.
        const reach = row.hip.distanceTo(row.knee) + row.knee.distanceTo(row.ankle) - .003;
        const horizontal = (row.hip.x - row.target.x) ** 2 + (row.hip.z - row.target.z) ** 2;
        drop = Math.max(drop, row.hip.y - row.target.y - Math.sqrt(Math.max(0, reach ** 2 - horizontal)));
      }
      // G24's calibration is centimetres; reject unexpected assets instead of deforming their rig.
      if (drop > .035) { action.stop(); mixer.uncacheClip(source); return source; }
      const changed = new Map<string, Float32Array>();
      changed.set(`${pelvis.name}.position`, new Float32Array((count + 1) * 3));
      for (const leg of Object.values(legs)) for (const bone of [leg.thigh, leg.shin, leg.foot])
        changed.set(`${bone.name}.quaternion`, new Float32Array((count + 1) * 4));
      for (let i = 0; i < count; i++) {
        mixer.setTime(times[i]); scene.updateMatrixWorld(true);
        const originalPosition = pelvis.position.clone();
        const originalRotations = Object.values(legs).flatMap(leg => [leg.thigh, leg.shin, leg.foot])
          .map(bone => ({ bone, q: bone.quaternion.clone() }));
        const localDrop = UP.clone().multiplyScalar(-drop).applyQuaternion(pelvis.parent!.getWorldQuaternion(new Quaternion()).invert());
        pelvis.position.add(localDrop); pelvis.updateMatrixWorld(true);
        changed.get(`${pelvis.name}.position`)!.set(pelvis.position.toArray(), i * 3);
        for (const side of ['L', 'R'] as const) {
          const leg = legs[side], row = samples[side][i], hip = leg.thigh.getWorldPosition(new Vector3());
          const l1 = row.hip.distanceTo(row.knee), l2 = row.knee.distanceTo(row.ankle);
          const axis = row.target.clone().sub(hip), distance = axis.length(); axis.normalize();
          const pole = row.knee.clone().sub(row.hip); pole.addScaledVector(axis, -pole.dot(axis)).normalize();
          const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
          const knee = hip.clone().addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
          const thigh = new Quaternion().setFromUnitVectors(row.knee.clone().sub(row.hip).normalize(), knee.clone().sub(hip).normalize()).multiply(row.thigh);
          worldRotation(leg.thigh, thigh);
          const shin = new Quaternion().setFromUnitVectors(row.ankle.clone().sub(row.knee).normalize(), row.target.clone().sub(knee).normalize()).multiply(row.shin);
          worldRotation(leg.shin, shin); worldRotation(leg.foot, row.foot);
          for (const bone of [leg.thigh, leg.shin, leg.foot]) {
            const values = changed.get(`${bone.name}.quaternion`)!;
            // Same quaternion hemisphere prevents long-path interpolation and a loop seam.
            const q = bone.quaternion.clone();
            if (i && q.dot(new Quaternion().fromArray(values, (i - 1) * 4)) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
            values.set(q.toArray(), i * 4);
          }
        }
        // PropertyMixer skips equal consecutive values; restore the sampled pose so a constant
        // source channel cannot accidentally inherit our previous frame's manually solved pose.
        pelvis.position.copy(originalPosition);
        for (const { bone, q } of originalRotations) bone.quaternion.copy(q);
      }
      for (const track of result.tracks) {
        const values = changed.get(track.name); if (!values) continue;
        const size = track.getValueSize(); values.set(values.subarray(0, size), count * size);
        track.times = times.slice(); track.values = values;
      }
      action.stop(); mixer.uncacheClip(source);
      return result;
    });
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
    for (const { node, p, q, s } of saved) { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }
    scene.updateMatrixWorld(true);
  }
}
