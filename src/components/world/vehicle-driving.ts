/** Coupe handling, shared by the live car and deterministic Rapier tests.
 * +X forward, +Y up, +Z right. Forces stay at the tyres; assists only apply bounded yaw torque. */
import { rotateVector, type Rotation } from './actor-physics.ts';

export interface DrivingInput { throttle: number; steer: number; brake?: boolean; handbrake?: boolean; boost?: boolean }
export interface DrivingState {
  power: number; steering: number; rearGrip: number; nitro: number; boostLock: boolean; rechargeDelay: number;
  boosting: boolean; handbrake: boolean; braking: boolean; slipAngle: number; speed: number; lateralSpeed: number;
  contacts: number; engine: number; suspension: number[];
}
export const createDrivingState = (): DrivingState => ({ power: 0, steering: 0, rearGrip: 1, nitro: 1,
  boostLock: false, rechargeDelay: 0, boosting: false, handbrake: false, braking: false,
  slipAngle: 0, speed: 0, lateralSpeed: 0, contacts: 0, engine: 0, suspension: [0,0,0,0] });
interface Body {
  rotation(): Rotation; linvel(): { x:number; y:number; z:number }; angvel(): { x:number; y:number; z:number };
  principalInertia(): { x:number; y:number; z:number };
  applyTorqueImpulse(t: {x:number;y:number;z:number}, wake:boolean): void;
}
interface Tyres {
  wheelIsInContact(i:number): boolean; wheelSuspensionLength(i:number): number|null;
  setWheelSteering(i:number,v:number): void; setWheelEngineForce(i:number,v:number): void;
  setWheelBrake(i:number,v:number): void; setWheelFrictionSlip(i:number,v:number): void;
  setWheelSideFrictionStiffness(i:number,v:number): void;
}
const clamp = (v:number,a:number,b:number) => Math.min(b,Math.max(a,v));
const approach = (a:number,b:number,rate:number,dt:number) => a+(b-a)*(1-Math.exp(-rate*dt));

export function configureCoupeSuspension(tyres:{setWheelSuspensionCompression(i:number,v:number):void;setWheelSuspensionRelaxation(i:number,v:number):void}) {
  for(let i=0;i<4;i++){tyres.setWheelSuspensionCompression(i,5.4);tyres.setWheelSuspensionRelaxation(i,7);}
}

export function stepCoupeDrive(body:Body, tyres:Tyres, state:DrivingState, input:DrivingInput,
  mass:number, wheelbase:number, dt:number, driven=true) {
  const q=body.rotation(),v=body.linvel(),front=rotateVector([1,0,0],q),side=rotateVector([0,0,1],q);
  const speed=v.x*front[0]+v.y*front[1]+v.z*front[2], lateral=v.x*side[0]+v.y*side[1]+v.z*side[2];
  const abs=Math.abs(speed),throttle=driven?clamp(input.throttle,-1,1):0,steer=driven?clamp(input.steer,-1,1):0;
  const contacts=[0,1,2,3].filter(i=>tyres.wheelIsInContact(i)).length;
  const grounded=contacts>=2&&rotateVector([0,1,0],q)[1]>.5;
  const handbrake=driven&&!!input.handbrake;
  // Opposite throttle brakes first. It only becomes reverse below walking pace.
  const braking=driven&&(!!input.brake||throttle*speed<-.65);
  const boostRequested=driven&&!!input.boost;
  if(!boostRequested)state.boostLock=false;
  const boosting=boostRequested&&!state.boostLock&&state.nitro>0&&throttle>.25&&speed>1&&grounded&&!braking&&!handbrake;
  if(boosting){state.nitro=Math.max(0,state.nitro-dt/3);state.rechargeDelay=1.4;if(state.nitro<=1e-6){state.nitro=0;state.boostLock=true;}}
  else {state.rechargeDelay=Math.max(0,state.rechargeDelay-dt);if(!boostRequested&&state.rechargeDelay===0)state.nitro=Math.min(1,state.nitro+dt/9);}
  // Rear grip drops deliberately with the handbrake, then returns over ~0.4 s, never as a snap.
  state.rearGrip=approach(state.rearGrip,handbrake&&abs>3?.43:1,handbrake?12:6,dt);
  const slip=Math.atan2(lateral,Math.max(abs,2));
  // Full keyboard lock is useful in car parks; high-speed lock is limited by lateral acceleration.
  const lock=Math.min(.56,Math.atan(12.5*wheelbase/Math.max(1,speed*speed)));
  // A small countersteer follows the actual slide, leaving the driver most of the available lock.
  const counterLimit=Math.min(.12,lock*.6);
  const counter=grounded&&speed>4?clamp(-slip*.28,-counterLimit,counterLimit):0;
  state.steering=steer*lock+counter;
  // Rapier's tyre solver selects engine force OR rolling/brake impulse. A decaying, nonzero
  // engine force would bypass the brake even when it is almost zero, so cut drive exactly.
  state.power=braking||handbrake||!driven?0:approach(state.power,throttle,7,dt);
  if(Math.abs(state.power)<.001)state.power=0;
  const limit=state.power<0?8:boosting?36:29;
  // Smooth torque falloff avoids the former on/off limiter at exactly 29 m/s.
  const taper=clamp((limit-abs)/5,0,1),power=state.power*(state.power<0?.55:1);
  const engine=mass*6.8*power*taper*(boosting?1.65:1);
  for(let i=0;i<4;i++){
    const rear=i>=2;
    tyres.setWheelSteering(i,rear?0:state.steering);
    tyres.setWheelEngineForce(i,engine*(rear?.32:.18));
    tyres.setWheelBrake(i,!driven?mass*.035:braking?mass*(rear?.034:.046):handbrake&&rear?mass*.045:abs>.15&&Math.abs(throttle)<.02?mass*.0018:0);
    tyres.setWheelFrictionSlip(i,(rear?1.65:1.6)*(rear?state.rearGrip:1));
    tyres.setWheelSideFrictionStiffness(i,rear?state.rearGrip:1);
  }
  // Progressive stability assistance: no force in the air, no heading/velocity teleport, and much
  // weaker during a deliberate slide. Countersteer and throttle still determine the exit.
  if(driven&&grounded&&speed>3){
    const yaw=body.angvel().y,desired=clamp(speed*Math.tan(steer*lock)/wheelbase,-1.4,1.4);
    const correction=clamp((desired-yaw)*.7-slip*(handbrake?.2:1.8),-1.4,1.4);
    body.applyTorqueImpulse({x:0,y:correction*body.principalInertia().y*dt,z:0},true);
  }
  Object.assign(state,{boosting,handbrake,braking,slipAngle:slip,speed,lateralSpeed:lateral,contacts,engine});
  for(let i=0;i<4;i++)state.suspension[i]=tyres.wheelSuspensionLength(i)??.42;
}
