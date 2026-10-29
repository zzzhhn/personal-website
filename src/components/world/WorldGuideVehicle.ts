import { AnimationMixer, LoopOnce, Quaternion, SkinnedMesh, Vector3, type AnimationClip, type Bone, type Object3D } from 'three';
import { skinnedWorldPoint } from './WorldGuideStop';
import { VEHICLE_DOORS, VEHICLE_PASSAGE, VEHICLE_SEAT_ADJUSTMENT, vehicleDoorContact, vehicleDoorCloseContact, type DoorSide } from './WorldVehicleDoors';
import type { VehicleId } from './types';

export const GUIDE_VEHICLE_TRANSITION_S = 5.2;
export interface GuideVehicleFrame { position: [number, number, number]; rotation: [number, number, number, number]; id: VehicleId; side: DoorSide; groundY?:number }
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** The same reversible clock drives the door and guide. Open before crossing the sill,
 * hold through the transfer, then close only after the seated contact is established. */
export function guideVehicleSample(phase: 'enter' | 'exit', t: number) {
  const q = phase === 'enter' ? clamp(t) : 1 - clamp(t);
  const approach = smooth(q / .30), turn = smooth((q - .28) / .08);
  const reach = smooth((q - .30) / .06), open = smooth((q - .36) / .13);
  const align = smooth((q - .49) / .045), threshold = smooth((q - .57) / .06), leadStep = smooth((q - .63) / .05);
  const transfer = smooth((q - .68) / .12), sit = smooth((q - .80) / .12);
  const doorOpen = open * (1 - smooth((q - .92) / .08));
  const stage = q < .30 ? 'approach' : q < .36 ? 'reach' : q < .49 ? 'open' : q < .58 ? 'threshold' : q < .68 ? 'step' : q < .80 ? 'cross' : q < .92 ? 'settle' : 'seated';
  const duck = smooth((q - .535) / .035) * (1 - smooth((q - .86) / .06));
  return { q, approach, turn, reach, open, align, threshold, leadStep, sit, transfer, opacity: 1, stage, duck, doorOpen };
}

export function guideVehicleProgress(phase: 'enter'|'exit', elapsed: number, approachSeconds = GUIDE_VEHICLE_TRANSITION_S * .3) {
  return clamp(phase === 'enter' ? (elapsed < approachSeconds ? .3 * elapsed / approachSeconds : .3 + (elapsed - approachSeconds) / GUIDE_VEHICLE_TRANSITION_S) : elapsed / GUIDE_VEHICLE_TRANSITION_S);
}

/** Establish actual cushion contact early in the source sit, after crossing the sill. */
export function guideVehicleSeatBlend(id:VehicleId,sample:ReturnType<typeof guideVehicleSample>) {
  return id==='coupe'?sample.sit:smooth(sample.sit);
}
export function guideVehicleDrivingBlend(id:VehicleId,sample:ReturnType<typeof guideVehicleSample>) {
  return id==='coupe'?sample.sit:smooth(sample.sit/.45);
}

/** Vehicle-only blend between the existing standing and held seated source poses.
 * The ordinary chair SitDown take bows deeply forward midway, outside a car's
 * windshield. Retain its endpoints with a controlled reversible sit instead. */
export class GuideVehicleSitPose {
  private bones:{bone:Bone;standP:Vector3;standQ:Quaternion;seatP:Vector3;seatQ:Quaternion;beforeP:Vector3;beforeQ:Quaternion}[]=[];
  private applied=false;
  constructor(private scene:Object3D,clips:readonly AnimationClip[]){
    const idle=clips.find(c=>c.name==='Idle'),seat=clips.find(c=>c.name==='SitIdle');if(!idle||!seat)return;
    scene.traverse(o=>{if((o as Bone).isBone)this.bones.push({bone:o as Bone,standP:new Vector3(),standQ:new Quaternion(),seatP:new Vector3(),seatQ:new Quaternion(),beforeP:o.position.clone(),beforeQ:o.quaternion.clone()});});
    const mixer=new AnimationMixer(scene);
    mixer.clipAction(idle).play();mixer.update(0);for(const e of this.bones){e.standP.copy(e.bone.position);e.standQ.copy(e.bone.quaternion);}
    mixer.stopAllAction();const held=mixer.clipAction(seat).setLoop(LoopOnce,1);held.clampWhenFinished=true;held.play();mixer.update(seat.duration);for(const e of this.bones){e.seatP.copy(e.bone.position);e.seatQ.copy(e.bone.quaternion);}
    mixer.stopAllAction();mixer.uncacheRoot(scene);for(const e of this.bones){e.bone.position.copy(e.beforeP);e.bone.quaternion.copy(e.beforeQ);}scene.updateWorldMatrix(true,true);
  }
  restore(){if(!this.applied)return;for(const e of this.bones){e.bone.position.copy(e.beforeP);e.bone.quaternion.copy(e.beforeQ);}this.applied=false;}
  apply(id:VehicleId,sample:ReturnType<typeof guideVehicleSample>){
    const weight=sample.sit;if(id==='coupe'||weight<=0)return;
    for(const e of this.bones){e.beforeP.copy(e.bone.position);e.beforeQ.copy(e.bone.quaternion);e.bone.position.lerpVectors(e.standP,e.seatP,weight);e.bone.quaternion.slerpQuaternions(e.standQ,e.seatQ,weight);}
    this.applied=true;this.scene.updateWorldMatrix(true,true);
  }
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

export function guideVehicleRoot(base: Vector3, door: readonly number[], cabin: readonly number[] | undefined, cabinYaw: number, contact: Vector3, sample: ReturnType<typeof guideVehicleSample>, out: Vector3, waypoints?: readonly (readonly number[])[], frame?: GuideVehicleFrame) {
  guideVehicleApproach(base, door, waypoints, sample.approach, out);
  if (frame && sample.q >= .30 && cabin) {
    const spec = VEHICLE_DOORS[frame.id], floor = VEHICLE_PASSAGE[frame.id].floor;
    const q = new Quaternion().fromArray(frame.rotation), origin = new Vector3(...frame.position);
    const point = (p: Vector3) => p.applyQuaternion(q).add(origin);
    const handle = point(vehicleDoorContact(frame.id,frame.side,sample.doorOpen,false,new Vector3()).add(new Vector3(-.20,0,frame.side*.35)));
    handle.y = door[1];
    // Doorway stance is measured in the standing frame. A seated posterior offset (~46 cm)
    // must not move a standing entrant toward the dashboard before the sit actually starts.
    const threshold = point(new Vector3(spec.standingX, floor, frame.side * (spec.hinge[2] + .24)));
    threshold.y=door[1];
    // High-door entrants keep a sideways stance until the body has crossed;
    // the coupe retains its measured 10 cm windshield setback.
    const inside = point(new Vector3(spec.seat[0]-(frame.id==='van'?.19:frame.id==='offroad'?0:.10), floor, frame.side * spec.seat[2]));
    // Reach the handle while standing and follow its outward sweep, then approach the open sill.
    out.fromArray(door).lerp(handle, sample.reach);
    const aligned=point(new Vector3(spec.standingX,0,frame.side*(spec.hinge[2]+.90)));aligned.y=door[1];
    out.lerp(aligned,sample.align);
    out.lerp(threshold, sample.threshold);
    if(frame.id!=='coupe'){
      const rise=smooth(sample.transfer/.38),startY=out.y;
      out.lerp(inside,sample.transfer);out.y=startY+(inside.y-startY)*rise;
    }else out.lerp(inside,sample.transfer);
    // Root remains on the actual exterior ground until weight transfers onto the cabin floor.
    // Ducking belongs to pelvis/limb pose, never a negative translation of the whole character.
    const seated = new Vector3(...cabin).sub(contact.clone().applyQuaternion(q));
    out.lerp(seated, guideVehicleSeatBlend(frame.id,sample));
    if(frame.id==='van')out.add(new Vector3(.043*smooth((sample.sit-.30)/.10)*(1-smooth((sample.sit-.70)/.30)),0,0).applyQuaternion(q));
    if(frame.id!=='coupe'){
      // Perch on the forward/outboard seat edge to take the ordinary door's inner pull,
      // then settle back into the bucket centre. This remains entirely inside the cabin.
      const reach=smooth((sample.q-.92)/.025)*(1-smooth((sample.q-.98)/.02));
      out.add(new Vector3(.22,0,frame.side*.18).applyQuaternion(q).multiplyScalar(reach));
    }
    return out;
  }
  if (cabin) {
    const c = Math.cos(cabinYaw), s = Math.sin(cabinYaw);
    out.x += (cabin[0] - contact.x * c - contact.z * s - door[0]) * sample.transfer;
    out.y += (cabin[1] - contact.y - door[1]) * sample.transfer;
    out.z += (cabin[2] + contact.x * s - contact.z * c - door[2]) * sample.transfer;
  }
  return out;
}

export function guideVehicleCrouchDepth(id:VehicleId,sample:ReturnType<typeof guideVehicleSample>) {
  return id==='coupe'?.22*(1-sample.sit)
    :(id==='van'?.035+.465*smooth(sample.transfer/.6):.04+.45*smooth(sample.transfer/.6))*(1-smooth((sample.sit-.80)/.20));
}

/** The low coupe needs its canopy duck before crossing. Ordinary high doors allow
 * an upright step from the ground; flex only as weight rises onto the cabin floor. */
export function guideVehicleBendScale(id:VehicleId,sample:ReturnType<typeof guideVehicleSample>) {
  return id==='coupe'?1.3:(.12+(id==='van'?1.33:1.23)*smooth(sample.transfer/.35))*(1-sample.sit);
}

/** Full rigid-body orientation, including pitch/roll, after the body has crossed the door. */
export function guideVehicleOrientation(frame: GuideVehicleFrame, sample: ReturnType<typeof guideVehicleSample>, approachYaw: number, out: Quaternion) {
  const body = new Quaternion().fromArray(frame.rotation);
  const inward = body.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0), frame.side * Math.PI / 2));
  out.setFromAxisAngle(new Vector3(0,1,0), approachYaw).slerp(inward, sample.turn);
  // High-door entrants cross sideways first; turning the crouched helmet toward
  // the windshield before seating sweeps it straight into the sloping A-pillar.
  return out.slerp(body, frame.id==='coupe'?sample.transfer:frame.id==='offroad'?smooth(sample.sit/.4):smooth((sample.sit-.15)/.6));
}

/** Authored canopy duck, not a new mocap take. Removed before the next mixer update and on hide. */
export class GuideVehicleUpperBody {
  private entries: { bone: Bone; base: Quaternion; position:Vector3; axis: Vector3; sideAxis:Vector3; applied: boolean }[] = [];
  private q = new Quaternion();
  constructor(private scene: Object3D) {
    scene.updateWorldMatrix(true, true); const sceneQ = scene.getWorldQuaternion(new Quaternion());
    scene.traverse(o => {
      if (!(o as Bone).isBone || !/^(pelvis|spine|chest|head)$/.test(o.name)) return;
      const inverse = o.getWorldQuaternion(new Quaternion()).invert();
      this.entries.push({ bone: o as Bone, base: new Quaternion(), position:new Vector3(), axis: new Vector3(0, 0, 1).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize(), sideAxis:new Vector3(1,0,0).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize(), applied: false });
    });
  }
  restore() { for (const e of this.entries) if (e.applied) { e.bone.quaternion.copy(e.base); if(e.bone.name==='pelvis')e.bone.position.copy(e.position);e.applied = false; } }
  applyEntry(id:VehicleId,sample:ReturnType<typeof guideVehicleSample>,doorReach=0,side:DoorSide=1) {
    let bend=guideVehicleBendScale(id,sample);
    if(id!=='coupe'&&sample.duck>.001){
      // SitDown already bends the torso. Cap the combined source + overlay, rather
      // than adding a second full canopy fold on top of the measured source pose.
      this.scene.updateWorldMatrix(true,true);
      const head=this.scene.getObjectByName('head'),chest=this.scene.getObjectByName('chest');
      if(head&&chest){
        const axis=head.getWorldPosition(new Vector3()).sub(chest.getWorldPosition(new Vector3())).normalize();
        const frame=this.scene.getWorldQuaternion(new Quaternion());
        const pitch=Math.atan2(axis.dot(new Vector3(1,0,0).applyQuaternion(frame)),axis.dot(new Vector3(0,1,0).applyQuaternion(frame)));
        bend=Math.min(bend,(65*Math.PI/180-pitch)/(.78*sample.duck));
      }
    }
    this.apply(sample.duck,id==='coupe',doorReach,side,guideVehicleCrouchDepth(id,sample),bend);
  }
  apply(weight: number, low=false, doorReach=0, side:DoorSide=1,crouchDepth=0,bendScale=1) {
    this.scene.updateWorldMatrix(true,true);
    for (const e of this.entries) {
      e.base.copy(e.bone.quaternion);e.position.copy(e.bone.position); e.applied = true;
      const head=e.bone.name==='head',pelvis=e.bone.name==='pelvis',pitch=pelvis?0:weight*bendScale*(head?.12:e.bone.name==='chest'?(low?-.60:-.40):(low?-.50:-.38));
      const sceneQ=this.scene.getWorldQuaternion(new Quaternion()),inverse=e.bone.parent!.getWorldQuaternion(new Quaternion()).invert();
      if(pelvis&&weight>0&&crouchDepth>0)e.bone.position.add(new Vector3(0,-crouchDepth*weight,0).applyQuaternion(sceneQ).applyQuaternion(inverse));
      e.axis.set(0,0,1).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize();
      e.sideAxis.set(1,0,0).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize();
      e.bone.quaternion.premultiply(this.q.setFromAxisAngle(e.axis,pitch));
      e.bone.quaternion.premultiply(this.q.setFromAxisAngle(e.sideAxis,(head?-.10:pelvis?0:.50)*side*doorReach));
      e.bone.updateWorldMatrix(false,true);
    }
  }
}

type VehicleLimb = { upper: Bone; lower: Bone; end: Bone; side: DoorSide };
/** Authored contact overlay on existing Idle/Walk/SitDown takes, NOT a vehicle-entry mocap.
 * A leading foot crosses the actual sill before the pelvis; hands follow the moving door.
 * Two-bone solves retain limb lengths and are restored before every mixer update. */
export class GuideVehicleContacts {
  private saved = new Map<Bone, Quaternion>();
  private arms: VehicleLimb[] = []; private legs: VehicleLimb[] = [];
  private applied = false;
  private soles = new Map<Bone,{mesh:SkinnedMesh;index:number}[]>();
  private solePoint=new Vector3();
  readonly errors = { hand: 0, leadFoot: 0, trailFoot: 0, posterior:0 };
  constructor(private scene: Object3D) {
    const bones = new Map<string, Bone>();
    scene.traverse(o => { if ((o as Bone).isBone) bones.set(o.name.replace(/[._]/g, ''), o as Bone); });
    for (const [side, tag] of [[-1,'L'],[1,'R']] as const) for (const [out,names] of [[this.arms,['upperarm','forearm','hand']],[this.legs,['thigh','shin','foot']]] as const) {
      const [upper,lower,end] = names.map(n => bones.get(n+tag));
      if (upper && lower && end) { out.push({upper,lower,end,side}); for (const b of [upper,lower,end]) this.saved.set(b,b.quaternion.clone()); }
    }
    scene.traverse(mesh=>{
      if(!(mesh instanceof SkinnedMesh))return;
      const ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
      if(!ids||!weights)return;
      for(let index=0;index<ids.count;index++)for(const leg of this.legs){
        let w=0;for(let k=0;k<4;k++)if(mesh.skeleton.bones[ids.getComponent(index,k)]===leg.end)w+=weights.getComponent(index,k);
        if(w>.98){const list=this.soles.get(leg.end)??[];list.push({mesh,index});this.soles.set(leg.end,list);}
      }
    });
  }
  restore() {
    if (!this.applied) return;
    for (const [bone,q] of this.saved) bone.quaternion.copy(q);
    this.scene.updateWorldMatrix(true,true); this.applied=false;
  }
  private rotate(bone: Bone, from: Vector3, to: Vector3) {
    const q = bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()));
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(q)); bone.updateWorldMatrix(true,true);
  }
  private solve(limb: VehicleLimb, target: Vector3, pole: Vector3, weight: number) {
    const {upper,lower,end}=limb, before=[upper,lower,end].map(b=>b.quaternion.clone());
    const a=upper.getWorldPosition(new Vector3()),b=lower.getWorldPosition(new Vector3()),c=end.getWorldPosition(new Vector3());
    const rotation=end.getWorldQuaternion(new Quaternion()),l1=a.distanceTo(b),l2=b.distanceTo(c);
    const direction=target.clone().sub(a),d=Math.min(l1+l2-.002,Math.max(Math.abs(l1-l2)+.002,direction.length()));direction.normalize();
    pole.sub(a).addScaledVector(direction,-pole.dot(direction));
    if(pole.lengthSq()<1e-8)pole.copy(b).sub(a).addScaledVector(direction,-b.clone().sub(a).dot(direction));
    pole.normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),joint=a.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
    this.rotate(upper,b.clone().sub(a),joint.clone().sub(a));
    const next=lower.getWorldPosition(new Vector3());
    this.rotate(lower,end.getWorldPosition(new Vector3()).sub(next),a.clone().addScaledVector(direction,d).sub(next));
    end.quaternion.copy(end.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
    [upper,lower,end].forEach((bone,i)=>bone.quaternion.slerpQuaternions(before[i],bone.quaternion.clone(),weight));
    this.scene.updateWorldMatrix(true,true);return end.getWorldPosition(new Vector3()).distanceTo(target);
  }
  apply(frame: GuideVehicleFrame | undefined, sample: ReturnType<typeof guideVehicleSample> | null) {
    Object.assign(this.errors,{hand:0,leadFoot:0,trailFoot:0,posterior:0});
    if(!frame||!sample||sample.q<.30||(sample.q>=1&&frame.id==='coupe'))return;
    for(const [bone,q] of this.saved)q.copy(bone.quaternion);this.applied=true;this.scene.updateWorldMatrix(true,true);
    const rotation=new Quaternion().fromArray(frame.rotation),origin=new Vector3(...frame.position),spec=VEHICLE_DOORS[frame.id],passage=VEHICLE_PASSAGE[frame.id];
    const world=(p:Vector3)=>p.applyQuaternion(rotation).add(origin);
    const close=sample.q>=.92;
    const handWeight=close?smooth((sample.q-.92)/.025)*(1-smooth((sample.q-.98)/.02)):smooth((sample.q-.32)/.04)*(1-smooth((sample.q-.49)/.05));
    const hand=this.arms.find(l=>l.side===frame.side);
    if(hand&&handWeight>0){
      const target=world(close?vehicleDoorCloseContact(frame.id,frame.side,sample.doorOpen,new Vector3()):vehicleDoorContact(frame.id,frame.side,sample.doorOpen,false,new Vector3()));
      const pole=world(new Vector3(spec.seat[0]-.1,spec.hinge[1]-.25,frame.side*(spec.hinge[2]+.65)));
      this.errors.hand=this.solve(hand,target,pole,handWeight);
    }
    const footWeight=sample.q<.49?0:frame.id==='coupe'?1-smooth((sample.q-.80)/.10):1;
    if(footWeight<=0)return;
    for(const leg of this.legs){
      const lead=leg.side===-frame.side;
      const up=new Vector3(0,1,0).applyQuaternion(rotation),ankle=leg.end.getWorldPosition(new Vector3());
      let minSole=Infinity;for(const {mesh,index}of this.soles.get(leg.end)??[])minSole=Math.min(minSole,skinnedWorldPoint(mesh,index,this.solePoint).dot(up));
      const soleLift=Number.isFinite(minSole)?ankle.dot(up)-minSole:.055;
      const start=new Vector3(spec.standingX+leg.side*frame.side*.10,(frame.groundY??frame.position[1])-frame.position[1]+.055,frame.side*(spec.hinge[2]+.25));
      const inside=new Vector3(spec.standingX+leg.side*frame.side*.10,passage.floor+.055,frame.side*(spec.hinge[2]-.07));
      const final=new Vector3(spec.seat[0]+(frame.id==='coupe'?.15:frame.id==='van'?.285:.30),passage.floor+.055,frame.side*spec.seat[2]+leg.side*.10);
      const step=lead?sample.leadStep:frame.id==='coupe'?sample.transfer:smooth((sample.q-.67)/.065);
      // A high sill needs lift before horizontal crossing, rather than dragging the
      // toe diagonally through its solid front. Keep the already verified low coupe arc.
      const across=frame.id==='coupe'?step:smooth((step-.25)/.75);
      const lift=frame.id==='coupe'?step:smooth(step/.45);
      const target=start.clone().lerp(inside,across);
      target.y=start.y+(inside.y-start.y)*lift+Math.sin(Math.PI*step)*(passage.sill-passage.floor+.18);
      target.lerp(final,lead?sample.transfer:smooth((sample.transfer-.5)/.5));
      target.y+=soleLift-.055;
      if(sample.q<.63){
        // Keep the actual source gait X/Z and swing clearance while the pelvis crouches.
        // A fixed door-foot target here drags the approaching boots through the ground.
        target.copy(ankle).sub(origin).applyQuaternion(rotation.clone().invert());
        target.y=Math.max(target.y+guideVehicleCrouchDepth(frame.id,sample)*sample.duck,(frame.groundY??frame.position[1])-frame.position[1]+soleLift);
      }
      const turn=frame.id==='coupe'?sample.transfer:frame.id==='offroad'?smooth(sample.sit/.4):smooth((sample.sit-.15)/.6),yaw=frame.side*Math.PI/2*(1-turn);
      const pole=world(frame.id==='coupe'?new Vector3(spec.seat[0]+.95,passage.floor+.35,frame.side*spec.hinge[2]):new Vector3(spec.standingX+.95*Math.cos(yaw),passage.floor+.35,frame.side*spec.hinge[2]-.95*Math.sin(yaw)));
      const error=this.solve(leg,world(target),pole,footWeight);
      if(lead)this.errors.leadFoot=error;else this.errors.trailFoot=error;
    }
  }
}

/** Foot IK also deforms the posterior's upper-thigh skin. Resolve the real cushion
 * contact after that solve, then replant feet at their original floor targets. */
export function settleGuideVehicle(root:Object3D,contact:{sample:(out:Vector3)=>Vector3},contacts:GuideVehicleContacts,frame:GuideVehicleFrame|undefined,sample:ReturnType<typeof guideVehicleSample>|null){
  if(!frame||!sample||frame.id==='coupe'||sample.sit<=0)return;
  const spec=VEHICLE_DOORS[frame.id],reach=smooth((sample.q-.92)/.025)*(1-smooth((sample.q-.98)/.02));
  const target=new Vector3(spec.seat[0]+.22*reach,spec.seat[1],frame.side*(spec.seat[2]+.18*reach)).applyQuaternion(new Quaternion().fromArray(frame.rotation)).add(new Vector3(...frame.position));
  const weight=smooth((sample.sit-.70)/.30);
  for(let i=0;i<3;i++){
    const delta=target.clone().sub(contact.sample(new Vector3())).multiplyScalar(weight);
    const position=root.getWorldPosition(new Vector3()).add(delta);
    if(root.parent)root.parent.worldToLocal(position);root.position.copy(position);root.updateWorldMatrix(true,true);
    contacts.restore();contacts.apply(frame,sample);
  }
  contacts.errors.posterior=contact.sample(new Vector3()).distanceTo(target);
}

/** Adapt the measured seated pose to a cabin's footwell. Rotations happen in the guide's
 * sagittal plane, independent of the source rig's different left/right bone axes. */
export class GuideDrivingPose {
  private entries: {bone: Bone; base: Quaternion; applied: boolean}[] = [];
  private axis = new Vector3(); private frame = new Quaternion(); private rotation = new Quaternion();
  private scene: Object3D;
  private neutralHead = new Quaternion();
  private head:Bone|undefined;
  constructor(scene: Object3D) {
    this.scene=scene;
    scene.traverse(o => { if ((o as Bone).isBone && /^(spine|chest|head|thigh[LR]|shin[LR]|foot[LR])$/.test(o.name))
      this.entries.push({bone:o as Bone,base:new Quaternion(),applied:false}); });
    scene.updateWorldMatrix(true,true);this.head=scene.getObjectByName('head') as Bone|undefined;
    if(this.head)this.neutralHead.copy(scene.getWorldQuaternion(new Quaternion()).invert().multiply(this.head.getWorldQuaternion(new Quaternion())));
  }
  restore() { for(const e of this.entries)if(e.applied){e.bone.quaternion.copy(e.base);e.applied=false;} }
  apply(id: 'offroad'|'coupe'|'van', weight: number) {
    if(weight<=0)return;
    this.scene.updateWorldMatrix(true,true);
    const chest=this.scene.getObjectByName('chest'),low=id==='coupe';let seatPitch=0;
    if(!low&&this.head&&chest){
      const axis=this.head.getWorldPosition(new Vector3()).sub(chest.getWorldPosition(new Vector3())).applyQuaternion(this.scene.getWorldQuaternion(new Quaternion()).invert()).normalize();
      seatPitch=(Math.atan2(axis.x,axis.y)+VEHICLE_SEAT_ADJUSTMENT[id].recline)/2;
    }
    for(const e of this.entries){
      const name=e.bone.name,low=id==='coupe',legs=low||id==='van';
      const angle=name.startsWith('thigh')?(legs?.35:.20):name.startsWith('shin')?(legs?.2:.18):name.startsWith('foot')?(legs?-.55:-.38):
        name==='head'?(low?.04:0):name==='spine'||name==='chest'?(low?-.11:seatPitch):0;
      e.base.copy(e.bone.quaternion);e.applied=true;
      this.scene.getWorldQuaternion(this.frame);this.axis.set(0,0,1).applyQuaternion(this.frame);
      e.bone.parent!.getWorldQuaternion(this.frame).invert();this.axis.applyQuaternion(this.frame);
      e.bone.quaternion.premultiply(this.rotation.setFromAxisAngle(this.axis,angle*weight));
      e.bone.updateWorldMatrix(false,true);
    }
    if(!low&&this.head){
      const nod=VEHICLE_SEAT_ADJUSTMENT[id].headNod+(id==='van'?.45*Math.sin(Math.PI*weight):0);
      const world=this.scene.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),nod)).multiply(this.neutralHead);
      const local=this.head.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world);
      this.head.quaternion.slerp(local,weight);this.head.updateWorldMatrix(false,true);
    }
  }
}
