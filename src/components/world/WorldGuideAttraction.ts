import { Quaternion, Vector3, type Bone, type Object3D } from 'three';
import type { GuideSeatContact } from './WorldGuideSeat.ts';
import { skinnedWorldPoint, type GuideSlopeFit } from './WorldGuideStop.ts';
import { rideGround, type RideActorFrame } from './rides/ride-contract';

/** Solve from this frame's actual skinned buttock patch, including train pitch and roll.
 * Converting the final world target through the parent also removes Rapier interpolation lag. */
export function settleGuideAttraction(group: Object3D, contact: GuideSeatContact, frame?: RideActorFrame | null) {
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

/** Adapt the current gait and the guide's measured boot soles to the six treads. This is a local IK
 * adaptation, not a new motion capture take. Restore every modified bone before the next mixer. */
export class GuideAttractionFeet {
  private saved = new Map<Bone, Quaternion>();
  private shifts = new Map<Bone, number>();
  private translated: { node: Object3D; position: Vector3 } | null = null;
  private walkDrop: number | null = null;
  private evidence:{drop:number;held:boolean;budget:number;pelvisWorldY:number|null}={drop:0,held:false,budget:0,pelvisWorldY:null};
  debug(){return {...this.evidence};}
  restore() {
    for (const [bone, rotation] of this.saved) bone.quaternion.copy(rotation);
    this.saved.clear();
    if(this.translated){this.translated.node.position.copy(this.translated.position);this.translated=null;}
  }
  apply(slope: GuideSlopeFit, frame: RideActorFrame | null | undefined, dt: number) {
    const groundAt=rideGround(frame?.groundId);
    if (!frame?.stairs || !groundAt) { this.shifts.clear(); this.walkDrop=null;this.evidence={drop:0,held:false,budget:0,pelvisWorldY:null}; return; }
    const direction = new Vector3(Math.cos(frame.yaw), 0, -Math.sin(frame.yaw));
    let drop=0;
    if(frame.footLowering){
      let wanted=0;
      for(const leg of Object.values(slope.legs)){
        const points=leg.sole.map(p=>skinnedWorldPoint(p.mesh,p.index,new Vector3()));
        if(Math.min(...points.map(p=>p.y))-frame.root[1]>.03)continue;
        let required=-Infinity;
        for(const p of points){const y=groundAt(p.x,p.z);if(y!==null)required=Math.max(required,y+.003-p.y);}
        if(Number.isFinite(required))wanted=Math.max(wanted,-required);
      }
      wanted=Math.min(frame.footLowering,Math.max(0,wanted));
      if(frame.footContactHold&&this.walkDrop!==null)wanted=this.walkDrop;
      this.walkDrop=this.walkDrop===null?wanted:this.walkDrop+(wanted-this.walkDrop)*(1-Math.exp(-dt/.045));drop=this.walkDrop;
      if(drop>0){const node=slope.pelvis,parent=node.parent!;this.translated={node,position:node.position.clone()};const p=node.getWorldPosition(new Vector3());p.y-=drop;node.position.copy(parent.worldToLocal(p));node.updateWorldMatrix(true,true);}
    }else this.walkDrop=null;
    this.evidence={drop,held:!!frame.footContactHold,budget:frame.footLowering??0,pelvisWorldY:slope.pelvis.getWorldPosition(new Vector3()).y};
    for (const leg of Object.values(slope.legs)) {
      const { thigh, shin, foot } = leg;
      const ankle = foot.getWorldPosition(new Vector3());
      let low = Infinity;
      const points = leg.sole.map(p => skinnedWorldPoint(p.mesh, p.index, new Vector3()));
      for (const p of points) low = Math.min(low, p.y);
      // A boot can straddle two treads while its ankle is over the lower one.
      // Sample the whole rigid sole so the toe/heel cannot cut through a riser.
      let ground = groundAt(ankle.x, ankle.z), requiredLift = frame.footLowering ? -Infinity : 0;
      for (const p of points) {
        const support = groundAt(p.x, p.z);
        if (support !== null) {
          ground = Math.max(ground ?? support, support);
          requiredLift = Math.max(requiredLift, support + .003 - p.y);
        }
      }
      if (ground === null || !Number.isFinite(low)) continue;
      const clearance = Math.max(0, low - (frame.root[1]-drop));
      // Anticipate the next riser only while the recorded boot is swinging.
      const ahead = groundAt(ankle.x + direction.x * .18, ankle.z + direction.z * .18) ?? ground;
      const swing = Math.min(1, clearance / .055);
      const targetGround = ground + Math.max(0, ahead - ground) * swing;
      const wanted = Math.max(-.28, Math.min(.28, targetGround + clearance + .003 - low));
      const before = this.shifts.get(foot) ?? wanted;
      // Smooth the release, but never smooth through a newly contacted tread.
      const shift = Math.max(Number.isFinite(requiredLift) ? requiredLift : -.28, before + (wanted - before) * (1 - Math.exp(-dt / .045)));
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
