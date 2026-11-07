import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three';
import type { Vec3 } from './types.ts';

type Chain = { upper: Bone; lower: Bone; end: Bone };
type Foot = Chain & { side: number; anchor: Vector3; rotation: Quaternion };

const PALM_OFFSET = 0.043;
const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Contact pose over the completed locomotion frame. The visual rig owns no prop or physics state. */
export class GuideCampLayer {
  readonly palm: Vec3 = [0, 0, 0];
  private readonly scene: Object3D;
  private readonly arm: Chain | null;
  private readonly pelvis: Bone | undefined;
  private readonly spine: Bone[];
  private readonly feet: Foot[] = [];
  private readonly saved: { bone: Bone; rotation: Quaternion }[];
  private readonly pelvisPosition = new Vector3();
  private applied = false;
  private elapsed = 0;

  private readonly root = new Vector3();
  private readonly goal = new Vector3();
  private readonly palmPoint = new Vector3();
  private readonly finger = new Vector3();
  private readonly handAcross = new Vector3();
  private readonly handNormal = new Vector3();
  private readonly basis = new Matrix4();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly pitchAxis = new Vector3();
  private readonly pole = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly c = new Vector3();
  private readonly direction = new Vector3();
  private readonly bend = new Vector3();
  private readonly nextEnd = new Vector3();
  private readonly currentSegment = new Vector3();
  private readonly nextSegment = new Vector3();
  private readonly rootRotation = new Quaternion();
  private readonly handRotation = new Quaternion();
  private readonly worldRotation = new Quaternion();
  private readonly parentInverse = new Quaternion();
  private readonly deltaRotation = new Quaternion();

  constructor(scene: Object3D) {
    this.scene = scene;
    const bones = new Map<string, Bone>();
    const key = (name: string) => name.replace(/[._]/g, '');
    scene.traverse(node => { if ((node as Bone).isBone) bones.set(key(node.name), node as Bone); });
    const chain = (upper: string, lower: string, end: string): Chain | null => {
      const a = bones.get(key(upper)), b = bones.get(key(lower)), c = bones.get(key(end));
      return a && b && c ? { upper: a, lower: b, end: c } : null;
    };
    this.arm = chain('upperarm.R', 'forearm.R', 'hand.R');
    this.pelvis = bones.get('pelvis');
    this.spine = ['spine', 'chest'].map(name => bones.get(name)).filter((bone): bone is Bone => !!bone);
    for (const side of ['R', 'L'] as const) {
      const leg = chain(`thigh.${side}`, `shin.${side}`, `foot.${side}`);
      if (leg) this.feet.push({ ...leg, side: side === 'R' ? 1 : -1, anchor: new Vector3(), rotation: new Quaternion() });
    }
    const animated = [...(this.pelvis ? [this.pelvis] : []), ...this.spine,
      ...this.feet.flatMap(({ upper, lower, end }) => [upper, lower, end])];
    if (this.arm) animated.push(this.arm.upper, this.arm.lower, this.arm.end);
    this.saved = animated.map(bone => ({ bone, rotation: new Quaternion() }));
  }

  /** Undo in reverse layer order, before advancing the mixer. Pause skips this call. */
  restore() {
    if (!this.applied) return;
    for (const { bone, rotation } of this.saved) bone.quaternion.copy(rotation);
    if (this.pelvis) this.pelvis.position.copy(this.pelvisPosition);
    this.applied = false;
    this.scene.updateWorldMatrix(true, true);
  }

  reset() { this.restore(); this.elapsed = 0; }

  private setWorldRotation(bone: Bone, rotation: Quaternion) {
    bone.quaternion.copy(rotation);
    if (bone.parent) bone.quaternion.premultiply(bone.parent.getWorldQuaternion(this.parentInverse).invert());
  }

  private rotateWorld(bone: Bone, delta: Quaternion) {
    this.setWorldRotation(bone, bone.getWorldQuaternion(this.worldRotation).premultiply(delta));
  }

  /** Solve an elbow or knee with the current two segment lengths. Only joint rotations change. */
  private solve(chain: Chain, goal: Vector3, rotation: Quaternion, pole: Vector3) {
    const { a, b, c, direction, bend, nextEnd, currentSegment, nextSegment } = this;
    chain.upper.getWorldPosition(a);
    chain.lower.getWorldPosition(b);
    chain.end.getWorldPosition(c);
    const upper = a.distanceTo(b), lower = b.distanceTo(c);
    if (Math.min(upper, lower) < 1e-6) return;
    direction.copy(goal).sub(a);
    const length = direction.length();
    if (length > 1e-6) direction.divideScalar(length);
    else direction.copy(c).sub(a).normalize();
    const distance = Math.max(Math.abs(upper - lower) + .0001, Math.min(upper + lower - .0001, length));
    nextEnd.copy(a).addScaledVector(direction, distance);
    bend.copy(pole).addScaledVector(direction, -pole.dot(direction));
    if (bend.lengthSq() < 1e-8) bend.copy(b).sub(a).addScaledVector(direction, -bend.dot(direction));
    bend.normalize();
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    nextSegment.copy(direction).multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
    currentSegment.copy(b).sub(a).normalize();
    this.rotateWorld(chain.upper, this.deltaRotation.setFromUnitVectors(currentSegment, nextSegment.normalize()));
    chain.lower.getWorldPosition(b);
    chain.end.getWorldPosition(c);
    currentSegment.copy(c).sub(b).normalize();
    nextSegment.copy(nextEnd).sub(b).normalize();
    this.rotateWorld(chain.lower, this.deltaRotation.setFromUnitVectors(currentSegment, nextSegment));
    this.setWorldRotation(chain.end, rotation);
  }

  private poseBody(low: number, extension: number, weight: number) {
    const squat = low * weight;
    const forwardReach = extension * (1 - low) * weight;
    const drop = (.40 + .08 * extension) * squat + .045 * forwardReach;
    const pelvis = this.pelvis;
    if (pelvis?.parent && this.feet.length === 2 && drop > 1e-5) {
      for (const foot of this.feet) {
        foot.end.getWorldPosition(foot.anchor);
        foot.end.getWorldQuaternion(foot.rotation);
      }
      const pelvisWorld = pelvis.getWorldPosition(this.a);
      pelvisWorld.y -= drop;
      pelvisWorld.addScaledVector(this.forward, -.045 * squat);
      pelvis.position.copy(pelvis.parent.worldToLocal(pelvisWorld));
      this.rotateWorld(pelvis, this.deltaRotation.setFromAxisAngle(this.pitchAxis, .46 * squat + .20 * forwardReach));
      for (const foot of this.feet) {
        this.pole.copy(this.forward).addScaledVector(this.right, .20 * foot.side);
        this.solve(foot, foot.anchor, foot.rotation, this.pole);
      }
    }
    // A forward hinge follows the hips for the floor reach. Ordinary grips need only a small upper-body lean.
    const lean = (.08 + .42 * extension) * (1 - low) * weight + .58 * squat;
    for (let i = 0; i < this.spine.length; i++) {
      this.rotateWorld(this.spine[i], this.deltaRotation.setFromAxisAngle(this.pitchAxis, (i === 0 ? .68 : .32) * lean));
    }
  }

  apply(target: Vec3, mode: 'reach' | 'grip', dt: number): Vec3 | null {
    this.restore();
    if (!this.arm || !target.every(Number.isFinite)) { this.elapsed = 0; return null; }
    for (const { bone, rotation } of this.saved) rotation.copy(bone.quaternion);
    if (this.pelvis) this.pelvisPosition.copy(this.pelvis.position);
    this.applied = true;
    this.elapsed = Math.min(.22, this.elapsed + dt);
    const weight = ease(this.elapsed / .22);
    const { root, goal, rootRotation, forward, right, pitchAxis, arm } = this;
    this.scene.getWorldPosition(root);
    this.scene.getWorldQuaternion(rootRotation);
    forward.set(1, 0, 0).applyQuaternion(rootRotation).setY(0).normalize();
    right.set(-forward.z, 0, forward.x);
    pitchAxis.copy(right).negate();
    goal.set(...target);
    const low = ease((.83 - (goal.y - root.y)) / .66);
    const extension = ease((Math.hypot(goal.x - root.x, goal.z - root.z) - .36) / .30);
    this.poseBody(low, extension, weight);

    const { palmPoint, finger, handAcross, handNormal, handRotation } = this;
    // Aim the finger axis from the wrist towards contact and keep the hand's cross axis outwards.
    finger.copy(goal).sub(arm.upper.getWorldPosition(this.a)).normalize();
    if (mode === 'grip') finger.addScaledVector(forward, .20).normalize();
    if (finger.lengthSq() < 1e-8) finger.copy(forward);
    handAcross.copy(right).addScaledVector(finger, -right.dot(finger));
    if (handAcross.lengthSq() < 1e-8) handAcross.copy(forward).addScaledVector(finger, -forward.dot(finger));
    handAcross.normalize();
    handNormal.crossVectors(handAcross, finger);
    handRotation.setFromRotationMatrix(this.basis.makeBasis(handAcross, finger, handNormal));
    handRotation.slerp(arm.end.getWorldQuaternion(this.worldRotation), 1 - weight);
    palmPoint.set(0, PALM_OFFSET, 0).applyMatrix4(arm.end.matrixWorld);
    goal.lerpVectors(palmPoint, goal, weight);
    goal.sub(palmPoint.set(0, PALM_OFFSET, 0).applyQuaternion(handRotation));
    this.pole.copy(right).addScaledVector(forward, -.26);
    this.pole.y -= .5;
    this.solve(arm, goal, handRotation, this.pole);
    arm.end.updateWorldMatrix(true, false);
    palmPoint.set(0, PALM_OFFSET, 0).applyMatrix4(arm.end.matrixWorld);
    return palmPoint.toArray(this.palm) as Vec3;
  }
}
