import { Bone, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { ExchangeBodyAction, ExchangeCarried, ExchangeVisualSockets } from './alpha-exchange-motion.ts';
import type { Vec3 } from './types.ts';

interface Arm { upper: Bone; lower: Bone; hand: Bone; palm: Group; side: number }
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const ease = (value: number) => { const u = clamp(value); return u * u * (3 - 2 * u); };
const tuple = (point: Vector3): Vec3 => [point.x, point.y, point.z];
const REST: Vec3 = [.27, 1.01, .22], CARRY: Vec3 = [.33, 1.03, .18];
const Y = new Vector3(0,1,0), Z = new Vector3(0,0,1);

/** Authored upper-body curves, sampled only from the supplied physics action clock. */
export class GuideExchangeLayer {
  readonly scene: Object3D;
  readonly arms: { right: Arm; left: Arm } | null;
  readonly paper = new Group();
  readonly sockets: ExchangeVisualSockets = {
    valid: false, contactError: Infinity, sampledId: null, sampledElapsed: 0, rightHand: [0,0,0], leftHand: [0,0,0],
  };
  private saved = new Map<Bone, Quaternion>();
  private spine: Bone[];
  private applied = false;
  private disposed = false;
  private paperGeometry = new BoxGeometry(.13, .006, .18);
  private stripeGeometry = new BoxGeometry(.078, .0015, .008);
  private paperMaterial = new MeshStandardMaterial({ color: '#eadfc2', roughness: .88 });
  private stripeMaterial = new MeshStandardMaterial({ color: '#564938', roughness: .9 });
  constructor(scene: Object3D) {
    this.scene = scene;
    const bones = new Map<string, Bone>(), key = (name: string) => name.replace(/[._]/g, '');
    scene.traverse(object => { if ((object as Bone).isBone) bones.set(key(object.name), object as Bone); });
    const bone = (name: string) => bones.get(key(name));
    const arm = (side: 'R' | 'L'): Arm | null => {
      const upper = bone(`upperarm.${side}`), lower = bone(`forearm.${side}`), hand = bone(`hand.${side}`);
      if (!upper || !lower || !hand) return null;
      const palm = new Group(); palm.name = `exchange-palm-${side}`; palm.position.set(0, .043, 0); hand.add(palm);
      return { upper, lower, hand, palm, side: side === 'R' ? 1 : -1 };
    };
    const right = arm('R'), left = arm('L');
    this.arms = right && left ? { right, left } : null;
    if (!this.arms) { right?.palm.removeFromParent(); left?.palm.removeFromParent(); }
    this.spine = ['spine', 'chest'].map(name => bone(name)).filter((value): value is Bone => !!value);
    for (const item of [...this.spine, ...[right, left].flatMap(a => a ? [a.upper, a.lower, a.hand] : [])]) this.saved.set(item, item.quaternion.clone());
    this.paper.name = 'exchange-carried-paper'; this.paper.visible = false; this.paper.position.set(0, .012, 0);
    const sheet = new Mesh(this.paperGeometry, this.paperMaterial); sheet.castShadow = true; this.paper.add(sheet);
    for (let i = 0; i < 4; i++) {
      const stripe = new Mesh(this.stripeGeometry, this.stripeMaterial); stripe.position.set(-.009, .004, -.048 + i * .024); this.paper.add(stripe);
    }
    this.arms?.right.palm.add(this.paper);
  }

  /** Invoke before the next mixer frame; also safe after a paused frame or repeated application. */
  restore(): void {
    if (!this.applied) return;
    for (const [bone, rotation] of this.saved) bone.quaternion.copy(rotation);
    this.applied = false; this.scene.updateWorldMatrix(true, true);
  }
  private invalidate(): void {
    this.paper.visible = false; this.sockets.valid = false; this.sockets.contactError = Infinity;
    this.sockets.sampledId = null; this.sockets.sampledElapsed = 0;
  }
  private frame(point: Vec3) { return this.scene.localToWorld(new Vector3(...point)); }
  private rotateWorld(bone: Bone, delta: Quaternion): void {
    const rotation = bone.getWorldQuaternion(new Quaternion()).premultiply(delta);
    if (bone.parent) rotation.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    bone.quaternion.copy(rotation); bone.updateWorldMatrix(true, true);
  }
  private solveArm(arm: Arm, palmGoal: Vector3, palmRotation: Quaternion): void {
    const goal = palmGoal.clone().sub(new Vector3(0,.043,0).applyQuaternion(palmRotation));
    const a = arm.upper.getWorldPosition(new Vector3()), b = arm.lower.getWorldPosition(new Vector3()), c = arm.hand.getWorldPosition(new Vector3());
    const upper = a.distanceTo(b), lower = b.distanceTo(c);
    if (upper < 1e-6 || lower < 1e-6) return;
    const direction = goal.clone().sub(a);
    if (direction.lengthSq() < 1e-10) direction.set(1,0,0).applyQuaternion(this.scene.getWorldQuaternion(new Quaternion()));
    const distance = clamp(direction.length(), Math.abs(upper - lower) + .002, (upper + lower) * .995); direction.normalize();
    const wrist = a.clone().addScaledVector(direction, distance);
    const pole = this.frame([.08,.88,arm.side * .64]).sub(a); pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-10) pole.set(0,0,arm.side).applyQuaternion(this.scene.getWorldQuaternion(new Quaternion()));
    pole.normalize();
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const elbow = a.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
    this.rotateWorld(arm.upper, new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), elbow.sub(a).normalize()));
    const nextB = arm.lower.getWorldPosition(new Vector3()), nextC = arm.hand.getWorldPosition(new Vector3());
    this.rotateWorld(arm.lower, new Quaternion().setFromUnitVectors(nextC.sub(nextB).normalize(), wrist.sub(nextB).normalize()));
    const local = palmRotation.clone();
    if (arm.hand.parent) local.premultiply(arm.hand.parent.getWorldQuaternion(new Quaternion()).invert());
    arm.hand.quaternion.copy(local); this.scene.updateWorldMatrix(true, true);
  }

  /** Root, heading, feet and action time are all owned by the main character controller. */
  apply(action: ExchangeBodyAction | null, carried: ExchangeCarried, allowed = true): ExchangeVisualSockets {
    this.restore(); this.invalidate();
    if (this.disposed || !this.arms || !allowed || (!action && !carried)) return this.sockets;
    this.scene.updateWorldMatrix(true, true);
    for (const [bone, rotation] of this.saved) rotation.copy(bone.quaternion);
    this.applied = true;
    const performing = action?.phase === 'perform' ? action : null;
    const t = performing ? clamp(performing.elapsed, 0, performing.duration) : 0;
    const reach = performing ? t <= performing.contactAt ? ease(t / performing.contactAt)
      : 1 - ease((t - performing.contactAt) / (performing.duration - performing.contactAt)) : 0;
    const rootRotation = this.scene.getWorldQuaternion(new Quaternion());
    const lean = .075 * reach;
    const lateral = Z.clone().applyQuaternion(rootRotation);
    // Only the spine and arms are modified. Pelvis, knees, solved soles and root remain untouched.
    for (const bone of this.spine) this.rotateWorld(bone, new Quaternion().setFromAxisAngle(lateral, -lean / this.spine.length));
    const rest = carried ? CARRY : REST, right = this.frame(rest);
    if (performing) {
      right.lerp(new Vector3(...performing.anchor.target), reach);
      const arc = Math.sin(Math.PI * clamp(t / performing.contactAt));
      if (t < performing.contactAt) {
        if (performing.kind === 'ring') right.y += .15 * arc;
        else if (performing.kind === 'adjust') right.add(Z.clone().applyQuaternion(rootRotation).multiplyScalar(-.07 * arc));
        else right.y += .035 * arc;
      }
    }
    const palmRotation = rootRotation.clone().multiply(new Quaternion().setFromAxisAngle(Z,
      performing?.kind === 'insert' ? -1.25 * reach : -.85 * reach));
    this.solveArm(this.arms.right, right, palmRotation);
    // The free hand counters the reach without moving the lower body or pretending to touch the device.
    this.solveArm(this.arms.left, this.frame([.20 + reach * .035, 1.00, -.24]),
      rootRotation.clone().multiply(new Quaternion().setFromAxisAngle(Y, -.12 * reach)));
    this.scene.updateWorldMatrix(true, true);
    this.sockets.rightHand = tuple(this.arms.right.palm.getWorldPosition(new Vector3()));
    this.sockets.leftHand = tuple(this.arms.left.palm.getWorldPosition(new Vector3()));
    this.sockets.valid = this.sockets.rightHand.every(Number.isFinite) && this.sockets.leftHand.every(Number.isFinite);
    this.sockets.sampledId = performing?.id ?? null; this.sockets.sampledElapsed = performing?.elapsed ?? 0;
    if (performing) this.sockets.contactError = new Vector3(...this.sockets.rightHand).distanceTo(new Vector3(...performing.anchor.target));
    // Ownership changes at confirmed contact in the motion module, never at a visual timestamp.
    this.paper.visible = carried !== null;
    this.paper.name = carried === 'receipt' ? 'exchange-carried-receipt' : 'exchange-carried-paper';
    return this.sockets;
  }

  dispose(): void {
    if (this.disposed) return;
    this.restore(); this.invalidate(); this.paper.removeFromParent();
    if (this.arms) for (const arm of Object.values(this.arms)) arm.palm.removeFromParent();
    this.paperGeometry.dispose(); this.stripeGeometry.dispose(); this.paperMaterial.dispose(); this.stripeMaterial.dispose(); this.disposed = true;
  }
}
