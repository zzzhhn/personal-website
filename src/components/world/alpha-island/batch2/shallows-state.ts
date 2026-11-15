import type { Vec3 } from '../../types';
import { ALPHA_SHALLOWS } from '../alpha-batch2-layout';

export const SHALLOWS_STONE_COUNT = 8;
export const SHALLOWS_STONE_SIZE: Vec3 = [1.52, .54, 1.64];
export const SHALLOWS_DECK_Y = 12.08;
export const SHALLOWS_SLIDE = 1.65;
export const SHALLOWS_BYPASS = Array.from({length:15}, (_,i) =>
  [ALPHA_SHALLOWS.center[0]-8.75+i*1.25, SHALLOWS_DECK_Y-.24, ALPHA_SHALLOWS.center[2]+4] as Vec3);
export interface ShallowsState { progress:number[]; active:number|null; resets:number }
export const createShallowsState = ():ShallowsState => ({progress:Array(SHALLOWS_STONE_COUNT).fill(0),active:null,resets:0});
export const shallowsComplete = (s:ShallowsState) => s.progress.every(p=>p===1);
export function shallowsStonePosition(index:number, progress=0):Vec3 {
  return [ALPHA_SHALLOWS.center[0]+(index-3.5)*1.48, SHALLOWS_DECK_Y-SHALLOWS_STONE_SIZE[1]/2,
    ALPHA_SHALLOWS.center[2]-1+(index%2?1:-1)*SHALLOWS_SLIDE*(1-progress)];
}
/** Capsule radius plus one frame of running and a contact skin. A standing or
 * airborne actor over a slab is also excluded, so a moving stone never carries it. */
export function shallowsSweepClear(index:number, from:number, to:number, actor:readonly number[]) {
  if(actor[1]<ALPHA_SHALLOWS.bedY-1 || actor[1]>SHALLOWS_DECK_Y+2.7)return true;
  const a=shallowsStonePosition(index,from),b=shallowsStonePosition(index,to),margin=.65;
  return Math.abs(actor[0]-a[0])>SHALLOWS_STONE_SIZE[0]/2+margin ||
    actor[2]<Math.min(a[2],b[2])-SHALLOWS_STONE_SIZE[2]/2-margin ||
    actor[2]>Math.max(a[2],b[2])+SHALLOWS_STONE_SIZE[2]/2+margin;
}
export function pushShallowsStone(s:ShallowsState,index:number,actor:readonly number[]) {
  if(!Number.isInteger(index)||index<0||index>=SHALLOWS_STONE_COUNT||s.active!==null||s.progress[index]===1||
    !shallowsSweepClear(index,s.progress[index],1,actor))return false;
  s.active=index;return true;
}
/** A bounded metre/second move, no wall-clock deadline and no pause catch-up. */
export function stepShallowsStone(s:ShallowsState,delta:number,actor:readonly number[],frozen=false) {
  if(frozen||s.active===null||!Number.isFinite(delta)||delta<=0)return false;
  const i=s.active,p=s.progress[i],next=Math.min(1,p+Math.min(delta,.05)*.85);
  if(!shallowsSweepClear(i,p,next,actor))return false;
  s.progress[i]=next;
  if(next===1)s.active=null;
  return true;
}
export function canResetShallows(s:ShallowsState,actor:readonly number[]) {
  return s.active===null&&s.progress.some(p=>p>0)&&
    s.progress.every((p,i)=>shallowsSweepClear(i,0,p,actor));
}
export function resetShallows(s:ShallowsState,actor:readonly number[]) {
  if(!canResetShallows(s,actor))return false;
  s.progress.fill(0);s.active=null;s.resets++;return true;
}
