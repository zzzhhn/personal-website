import { create } from 'zustand';
import { cancelCampPropInteraction } from '../camp-prop-interactions';
import { guideActionHand as campPropHand } from '../rides/guide-action-hand';
import type { Vec3 } from '../types';
export type AlphaAction = 'bell'|'sand'|'tree'|'wind'|'stone'|'lantern';
export const ALPHA_LANTERN_CAP = 12;
export const ALPHA_LANTERN_LIFETIME = 34;
interface AlphaProgress { visits:number[]; card:boolean; stones:number; wind:0|1|2; carried:boolean; action:AlphaAction|null; revision:number }
const initial=()=>{try{const v=JSON.parse(localStorage.getItem('alpha-island-progress-v1')||'{}');return {visits:Array.isArray(v.visits)?v.visits.filter((n:unknown)=>[1,3,7,8,11,12].includes(Number(n))):[],card:v.card===true,stones:Math.max(0,Math.min(32,Number(v.stones)||0))};}catch{return {visits:[],card:false,stones:0};}};
export const useAlphaStore=create<AlphaProgress>(()=>({...initial(),wind:0,carried:false,action:null,revision:0}));
export const alphaMotion={time:0,bellAt:-100,treeAt:-100,sandAt:-100,windAt:-100,looseAt:-100,handTarget:null as Vec3|null,handError:Infinity,
 lanterns:[] as {id:number;age:number;position:Vec3;drift:number}[],nextLantern:0};
export function saveAlphaProgress(){try{const {visits,card,stones}=useAlphaStore.getState();localStorage.setItem('alpha-island-progress-v1',JSON.stringify({visits,card,stones}));}catch{/* Storage unavailable: session remains playable. */}}
export function visitAlphaStation(n:number){const s=useAlphaStore.getState();if(!s.visits.includes(n)){useAlphaStore.setState({visits:[...s.visits,n]});saveAlphaProgress();}}
export function startAlphaHand(action:AlphaAction,target:Vec3){cancelCampPropInteraction('alpha-action');cancelAlphaHand();alphaMotion.handTarget=target;campPropHand.target=target;campPropHand.facing=target;campPropHand.mode='grip';campPropHand.owner='alpha-island';campPropHand.cancel=()=>{cancelAlphaHand();};useAlphaStore.setState({action});}
/** Shared store Esc calls this before opening pause. A cancelled carried lantern returns to rack. */
export function cancelAlphaHand(){const s=useAlphaStore.getState();if(!s.action&&!s.carried)return false;if(campPropHand.target===alphaMotion.handTarget){campPropHand.target=null;campPropHand.facing=null;campPropHand.palm=null;campPropHand.owner=null;campPropHand.cancel=null;}alphaMotion.handTarget=null;alphaMotion.handError=Infinity;useAlphaStore.setState({action:null,carried:false,revision:s.revision+1});return true;}
export function releaseAlphaLantern(position:Vec3){const s=useAlphaStore.getState();if(!s.carried||alphaMotion.handError>.14)return false;const id=alphaMotion.nextLantern++;if(alphaMotion.lanterns.length>=ALPHA_LANTERN_CAP)alphaMotion.lanterns.shift();alphaMotion.lanterns.push({id,age:0,position:[...position],drift:(id%5-2)*.035});cancelAlphaHand();return true;}
/** Lightweight read-only actor adapter; no global player weather preference mutation. */
export function alphaWindAtWorld(position:readonly number[]){if(Math.hypot(position[0]-254,position[2]-148)>14)return null;return {strength:useAlphaStore.getState().wind, direction:[1,0,.15] as Vec3};}
