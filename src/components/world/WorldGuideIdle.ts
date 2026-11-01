import { Quaternion, Vector3, type Bone, type Object3D } from 'three';

export type IdleGesture = 'look-left' | 'settle' | 'look-right' | 'stretch' | 'measured';
const SEQUENCE: IdleGesture[] = ['look-left', 'settle', 'measured', 'look-right', 'stretch'];
const RESTS = [6.2, 8.7, 7.4, 10.1, 8.2];
const DURATIONS: Record<IdleGesture, number> = { 'look-left': 3.1, 'look-right': 2.8, settle: 3.7, stretch: 3.5, measured: 2.5 };

/** Authored upper-body accents, deliberately independent of gait, feet and the mine action clock.
 * The sequence is deterministic, never repeats a gesture consecutively, and resets on any action. */
export class GuideIdleLayer {
  gesture: IdleGesture | null = null;
  elapsed = 0;
  waiting = 0;
  private index = 0;
  private next = RESTS[0];
  private entries: { bone: Bone; base: Quaternion; yaw: Vector3; pitch: Vector3; roll: Vector3; applied: boolean }[] = [];
  private q = new Quaternion();
  private measuredDuration: number;
  constructor(scene: Object3D, measuredDuration = 2.5) {
    this.measuredDuration = measuredDuration;
    scene.updateWorldMatrix(true, true);
    const sceneQ = scene.getWorldQuaternion(new Quaternion());
    scene.traverse(o => {
      if (!(o as Bone).isBone || !/^(head|chest|spine|upperarm[._]?[LR])$/.test(o.name)) return;
      const inverse = o.getWorldQuaternion(new Quaternion()).invert();
      const axis = (x: number, y: number, z: number) => new Vector3(x,y,z).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize();
      this.entries.push({ bone:o as Bone, base:new Quaternion(), yaw:axis(0,1,0), pitch:axis(0,0,1), roll:axis(1,0,0), applied:false });
    });
  }
  restore() {
    for (const e of this.entries) if (e.applied) { e.bone.quaternion.copy(e.base); e.applied = false; }
  }
  reset() { this.gesture = null; this.elapsed = 0; this.waiting = 0; }
  advance(dt: number, eligible: boolean) {
    if (!eligible) { this.reset(); return null; }
    if (this.gesture) {
      this.elapsed += dt;
      const duration = this.gesture === 'measured' ? this.measuredDuration : DURATIONS[this.gesture];
      if (this.elapsed >= duration) { this.gesture = null; this.elapsed = 0; this.waiting = 0; }
    } else {
      this.waiting += dt;
      if (this.waiting >= this.next) {
        this.gesture = SEQUENCE[this.index % SEQUENCE.length];
        this.index++; this.next = RESTS[this.index % RESTS.length]; this.elapsed = 0;
      }
    }
    return this.gesture;
  }
  apply() {
    const kind = this.gesture;
    if (!kind || kind === 'measured') return;
    const u = Math.min(1, this.elapsed / DURATIONS[kind]);
    // Smooth zero endpoints make interruption bounded; no pelvis/leg translation or rotation.
    const envelope = Math.sin(Math.PI * u) ** 2;
    for (const e of this.entries) {
      const head = e.bone.name === 'head', chest = e.bone.name === 'chest', spine = e.bone.name === 'spine';
      let yaw = 0, pitch = 0, roll = 0;
      if (kind.startsWith('look')) yaw = (kind === 'look-left' ? 1 : -1) * envelope * (head ? .38 : chest ? .075 : 0);
      if (kind === 'settle') pitch = envelope * (head ? -.07 : chest ? .045 : spine ? -.025 : 0);
      if (kind === 'stretch') {
        pitch = envelope * (chest ? -.07 : spine ? -.025 : head ? .05 : 0);
        if (/upperarm/.test(e.bone.name)) roll = envelope * (/L$/.test(e.bone.name) ? -.16 : .16);
      }
      if (!yaw && !pitch && !roll) continue;
      e.base.copy(e.bone.quaternion); e.applied = true;
      e.bone.quaternion.multiply(this.q.setFromAxisAngle(e.yaw, yaw))
        .multiply(this.q.setFromAxisAngle(e.pitch, pitch)).multiply(this.q.setFromAxisAngle(e.roll, roll));
    }
  }
}
