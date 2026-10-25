import { Bone, Group, Material, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { AlphaFactorId } from './alpha-mine-data';
import type { MineAction, MinePoint } from './alpha-mine-state';

export interface GuideMineState { equipped: boolean; carried: AlphaFactorId | null; action: MineAction | null }
export interface GuideMineAssets { detector: Object3D; pickaxe: Object3D; ore: Object3D; colors: Record<AlphaFactorId, string> }
type Tool = 'detector' | 'pickaxe' | 'ore' | 'none';
interface Pose {
  right: MinePoint; tilt: number; lean: number; target: number; left: number; tool: Tool;
}
type Key = [number, MinePoint, number, number, number, number];
const REST: MinePoint = [.36, .98, .20], CARRY: MinePoint = [.33, .96, .16], BELT: MinePoint = [.12, .79, .23];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u); };
function sample(keys: Key[], t: number, tool: Tool): Pose {
  t = Math.min(t, keys[keys.length - 1][0]);
  const i = Math.max(0, keys.findIndex(k => k[0] >= t)), b = keys[i], a = keys[Math.max(0, i - 1)];
  const u = i ? ease((t - a[0]) / Math.max(1e-6, b[0] - a[0])) : 0;
  return { right: a[1].map((v, j) => v + (b[1][j] - v) * u) as MinePoint,
    tilt: a[2] + (b[2] - a[2]) * u, lean: a[3] + (b[3] - a[3]) * u,
    target: a[4] + (b[4] - a[4]) * u, left: a[5] + (b[5] - a[5]) * u, tool };
}

/** Authored interaction poses, not motion capture. All timing is the supplied physics-clock elapsed. */
export function minePose(state: GuideMineState): Pose {
  const a = state.action, t = a ? clamp(a.elapsed, 0, a.duration) : 0;
  if (!a) return { right: state.carried ? CARRY : REST, tilt: 0, lean: state.carried ? .06 : 0,
    target: 0, left: state.carried ? 1 : 0, tool: state.carried ? 'ore' : state.equipped ? 'detector' : 'none' };
  if (a.kind === 'scan') return { right: [.36 + .015 * Math.sin(t * 4), .98, .18 + .045 * Math.sin(t * 3)],
    tilt: -.08, lean: .03, target: 0, left: 0, tool: 'detector' };
  if (a.kind === 'equip') return sample([
    [0, BELT, 0, 0, 0, 0], [.48, REST, 0, .18, 1, .2], [.8, REST, 0, 0, 0, 0],
  ], t, a.contact || state.equipped ? 'detector' : 'none');
  if (a.kind === 'strike') return sample([
    [0, REST, 0, 0, 0, 0], [.14, BELT, 0, 0, 0, .2],
    [.40, [.28, 1.16, .10], .42, -.10, 0, 1], [.57, [.29, .94, .08], -1.05, .20, 1, 1],
    [.73, [.42, .80, .10], -1.35, .28, 0, 1], [.94, BELT, 0, .02, 0, 0], [1.05, REST, 0, 0, 0, 0],
  ], t, t < .14 || t >= .94 ? 'detector' : 'pickaxe');
  if (a.kind === 'pickup') return sample([
    [0, REST, 0, 0, 0, 0], [.12, BELT, 0, .22, 0, .3],
    [.48, CARRY, 0, 1.12, 1, 1], [.85, CARRY, 0, .06, 0, 1],
  ], t, 'ore');
  if (a.bay === undefined) return sample([
    [0, CARRY, 0, .06, 0, 1], [.22, CARRY, 0, .35, .15, 1],
    [.48, CARRY, 0, 1.12, 1, 1], [.78, BELT, 0, .25, 0, 0], [1.4, REST, 0, 0, 0, 0],
  ], t, t < .78 ? 'ore' : 'detector');
  return sample([
    [0, CARRY, 0, .06, 0, 1], [.22, [.17, .91, .16], .12, -.08, 0, 1],
    [.48, [.42, 1.15, .16], -.10, .14, 0, 1], [.65, [.47, 1.09, .16], -.22, .20, 0, .8],
    [1.08, BELT, 0, 0, 0, 0], [1.4, REST, 0, 0, 0, 0],
  ], t, t < 1.08 ? 'ore' : 'detector');
}

interface Arm { upper: Bone; lower: Bone; hand: Bone; palm: Group; side: number }
interface Leg { upper: Bone; lower: Bone; foot: Bone; side: number }
interface Asset {
  root: Object3D; inverseGrip: Matrix4; left: Matrix4 | null; contact: Vector3 | null;
  scan: Vector3 | null; release: Vector3; right: Vector3; gripRotation: Quaternion;
}
export interface MineSockets {
  leftHand: MinePoint; rightHand: MinePoint; headContact: MinePoint; scanOrigin: MinePoint; oreRelease: MinePoint;
  valid: boolean; assetsReady: boolean; contactError: number; rightReachError: number; leftReachError: number;
  sampledActionKind: MineAction['kind'] | null; sampledElapsed: number;
}
const tuple = (v: Vector3): MinePoint => [v.x, v.y, v.z];
const ONE = new Vector3(1, 1, 1), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

/** Reversible interaction layer. Short crouches preserve solved foot anchors; gameplay owns the clock. */
export class GuideMineLayer {
  readonly scene: Object3D;
  readonly arms: { right: Arm; left: Arm } | null;
  readonly sockets: MineSockets = { leftHand: [0,0,0], rightHand: [0,0,0], headContact: [0,0,0],
    scanOrigin: [0,0,0], oreRelease: [0,0,0], valid: false, assetsReady: false,
    contactError: Infinity, rightReachError: 0, leftReachError: 0, sampledActionKind: null, sampledElapsed: 0 };
  private saved = new Map<Bone, Quaternion>();
  private spine: Bone[] = [];
  private assets = new Map<string, Asset>();
  private holsters: Group[] = [];
  private materials = new Set<Material>();
  private pelvis: Bone | null = null;
  private pelvisPosition = new Vector3();
  private head: Bone | null = null;
  private legs: Leg[] = [];
  private applied = false;
  constructor(scene: Object3D) {
    this.scene = scene;
    const bones = new Map<string, Bone>(); scene.traverse(o => { if ((o as Bone).isBone) bones.set(o.name, o as Bone); });
    const arm = (tag: 'R' | 'L'): Arm | null => {
      const upper = bones.get(`upperarm.${tag}`), lower = bones.get(`forearm.${tag}`), hand = bones.get(`hand.${tag}`);
      if (!upper || !lower || !hand) return null;
      const palm = new Group(); palm.name = `mine-palm-${tag}`; palm.position.set(0, .043, 0); hand.add(palm);
      return { upper, lower, hand, palm, side: tag === 'R' ? 1 : -1 };
    };
    const right = arm('R'), left = arm('L'); this.arms = right && left ? { right, left } : null;
    this.spine = ['spine', 'chest'].map(name => bones.get(name)).filter((b): b is Bone => !!b);
    this.head = bones.get('head') ?? null; this.pelvis = bones.get('pelvis') ?? null;
    if (this.pelvis) this.pelvisPosition.copy(this.pelvis.position);
    for (const tag of ['R', 'L']) {
      const upper = bones.get(`thigh.${tag}`), lower = bones.get(`shin.${tag}`), foot = bones.get(`foot.${tag}`);
      if (upper && lower && foot) this.legs.push({ upper, lower, foot, side: tag === 'R' ? 1 : -1 });
    }
    for (const b of [...this.spine, ...(this.head ? [this.head] : []),
      ...[right, left].flatMap(a => a ? [a.upper, a.lower, a.hand] : []), ...this.legs.flatMap(a => [a.upper, a.lower, a.foot])])
      this.saved.set(b, b.quaternion.clone());
    const pelvis = bones.get('pelvis');
    scene.updateWorldMatrix(true, true);
    for (const [position, angle] of [[[-.22, .68, .23], .30], [[-.10, .76, -.26], -.12]] as const) {
      const holder = new Group(); holder.name = 'mine-tool-holster'; holder.matrixAutoUpdate = false;
      if (pelvis) {
        const world = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromAxisAngle(new Vector3(1,0,0), angle), ONE);
        holder.matrix.copy(pelvis.matrixWorld).invert().multiply(scene.matrixWorld).multiply(world); pelvis.add(holder);
      }
      this.holsters.push(holder);
    }
  }

  installAssets(source: GuideMineAssets) {
    this.clearAssets();
    const install = (key: string, object: Object3D, tint?: string) => {
      const root = object.clone(true); root.name = `mine-${key}`; root.visible = false; root.updateWorldMatrix(true, true);
      const inverseRoot = root.matrixWorld.clone().invert();
      const socket = (name: string, required = false) => {
        const node = root.getObjectByName(name);
        if (!node) { if (required) throw new Error(`${key}: missing ${name}`); return null; }
        return inverseRoot.clone().multiply(node.matrixWorld);
      };
      const grip = socket('grip_R', true)!;
      const left = socket('grip_L', key !== 'detector');
      const contact = socket('head_contact', key === 'pickaxe');
      const scan = socket('scan_origin', key === 'detector');
      const release = socket('release', !!tint);
      if (tint) root.traverse(o => {
        if (!(o instanceof Mesh)) return;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        const next = materials.map(m => {
          if (m.name !== 'ore_mineral' || !('color' in m)) return m;
          const copy = m.clone() as Material & { color: { set(color: string): void } };
          copy.color.set(tint); this.materials.add(copy); return copy;
        });
        o.material = Array.isArray(o.material) ? next : next[0];
      });
      root.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.matrixAutoUpdate = false;
      this.assets.set(key, { root, inverseGrip: grip.clone().invert(), left,
        contact: contact ? new Vector3().setFromMatrixPosition(contact) : null,
        scan: scan ? new Vector3().setFromMatrixPosition(scan) : null,
        release: release ? new Vector3().setFromMatrixPosition(release) : new Vector3(),
        right: new Vector3().setFromMatrixPosition(grip), gripRotation: new Quaternion().setFromRotationMatrix(grip) });
    };
    try {
      install('detector', source.detector); install('pickaxe', source.pickaxe);
      for (const id of Object.keys(source.colors) as AlphaFactorId[]) install(id, source.ore, source.colors[id]);
      this.sockets.assetsReady = this.assets.size === 5;
    } catch (error) { this.clearAssets(); throw error; }
  }

  private clearAssets() {
    for (const a of this.assets.values()) a.root.removeFromParent();
    this.assets.clear(); this.materials.forEach(m => m.dispose()); this.materials.clear();
    this.sockets.assetsReady = false;
  }
  unloadAssets() {
    this.clearAssets();
    this.sockets.headContact = [Infinity,Infinity,Infinity];
    this.sockets.scanOrigin = [Infinity,Infinity,Infinity];
  }
  /** Call before advancing the mixer, not before an early paused return. */
  restore() {
    if (!this.applied) return;
    for (const [bone, q] of this.saved) bone.quaternion.copy(q);
    if (this.pelvis) this.pelvis.position.copy(this.pelvisPosition);
    this.applied = false; this.scene.updateWorldMatrix(true, true);
  }
  hide() {
    this.sockets.valid = false; this.sockets.sampledActionKind = null; this.sockets.sampledElapsed = 0;
    for (const a of this.assets.values()) a.root.visible = false;
  }
  private frame(point: MinePoint) { return this.scene.localToWorld(new Vector3(...point)); }
  private rotateWorld(bone: Bone, delta: Quaternion) {
    const q = bone.getWorldQuaternion(new Quaternion()).premultiply(delta);
    if (bone.parent) q.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    bone.quaternion.copy(q); bone.updateWorldMatrix(true, true);
  }
  private chain(upperBone: Bone, lowerBone: Bone, endBone: Bone, goal: Vector3, rotation: Quaternion, pole: Vector3, weight: number) {
    if (weight <= 0) return 0;
    const before = [upperBone, lowerBone, endBone].map(b => b.quaternion.clone());
    const a = upperBone.getWorldPosition(new Vector3()), b = lowerBone.getWorldPosition(new Vector3());
    const c = endBone.getWorldPosition(new Vector3());
    const upper = a.distanceTo(b), lower = b.distanceTo(c);
    const direction = goal.clone().sub(a), actualDistance = direction.length();
    if (actualDistance < 1e-7) direction.set(1, 0, 0).applyQuaternion(this.scene.getWorldQuaternion(new Quaternion()));
    direction.normalize();
    const distance = clamp(actualDistance, Math.abs(upper - lower) + .002, (upper + lower) * .995);
    const wrist = a.clone().addScaledVector(direction, distance);
    pole.sub(a);
    pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-8) pole.copy(b).sub(a).addScaledVector(direction, -b.clone().sub(a).dot(direction));
    pole.normalize();
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const elbow = a.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
    this.rotateWorld(upperBone, new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), elbow.sub(a).normalize()));
    const nextB = lowerBone.getWorldPosition(new Vector3()), nextC = endBone.getWorldPosition(new Vector3());
    this.rotateWorld(lowerBone, new Quaternion().setFromUnitVectors(nextC.sub(nextB).normalize(), wrist.sub(nextB).normalize()));
    const endLocal = rotation.clone();
    if (endBone.parent) endLocal.premultiply(endBone.parent.getWorldQuaternion(new Quaternion()).invert());
    endBone.quaternion.copy(endLocal);
    for (const [i, bone] of [upperBone, lowerBone, endBone].entries()) bone.quaternion.slerpQuaternions(before[i], bone.quaternion.clone(), clamp(weight));
    this.scene.updateWorldMatrix(true, true);
    return endBone.getWorldPosition(new Vector3()).distanceTo(goal);
  }
  private arm(arm: Arm, palmGoal: Vector3, palmRotation: Quaternion, weight: number) {
    const wristGoal = palmGoal.clone().sub(new Vector3(0, .043, 0).applyQuaternion(palmRotation));
    this.chain(arm.upper, arm.lower, arm.hand, wristGoal, palmRotation, this.frame([.06, .84, arm.side * .64]), weight);
    return arm.palm.getWorldPosition(new Vector3()).distanceTo(palmGoal);
  }
  private crouch(amount: number) {
    if (!this.pelvis || this.legs.length !== 2 || amount < 1e-5) return;
    const anchors = this.legs.map(leg => ({ p: leg.foot.getWorldPosition(new Vector3()), q: leg.foot.getWorldQuaternion(new Quaternion()) }));
    const p = this.pelvis.getWorldPosition(new Vector3()); p.y -= clamp(amount, 0, .16);
    if (this.pelvis.parent) this.pelvis.parent.worldToLocal(p);
    this.pelvis.position.copy(p); this.scene.updateWorldMatrix(true, true);
    this.legs.forEach((leg, i) => this.chain(leg.upper, leg.lower, leg.foot, anchors[i].p, anchors[i].q,
      this.frame([.45, .32, leg.side * .18]), 1));
  }

  private attach(asset: Asset, parent: Object3D) {
    if (asset.root.parent !== parent) parent.add(asset.root);
    asset.root.matrix.copy(asset.inverseGrip); asset.root.matrixWorldNeedsUpdate = true;
    asset.root.updateWorldMatrix(true, true);
  }
  private publishHands() {
    if (!this.arms) return;
    this.sockets.leftHand = tuple(this.arms.left.palm.getWorldPosition(new Vector3()));
    this.sockets.rightHand = tuple(this.arms.right.palm.getWorldPosition(new Vector3()));
    this.sockets.valid = true;
  }
  /** Call after the final foot/root corrections. No elapsed accumulation or gameplay writes occur. */
  apply(state: GuideMineState, enabled = true): MineSockets {
    this.restore(); this.hide();
    this.sockets.contactError = Infinity; this.sockets.rightReachError = 0; this.sockets.leftReachError = 0;
    if (!this.arms || !enabled) return this.sockets;
    this.scene.updateWorldMatrix(true, true); this.publishHands();
    if (!state.equipped && !state.carried && !state.action) return this.sockets;
    for (const [bone, q] of this.saved) q.copy(bone.quaternion);
    if (this.pelvis) this.pelvisPosition.copy(this.pelvis.position);
    this.applied = true;
    const pose = minePose(state), action = state.action;
    this.sockets.sampledActionKind = action?.kind ?? null; this.sockets.sampledElapsed = action?.elapsed ?? 0;
    const oreId = action?.kind === 'deposit' ? action.contact ? null : action.factorId ?? state.carried : state.carried;
    const posedOre = oreId ?? action?.factorId;
    const chosen = pose.tool === 'ore' ? posedOre ? this.assets.get(posedOre) : undefined : this.assets.get(pose.tool);
    const rootRotation = this.scene.getWorldQuaternion(new Quaternion());
    const lateral = Z.clone().applyQuaternion(rootRotation);
    let lean = pose.lean;
    const lowering = action?.kind === 'pickup' || (action?.kind === 'deposit' && action.bay === undefined);
    if (lowering && action) {
      const targetHeight = this.scene.worldToLocal(new Vector3(...action.target)).y;
      lean = Math.min(lean, clamp((1.2 - targetHeight) / .5) * 1.12);
      this.crouch(.16 * pose.target);
    } else if (action?.kind === 'deposit' && action.elapsed < .48) {
      this.crouch(.07 * Math.sin(Math.PI * action.elapsed / .48));
    } else if (action?.kind === 'strike') {
      const target = this.scene.worldToLocal(new Vector3(...action.target));
      lean += pose.target * clamp((target.x - .75) / .4) * .85;
    }
    for (const b of this.spine) this.rotateWorld(b, new Quaternion().setFromAxisAngle(lateral, -lean / Math.max(1, this.spine.length)));
    if (lowering && this.head) this.rotateWorld(this.head, new Quaternion().setFromAxisAngle(lateral, lean * .9));
    let aim = 0;
    if (action?.kind === 'scan') {
      const target = this.scene.worldToLocal(new Vector3(...action.target));
      aim = clamp(Math.atan2(-target.z, target.x), -.45, .45);
    }
    const highStrike = action?.kind === 'strike' ? pose.target * clamp((this.scene.worldToLocal(new Vector3(...action.target)).y - 1) / .35) * .35 : 0;
    const toolRotation = rootRotation.clone().multiply(new Quaternion().setFromAxisAngle(Y, aim))
      .multiply(new Quaternion().setFromAxisAngle(Z, pose.tilt + highStrike));
    const palmRotation = toolRotation.clone().multiply(chosen?.gripRotation ?? new Quaternion());
    const palmGoal = this.frame(pose.right);
    if (action && pose.target > 0) {
      const target = new Vector3(...action.target);
      if (action.kind === 'strike' && chosen?.contact) target.sub(chosen.contact.clone().sub(chosen.right).applyQuaternion(toolRotation));
      if (lowering && chosen) target.add(chosen.right.clone().applyQuaternion(toolRotation));
      palmGoal.lerp(target, pose.target);
    }
    this.sockets.rightReachError = this.arm(this.arms.right, palmGoal, palmRotation, 1);
    for (const [key, asset] of this.assets) {
      const active = key === 'detector' ? pose.tool === 'detector' : key === 'pickaxe' ? pose.tool === 'pickaxe' : key === posedOre && pose.tool === 'ore';
      this.attach(asset, active ? this.arms.right.palm : this.holsters[key === 'pickaxe' ? 0 : 1]);
      asset.root.visible = key === 'detector' || key === 'pickaxe' ? state.equipped : key === oreId;
    }
    if (chosen?.left && pose.left > 0) {
      const world = chosen.root.matrixWorld.clone().multiply(chosen.left);
      this.sockets.leftReachError = this.arm(this.arms.left, new Vector3().setFromMatrixPosition(world),
        new Quaternion().setFromRotationMatrix(world), pose.left);
    }
    this.scene.updateWorldMatrix(true, true); this.publishHands();
    const pickaxe = this.assets.get('pickaxe'), detector = this.assets.get('detector');
    this.sockets.headContact = pickaxe?.contact ? tuple(pickaxe.root.localToWorld(pickaxe.contact.clone())) : [Infinity,Infinity,Infinity];
    this.sockets.scanOrigin = detector?.scan ? tuple(detector.root.localToWorld(detector.scan.clone())) : [Infinity,Infinity,Infinity];
    this.sockets.oreRelease = chosen && pose.tool === 'ore' ? tuple(chosen.root.localToWorld(chosen.release.clone()))
      : tuple(this.arms.right.palm.getWorldPosition(new Vector3()));
    if (action?.kind === 'strike' && pickaxe?.contact) this.sockets.contactError = new Vector3(...this.sockets.headContact).distanceTo(new Vector3(...action.target));
    return this.sockets;
  }

  dispose() {
    this.restore(); this.hide(); this.clearAssets();
    for (const arm of this.arms ? Object.values(this.arms) : []) arm.palm.removeFromParent();
    this.holsters.forEach(h => h.removeFromParent());
  }
}
