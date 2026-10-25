import type { DrivingState } from './vehicle-driving';

/** Ordinary runtime interface for the integrated HUD. Values are sampled at physics frequency;
 * consumers should poll at display frequency or ~10 Hz, rather than add React state to every step. */
export type DrivingTelemetry = Pick<DrivingState, 'nitro'|'boosting'|'handbrake'|'braking'|'slipAngle'|'contacts'|'speed'|'power'> & { id:'coupe' };
let current:DrivingTelemetry|null=null;
export function readDrivingTelemetry():DrivingTelemetry|null { return current; }
export function publishDrivingTelemetry(state:DrivingState|null) {
  current=state?{id:'coupe',nitro:state.nitro,boosting:state.boosting,handbrake:state.handbrake,
    braking:state.braking,slipAngle:state.slipAngle,contacts:state.contacts,speed:state.speed,power:state.power}:null;
}
