import type { RegionPassage } from '../region-passage';
import { passageRoute } from '../region-passage';
import { PLAYER_RADIUS } from '../actor-physics';
import type { Vec3 } from '../types';
import { rideSegmentReady } from '../rides/ride-passage';
import { COASTER_CAR_PANELS } from './coaster-access';
import { advanceCoaster, coasterDistanceAt, coasterFrame, COASTER_LENGTH, COASTER_DURATION, type CoasterClock } from './coaster-track';
import { COASTER_BOARDING, finishSkippedCoasterTravel, returnCoasterToStation, type CoasterTransition } from './coaster-transition';

// A rotation-independent envelope includes each carriage and its seated rider.
const radius=Math.max(2.5,...COASTER_CAR_PANELS.map(p=>Math.hypot(...p.at.map((v,i)=>Math.abs(v)+p.size[i]/2))));
export function coasterTravelReady(passage:RegionPassage|null,from:number,to:number):boolean {
  if(!passage)return false;
  return [0,1,2].every(car=>rideSegmentReady(passage,
    u=>coasterFrame(u-car*3.55/COASTER_LENGTH).point.toArray() as Vec3,from,to,COASTER_LENGTH,radius));
}
export function coasterStationReady(passage:RegionPassage|null):boolean {
  return !!passage&&coasterTravelReady(passage,0,0)
    &&passageRoute(passage,[COASTER_BOARDING.inside,COASTER_BOARDING.approach,COASTER_BOARDING.exit],PLAYER_RADIUS);
}

/** Commit the travel clock only after admission. A denied skip stays queued. */
export function advanceReadyCoaster(clock:CoasterClock,t:CoasterTransition,passage:RegionPassage|null,
  dt:number,enabled:boolean,frozen:boolean,hidden:boolean,active:boolean,revision:number) {
  const next=advanceCoaster(clock,dt,enabled,frozen,hidden,active,revision);
  if(!enabled||!active||clock.revision!==revision)return {clock:next,blocked:false,skipped:false};
  if(!t.captured||t.phase!=='riding'||frozen||hidden||!Number.isFinite(dt)||dt<=0||dt>.25)
    return {clock,blocked:false,skipped:false};
  if(t.skipRequested){
    if(!coasterStationReady(passage))return {clock,blocked:true,skipped:false};
    finishSkippedCoasterTravel(t,dt,false);
    return {clock:{...clock,elapsed:COASTER_DURATION,riding:false},blocked:false,skipped:true};
  }
  if(!coasterTravelReady(passage,coasterDistanceAt(clock.elapsed),coasterDistanceAt(next.elapsed))
    ||next.elapsed>=COASTER_DURATION&&!coasterStationReady(passage))return {clock,blocked:true,skipped:false};
  if(!next.riding&&next.elapsed>=COASTER_DURATION)returnCoasterToStation(t);
  return {clock:next,blocked:false,skipped:false};
}
