import { Quaternion, Vector3, type Bone, type Object3D } from 'three';
import type { GuideSeatContact } from './WorldGuideSeat.ts';
import { skinnedWorldPoint, type GuideSlopeFit } from './WorldGuideStop.ts';
import { coasterBoardingGround, type CoasterActorFrame } from './attractions/coaster-transition.ts';

/** Solve from this frame's actual skinned buttock patch, including train pitch and roll.
 * Converting the final world target through the parent also removes Rapier interpolation lag. */
export function settleGuideAttraction(group: Object3D, contact: GuideSeatContact, frame?: CoasterActorFrame | null) {
  if (!frame || !group.parent) return;
  const parent = group.parent, world = new Vector3(...frame.root);
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), frame.yaw);
  if (frame.orientation) yaw.slerp(new Quaternion(...frame.orientation), frame.seatWeight);
  group.quaternion.copy(parent.getWorldQuaternion(new Quaternion()).invert().multiply(yaw));
  group.position.copy(parent.worldToLocal(world.clone()));
  group.updateWorldMatrix(true, true);
  if (frame.seatWeight > 0) {
    const offset = contact.sample(new Vector3()).sub(group.getWorldPosition(new Vector3()));
    world.lerp(new Vector3(...frame.seat).sub(offset), frame.seatWeight);
    group.position.copy(parent.worldToLocal(world));
    group.updateWorldMatrix(true, true);
  }
}

/** Reuse Walk and the guide's measured boot soles for the six treads. This is a local IK
 * adaptation, not a new motion capture take. Restore every modified bone before the next mixer. */
export class GuideAttractionFeet {
  private saved = new Map<Bone, Quaternion>();
  private shifts = new Map<Bone, number>();
  restore() {
    for (const [bone, rotation] of this.saved) bone.quaternion.copy(rotation);
    this.saved.clear();
  }
  apply(slope: GuideSlopeFit, frame: CoasterActorFrame | null | undefined, dt: number) {
    if (!frame?.stairs) { this.shifts.clear(); return; }
    const direction = new Vector3(Math.cos(frame.yaw), 0, -Math.sin(frame.yaw));
    for (const leg of Object.values(slope.legs)) {
      const { thigh, shin, foot } = leg;
      const ankle = foot.getWorldPosition(new Vector3());
      let low = Infinity;
      const points = leg.sole.map(p => skinnedWorldPoint(p.mesh, p.index, new Vector3()));
      for (const p of points) low = Math.min(low, p.y);
      const ground = coasterBoardingGround(ankle.x, ankle.z);
      if (ground === null || !Number.isFinite(low)) continue;
      const clearance = Math.max(0, low - frame.root[1]);
      // Anticipate the next riser only while the recorded boot is swinging.
      const ahead = coasterBoardingGround(ankle.x + direction.x * .18, ankle.z + direction.z * .18) ?? ground;
      const swing = Math.min(1, clearance / .055);
      const targetGround = ground + Math.max(0, ahead - ground) * swing;
      const wanted = Math.max(-.28, Math.min(.28, targetGround + clearance + .003 - low));
      const before = this.shifts.get(foot) ?? wanted;
      const shift = before + (wanted - before) * (1 - Math.exp(-dt / .045));
      this.shifts.set(foot, shift);
      for (const bone of [thigh, shin, foot]) this.saved.set(bone, bone.quaternion.clone());
      const target = ankle.clone(); target.y += shift;
      const a = thigh.getWorldPosition(new Vector3()), b = shin.getWorldPosition(new Vector3());
      const rotation = foot.getWorldQuaternion(new Quaternion());
      const l1 = a.distanceTo(b), l2 = b.distanceTo(ankle), axis = target.clone().sub(a);
      const d = Math.min(l1 + l2 - .002, Math.max(Math.abs(l1 - l2) + .002, axis.length())); axis.normalize();
      const pole = b.clone().sub(a).addScaledVector(direction, .15);
      pole.addScaledVector(axis, -pole.dot(axis)).normalize();
      const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const knee = a.clone().addScaledVector(axis, x).addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - x * x)));
      const rotate = (bone: Bone, from: Vector3, to: Vector3) => {
        const parentQ = bone.parent!.getWorldQuaternion(new Quaternion());
        const delta = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
        bone.quaternion.premultiply(parentQ.clone().invert().multiply(delta).multiply(parentQ));
        bone.updateWorldMatrix(true, true);
      };
      rotate(thigh, b.clone().sub(a), knee.sub(a));
      const nextB = shin.getWorldPosition(new Vector3());
      rotate(shin, foot.getWorldPosition(new Vector3()).sub(nextB), a.clone().addScaledVector(axis, d).sub(nextB));
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
      foot.updateWorldMatrix(true, true);
    }
  }
}
