import { Vector3 } from 'three';
import { INTENT_COASTER } from './attraction-layout.ts';
import type { AttractionRidePose } from './attraction-ride.ts';
import type { Vec3 } from '../types';
import { THRILL_POINTS, THRILL_ELEMENTS, THRILL_DROP_END, THRILL_LENGTH, THRILL_TUNNEL_START_INDEX, thrillCurve, thrillControlU } from './coaster-thrill-layout.ts';
import { thrillFrame, thrillRidePose } from './coaster-thrill-frame.ts';
import { THRILL_DURATION, thrillDistanceAt } from './coaster-thrill-motion.ts';
export { thrillSupports as coasterSupports } from './coaster-thrill-supports.ts';

/** The production station and all actor/collision consumers share the approved v4 route. */
export const COASTER_DURATION = THRILL_DURATION;
export const COASTER_DISPLAY_SECONDS = Math.ceil(THRILL_DURATION);
export type CoasterView = 'chase' | 'first-person' | 'comfort';
export const coasterWorld = ([x,y,z]:Vec3):Vec3 => [x+INTENT_COASTER.center[0],y+INTENT_COASTER.center[1],z+INTENT_COASTER.center[2]];
export const COASTER_GATE_Z = 56;
export const COASTER_EXIT = coasterWorld([-4.2,.08,43]);
export const COASTER_BOARD = coasterWorld([-2.8,.65,43]);
export const COASTER_CANOPY_BOUNDS = {min:coasterWorld([-11,6.2,30]),max:coasterWorld([7,7.4,53])};
export const COASTER_POINTS = THRILL_POINTS;
export const coasterCurve = thrillCurve;
export const COASTER_LENGTH = THRILL_LENGTH;
export const coasterControlU = thrillControlU;
export const coasterDistanceAt = thrillDistanceAt;
export const COASTER_TUNNEL = {start:thrillControlU(THRILL_TUNNEL_START_INDEX),end:thrillControlU(THRILL_TUNNEL_START_INDEX+3),height:4.5,halfWidth:3};
const giant=THRILL_ELEMENTS[0];
export const COASTER_INVERSION = {start:giant.start,end:giant.end,top:giant.peaks[0]};
export function coasterFrame(u:number,_banking=true) {
  const f=thrillFrame(u);
  return {...f,bank:0,yaw:Math.atan2(-f.forward.z,f.forward.x)};
}
export function coasterPhase(seconds:number) {
  if(seconds<3)return 'station';if(seconds<27)return 'lift';if(seconds<29)return 'crest';
  const u=coasterDistanceAt(seconds);
  if(u<THRILL_DROP_END)return 'drop';if(u<giant.start)return 'low';
  const element=THRILL_ELEMENTS.find(e=>u>=e.start&&u<=e.end);
  if(element)return element.id==='stall'?'stall':element.id==='double-corkscrew'?'corkscrew':element.id==='water-roll'?'water-roll':'inversion';
  if(u>=COASTER_TUNNEL.start)return u<=COASTER_TUNNEL.end?'tunnel':'return';
  return 'bank';
}
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(t*(t*6-15)+10);};
export function coasterRidePose(u:number,view:CoasterView):AttractionRidePose & {orientation:[number,number,number,number];cameraUp:Vec3} {
  const pose=thrillRidePose(u,view==='first-person') as AttractionRidePose & {orientation:[number,number,number,number];cameraUp:Vec3};
  if(view==='first-person')return pose;
  // Blend inside the retained return corridor without changing the player's look input.
  const distance=((u%1)+1)%1*COASTER_LENGTH;
  const tunnel=smooth((distance-COASTER_TUNNEL.start*COASTER_LENGTH+24)/14)
    *(1-smooth((distance-COASTER_TUNNEL.end*COASTER_LENGTH-10)/12));
  if(tunnel>0){
    const near=coasterFrame(u-3.2/COASTER_LENGTH),ahead=coasterFrame(u+1.6/COASTER_LENGTH);
    pose.cameraPosition=new Vector3(...pose.cameraPosition).lerp(near.point.addScaledVector(near.up,2.9),tunnel).toArray() as Vec3;
    pose.cameraTarget=new Vector3(...pose.cameraTarget).lerp(ahead.point.addScaledVector(ahead.up,1.9),tunnel).toArray() as Vec3;
  }
  if(view==='comfort')pose.fov=52;
  return pose;
}
export interface CoasterClock {elapsed:number;riding:boolean;revision:number}
export function advanceCoaster(clock:CoasterClock,dt:number,enabled:boolean,paused:boolean,hidden:boolean,bridgeActive:boolean,bridgeRevision:number):CoasterClock {
  if(!clock.riding)return clock;
  if(!enabled||!bridgeActive||clock.revision!==bridgeRevision)return {...clock,riding:false,elapsed:0};
  if(paused||hidden||!Number.isFinite(dt)||dt<=0||dt>.25)return clock;
  const elapsed=Math.min(COASTER_DURATION,clock.elapsed+dt);
  return {...clock,elapsed,riding:elapsed<COASTER_DURATION};
}
