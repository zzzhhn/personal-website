import {shelfLanternGrip} from './alpha-lantern-layout';
import type { AlphaAction } from './alpha-state';
import type { Interactable } from '../WorldInteract';
import type { Vec3 } from '../types';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics';
import { alphaWorld, ALPHA_WIND_GATE_Y } from './alpha-layout';
import type { PickupApproach } from '../pickup-approach';
import { ALPHA_CAIRN_STANCE_RADIUS, alphaPersonalStone } from './alpha-personal-cairn';

type Notice = { zh: string; en: string };
const TARGETS: Record<Exclude<AlphaAction,'stone'>, Vec3> = {
  bell: [-61.3,4.95,-36.35], sand: [-64,5.5,-38.9], tree: [-42.7,19.2,-27.7],
  wind: [17.4,ALPHA_WIND_GATE_Y+1.05,-43.6], lantern: shelfLanternGrip(),
};
const LABELS: Record<AlphaAction, Notice> = {
  bell: { zh:'摇铜铃',en:'Ring the bronze bell' }, sand: { zh:'让小球走一遍山路',en:'Trace the mountain path' },
  tree: { zh:'拉动树根钟绳',en:'Pull the tree rope' }, wind: { zh:'扳动风闸',en:'Turn the wind gate' },
  stone: { zh:'添一块石头',en:'Add one stone' }, lantern: { zh:'从灯架取一盏纸灯',en:'Take a paper lantern' },
};
const WIND_LABELS: Notice[] = [
  { zh:'风闸：静风，切换微风',en:'Wind: calm. Set a breeze' },
  { zh:'风闸：微风，切换强风',en:'Wind: breeze. Set a strong wind' },
  { zh:'风闸：强风，恢复静风',en:'Wind: strong. Return to calm' },
];
const WIND_NOTICES: Notice[] = [
  { zh:'风闸合上了，山口恢复平静。',en:'The gate is closed. The mountain pass is calm again.' },
  { zh:'微风吹起来了，看看旁边的旗面。',en:'A breeze is blowing. Watch the flags beside the gate.' },
  { zh:'强风吹起来了，旗面鼓起，路牌开始翻滚。',en:'The wind is strong. The flags billow and the sign starts tumbling.' },
];

export function alphaActionTarget(kind: AlphaAction, wind = 0, stones = 0): Vec3 {
  if(kind==='stone')return [...alphaPersonalStone(stones).grab];
  if(kind!=='wind')return [...TARGETS[kind]];
  const a=wind*.7;return [16.8+.6*Math.cos(a)+.4*Math.sin(a),ALPHA_WIND_GATE_Y+1.05,-44-.6*Math.sin(a)+.4*Math.cos(a)];
}
/** The placement arc ends at the grip on the stone's actual resting hull. */
export function alphaStonePlacementTarget(stones: number, progress: number): Vec3 {
  const {position,grab,arcHeight,gripLift}=alphaPersonalStone(stones);
  const f=Math.max(0,Math.min(1,progress));
  return [grab[0]+(position[0]-grab[0])*f,
    grab[1]+(position[1]+gripLift-grab[1])*f+Math.sin(Math.PI*f)*arcHeight,
    grab[2]+(position[2]-grab[2])*f];
}
/** Conservative height-dependent G24 staging envelope. The wider discovery radius never
 * starts an action. Once staged, the accepted action owns success; IK only poses the hand. */
export function alphaHandReach(position: readonly number[], target: readonly number[], grounded: boolean) {
  if(!grounded||![...position,...target].every(Number.isFinite))return false;
  const height=target[1]-(position[1]-PLAYER_HALF_HEIGHT-PLAYER_RADIUS);
  if(height<.82||height>1.4)return false;
  const distance=Math.hypot(position[0]-target[0],position[2]-target[2]);
  const reach=height<=1.16?.6:height<=1.22?.55:.55-(height-1.22)*(.25/.18);
  return distance<=reach;
}
export const alphaActionCanReach = (kind: 'wind'|'lantern', position: readonly number[], grounded: boolean, wind = 0) =>
  alphaHandReach(position,alphaWorld(alphaActionTarget(kind,wind)),grounded);
/** Authored front-side operating areas, then validated against the current physical floor. */
export function alphaPickupApproach(kind: 'wind'|'lantern'|'stone', wind = 0, stones = 0): PickupApproach {
  const target = alphaWorld(alphaActionTarget(kind, wind, stones));
  const stoneStand = kind==='stone'?alphaWorld(alphaPersonalStone(stones).stand):null;
  return {
    target: () => target,
    ready: position => stoneStand
      ? Math.hypot(position[0]-stoneStand[0],position[2]-stoneStand[2])<=ALPHA_CAIRN_STANCE_RADIUS
        && Math.abs(position[1]-PLAYER_HALF_HEIGHT-PLAYER_RADIUS-stoneStand[1])<.12
      : kind!=='stone'&&alphaActionCanReach(kind, position, true, wind),
    candidates: from => stoneStand ? [[stoneStand[0],from[1],stoneStand[2]]]
      : kind === 'lantern' ? [0,.1,-.1].map(dx=>[target[0]+dx,from[1],target[2]-.53] as Vec3)
        : [0,.1,-.1].flatMap(dz=>[.5,.44,.56].map(dx=>[target[0]+dx,from[1],target[2]+dz] as Vec3)),
  };
}
export const alphaActionLabel = (kind: AlphaAction, wind = 0): Notice =>
  kind==='wind'?WIND_LABELS[wind]:LABELS[kind];
export function alphaActionNotice(kind: AlphaAction, wind = 0): Notice {
  if(kind==='wind')return WIND_NOTICES[wind];
  return {
    bell:{zh:'铜铃响了，山路的灯逐盏亮起。',en:'The bell rings. Lamps light up along the trail.'},
    sand:{zh:'小球出发了，沿沙盘上的山路走一遍。',en:'The little ball is following the mountain path on the table.'},
    tree:{zh:'树根的光沿枝干向上流，抬头看看树冠。',en:'Light travels from the roots up the branches. Look toward the crown.'},
    stone:{zh:'这一块放稳了。',en:'The stone is settled in place.'},
    lantern:{zh:'纸灯拿稳了。可以带着走，按 E 放飞。',en:'The lantern is secure. Carry it with you, then press E to release it.'},
  }[kind];
}
export function alphaMeasuredHandError(palm: readonly number[] | null, target: readonly number[] | null, owner: string | null) {
  return owner==='alpha-island'&&palm&&target&&[...palm,...target].every(Number.isFinite)
    ?Math.hypot(palm[0]-target[0],palm[1]-target[1],palm[2]-target[2]):Infinity;
}
export function alphaLanternCarryTarget(position: readonly number[], yaw: number): Vec3 {
  return [position[0]+Math.cos(yaw)*.43+Math.sin(yaw)*.24,position[1]+.34,
    position[2]-Math.sin(yaw)*.43+Math.cos(yaw)*.24];
}
/** A live getter survives carrying without React rerenders; callers supply fresh hand/state guards. */
export function alphaLanternReleaseInteraction(readPosition:()=>readonly number[], canRelease:()=>boolean, release:()=>void): Interactable {
  return {id:'alpha-lantern-release',get position(){return [...readPosition()] as Vec3;},radius:1.5,kind:'exhibit',
    label:{zh:'放飞纸灯',en:'Release the paper lantern'},enabled:canRelease,onInteract:()=>{if(canRelease())release();}};
}
