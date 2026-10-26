import { Bone, Object3D, Quaternion, Vector3 } from 'three';
export interface GuideRailVault {
  hand: [number, number, number]; direction: { x: number; y: number; z: number };
  elapsed: number; prepare: number; duration: number;
}
const smooth = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
type Limb = { upper: Bone; lower: Bone; end: Bone; side: number };

/** Authored traversal overlay on the existing jump. Hands reach the measured rail; legs tuck only
 * in flight. Restore before the mixer every frame so corrections never accumulate into mocap. */
export class GuideVaultLayer {
  private saved = new Map<Bone, Quaternion>();
  private arms: Limb[] = []; private legs: Limb[] = []; private chest: Bone | undefined;
  private applied = false;
  readonly handErrors: number[] = [];
  constructor(private scene: Object3D) {
    const bones = new Map<string, Bone>();
    scene.traverse(o => { if ((o as Bone).isBone) bones.set(o.name.replace(/[._]/g, ''), o as Bone); });
    for (const [side, tag] of [[-1, 'L'], [1, 'R']] as const) {
      for (const [out, names] of [[this.arms, ['upperarm', 'forearm', 'hand']], [this.legs, ['thigh', 'shin', 'foot']]] as const) {
        const [upper, lower, end] = names.map(n => bones.get(n + tag));
        if (upper && lower && end) out.push({ upper, lower, end, side });
      }
    }
    this.chest = bones.get('chest');
    for (const limb of [...this.arms, ...this.legs]) for (const bone of [limb.upper, limb.lower, limb.end]) this.saved.set(bone, bone.quaternion.clone());
    if (this.chest) this.saved.set(this.chest, this.chest.quaternion.clone());
  }
  restore() {
    if (!this.applied) return;
    for (const [bone, q] of this.saved) bone.quaternion.copy(q);
    this.scene.updateWorldMatrix(true, true); this.applied = false;
  }
  private rotate(bone: Bone, from: Vector3, to: Vector3) {
    const q = bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()));
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(q)); bone.updateWorldMatrix(true, true);
  }
  private solve(limb: Limb, target: Vector3, pole: Vector3, weight: number) {
    const { upper, lower, end } = limb, before = [upper, lower, end].map(b => b.quaternion.clone());
    const a = upper.getWorldPosition(new Vector3()), b = lower.getWorldPosition(new Vector3()), c = end.getWorldPosition(new Vector3());
    const rotation = end.getWorldQuaternion(new Quaternion()), l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const axis = target.clone().sub(a), d = Math.min(l1 + l2 - .002, Math.max(Math.abs(l1 - l2) + .002, axis.length())); axis.normalize();
    pole.sub(a); pole.addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const joint = a.clone().addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    this.rotate(upper, b.clone().sub(a), joint.clone().sub(a));
    const nextB = lower.getWorldPosition(new Vector3()), nextC = end.getWorldPosition(new Vector3());
    this.rotate(lower, nextC.sub(nextB), a.clone().addScaledVector(axis, d).sub(nextB));
    end.quaternion.copy(end.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
    [upper, lower, end].forEach((bone, i) => bone.quaternion.slerpQuaternions(before[i], bone.quaternion.clone(), weight));
    this.scene.updateWorldMatrix(true, true);
    return end.getWorldPosition(new Vector3()).distanceTo(target);
  }
  apply(vault: GuideRailVault | null | undefined) {
    this.handErrors.length = 0; if (!vault) return;
    for (const [bone, q] of this.saved) q.copy(bone.quaternion);
    this.applied = true; this.scene.updateWorldMatrix(true, true);
    const { elapsed: t, prepare, duration, direction } = vault;
    const reach = smooth(t / .12) * (1 - smooth((t - prepare) / .10));
    const flight = Math.max(0, (t - prepare) / (duration - prepare));
    const tuck = smooth(flight / .22) * (1 - smooth((flight - .65) / .25));
    if (this.chest) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -.24 * Math.max(reach, tuck * .65));
      this.chest.quaternion.multiply(q); this.chest.updateWorldMatrix(true, true);
    }
    for (const arm of this.arms) if (reach > 0) {
      const goal = new Vector3(...vault.hand).add(new Vector3(-direction.z, 0, direction.x).multiplyScalar(arm.side * .18));
      goal.y += .035;
      const pole = goal.clone().add(new Vector3(-direction.x * .3 - direction.z * arm.side * .5, -.15, -direction.z * .3 + direction.x * arm.side * .5));
      this.handErrors.push(this.solve(arm, goal, pole, reach));
    }
    for (const leg of this.legs) if (tuck > 0) {
      const hip = leg.upper.getWorldPosition(new Vector3());
      const target = hip.clone().add(new Vector3(direction.x * .12, -.40, direction.z * .12));
      const pole = hip.clone().add(new Vector3(direction.x * .65, -.15, direction.z * .65));
      this.solve(leg, target, pole, tuck * .88);
    }
  }
}
