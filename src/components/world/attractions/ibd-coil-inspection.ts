import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import type { Vec3 } from '../types.ts';
import type { IbdInspectionAnchor } from './ibd-inspection-motion.ts';
import type { IbdAction, IbdYardGame } from './ibd-yard-game.ts';
import { ibdCargoPose } from './ibd-yard-motion.ts';
import { ibdWorld } from './ibd-yard-layout.ts';

export const isIbdCoilCheck = (action?: IbdAction) => !!action?.slot?.startsWith('coil')
  && (action.kind==='scan'||action.kind==='rear');

/** Turn in the current clear standing spot. Never slide through a cradle or gallery guard. */
export function ibdCoilInspectAnchor(game:IbdYardGame,action:IbdAction,position:Vec3):IbdInspectionAnchor {
  const pose=ibdCargoPose(game,action.slot!);
  // The turned rear's recessed area is at (+.72,+.82) on the now-exposed +z face.
  const focus=ibdWorld([pose.at[0]+.72,pose.at[1]+.82,pose.at[2]+1.39]);
  const stand:Vec3=[position[0],position[1]-PLAYER_CENTER_HEIGHT,position[2]];
  const yaw=Math.atan2(-(focus[2]-stand[2]),focus[0]-stand[0]);
  const toWorld=(x:number,y:number,z:number):Vec3=>[
    stand[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,stand[1]+y,stand[2]-Math.sin(yaw)*x+Math.cos(yaw)*z];
  return {stand,yaw,leftTarget:toWorld(.32,1.04,-.1),rightTarget:toWorld(.42,1.05,.16),focus};
}

/** One broad pass over the rolled face, finishing at the rear defect's real location.
 * The footprint stays on the steel annulus rather than tracing decorative concentric circles. */
export function ibdCoilBeamFocus(focus:Vec3,elapsed:number):Vec3 {
  const u=Math.max(0,Math.min(1,(elapsed-.6)/1.9));
  return [focus[0]-1.44*(1-u),focus[1]+.45*Math.sin(Math.PI*u),focus[2]];
}
