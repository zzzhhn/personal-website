import { create } from 'zustand';
import { ibdWorld } from './ibd-yard-layout.ts';
import type { IbdYardGame } from './ibd-yard-game.ts';
import { beginIbdInspectionAction, cancelIbdInspectionAction, advanceIbdInspectionAction,
  ibdInspectionBody, ibdInspectionVisualSockets, IBD_INSPECTION_CONTACT_TOLERANCE } from './ibd-inspection-motion.ts';
import type { Vec3 } from '../types.ts';

export type CraneDirection = 'raise'|'travel'|'lower';
export const CRANE_STEPS = ['raise','travel','lower'] as const;
export const CRANE_STAND:Vec3=[-6,.1,.84];
export const CRANE_PIVOTS:readonly Vec3[]=[[-6.22,.91,0],[-5.78,.91,0]];
export const CRANE_GRIP:Vec3=[0,.17,.5];
export const useIbdCraneControl=create(()=>({stage:0,held:null as CraneDirection|null,ready:false,wrong:false}));
// Fixed-clock data, not a per-frame React store. Cargo position remains owned by the mechanism clock.
export const craneControl={token:null as number|null,round:0,progress:0,done:false,cancelled:false,leftAngle:0,rightAngle:0};
export function craneGripTarget(side:0|1,angle:number):Vec3 {
  const [x,y,z]=CRANE_GRIP,[px,py,pz]=CRANE_PIVOTS[side],c=Math.cos(angle),s=Math.sin(angle);
  return side===0?[px+x,py+y*c-z*s,pz+y*s+z*c]:[px+x*c-y*s,py+x*s+y*c,pz+z];
}
export function beginCraneControl(game:IbdYardGame) {
  const token=game.pending?.token;if(token===undefined||game.pending?.action.kind!=='crane')return false;
  const anchor={stand:ibdWorld(CRANE_STAND),yaw:Math.PI/2,
    leftTarget:ibdWorld(craneGripTarget(0,0)),rightTarget:ibdWorld(craneGripTarget(1,0))};
  const started=beginIbdInspectionAction('crane-control',anchor,()=>craneControl.token===token&&!craneControl.cancelled,
    ()=>{if(craneControl.token===token){craneControl.cancelled=true;setCraneInput(null);}});
  if(!started)return false;
  Object.assign(craneControl,{token,round:game.round,progress:0,done:false,cancelled:false,leftAngle:0,rightAngle:0});
  useIbdCraneControl.setState({stage:0,held:null,ready:false,wrong:false});return true;
}
export function resetCraneControl() {
  if(ibdInspectionBody.action?.kind==='crane-control')cancelIbdInspectionAction();
  Object.assign(craneControl,{token:null,progress:0,done:false,cancelled:false,leftAngle:0,rightAngle:0});
  useIbdCraneControl.setState({stage:0,held:null,ready:false,wrong:false});
}
export function setCraneInput(direction:CraneDirection|null) {
  const s=useIbdCraneControl.getState();
  if(direction===null){if(s.held!==null)useIbdCraneControl.setState({held:null});return;}
  if(!s.ready||craneControl.token===null||craneControl.done)return;
  const correct=direction===CRANE_STEPS[s.stage];
  useIbdCraneControl.setState({held:correct?direction:null,wrong:!correct});
}
/** Called on the existing actor clock. Joystick meshes and palm targets share these angles. */
export function tickCraneControl(dt:number) {
  const a=ibdInspectionBody.action;if(a?.kind!=='crane-control')return;
  const held=useIbdCraneControl.getState().held,k=Math.min(1,Math.max(0,dt)*16);
  craneControl.leftAngle+=((held==='raise'?-.18:held==='lower'?.18:0)-craneControl.leftAngle)*k;
  craneControl.rightAngle+=((held==='travel'?.18:0)-craneControl.rightAngle)*k;
  a.anchor.leftTarget=ibdWorld(craneGripTarget(0,craneControl.leftAngle));
  a.anchor.rightTarget=ibdWorld(craneGripTarget(1,craneControl.rightAngle));
  advanceIbdInspectionAction(dt);
  const ready=!!ibdInspectionBody.action?.committed&&!craneControl.done;
  if(useIbdCraneControl.getState().ready!==ready)useIbdCraneControl.setState({ready});
}
/** The mechanism may only advance the current route leg while the operator holds it. */
export function craneMayAdvance(game:IbdYardGame,progress:number) {
  if(game.pending?.token!==craneControl.token||game.round!==craneControl.round||craneControl.cancelled)return false;
  craneControl.progress=progress;
  const stage=Math.min(2,Math.floor(progress*3+1e-7)),s=useIbdCraneControl.getState();
  if(stage!==s.stage&&!craneControl.done){useIbdCraneControl.setState({stage,held:null,wrong:false});return false;}
  const a=ibdInspectionBody.action,v=ibdInspectionVisualSockets;
  return s.ready&&s.held===CRANE_STEPS[stage]&&a?.kind==='crane-control'&&a.committed&&!a.released
    &&v.valid&&v.reachable&&v.sampledId===a.id&&Math.abs(v.sampledElapsed-a.elapsed)<1e-5
    &&[v.leftHand,v.rightHand].every((p,i)=>p.every(Number.isFinite)&&Math.hypot(...p.map((n,j)=>n-(i?a.anchor.rightTarget:a.anchor.leftTarget)[j]))<=IBD_INSPECTION_CONTACT_TOLERANCE);
}
export function craneLanded() {
  if(craneControl.done)return;
  craneControl.done=true;craneControl.progress=1;
  useIbdCraneControl.setState({stage:3,held:null,ready:false,wrong:false});
  if(ibdInspectionBody.action?.kind==='crane-control')ibdInspectionBody.action.released=true;
}
