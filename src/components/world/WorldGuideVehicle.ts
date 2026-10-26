import { Quaternion, Vector3, type Bone, type Object3D } from 'three';

export const GUIDE_VEHICLE_TRANSITION_S = 3.4;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** The same reversible clock drives the door and guide. Open before crossing the sill,
 * hold through the transfer, then close only after the seated contact is established. */
export function guideVehicleSample(phase: 'enter' | 'exit', t: number) {
  const q = phase === 'enter' ? clamp(t) : 1 - clamp(t);
  const approach = smooth(q / .30), turn = smooth((q - .30) / .22);
  const sit = clamp((q - .52) / .28), transfer = smooth((q - .68) / .22);
  const doorOpen = smooth((q - .30) / .20) * (1 - smooth((q - .90) / .10));
  const stage = q < .30 ? 'approach' : q < .52 ? 'turn' : q < .68 ? 'flex' : q < .90 ? 'transfer' : 'seated';
  const duck = Math.sin(Math.PI * clamp((q - .48) / .42)) ** 2;
  return { q, approach, turn, sit, transfer, opacity: 1, stage, duck, doorOpen };
}

export function guideVehicleProgress(phase: 'enter'|'exit', elapsed: number, approachSeconds = GUIDE_VEHICLE_TRANSITION_S * .3) {
  return clamp(phase === 'enter' ? (elapsed < approachSeconds ? .3 * elapsed / approachSeconds : .3 + (elapsed - approachSeconds) / GUIDE_VEHICLE_TRANSITION_S) : elapsed / GUIDE_VEHICLE_TRANSITION_S);
}

/** Arc-length sampling keeps a collision-checked approach polyline intact. Interpolating only its
 * first/last points would cut the car's rear corner even when Actors supplied safe waypoints. */
export function guideVehicleApproach(base: Vector3, door: readonly number[], waypoints: readonly (readonly number[])[] | undefined, progress: number, out: Vector3) {
  const points = [base.toArray(), ...(waypoints ?? []), door];
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]);
  let remaining = clamp(progress) * length, dx = 1, dz = 0;
  out.copy(base);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], n = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (n < 1e-8) continue;
    dx = (b[0] - a[0]) / n; dz = (b[2] - a[2]) / n;
    if (remaining <= n + 1e-8 || i === points.length - 1) {
      const w = clamp(remaining / n); out.set(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w); break;
    }
    remaining -= n;
  }
  return { length, dx, dz };
}

export function guideVehicleRoot(base: Vector3, door: readonly number[], cabin: readonly number[] | undefined, cabinYaw: number, contact: Vector3, sample: ReturnType<typeof guideVehicleSample>, out: Vector3, waypoints?: readonly (readonly number[])[]) {
  guideVehicleApproach(base, door, waypoints, sample.approach, out);
  if (cabin) {
    const c = Math.cos(cabinYaw), s = Math.sin(cabinYaw);
    out.x += (cabin[0] - contact.x * c - contact.z * s - door[0]) * sample.transfer;
    out.y += (cabin[1] - contact.y - door[1]) * sample.transfer;
    out.z += (cabin[2] + contact.x * s - contact.z * c - door[2]) * sample.transfer;
  }
  return out;
}

/** Authored canopy duck, not a new mocap take. Removed before the next mixer update and on hide. */
export class GuideVehicleUpperBody {
  private entries: { bone: Bone; base: Quaternion; axis: Vector3; applied: boolean }[] = [];
  private q = new Quaternion();
  constructor(scene: Object3D) {
    scene.updateWorldMatrix(true, true); const sceneQ = scene.getWorldQuaternion(new Quaternion());
    scene.traverse(o => {
      if (!(o as Bone).isBone || !/^(spine|chest|head)$/.test(o.name)) return;
      const inverse = o.getWorldQuaternion(new Quaternion()).invert();
      this.entries.push({ bone: o as Bone, base: new Quaternion(), axis: new Vector3(0, 0, 1).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize(), applied: false });
    });
  }
  restore() { for (const e of this.entries) if (e.applied) { e.bone.quaternion.copy(e.base); e.applied = false; } }
  apply(weight: number) {
    for (const e of this.entries) {
      e.base.copy(e.bone.quaternion); e.applied = true;
      e.bone.quaternion.multiply(this.q.setFromAxisAngle(e.axis, weight * (e.bone.name === 'head' ? -.06 : e.bone.name === 'chest' ? .12 : .08)));
    }
  }
}

/** Adapt the measured seated pose to a cabin's footwell. Rotations happen in the guide's
 * sagittal plane, independent of the source rig's different left/right bone axes. */
export class GuideDrivingPose {
  private entries: {bone: Bone; base: Quaternion; applied: boolean}[] = [];
  private axis = new Vector3(); private frame = new Quaternion(); private rotation = new Quaternion();
  private scene: Object3D;
  constructor(scene: Object3D) {
    this.scene=scene;
    scene.traverse(o => { if ((o as Bone).isBone && /^(spine|chest|head|thigh[LR]|shin[LR]|foot[LR])$/.test(o.name))
      this.entries.push({bone:o as Bone,base:new Quaternion(),applied:false}); });
  }
  restore() { for(const e of this.entries)if(e.applied){e.bone.quaternion.copy(e.base);e.applied=false;} }
  apply(id: 'offroad'|'coupe'|'van', weight: number) {
    if(weight<=0)return;
    this.scene.updateWorldMatrix(true,true);
    for(const e of this.entries){
      const name=e.bone.name,low=id==='coupe',legs=low||id==='van';
      const angle=name.startsWith('thigh')?(legs?.35:.20):name.startsWith('shin')?(legs?.2:.18):name.startsWith('foot')?(legs?-.55:-.38):
        name==='head'?.04:name==='spine'||name==='chest'?(low?-.11:-.035):0;
      e.base.copy(e.bone.quaternion);e.applied=true;
      this.scene.getWorldQuaternion(this.frame);this.axis.set(0,0,1).applyQuaternion(this.frame);
      e.bone.parent!.getWorldQuaternion(this.frame).invert();this.axis.applyQuaternion(this.frame);
      e.bone.quaternion.premultiply(this.rotation.setFromAxisAngle(this.axis,angle*weight));
      e.bone.updateWorldMatrix(false,true);
    }
  }
}
