import { Bone, Group, Object3D, Quaternion, Vector3 } from 'three';
import type { IbdInspectionAction, IbdInspectionCarried, IbdInspectionVisualSockets } from './attractions/ibd-inspection-motion.ts';
import { IBD_INSPECTION_CONTACT_TOLERANCE } from './attractions/ibd-inspection-motion.ts';
import type { Vec3 } from './types.ts';

interface Arm { upper: Bone; lower: Bone; hand: Bone; palm: Group; side: number }
const clamp=(v:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const ease=(v:number)=>{const u=clamp(v);return u*u*(3-2*u);};
const tuple=(v:Vector3):Vec3=>[v.x,v.y,v.z];
const Z=new Vector3(0,0,1), PALM=new Vector3(0,.043,0);
const LEFT_REST:Vec3=[.25,.98,-.22], LEFT_CARRY:Vec3=[.42,1.02,-.11], RIGHT_REST:Vec3=[.29,.99,.22];

/** Authored, reversible two-arm IK. The controller supplies every action time; legs and root are untouched. */
export class GuideIbdInspectionLayer {
  readonly scene:Object3D;
  /** Attach the sample to left.palm and the caliper push grip to right.palm using their builder grip inverses. */
  readonly arms:{left:Arm;right:Arm}|null;
  readonly sockets:IbdInspectionVisualSockets={ valid:false,reachable:false,sampledId:null,sampledElapsed:0,
    leftHand:[0,0,0],rightHand:[0,0,0],leftContactError:Infinity,rightContactError:Infinity,contactError:Infinity };
  private saved=new Map<Bone,Quaternion>();
  private applied=false;
  private disposed=false;
  constructor(scene:Object3D) {
    this.scene=scene;
    const bones=new Map<string,Bone>(),key=(name:string)=>name.replace(/[._]/g,'');
    scene.traverse(object=>{if((object as Bone).isBone)bones.set(key(object.name),object as Bone);});
    const arm=(tag:'R'|'L'):Arm|null=>{
      const upper=bones.get(key(`upperarm.${tag}`)),lower=bones.get(key(`forearm.${tag}`)),hand=bones.get(key(`hand.${tag}`));
      if(!upper||!lower||!hand)return null;
      const palm=new Group();palm.name=`ibd-inspection-palm-${tag}`;palm.position.copy(PALM);
      return{upper,lower,hand,palm,side:tag==='R'?1:-1};
    };
    const left=arm('L'),right=arm('R');this.arms=left&&right?{left,right}:null;
    if(this.arms)for(const a of Object.values(this.arms))for(const bone of[a.upper,a.lower,a.hand])this.saved.set(bone,bone.quaternion.clone());
  }
  restore():void {
    if(!this.applied)return;
    for(const[bone,q]of this.saved)bone.quaternion.copy(q);
    this.applied=false;this.scene.updateWorldMatrix(true,true);
  }
  private invalidate():void {
    Object.assign(this.sockets,{valid:false,reachable:false,sampledId:null,sampledElapsed:0,
      leftContactError:Infinity,rightContactError:Infinity,contactError:Infinity});
  }
  private detach():void {if(this.arms)for(const a of Object.values(this.arms))a.palm.removeFromParent();}
  private frame(point:Vec3):Vector3{return this.scene.localToWorld(new Vector3(...point));}
  private rotateWorld(bone:Bone,delta:Quaternion):void {
    const q=bone.getWorldQuaternion(new Quaternion()).premultiply(delta);
    if(bone.parent)q.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    bone.quaternion.copy(q);bone.updateWorldMatrix(true,true);
  }
  private wristGoal(palm:Vector3,q:Quaternion):Vector3 {
    // Include inherited rig scale in the hand-to-palm offset; never change a bone length.
    return palm.clone().sub(PALM.clone().multiply(this.scene.getWorldScale(new Vector3())).applyQuaternion(q));
  }
  private reachable(arm:Arm,palm:Vector3,q:Quaternion):boolean {
    const a=arm.upper.getWorldPosition(new Vector3()),b=arm.lower.getWorldPosition(new Vector3()),c=arm.hand.getWorldPosition(new Vector3());
    const upper=a.distanceTo(b),lower=b.distanceTo(c),distance=a.distanceTo(this.wristGoal(palm,q));
    return upper>1e-6&&lower>1e-6&&distance<=upper+lower+IBD_INSPECTION_CONTACT_TOLERANCE
      && distance>=Math.max(0,Math.abs(upper-lower)-IBD_INSPECTION_CONTACT_TOLERANCE);
  }
  private solve(arm:Arm,palm:Vector3,q:Quaternion):void {
    const a=arm.upper.getWorldPosition(new Vector3()),b=arm.lower.getWorldPosition(new Vector3()),c=arm.hand.getWorldPosition(new Vector3());
    const upper=a.distanceTo(b),lower=b.distanceTo(c);
    if(upper<1e-6||lower<1e-6)return;
    const direction=this.wristGoal(palm,q).sub(a);
    if(direction.lengthSq()<1e-10)direction.set(1,0,0).applyQuaternion(this.scene.getWorldQuaternion(new Quaternion()));
    const distance=clamp(direction.length(),Math.abs(upper-lower)+.002,(upper+lower)*.995);direction.normalize();
    const wrist=a.clone().addScaledVector(direction,distance);
    const pole=this.frame([.08,.86,arm.side*.64]).sub(a);pole.addScaledVector(direction,-pole.dot(direction));
    if(pole.lengthSq()<1e-10)pole.set(0,0,arm.side).applyQuaternion(this.scene.getWorldQuaternion(new Quaternion()));
    pole.normalize();
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
    const elbow=a.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along)));
    this.rotateWorld(arm.upper,new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),elbow.sub(a).normalize()));
    const nextB=arm.lower.getWorldPosition(new Vector3()),nextC=arm.hand.getWorldPosition(new Vector3());
    this.rotateWorld(arm.lower,new Quaternion().setFromUnitVectors(nextC.sub(nextB).normalize(),wrist.sub(nextB).normalize()));
    const local=q.clone();if(arm.hand.parent)local.premultiply(arm.hand.parent.getWorldQuaternion(new Quaternion()).invert());
    arm.hand.quaternion.copy(local);arm.hand.updateWorldMatrix(true,true);
  }
  apply(action:IbdInspectionAction|null,carried:IbdInspectionCarried,allowed=true):IbdInspectionVisualSockets {
    this.restore();this.invalidate();
    if(this.disposed||!this.arms||!allowed||(!action&&!carried)){this.detach();return this.sockets;}
    for(const a of Object.values(this.arms))if(a.palm.parent!==a.hand)a.hand.add(a.palm);
    this.scene.updateWorldMatrix(true,true);
    for(const[bone,q]of this.saved)q.copy(bone.quaternion);
    this.applied=true;
    const performing=action?.phase==='perform'?action:null;
    const t=performing?clamp(performing.elapsed,0,performing.duration):0;
    const reach=performing?(t<=performing.contactAt
      ?ease((t-performing.reachStartAt)/(performing.contactAt-performing.reachStartAt))
      :1-ease((t-performing.contactAt)/performing.recoverDuration)):0;
    const root=this.scene.getWorldQuaternion(new Quaternion());
    const leftQ=root.clone().multiply(new Quaternion().setFromAxisAngle(Z,-.08));
    const rightQ=root.clone().multiply(new Quaternion().setFromAxisAngle(Z,-.7));
    const left=this.frame(carried?LEFT_CARRY:LEFT_REST),right=this.frame(RIGHT_REST);
    if(performing){
      left.lerp(new Vector3(...performing.anchor.leftTarget),reach);
      right.lerp(new Vector3(...performing.anchor.rightTarget),reach);
      // A modest lift clears the slot edge; both arcs end exactly at the contact pose.
      if(t<performing.contactAt&&performing.kind!=='measure')left.y+=.045*Math.sin(Math.PI*clamp(
        (t-performing.reachStartAt)/(performing.contactAt-performing.reachStartAt)));
    }
    const reachable=!performing||(this.reachable(this.arms.left,new Vector3(...performing.anchor.leftTarget),leftQ)
      &&this.reachable(this.arms.right,new Vector3(...performing.anchor.rightTarget),rightQ));
    this.solve(this.arms.left,left,leftQ);this.solve(this.arms.right,right,rightQ);
    this.scene.updateWorldMatrix(true,true);
    this.sockets.leftHand=tuple(this.arms.left.palm.getWorldPosition(new Vector3()));
    this.sockets.rightHand=tuple(this.arms.right.palm.getWorldPosition(new Vector3()));
    this.sockets.valid=this.sockets.leftHand.every(Number.isFinite)&&this.sockets.rightHand.every(Number.isFinite);
    this.sockets.reachable=reachable;this.sockets.sampledId=performing?.id??null;this.sockets.sampledElapsed=performing?.elapsed??0;
    if(performing){
      this.sockets.leftContactError=new Vector3(...this.sockets.leftHand).distanceTo(new Vector3(...performing.anchor.leftTarget));
      this.sockets.rightContactError=new Vector3(...this.sockets.rightHand).distanceTo(new Vector3(...performing.anchor.rightTarget));
      this.sockets.contactError=Math.max(this.sockets.leftContactError,this.sockets.rightContactError);
    }
    return this.sockets;
  }
  dispose():void {if(this.disposed)return;this.restore();this.invalidate();this.detach();this.disposed=true;}
}
