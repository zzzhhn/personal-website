import type { Vec3 } from '../types';
import type { RideActorFrame, RideDriver, TransportRoute } from './ride-contract';
import { pathLength, sampleTransport, transportCurve, transportWorld } from './transport-route.ts';
const smooth = (u:number)=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
const mixAngle=(a:number,b:number,u:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*u;
const heading=(a:Vec3,b:Vec3)=>Math.atan2(a[2]-b[2],b[0]-a[0]);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const firstHeading=(path:Vec3[],fallback:number)=>{for(let i=1;i<path.length;i++)if(Math.hypot(path[i][0]-path[i-1][0],path[i][2]-path[i-1][2])>1e-8)return heading(path[i-1],path[i]);return fallback;};
/** Join the surveyed route where the player already stands, without revisiting its apron. */
function joinBoarding(root:Vec3,path:Vec3[],guard:((from:Vec3,to:Vec3)=>boolean)|null):Vec3[]{
  let best=Infinity,at=0,fraction=0,join=path[0];
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],horizontal=dx*dx+dz*dz;
    const t=horizontal>1e-12?Math.max(0,Math.min(1,((root[0]-a[0])*dx+(root[2]-a[2])*dz)/horizontal)):0;
    const p=a.map((v,k)=>v+(b[k]-v)*t) as Vec3,d=distance(root,p);
    if(d<=best+1e-8){best=d;at=i;fraction=t;join=p;}
  }
  // Try only forward points on the same surveyed segment. Joining beyond a bend
  // would shortcut its railings, cabin opening or supported gangway surface.
  if(guard&&at>0){
    const a=path[at-1],b=path[at],count=Math.max(1,Math.ceil(distance(join,b)/.2));
    for(let i=0;i<=count;i++){
      const t=fraction+(1-fraction)*i/count,candidate=a.map((v,k)=>v+(b[k]-v)*t) as Vec3;
      const samples=Math.max(1,Math.ceil(distance(root,candidate)/.2));let clear=true,previous=root;
      for(let j=1;j<=samples;j++){const p=root.map((v,k)=>v+(candidate[k]-v)*j/samples) as Vec3;if(!guard(previous,p)){clear=false;break;}previous=p;}
      if(clear){join=candidate;break;}
    }
  }
  return [root,join,...path.slice(at)].filter((p,i,all)=>!i||distance(p,all[i-1])>1e-8).map(p=>[...p] as Vec3);
}
const inverseSmooth=(u:number)=>.5-Math.sin(Math.asin(1-2*Math.max(0,Math.min(1,u)))/3);
export type TransportPhase='approach'|'turn-in'|'sit'|'riding'|'stand'|'turn-out'|'walk-out'|'complete';
/** One route, vehicle and actor clock. Frozen frames never accumulate elapsed time. */
export class TransportDriver implements RideDriver {
  readonly id: string;
  phase: TransportPhase='approach';
  frame: RideActorFrame;
  u: number; velocity=0; elapsed=0; captured=false; exitRequested=false; disposed=false;
  skipRequested=false;
  blockedMotion=false; private movementGuard:((from:Vec3,to:Vec3)=>boolean)|null=null;private cancelledAt:Vec3|null=null;
  setMovementGuard(guard:(from:Vec3,to:Vec3)=>boolean){this.movementGuard=guard;
    if(this.captured&&this.phase==='approach'&&this.elapsed===0&&distance(this.frame.root,this.from)<1e-8)this.enter=this.joinBoarding();}
  exitBlocked=false;
  get boardingPath(){return this.enter;}
  get egressPath(){const terminal=this.route.terminals[this.destination];return (terminal.egress??[...terminal.boarding].reverse().concat([terminal.safeExit])).map(p=>transportWorld(p,this.route.transform));}
  setExitBlocked(blocked:boolean){this.exitBlocked=blocked;}
  source: 0|1; destination: 0|1; direction: number;
  private from: Vec3; private startYaw=0;
  private curve; private enter:Vec3[]=[]; private leave:Vec3[]=[];
  readonly route:TransportRoute; private release:()=>void;
  constructor(route: TransportRoute, source:0|1, release=()=>{}) {
    this.route=route;this.release=release;
    this.id=route.id; this.source=source;this.destination=source===0?1:0;this.direction=source===0?1:-1;this.u=source;
    this.curve=transportCurve(route);this.from=transportWorld(route.terminals[source].boarding[0],route.transform);
    const sample=this.sample();
    this.frame={root:[...this.from],yaw:sample.yaw,speed:0,clip:'Idle',seatWeight:0,seat:sample.pose.seat};
  }
  get terminal(){return this.route.terminals[this.destination];}
  get safeExit():Vec3{if(this.cancelledAt)return [...this.cancelledAt] as Vec3;return transportWorld(this.terminal.safeExit,this.route.transform);}
  sample(){return sampleTransport(this.route,this.u,this.curve,1);}
  capture(root:Vec3,yaw:number){if(this.captured)return;this.captured=true;this.from=[...root];
    this.frame={...this.frame,root:[...root],yaw};
    this.enter=this.joinBoarding();}
  private joinBoarding(){return joinBoarding(this.from,this.route.terminals[this.source].boarding.map(p=>transportWorld(p,this.route.transform)),this.movementGuard);}
  requestExit(){this.exitRequested=true;
    if(this.phase==='approach'&&this.captured){this.destination=this.source;this.cancelledAt=[...this.frame.root];this.phase='complete';this.elapsed=0;this.frame={...this.frame,root:[...this.cancelledAt],speed:0,clip:'Idle'};return;}
    // Cable/ferry return physically along the same route; sled has no safe mid-slope landing.
    if(this.phase==='riding'&&this.route.kind!=='sled'){this.destination=this.source;this.direction=this.source===0?-1:1;}
  }
  /** Skip only the travel clock. The surveyed terminal egress and its guards still run. */
  requestSkip(){
    if(this.disposed||!this.captured||this.phase!=='riding'||this.skipRequested)return false;
    this.skipRequested=true;return true;
  }
  dispose(_reason:'complete'|'recovery'){if(this.disposed)return;this.disposed=true;this.movementGuard=null;this.release();}
  private duration(){switch(this.phase){case'approach':return Math.max(.25,pathLength(this.enter)/1.35);case'turn-in':case'turn-out':return .7;case'sit':case'stand':return 1.35;case'walk-out':return Math.max(.3,pathLength(this.leave)/1.35);default:return Infinity;}}
  private next(){this.elapsed=0;
    switch(this.phase){
      case'approach':this.startYaw=this.frame.yaw;this.phase='turn-in';break;
      case'turn-in':this.phase='sit';break;
      case'sit':this.phase=this.exitRequested?'stand':'riding';if(this.exitRequested)this.destination=this.source;break;
      case'riding':this.phase='stand';break;
      case'stand':this.phase='turn-out';this.leave=(this.route.terminals[this.destination].egress??[...this.route.terminals[this.destination].boarding].reverse()).map(p=>transportWorld(p,this.route.transform));if(!this.route.terminals[this.destination].egress)this.leave.push(this.safeExit);break;
      case'turn-out':this.phase='walk-out';break;
      case'walk-out':this.phase='complete';break;
    }
  }
  private walk(dt:number,path:Vec3[]):Pick<RideActorFrame,'root'|'yaw'|'speed'|'clip'> {
    const total=pathLength(path),duration=this.duration(),travel=smooth(this.elapsed/duration)*total;
    if(total<1e-8){this.next();return {root:[...path.at(-1)!],yaw:this.frame.yaw,speed:0,clip:'Idle'};}
    let start=0;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],length=distance(a,b),end=start+length;
      if(length<1e-8||travel>=end-1e-8&&i<path.length-1){start=end;continue;}
      const yaw=Math.hypot(b[0]-a[0],b[2]-a[2])>1e-8?heading(a,b):this.frame.yaw,delta=angleDelta(this.frame.yaw,yaw);
      // Finish each turn while stationary. A step never cuts across two segments.
      if(Math.abs(delta)>1e-6)return {root:[...this.frame.root],yaw:this.frame.yaw+Math.sign(delta)*Math.min(Math.abs(delta),Math.PI*dt),speed:0,clip:delta>0?'TurnL':'TurnR'};
      this.elapsed=Math.min(this.elapsed+dt,inverseSmooth(end/total)*duration);
      const d=Math.max(0,Math.min(length,smooth(this.elapsed/duration)*total-start));
      const root=a.map((v,k)=>v+(b[k]-v)*d/length) as Vec3;
      const motion={root,yaw,speed:distance(this.frame.root,root)/dt,clip:'Walk' as const};
      if(i===path.length-1&&d>=length-1e-8){this.frame={...this.frame,...motion};this.next();}
      return motion;
    }
    this.next();return {root:[...path.at(-1)!],yaw:this.frame.yaw,speed:0,clip:'Idle'};
  }
  step(dt:number,frozen:boolean){
    if(!this.captured||this.disposed||frozen||!Number.isFinite(dt)||dt<=0||dt>.25)return this.sample();
    const before={phase:this.phase,elapsed:this.elapsed,frame:this.frame};
    this.blockedMotion=false;
    let walking:ReturnType<TransportDriver['walk']>|undefined;
    if(this.phase==='approach'||this.phase==='walk-out')walking=this.walk(dt,this.phase==='approach'?this.enter:this.leave);
    else if(this.phase==='riding'){
      if(this.skipRequested){this.u=this.destination;this.velocity=0;this.skipRequested=false;this.next();}
      else {
      const acceleration=1/(this.route.duration*2),distance=Math.abs(this.destination-this.u);
      const wanted=this.direction*Math.min(1/this.route.duration,Math.sqrt(2*acceleration*distance));
      this.velocity+=Math.max(-acceleration*dt,Math.min(acceleration*dt,wanted-this.velocity));
      this.u=Math.max(0,Math.min(1,this.u+this.velocity*dt));
      if((this.direction>0&&this.u>=this.destination)||(this.direction<0&&this.u<=this.destination)){this.u=this.destination;this.velocity=0;this.next();}
      }
    }else if(this.phase!=='complete'){this.elapsed+=dt;if(this.elapsed>=this.duration()){if(this.phase==='stand'&&this.exitBlocked)this.elapsed=this.duration();else this.next();}}
    const sample=this.sample(),q=Math.min(1,this.elapsed/this.duration()),k=smooth(q);
    let root=transportWorld(this.route.terminals[this.phase==='approach'||this.phase==='turn-in'||this.phase==='sit'?this.source:this.destination].boarding.at(-1)!,this.route.transform);
    let yaw=sample.yaw,speed=0,seatWeight=0,clip:RideActorFrame['clip']='Idle',clipPhase:number|undefined;
    switch(this.phase){
      case'approach':({root,yaw,speed,clip}=walking!);break;
      case'turn-in':yaw=mixAngle(this.startYaw,sample.yaw,k);clip='TurnR';clipPhase=q;break;
      case'sit':clip='SitDown';clipPhase=q;seatWeight=smooth((q-.25)/.7);break;
      case'riding':root=[...sample.pose.seat];clip='SitIdle';clipPhase=1;seatWeight=1;break;
      case'stand':clip='StandUp';clipPhase=q;seatWeight=1-smooth(q/.75);break;
      case'turn-out':yaw=mixAngle(sample.yaw,firstHeading(this.leave,sample.yaw),k);clip='TurnR';clipPhase=q;break;
      case'walk-out':({root,yaw,speed,clip}=walking??{root:[...this.leave[0]] as Vec3,yaw:firstHeading(this.leave,sample.yaw),speed:0,clip:'Walk'});break;
      case'complete':root=this.safeExit;yaw=this.frame.yaw;break;
    }
    const onFoot=this.phase==='approach'||this.phase==='walk-out';
    this.frame={groundId:this.route.id+'-boarding-'+(['approach','turn-in','sit'].includes(this.phase)?this.source:this.destination),stairs:this.phase!=='riding'&&this.phase!=='complete',footLowering:this.route.kind==='ferry'&&onFoot?this.route.footLowering:undefined,root,yaw,speed,clip,clipPhase,seatWeight,seat:[...sample.pose.seat],orientation:sample.orientation};
    if(this.movementGuard&&(this.phase==='approach'||this.phase==='walk-out'||before.phase==='approach'||before.phase==='walk-out')&&!this.movementGuard(before.frame.root,this.frame.root)){this.phase=before.phase;this.elapsed=before.elapsed;this.frame={...before.frame,speed:0,clip:this.route.kind==='ferry'&&before.frame.footLowering?'Walk':'Idle',footContactHold:this.route.kind==='ferry'&&!!before.frame.footLowering,clipPhase:undefined};this.blockedMotion=true;}
    if(this.phase!=='riding')sample.pose.cameraTarget=[this.frame.root[0],this.frame.root[1]+.9,this.frame.root[2]];
    return sample;
  }
}
