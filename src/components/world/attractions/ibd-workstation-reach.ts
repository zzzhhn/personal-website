import { PLAYER_CENTER_HEIGHT } from '../actor-physics';
import { canReachActivityStand } from '../activity-ground-route';
import type { Vec3 } from '../types';
import { ibdInspectionActor, IBD_INSPECTION_STAND_TOLERANCE } from './ibd-inspection-motion';
import { IBD_PACK_INSPECTION } from './ibd-pack-layout';
import { ibdLocal, ibdPackHome, ibdReach, ibdStation, ibdWorld, type IbdPackStation } from './ibd-yard-layout';

export const CRANE_STAND: Vec3 = [-6,.1,.97];
type Workstation = IbdPackStation | 'crane';

function localStance(id: Workstation): Vec3 {
  if (id === 'crane') return CRANE_STAND;
  const home = ibdPackHome(id);
  return IBD_PACK_INSPECTION.stand.map((v,i) => v+home[i]) as Vec3;
}

export function ibdWorkstationStance(id: Workstation) {
  const station = ibdStation(id);
  const local = localStance(id);
  // The prompt is centred on the station marker; the hands may need a slightly offset stance.
  const offset = Math.hypot(local[0]-station.at[0],local[2]-station.at[2]);
  return {stand:ibdWorld(local), radius:station.radius+offset};
}

export function canReachIbdWorkstation(id: Workstation, fresh=false) {
  const {position,available,grounded,groundRoute} = ibdInspectionActor;
  if (!available || !grounded || !ibdReach(ibdLocal(position),ibdStation(id))) return false;
  const {stand,radius} = ibdWorkstationStance(id);
  const centerY = stand[1]+PLAYER_CENTER_HEIGHT;
  if (Math.abs(position[1]-centerY) > .25) return false;
  return canReachActivityStand(position,stand,radius,IBD_INSPECTION_STAND_TOLERANCE*.5,groundRoute,fresh);
}
