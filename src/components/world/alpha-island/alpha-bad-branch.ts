import type {RigidBody,World} from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {ALPHA_MAIN_PATH,alphaLocal} from './alpha-layout';
import {alphaHeight} from './alpha-terrain';
import type {Vec3} from '../types';
export type BranchPhase='attached'|'waiting'|'fallen'|'reset-wait';
export const alphaBadBranchProbe={phase:'attached' as BranchPhase,position:[0,0,0] as Vec3,velocity:[0,0,0] as Vec3,home:[0,0,0] as Vec3,worldTime:0,droppedAt:-100,age:0,drops:0,resets:0,playerContacts:0,pathMargin:Infinity,minPathMargin:Infinity,restoreBlocked:false,dropBlocked:false};
const pointSegment=(p:Vec3,a:Vec3,b:Vec3)=>{const x=b[0]-a[0],z=b[2]-a[2],n=x*x+z*z,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[2]-a[2])*z)/n)):0;return Math.hypot(p[0]-a[0]-t*x,p[2]-a[2]-t*z);};
export function alphaBranchPathMargin(center:Vec3,radius:number){const p=alphaLocal(center);let d=Infinity;for(let i=1;i<ALPHA_MAIN_PATH.length;i++)d=Math.min(d,pointSegment(p,ALPHA_MAIN_PATH[i-1],ALPHA_MAIN_PATH[i]));return d-2.1-radius;}
type Engine=typeof import('@dimforge/rapier3d-compat');
type Bound={boundCenter:Vec3;boundRadius:number;travel:number};
/** One actual rigid body alternates between its source attachment and free physics.
 * Deadlines use the island's pause/visibility-aware world clock, never wall time. */
export class AlphaBadBranchController{
 phase:BranchPhase='attached';lastTreeAt=-100;due=Infinity;droppedAt=-100;deadline=Infinity;
 readonly home:Vec3;readonly homeRotation:Quaternion;lastClear:{position:Vec3;rotation:Quaternion}|null=null;
 constructor(readonly body:RigidBody,readonly world:World,readonly engine:Engine,readonly bound:Bound){const p=body.translation(),q=body.rotation();this.home=[p.x,p.y,p.z];this.homeRotation=new Quaternion(q.x,q.y,q.z,q.w);alphaBadBranchProbe.home=[...this.home];}
 center(){const p=this.body.translation(),q=this.body.rotation();return new Vector3(...this.bound.boundCenter).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w)).add(new Vector3(p.x,p.y,p.z)).toArray() as Vec3;}
 canRestore(){let blocked=false;const q=this.homeRotation;
  for(let i=0;i<this.body.numColliders()&&!blocked;i++){const c=this.body.collider(i),p=c.translationWrtParent(),r=c.rotationWrtParent();if(!p||!r)continue;const at=new Vector3(p.x,p.y,p.z).applyQuaternion(q).add(new Vector3(...this.home)),rot=q.clone().multiply(new Quaternion(r.x,r.y,r.z,r.w));this.world.intersectionsWithShape(at,rot,c.shape,()=>{blocked=true;return false;},undefined,undefined,c,this.body,other=>other.isEnabled()&&!other.isSensor());}
  alphaBadBranchProbe.restoreBlocked=blocked;return !blocked;
 }
 canDrop(){const c=this.center(),p=alphaLocal(c),floor=alphaHeight(p[0],p[2]),r=this.bound.boundRadius+.3,half=Math.max(.2,(c[1]-floor)/2+r),at={x:c[0],y:(c[1]+floor)/2,z:c[2]};let blocked=false;
  this.world.intersectionsWithShape(at,{x:0,y:0,z:0,w:1},new this.engine.Cuboid(r,half,r),()=>{blocked=true;return false;},undefined,undefined,undefined,this.body,other=>other.isEnabled()&&!other.isSensor()&&!other.parent()?.isFixed());alphaBadBranchProbe.dropBlocked=blocked;return !blocked;
 }
 restore(){if(!this.canRestore())return false;const b=this.body,zero={x:0,y:0,z:0},enabled=Array.from({length:b.numColliders()},(_,i)=>b.collider(i).isEnabled());enabled.forEach((_,i)=>b.collider(i).setEnabled(false));b.setBodyType(this.engine.RigidBodyType.KinematicPositionBased,true);b.setLinvel(zero,true);b.setAngvel(zero,true);b.setTranslation({x:this.home[0],y:this.home[1],z:this.home[2]},true);b.setRotation(this.homeRotation,true);b.setNextKinematicTranslation({x:this.home[0],y:this.home[1],z:this.home[2]});b.setNextKinematicRotation(this.homeRotation);enabled.forEach((v,i)=>b.collider(i).setEnabled(v));this.phase='attached';this.deadline=Infinity;alphaBadBranchProbe.resets++;return true;}
 tick(time:number,treeAt:number,paused:boolean,active:boolean){
  const b=this.body;if(paused)return;
  if(treeAt!==this.lastTreeAt){this.lastTreeAt=treeAt;if(treeAt>=0&&this.phase==='attached'){this.phase='waiting';this.due=treeAt+Math.max(.7,this.bound.travel/3.4);}}
  if(!active&&this.phase!=='attached'){if(!this.restore())this.phase='reset-wait';}
  else if(this.phase==='waiting'&&time>=this.due&&this.canDrop()){b.setBodyType(this.engine.RigidBodyType.Dynamic,true);b.setLinvel({x:0,y:0,z:0},true);b.setAngvel({x:0,y:0,z:0},true);this.phase='fallen';this.droppedAt=time;this.deadline=time+18;alphaBadBranchProbe.drops++;}
  const center=this.center(),margin=alphaBranchPathMargin(center,this.bound.boundRadius),p=b.translation(),q=b.rotation(),v=b.linvel();
  if(this.phase==='fallen'){
   alphaBadBranchProbe.minPathMargin=Math.min(alphaBadBranchProbe.minPathMargin,margin);const local=alphaLocal([p.x,p.y,p.z]);
   if(time>=this.deadline||Math.hypot(p.x-this.home[0],p.z-this.home[2])>7||margin<0||p.y<alphaHeight(local[0],local[2])-2){if(!this.restore()){
     this.phase='reset-wait';b.setBodyType(this.engine.RigidBodyType.KinematicPositionBased,true);b.setLinvel({x:0,y:0,z:0},true);b.setAngvel({x:0,y:0,z:0},true);
     if(this.lastClear){b.setTranslation({x:this.lastClear.position[0],y:this.lastClear.position[1],z:this.lastClear.position[2]},true);b.setRotation(this.lastClear.rotation,true);}
    }}else this.lastClear={position:[p.x,p.y,p.z],rotation:new Quaternion(q.x,q.y,q.z,q.w)};
  }else if(this.phase==='reset-wait')this.restore();
  const now=b.translation(),velocity=b.linvel();Object.assign(alphaBadBranchProbe,{phase:this.phase,position:[now.x,now.y,now.z],velocity:[velocity.x,velocity.y,velocity.z],worldTime:time,droppedAt:this.droppedAt,age:this.phase==='fallen'?time-this.droppedAt:0,pathMargin:alphaBranchPathMargin(this.center(),this.bound.boundRadius)});
 }
}
