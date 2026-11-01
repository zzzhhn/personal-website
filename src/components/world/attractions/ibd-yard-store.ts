import { create } from 'zustand';
import { useWorldStore } from '../store';
import { ibdLocal } from './ibd-yard-layout.ts';
import { createIbdYardGame, requestIbdYardAction, finishIbdYardAction, cancelIbdYardAction, yardItemId, type IbdAction, type IbdActor } from './ibd-yard-game.ts';
import type { IbdMotionWait } from './ibd-yard-safety.ts';
import { advanceIbdInspectionAction, beginIbdInspectionAction, cancelIbdInspectionAction, ibdInspectionActor, ibdInspectionBody } from './ibd-inspection-motion.ts';
import { ibdCoilInspectAnchor, isIbdCoilCheck } from './ibd-coil-inspection.ts';
import { beginCraneControl,craneControl,resetCraneControl,setCraneInput,tickCraneControl } from './ibd-crane-control.ts';

// This reservation owns the physical observation, not a second cargo/evidence state.
let coilCheck: {token:number; round:number; itemId:string; observed:boolean} | null = null;

/** One scene/HUD bridge, no global timer or browser storage. Retains this visit across a lazy remount. */
export const useIbdYardStore = create(() => ({ game: createIbdYardGame(), active: false, guideEnabled: true, motionWait: null as IbdMotionWait }));
export function setIbdMotionWait(motionWait: IbdMotionWait) {
  if (useIbdYardStore.getState().motionWait !== motionWait) useIbdYardStore.setState({ motionWait });
}
/** Guidance is an independent visit preference: skipping/resuming never changes cargo or evidence. */
export function setIbdGuide(enabled: boolean) { useIbdYardStore.setState({ guideEnabled: enabled }); }
export function ibdActor(): IbdActor {
  const world = useWorldStore.getState();
  return { local: ibdLocal(world.position), active: useIbdYardStore.getState().active,
    paused: world.paused || !!world.card || world.poolInspect || !!world.shot,
    hidden: typeof document !== 'undefined' && document.hidden,
    driving: !!world.activeVehicle || !!world.seat || !!world.clubMode };
}
export function dispatchIbdAction(action: IbdAction) {
  const s=useIbdYardStore.getState();
  let game=requestIbdYardAction(s.game,action,ibdActor());
  if(game.pending&&game.pending!==s.game.pending&&action.kind==='crane'&&!beginCraneControl(game))
    game={...cancelIbdYardAction(game),notice:'inspection-stand-clear'};
  if(game.pending && game.pending!==s.game.pending && isIbdCoilCheck(action)) {
    const reservation={token:game.pending.token,round:game.round,itemId:yardItemId(game,action.slot!),observed:false};
    const began=beginIbdInspectionAction('coil-check',ibdCoilInspectAnchor(game,action,ibdInspectionActor.position),()=>{
      const current=useIbdYardStore.getState().game,actor=ibdActor();
      if(coilCheck!==reservation || current.pending?.token!==reservation.token || current.round!==reservation.round
        || yardItemId(current,action.slot!)!==reservation.itemId || !actor.active || actor.paused || actor.hidden || actor.driving)return false;
      reservation.observed=true;return true;
    },()=>{
      if(coilCheck!==reservation)return;
      coilCheck=null;
      useIbdYardStore.setState(current=>current.game.pending?.token===reservation.token && current.game.round===reservation.round
        ?{game:cancelIbdYardAction(current.game),motionWait:null}:{});
    });
    if(began)coilCheck=reservation;
    else game={...cancelIbdYardAction(game),notice:'inspection-stand-clear'};
  }
  useIbdYardStore.setState({game,motionWait:game.pending===s.game.pending?s.motionWait:null});
}
export function finishIbdAction(token: number) {
  if(useIbdYardStore.getState().game.pending?.action.kind==='crane'
    &&(craneControl.token!==token||!craneControl.done||ibdInspectionBody.action))return;
  // A mechanism timer cannot bypass the rendered hand pose or the recovery phase.
  if(isIbdCoilCheck(useIbdYardStore.getState().game.pending?.action)
    && (!coilCheck || coilCheck.token!==token || !coilCheck.observed || ibdInspectionBody.action))return;
  useIbdYardStore.setState(s => ({ game: finishIbdYardAction(s.game, token, ibdActor()), motionWait: null }));
  if(craneControl.token===token&&!useIbdYardStore.getState().game.pending)resetCraneControl();
}
export function cancelIbdAction() {
  resetCraneControl();
  if(coilCheck)cancelIbdInspectionAction();
  coilCheck=null;
  useIbdYardStore.setState(s => ({ game: cancelIbdYardAction(s.game), motionWait: null }));
}
/** Reuse the existing fixed actor clock; no interval, polling or per-frame React update. */
export function tickIbdCoilInspection(dt:number) {
  if(craneControl.token!==null){
    const game=useIbdYardStore.getState().game,actor=ibdActor();
    if(game.pending?.token!==craneControl.token||game.round!==craneControl.round||!actor.active||actor.driving||craneControl.cancelled){cancelIbdAction();return;}
    if(actor.paused||actor.hidden){setCraneInput(null);return;}
    tickCraneControl(dt);
    if(craneControl.cancelled){cancelIbdAction();return;}
  }
  const check=coilCheck;if(!check)return;
  const game=useIbdYardStore.getState().game,actor=ibdActor();
  if(game.pending?.token!==check.token || game.round!==check.round || !actor.active || actor.driving) {
    cancelIbdInspectionAction();return;
  }
  if(actor.paused || actor.hidden)return;
  advanceIbdInspectionAction(dt);
  if(coilCheck!==check || ibdInspectionBody.action)return;
  if(check.observed)finishIbdAction(check.token);
  coilCheck=null;
}
