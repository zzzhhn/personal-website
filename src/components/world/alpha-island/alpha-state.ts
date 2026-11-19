import { create } from 'zustand';
import { guideActionHand, releaseGuideActionHand } from '../rides/guide-action-hand';
import type { Vec3 } from '../types';
import { acceptAction, advanceAcceptedAction, cancelAcceptedAction, type AcceptedAction } from '../accepted-action';
export type AlphaAction = 'bell'|'sand'|'tree'|'wind'|'stone'|'lantern';
export const ALPHA_LANTERN_CAP = 12;
export const ALPHA_LANTERN_LIFETIME = 34;
interface AlphaProgress { visits:number[]; card:boolean; stones:number; wind:0|1|2; carried:boolean; action:AlphaAction|null; revision:number }
function initial() {
  try {
    const saved = JSON.parse(localStorage.getItem('alpha-island-progress-v1') || '{}');
    return restoreAlphaProgress(saved);
  } catch {
    return restoreAlphaProgress(null);
  }
}

export function restoreAlphaProgress(saved: {visits?: unknown; card?: unknown; stones?: unknown} | null) {
  const visits = Array.isArray(saved?.visits) ? saved.visits.map(Number) : [];
  const stones = Number(saved?.stones);
  return {
    visits: [...new Set(visits.filter(n => [1,2,3,5,6,7,8,11,12].includes(n)))],
    card: saved?.card === true,
    stones: Number.isFinite(stones) ? Math.min(32, Math.max(0, Math.floor(stones))) : 0,
  };
}
export const useAlphaStore=create<AlphaProgress>(()=>({...initial(),wind:0,carried:false,action:null,revision:0}));
export const alphaMotion={time:0,bellAt:-100,treeAt:-100,sandAt:-100,windAt:-100,looseAt:-100,handTarget:null as Vec3|null,handError:Infinity,
 actionClock:null as AcceptedAction|null,acceptedAt:null as Vec3|null,
 lanterns:[] as {id:number;age:number;position:Vec3;drift:number}[],nextLantern:0};
export function saveAlphaProgress(){try{const {visits,card,stones}=useAlphaStore.getState();localStorage.setItem('alpha-island-progress-v1',JSON.stringify({visits,card,stones}));}catch{/* Storage unavailable: session remains playable. */}}
export function visitAlphaStation(n:number){const s=useAlphaStore.getState();if(!s.visits.includes(n)){useAlphaStore.setState({visits:[...s.visits,n]});saveAlphaProgress();}}
export function startAlphaHand(action:AlphaAction,target:Vec3,position?:Vec3){
 releaseGuideActionHand();cancelAlphaHand();
 alphaMotion.actionClock=acceptAction(action==='stone'?1.2:.36);
 alphaMotion.acceptedAt=position?[...position]:null;
 alphaMotion.handTarget=target;guideActionHand.target=target;guideActionHand.facing=target;
 guideActionHand.mode='grip';guideActionHand.owner='alpha-island';guideActionHand.cancel=()=>{cancelAlphaHand();};
 useAlphaStore.setState({action});
}

/** Scene adapters pass live actor eligibility; palm position only affects visual posing. */
export function advanceAlphaHand(dt:number,position:Vec3,eligible:boolean):{kind:AlphaAction;wind:0|1|2}|null {
 const s=useAlphaStore.getState(),clock=alphaMotion.actionClock;
 if(!s.action||s.carried)return null;
 const start=alphaMotion.acceptedAt;
 const valid=eligible&&position.every(Number.isFinite)&&guideActionHand.owner==='alpha-island'
   &&!!alphaMotion.handTarget&&guideActionHand.target===alphaMotion.handTarget
   &&(!start||Math.hypot(position[0]-start[0],position[1]-start[1],position[2]-start[2])<=.3);
 if(!clock||!valid){cancelAlphaHand();return null;}
 if(!advanceAcceptedAction(clock,dt,true))return null;
 const kind=s.action,t=alphaMotion.time;let wind=s.wind;
 switch(kind){
   case'bell':alphaMotion.bellAt=t;break;
   case'sand':alphaMotion.sandAt=t;break;
   case'tree':alphaMotion.treeAt=t;alphaMotion.looseAt=t;visitAlphaStation(3);break;
   case'wind':wind=((s.wind+1)%3) as 0|1|2;useAlphaStore.setState({wind});alphaMotion.windAt=t;visitAlphaStation(7);break;
   case'stone':useAlphaStore.setState({stones:Math.min(32,s.stones+1)});saveAlphaProgress();visitAlphaStation(11);break;
   case'lantern':useAlphaStore.setState({carried:true});visitAlphaStation(11);break;
 }
 if(kind!=='lantern')cancelAlphaHand();
 return {kind,wind};
}
/** The scene-owned hand release calls this before opening pause. A cancelled lantern returns to its rack. */
export function cancelAlphaHand(){const s=useAlphaStore.getState();if(!s.action&&!s.carried)return false;if(guideActionHand.target===alphaMotion.handTarget){guideActionHand.target=null;guideActionHand.facing=null;guideActionHand.palm=null;guideActionHand.owner=null;guideActionHand.cancel=null;}cancelAcceptedAction(alphaMotion.actionClock);alphaMotion.actionClock=null;alphaMotion.acceptedAt=null;alphaMotion.handTarget=null;alphaMotion.handError=Infinity;useAlphaStore.setState({action:null,carried:false,revision:s.revision+1});return true;}
export function canReleaseAlphaLantern(){const s=useAlphaStore.getState();return s.carried&&s.action==='lantern'&&guideActionHand.owner==='alpha-island'&&!!alphaMotion.handTarget&&guideActionHand.target===alphaMotion.handTarget;}
export function releaseAlphaLantern(position:Vec3){if(!canReleaseAlphaLantern()||!position.every(Number.isFinite))return false;const id=alphaMotion.nextLantern++;if(alphaMotion.lanterns.length>=ALPHA_LANTERN_CAP)alphaMotion.lanterns.shift();alphaMotion.lanterns.push({id,age:0,position:[...position],drift:(id%5-2)*.035});cancelAlphaHand();return true;}
/** Lightweight read-only actor adapter; no global player weather preference mutation. */
export function alphaWindAtWorld(position:readonly number[]){if(Math.hypot(position[0]-254,position[2]-148)>14)return null;return {strength:useAlphaStore.getState().wind, direction:[1,0,.15] as Vec3};}
