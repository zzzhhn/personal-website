import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics';
import { pickupStandingRing, type PickupApproach } from './pickup-approach';
import type { Vec3 } from './types';

/** G24's existing mine crouch reaches .7 m shelf ore and the 1.05 m rack grip.
 * Shelf stances leave room for the solid tray. IK contact remains a visual check, not an action gate. */
export function minePickupApproach(readTarget: () => Vec3, kind: 'ore'|'tools' = 'ore'): PickupApproach {
  return {
    target: readTarget,
    ready: position => {
      const target=readTarget(),height=target[1]-(position[1]-PLAYER_HALF_HEIGHT-PLAYER_RADIUS);
      return [...position,...target].every(Number.isFinite)
        && height >= (kind==='ore'?.5:.85) && height <= (kind==='ore'?1:1.35)
        && Math.hypot(position[0]-target[0],position[2]-target[2]) <= (kind==='ore'?.66:.6);
    },
    candidates: from => pickupStandingRing(readTarget(),from,kind==='ore'?.62:.55),
  };
}
