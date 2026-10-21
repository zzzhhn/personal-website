/**
 * Stop-step visual candidate for G24 (QA-only, not Fable-approved).
 *
 * When the guide changes Walk/Run -> Idle on the ground, the displayed feet are captured in
 * world space. The support foot stays locked; the other foot lifts 6-8 cm and moves to the
 * Idle stance in ~0.25-0.35 s (minimum-jerk path, sine lift). If both feet are off the stance,
 * they step one after the other. A two-bone analytic IK on each thigh/shin/foot chain holds
 * the targets; bone lengths are never changed. If a target is out of reach the pelvis may be
 * lowered by at most `maxPelvisDrop`, and any remaining gap is reported as `reachError`
 * (the leg is not stretched to hide it).
 *
 * Visual only: no rigid body, braking or collider changes. Flat ground only: targets keep the
 * captured/Idle heights; there is no terrain probe, so slopes are NOT handled.
 *
 * Per-frame integration (see docs/world/quality-v2/stop-prototype.md):
 *   stop.preUpdate({ animation, grounded, speedMps, facing, visible })   // before mixer.update
 *   mixer.update(dt); group.rotation.y = facing;
 *   stop.solve(dt)                                                       // before sole correction
 *   ...existing <=2.5 cm sole correction...
 * Call stop.cancel('hidden') when the guide is hidden (vehicle) and stop.dispose() on unmount.
 * No local bone axis is assumed: all directions come from world-space bone positions of the
 * cloned GLTF and its Idle clip.
 */
import { AnimationMixer, Matrix4, Quaternion, Vector3, type AnimationClip, type Bone, type Object3D } from 'three';
// r2 (turn fix): locked targets now follow the root's yaw. When facing changes (WorldActors
// turns the body up to 24 rad/s while stopped), every held target position/orientation is
// rotated about the root by the same yaw delta, in every state, before the IK solve. A
// world-fixed foot under a rotating pelvis twisted the legs through each other (A6 runtime
// matrix, turn180). Feet therefore turn rigidly with the body, matching the Idle rigid turn
// Fable accepted; the resulting sole arc is still measured by QA, not hidden.
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type StopSide = 'left' | 'right';
export interface StopFrameInput { animation: string; grounded: boolean; speedMps: number; facing: number; visible: boolean }
export interface StopTuning {
  /** Feet closer than this to their Idle target are not stepped; they settle during release. */
  stepThreshold: number;
  liftMin: number; liftMax: number;
  stepMin: number; stepMax: number;
  /** Pause between two sequential steps. */
  stepGap: number;
  /** Hard limit on visual pelvis lowering used to reach a planted target. */
  maxPelvisDrop: number;
  /** Max pelvis drop speed (m/s); faster demand shows up as reachError, not a pop. */
  pelvisDropRate: number;
  /** Fraction of thigh+shin length usable for reach (avoids the straight-knee singularity). */
  reachMargin: number;
  releaseBlend: number; exitBlend: number; jumpExitBlend: number;
  /** Facing change (rad) since the stop that counts as a turn and exits. */
  turnExit: number;
  /** Speed (m/s) that counts as moving again. Matches WorldGuide Idle threshold. */
  moveExit: number;
  /** Safety: settle longer than this exits via the normal blend. */
  maxSettle: number;
  /** Moving exit: a planted foot stays locked until the animation lifts it this much... */
  liftRelease: number;
  /** ...or at most this long, then blends out over exitBlend. */
  maxHold: number;
  /** A foot whose ankle is this far above its Idle height at capture is treated as swing. */
  swingHeight: number;
}
export interface StopOptions extends Partial<StopTuning> {
  /**
   * The node whose position.y the existing <=2.5 cm sole correction writes (WorldGuide's group).
   * Locked targets follow changes of anchor.position.y since the stop began. Without this, a
   * world-locked foot feeds back into the correction (sole - root depends on the correction)
   * and ratchets it to its 2.5 cm clamp. Pass it whenever the correction runs after solve().
   */
  anchor?: Object3D;
}
export const STOP_DEFAULTS: StopTuning = {
  stepThreshold: 0.02, liftMin: 0.06, liftMax: 0.08, stepMin: 0.25, stepMax: 0.35, stepGap: 0.04,
  maxPelvisDrop: 0.05, pelvisDropRate: 0.6, reachMargin: 0.995,
  releaseBlend: 0.18, exitBlend: 0.15, jumpExitBlend: 0.08, turnExit: 0.35, moveExit: 0.12, maxSettle: 1.4,
  liftRelease: 0.012, maxHold: 0.3,
  swingHeight: 0.015,
};

type StopState = 'off' | 'settling' | 'releasing' | 'exiting';
interface Step { from: Vector3; to: Vector3; fromQ: Quaternion; toQ: Quaternion; t: number; duration: number; lift: number; distance: number; peakAboveChord: number; startY: number; endY: number }
interface Leg {
  side: StopSide; thigh: Bone; shin: Bone; foot: Bone;
  upper: number; lower: number;
  /** Idle ankle position / foot orientation in guide-scene space (from the Idle clip). */
  idlePos: Vector3; idleQuat: Quaternion;
  /** Knee bend direction in guide-scene space (from Idle, or the most bent Walk sample). */
  pole: Vector3; poleSource: string;
  target: Vector3; targetQuat: Quaternion; planted: Vector3; plantedQuat: Quaternion;
  step: Step | null; queued: boolean; stepped: boolean;
  reachError: number; maxReachError: number; boneLengthError: number; kneeDot: number; minKneeDot: number;
  lockedDrift: number; animFoot: Vector3;
  /** Per-leg IK weight and its own blend-out (moving exit releases legs separately). */
  w: number; hold: boolean; wFrom: number; wTime: number;
  anim: { thigh: Quaternion; shin: Quaternion; foot: Quaternion };
  ik: { thigh: Quaternion; shin: Quaternion; foot: Quaternion };
}

const MOVING = new Set(['Walk', 'Run']);
const minJerk = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function findBone(root: Object3D, re: RegExp): Bone | null {
  let found: Bone | null = null;
  root.traverse(o => { if (!found && (o as Bone).isBone && re.test(o.name)) found = o as Bone; });
  return found;
}
/** GLTFLoader strips '.' from names (thigh.L -> thighL); accept both spellings. */
const chainNames = (side: StopSide) => {
  const s = side === 'left' ? 'L' : 'R';
  return { thigh: new RegExp(`^thigh[._]?${s}$`), shin: new RegExp(`^shin[._]?${s}$`), foot: new RegExp(`^foot[._]?${s}$`) };
};

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _t = new Vector3(), _k = new Vector3();
const _u1 = new Vector3(), _u2 = new Vector3(), _n1 = new Vector3(), _n2 = new Vector3(), _w1 = new Vector3(), _w2 = new Vector3();
const _m1 = new Matrix4(), _m2 = new Matrix4(), _q = new Quaternion(), _q2 = new Quaternion(), _pq = new Quaternion(), _wq = new Quaternion();
const _v = new Vector3(), _sceneQ = new Quaternion(), _pole = new Vector3();
const _v2 = new Vector3(), _yq = new Quaternion(), _Y = new Vector3(0, 1, 0);

/** Apply a world-space rotation delta to a bone (keeps its world position). */
function rotateBoneWorld(bone: Bone, delta: Quaternion) {
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(delta);
  if (bone.parent) { bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_wq)); }
  else bone.quaternion.copy(_wq);
  bone.updateMatrixWorld(true);
}
function setBoneWorldQuat(bone: Bone, world: Quaternion) {
  if (bone.parent) { bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(world)); }
  else bone.quaternion.copy(world);
  bone.updateMatrixWorld(true);
}

export class GuideStopStep {
  readonly tuning: StopTuning;
  readonly scene: Object3D;
  readonly legs: Record<StopSide, Leg>;
  readonly pelvis: Object3D;
  private state: StopState = 'off';
  private weight = 0;
  private blendFrom = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private elapsed = 0;
  private gap = 0;
  private facing0 = 0;
  /** Latest facing from preUpdate, and the facing the held targets are currently expressed in. */
  private facingIn = 0;
  private facingApplied = 0;
  private yawFollowed = 0;
  private lastAnimation = 'Idle';
  private drop = 0;
  private animPelvis = new Vector3();
  private queue: StopSide[] = [];
  private events: { t: number; event: string }[] = [];
  private clock = 0;
  private exitReason: string | null = null;
  private releaseResidual: Record<StopSide, number> = { left: 0, right: 0 };
  private stopsStarted = 0;
  private anchor: Object3D | null;
  private anchorY0 = 0;
  private readonly eff = new Vector3();

  /**
   * @param scene the runtime clone (the object whose bones the mixer animates)
   * @param source the loaded GLTF (scene + animations); only used to probe the Idle stance
   */
  constructor(scene: Object3D, source: { scene: Object3D; animations: AnimationClip[] }, options: StopOptions = {}) {
    const { anchor, ...tuning } = options;
    this.tuning = { ...STOP_DEFAULTS, ...tuning };
    this.anchor = anchor ?? null;
    this.scene = scene;
    const idle = source.animations.find(c => c.name === 'Idle');
    if (!idle) throw new Error('GuideStopStep: Idle clip missing');
    const walk = source.animations.find(c => c.name === 'Walk') ?? null;
    const probe = clone(source.scene);
    const mixer = new AnimationMixer(probe);
    mixer.clipAction(idle).play(); mixer.setTime(0); probe.updateMatrixWorld(true);
    const rootInv = probe.matrixWorld.clone().invert();
    const rootQinv = probe.getWorldQuaternion(new Quaternion()).invert();
    const build = (side: StopSide): Leg => {
      const n = chainNames(side);
      const thigh = findBone(scene, n.thigh), shin = findBone(scene, n.shin), foot = findBone(scene, n.foot);
      const pThigh = findBone(probe, n.thigh), pShin = findBone(probe, n.shin), pFoot = findBone(probe, n.foot);
      if (!thigh || !shin || !foot || !pThigh || !pShin || !pFoot) throw new Error(`GuideStopStep: ${side} thigh/shin/foot chain missing`);
      if (shin.parent !== thigh || foot.parent !== shin) throw new Error(`GuideStopStep: ${side} chain is not thigh>shin>foot`);
      const A = pThigh.getWorldPosition(new Vector3()), B = pShin.getWorldPosition(new Vector3()), C = pFoot.getWorldPosition(new Vector3());
      const upper = A.distanceTo(B), lower = B.distanceTo(C);
      const idlePos = C.clone().applyMatrix4(rootInv);
      const idleQuat = rootQinv.clone().multiply(pFoot.getWorldQuaternion(new Quaternion()));
      const kneeOffset = (a: Vector3, b: Vector3, c: Vector3) => { const d = c.clone().sub(a).normalize(); return b.clone().sub(a).sub(d.multiplyScalar(b.clone().sub(a).dot(d))); };
      let off = kneeOffset(A, B, C), poleSource = 'Idle t=0';
      if (off.length() < 0.004 && walk) {
        // Nearly straight Idle knee: take the bend plane from the most bent Walk sample.
        const wm = new AnimationMixer(probe); mixer.stopAllAction(); wm.clipAction(walk).play();
        let best = off;
        for (let i = 0; i < 24; i++) {
          wm.setTime(walk.duration * i / 24); probe.updateMatrixWorld(true);
          const o = kneeOffset(pThigh.getWorldPosition(new Vector3()), pShin.getWorldPosition(new Vector3()), pFoot.getWorldPosition(new Vector3()));
          if (o.length() > best.length()) best = o;
        }
        wm.stopAllAction(); wm.uncacheRoot(probe); off = best; poleSource = 'Walk max bend';
        mixer.clipAction(idle).play(); mixer.setTime(0); probe.updateMatrixWorld(true);
      }
      if (off.length() < 1e-4) throw new Error(`GuideStopStep: ${side} knee bend direction undefined`);
      const pole = off.normalize().applyQuaternion(rootQinv);
      const q = () => new Quaternion();
      return { side, thigh, shin, foot, upper, lower, idlePos, idleQuat, pole, poleSource,
        target: new Vector3(), targetQuat: q(), planted: new Vector3(), plantedQuat: q(), step: null, queued: false, stepped: false,
        reachError: 0, maxReachError: 0, boneLengthError: 0, kneeDot: 1, minKneeDot: 1, lockedDrift: 0, animFoot: new Vector3(),
        w: 0, hold: false, wFrom: 0, wTime: 0,
        anim: { thigh: q(), shin: q(), foot: q() }, ik: { thigh: q(), shin: q(), foot: q() } };
    };
    this.legs = { left: build('left'), right: build('right') };
    mixer.stopAllAction(); mixer.uncacheRoot(probe);
    const pelvis = this.legs.left.thigh.parent;
    if (!pelvis || pelvis !== this.legs.right.thigh.parent) throw new Error('GuideStopStep: thighs do not share a parent');
    this.pelvis = pelvis;
  }

  get active() { return this.state !== 'off'; }

  /** Idle stance target for one foot in world space (uses the scene's current world matrix). */
  idleTarget(leg: Leg, pos: Vector3, quat: Quaternion) {
    pos.copy(leg.idlePos).applyMatrix4(this.scene.matrixWorld);
    pos.y -= this.shift();
    quat.copy(this.scene.getWorldQuaternion(_sceneQ)).multiply(leg.idleQuat);
  }

  /** Rotate every held target about the root by the facing change since the last solve. */
  private followYaw() {
    const delta = wrap(this.facingIn - this.facingApplied);
    this.facingApplied = this.facingIn;
    if (Math.abs(delta) < 1e-7) return;
    this.yawFollowed += Math.abs(delta);
    const pivot = (this.anchor ?? this.scene).getWorldPosition(_v2);
    _yq.setFromAxisAngle(_Y, delta);
    const turnPoint = (p: Vector3) => p.sub(pivot).applyQuaternion(_yq).add(pivot);
    for (const leg of Object.values(this.legs)) {
      turnPoint(leg.target); turnPoint(leg.planted);
      leg.targetQuat.premultiply(_yq); leg.plantedQuat.premultiply(_yq);
      if (leg.step) { turnPoint(leg.step.from); turnPoint(leg.step.to); leg.step.fromQ.premultiply(_yq); leg.step.toQ.premultiply(_yq); }
    }
  }

  /** Vertical change of the sole-correction anchor since the stop began. */
  private shift() { return this.anchor ? this.anchor.position.y - this.anchorY0 : 0; }
  /** Target actually solved this frame (stored target + anchor shift). */
  private effective(leg: Leg) { return this.eff.copy(leg.target).setY(leg.target.y + this.shift()); }

  private log(event: string) { this.events.push({ t: +this.clock.toFixed(3), event }); if (this.events.length > 24) this.events.shift(); }

  /** Call every visible, unpaused frame BEFORE mixer.update(dt). */
  preUpdate(input: StopFrameInput) {
    this.facingIn = input.facing;
    const previous = this.lastAnimation;
    this.lastAnimation = input.animation;
    if (!input.visible) { this.cancel('hidden'); return; }
    if (this.state === 'off') {
      if (MOVING.has(previous) && input.animation === 'Idle' && input.grounded) this.begin(input, previous);
      return;
    }
    if (this.state === 'exiting') return;
    const t = this.tuning;
    let reason: string | null = null, blend = t.exitBlend;
    if (!input.grounded) { reason = 'jump'; blend = t.jumpExitBlend; }
    else if (input.animation !== 'Idle') reason = `animation:${input.animation}`;
    else if (input.speedMps > t.moveExit) reason = 'moving';
    else if (Math.abs(wrap(input.facing - this.facing0)) > t.turnExit) reason = 'turn';
    else if (this.elapsed > t.maxSettle) reason = 'timeout';
    if (reason) this.startBlendOut('exiting', blend, reason);
  }

  private begin(input: StopFrameInput, from: string) {
    this.scene.updateMatrixWorld(true);
    this.facing0 = input.facing; this.facingApplied = input.facing; this.yawFollowed = 0; this.elapsed = 0; this.gap = 0; this.drop = 0; this.exitReason = null; this.stopsStarted++;
    this.anchorY0 = this.anchor ? this.anchor.position.y : 0;
    const plan: { side: StopSide; distance: number; swing: boolean }[] = [];
    for (const leg of Object.values(this.legs)) {
      leg.foot.getWorldPosition(leg.planted); leg.foot.getWorldQuaternion(leg.plantedQuat);
      leg.target.copy(leg.planted); leg.targetQuat.copy(leg.plantedQuat);
      leg.step = null; leg.stepped = false; leg.queued = false; leg.maxReachError = 0; leg.reachError = 0; leg.lockedDrift = 0; leg.minKneeDot = 1;
      this.idleTarget(leg, _t, _q);
      const distance = Math.hypot(_t.x - leg.planted.x, _t.z - leg.planted.z);
      const swing = leg.planted.y - _t.y > this.tuning.swingHeight;
      if (distance > this.tuning.stepThreshold || swing) plan.push({ side: leg.side, distance, swing });
    }
    // The swing foot moves first (it is already unloaded); otherwise the farther foot.
    plan.sort((a, b) => Number(b.swing) - Number(a.swing) || b.distance - a.distance);
    this.queue = plan.map(p => p.side);
    for (const s of this.queue) this.legs[s].queued = true;
    this.state = 'settling'; this.weight = 1;
    for (const leg of Object.values(this.legs)) { leg.w = 1; leg.hold = false; }
    this.log(`begin from ${from}; steps ${plan.map(p => `${p.side}${p.swing ? '(swing)' : ''} ${(p.distance * 100).toFixed(1)}cm`).join(', ') || 'none'}`);
  }

  private startBlendOut(state: 'releasing' | 'exiting', duration: number, reason: string) {
    this.state = state; this.blendFrom = this.weight; this.blendTime = 0; this.blendDuration = Math.max(1e-3, duration);
    if (state === 'exiting') this.exitReason = reason;
    // Moving again: a locked (not stepping) foot keeps its world lock until the new gait lifts
    // it, so the stance foot is not dragged; the stepping foot blends out at once.
    const steppingOff = state === 'exiting' && (reason === 'moving' || reason.startsWith('animation:Walk') || reason.startsWith('animation:Run'));
    for (const leg of Object.values(this.legs)) { leg.hold = steppingOff && !leg.step; leg.wFrom = leg.w; leg.wTime = 0; }
    this.log(`${state}: ${reason}${steppingOff ? ` (hold ${Object.values(this.legs).filter(l => l.hold).map(l => l.side).join('+') || 'none'})` : ''}`);
  }

  /** Immediate reset; only for cases where the guide is not visible (vehicle, unmount). */
  cancel(reason: string) {
    if (this.state === 'off') return;
    this.exitReason = reason; this.state = 'off'; this.weight = 0; this.drop = 0; this.queue = [];
    for (const leg of Object.values(this.legs)) { leg.step = null; leg.queued = false; leg.w = 0; leg.hold = false; }
    this.log(`cancel: ${reason}`);
  }

  /**
   * Call AFTER mixer.update(dt) and after the guide group's transform (facing) is set, BEFORE
   * the sole correction. Overwrites pelvis position and leg bone rotations, blended by weight.
   */
  solve(dt: number) {
    this.clock += dt;
    if (this.state === 'off') return;
    const t = this.tuning;
    this.elapsed += dt;
    this.scene.parent?.updateWorldMatrix(true, false);
    this.scene.updateMatrixWorld(true);
    this.followYaw();
    // Store animated (mixer) locals for blending.
    this.animPelvis.copy(this.pelvis.position);
    for (const leg of Object.values(this.legs)) {
      leg.anim.thigh.copy(leg.thigh.quaternion); leg.anim.shin.copy(leg.shin.quaternion); leg.anim.foot.copy(leg.foot.quaternion);
      leg.foot.getWorldPosition(leg.animFoot);
    }
    if (this.state === 'settling') { this.advanceSteps(dt); for (const leg of Object.values(this.legs)) leg.w = 1; }
    else {
      this.blendTime += dt;
      this.weight = this.blendFrom * (1 - minJerk(clamp(this.blendTime / this.blendDuration, 0, 1)));
      let done = true;
      for (const leg of Object.values(this.legs)) {
        if (leg.hold) {
          const e = this.effective(leg);
          const lifted = leg.animFoot.y - e.y > t.liftRelease;
          if (lifted || this.blendTime >= t.maxHold) { leg.hold = false; leg.wFrom = leg.w; leg.wTime = 0; this.log(`${leg.side} hold released (${lifted ? 'lifted by gait' : 'maxHold'})`); }
          else { done = false; continue; }
        }
        leg.wTime += dt;
        leg.w = leg.wFrom * (1 - minJerk(clamp(leg.wTime / this.blendDuration, 0, 1)));
        if (leg.wTime < this.blendDuration) done = false;
      }
      if (done) {
        this.log(`off after ${this.state}`);
        this.state = 'off'; this.weight = 0; this.drop = 0; this.queue = [];
        for (const leg of Object.values(this.legs)) { leg.step = null; leg.w = 0; leg.hold = false; }
        return;
      }
    }
    // Pelvis weight follows the most-locked leg so a held foot is not pulled by the pelvis.
    const w = Math.max(this.weight, this.legs.left.w, this.legs.right.w);
    // Pelvis drop needed so every target is within reach (rate limited, hard bounded).
    let needed = 0;
    const maxR = (leg: Leg) => (leg.upper + leg.lower) * t.reachMargin;
    for (const leg of Object.values(this.legs)) {
      leg.thigh.getWorldPosition(_a);
      const e = this.effective(leg);
      const h = Math.hypot(e.x - _a.x, e.z - _a.z), R = maxR(leg);
      if (h < R) needed = Math.max(needed, (_a.y - e.y) - Math.sqrt(R * R - h * h));
      else needed = t.maxPelvisDrop;
    }
    const want = clamp(needed, 0, t.maxPelvisDrop);
    this.drop += clamp(want - this.drop, -t.pelvisDropRate * dt, t.pelvisDropRate * dt);
    if (this.drop > 1e-5) {
      this.pelvis.getWorldPosition(_v); _v.y -= this.drop;
      if (this.pelvis.parent) this.pelvis.parent.worldToLocal(_v);
      this.pelvis.position.copy(_v);
      this.pelvis.updateMatrixWorld(true);
    }
    for (const leg of Object.values(this.legs)) this.solveLeg(leg);
    // Blend IK result with the animated pose.
    if (w < 1) this.pelvis.position.lerpVectors(this.animPelvis, this.pelvis.position, w);
    for (const leg of Object.values(this.legs)) {
      if (leg.w >= 1) continue;
      leg.thigh.quaternion.copy(leg.anim.thigh).slerp(leg.ik.thigh, leg.w);
      leg.shin.quaternion.copy(leg.anim.shin).slerp(leg.ik.shin, leg.w);
      leg.foot.quaternion.copy(leg.anim.foot).slerp(leg.ik.foot, leg.w);
    }
    this.pelvis.updateMatrixWorld(true);
    for (const leg of Object.values(this.legs)) {
      leg.foot.getWorldPosition(_v);
      const e = this.effective(leg);
      leg.reachError = leg.w >= 1 ? _v.distanceTo(e) : 0;
      leg.maxReachError = Math.max(leg.maxReachError, leg.reachError);
      if (leg.w >= 1 && !leg.step) leg.lockedDrift = Math.max(leg.lockedDrift, Math.hypot(_v.x - e.x, _v.z - e.z));
    }
  }

  private advanceSteps(dt: number) {
    const t = this.tuning;
    const active = Object.values(this.legs).find(l => l.step);
    if (active) {
      const s = active.step!;
      s.t = Math.min(1, s.t + dt / s.duration);
      const e = minJerk(s.t);
      active.target.lerpVectors(s.from, s.to, e);
      active.target.y = s.startY + (s.endY - s.startY) * e + s.lift * Math.sin(Math.PI * s.t);
      // Ankle height above the straight start->end chord (the authored lift, not sole clearance).
      s.peakAboveChord = Math.max(s.peakAboveChord, active.target.y - (s.startY + (s.endY - s.startY) * e));
      active.targetQuat.slerpQuaternions(s.fromQ, s.toQ, e);
      if (s.t >= 1) {
        active.target.copy(s.to); active.targetQuat.copy(s.toQ); active.stepped = true;
        this.log(`${active.side} landed ${(s.distance * 100).toFixed(1)}cm in ${s.duration.toFixed(2)}s lift ${(s.peakAboveChord * 100).toFixed(1)}cm`);
        active.step = null; this.gap = t.stepGap;
      }
      return;
    }
    if (this.gap > 0) { this.gap -= dt; return; }
    const next = this.queue.shift();
    if (!next) {
      // Release: the Idle clip now drives the feet; record the remaining offset to Idle.
      // Offset between the held target and the foot the animation (Idle) would show now.
      for (const leg of Object.values(this.legs)) { const e = this.effective(leg); this.releaseResidual[leg.side] = Math.hypot(leg.animFoot.x - e.x, leg.animFoot.z - e.z); }
      this.startBlendOut('releasing', t.releaseBlend, 'settled');
      return;
    }
    const leg = this.legs[next]; leg.queued = false;
    this.idleTarget(leg, _t, _q);
    const distance = Math.hypot(_t.x - leg.target.x, _t.z - leg.target.z);
    // Re-check at step time: a foot already within the threshold is not lifted (it settles in
    // the release blend, whose residual is reported).
    if (distance <= t.stepThreshold && leg.target.y - _t.y <= t.swingHeight) { this.log(`${leg.side} skip ${(distance * 100).toFixed(1)}cm`); return; }
    const k = clamp(distance / 0.25, 0, 1);
    leg.step = { from: leg.target.clone(), to: _t.clone(), fromQ: leg.targetQuat.clone(), toQ: _q.clone(), t: 0,
      duration: t.stepMin + (t.stepMax - t.stepMin) * k, lift: t.liftMin + (t.liftMax - t.liftMin) * k, distance, peakAboveChord: 0,
      startY: leg.target.y, endY: _t.y };
    this.log(`${leg.side} step ${(distance * 100).toFixed(1)}cm`);
  }

  /** Analytic two-bone IK; keeps |hip-knee| and |knee-ankle|; foot gets targetQuat. */
  private solveLeg(leg: Leg) {
    const t = this.tuning;
    leg.thigh.getWorldPosition(_a); leg.shin.getWorldPosition(_b); leg.foot.getWorldPosition(_c);
    const a = leg.upper, b = leg.lower;
    leg.boneLengthError = Math.max(Math.abs(_a.distanceTo(_b) - a), Math.abs(_b.distanceTo(_c) - b));
    const R = (a + b) * t.reachMargin, r = Math.abs(a - b) + 1e-3;
    _t.copy(this.effective(leg)).sub(_a);
    const d = clamp(_t.length(), r, R);
    _t.setLength(d).add(_a);   // reachable target; the remainder is reported as reachError
    // Rest knee direction in world space (from Idle/Walk probe), used as the bend side.
    _pole.copy(leg.pole).applyQuaternion(this.scene.getWorldQuaternion(_sceneQ));
    const restPole = _k.copy(_pole);
    // Current knee offset from the hip-ankle line; falls back to the rest pole if degenerate
    // or bent the wrong way.
    _u1.copy(_c).sub(_a).normalize();
    _w1.copy(_b).sub(_a); _w1.addScaledVector(_u1, -_w1.dot(_u1));
    const off1 = _w1.length() > 0.004 && _w1.dot(restPole) > 0 ? _w1.normalize() : _w1.copy(restPole).addScaledVector(_u1, -restPole.dot(_u1)).normalize();
    _n1.copy(_u1).cross(off1).normalize();                          // current leg-plane normal
    // Target knee position on the same side.
    const dir = _u2.copy(_t).sub(_a).normalize();
    _pole.copy(off1).addScaledVector(dir, -off1.dot(dir));
    if (_pole.lengthSq() < 1e-8) _pole.copy(restPole).addScaledVector(dir, -restPole.dot(dir));
    _pole.normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const K = _w2.copy(_a).addScaledVector(dir, a * cosA).addScaledVector(_pole, a * sinA);
    _n2.copy(dir).cross(_pole).normalize();                         // target leg-plane normal
    // Thigh: rotation taking (thigh dir, plane normal) frame to the target frame.
    const thighNow = _v.copy(_b).sub(_a).normalize();
    _m1.makeBasis(thighNow, _n1, thighNow.clone().cross(_n1));
    const thighNew = K.clone().sub(_a).normalize();
    _m2.makeBasis(thighNew, _n2, thighNew.clone().cross(_n2));
    _q.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
    rotateBoneWorld(leg.thigh, _q);
    // Shin: hinge so the ankle lands on the reachable target.
    leg.shin.getWorldPosition(_b); leg.foot.getWorldPosition(_c);
    _q2.setFromUnitVectors(_w1.copy(_c).sub(_b).normalize(), _v.copy(_t).sub(_b).normalize());
    rotateBoneWorld(leg.shin, _q2);
    setBoneWorldQuat(leg.foot, leg.targetQuat);
    // Measured knee side after the solve (1 = exactly on the rest bend side, <0 = flipped).
    leg.thigh.getWorldPosition(_a); leg.shin.getWorldPosition(_b); leg.foot.getWorldPosition(_c);
    _u1.copy(_c).sub(_a).normalize();
    _w1.copy(_b).sub(_a); _w1.addScaledVector(_u1, -_w1.dot(_u1));
    _pole.copy(leg.pole).applyQuaternion(this.scene.getWorldQuaternion(_sceneQ)).addScaledVector(_u1, -_pole.dot(_u1));
    leg.kneeDot = _w1.length() > 1e-4 && _pole.length() > 1e-6 ? _w1.normalize().dot(_pole.normalize()) : 1;
    leg.minKneeDot = Math.min(leg.minKneeDot, leg.kneeDot);
    leg.ik.thigh.copy(leg.thigh.quaternion); leg.ik.shin.copy(leg.shin.quaternion); leg.ik.foot.copy(leg.foot.quaternion);
  }

  debug() {
    const leg = (l: Leg) => ({
      planted: l.planted.toArray().map(v => +v.toFixed(4)), target: l.target.toArray().map(v => +v.toFixed(4)),
      stepping: !!l.step, queued: l.queued, stepped: l.stepped, weight: +l.w.toFixed(3), hold: l.hold,
      step: l.step && { t: +l.step.t.toFixed(3), duration: +l.step.duration.toFixed(3), lift: l.step.lift, distance: +l.step.distance.toFixed(4), peakAboveChord: +l.step.peakAboveChord.toFixed(4) },
      reachError: +l.reachError.toFixed(5), maxReachError: +l.maxReachError.toFixed(5), lockedDrift: +l.lockedDrift.toFixed(5),
      boneLengthError: +l.boneLengthError.toExponential(2), kneeDot: +l.kneeDot.toFixed(3), minKneeDot: +l.minKneeDot.toFixed(3),
      upper: +l.upper.toFixed(4), lower: +l.lower.toFixed(4), poleSource: l.poleSource,
    });
    return { state: this.state, weight: +this.weight.toFixed(3), elapsed: +this.elapsed.toFixed(3), exitReason: this.exitReason,
      yawFollowed: +this.yawFollowed.toFixed(4),
      pelvisDrop: +this.drop.toFixed(4), pelvisDropLimit: this.tuning.maxPelvisDrop, queue: [...this.queue], anchorShift: +this.shift().toFixed(4),
      releaseResidual: { left: +this.releaseResidual.left.toFixed(4), right: +this.releaseResidual.right.toFixed(4) },
      stopsStarted: this.stopsStarted, left: leg(this.legs.left), right: leg(this.legs.right), events: [...this.events] };
  }

  dispose() { this.cancel('dispose'); }
}
