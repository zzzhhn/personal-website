import type { DrivingState } from './vehicle-driving';

/** Ordinary runtime interface for the integrated HUD. Values are sampled at physics frequency;
 * HUD consumers reuse the actor's ~10 Hz position publication, without a second timer. */
export type DrivingTelemetry = Pick<DrivingState, 'nitro'|'boosting'|'boostLock'|'rechargeDelay'|'handbrake'|'braking'|'slipAngle'|'contacts'|'speed'|'power'> & { id:'coupe' };
let current:DrivingTelemetry|null=null;
export function readDrivingTelemetry():DrivingTelemetry|null { return current; }
export function publishDrivingTelemetry(state:DrivingState|null) {
  current=state?{id:'coupe',nitro:state.nitro,boosting:state.boosting,boostLock:state.boostLock,rechargeDelay:state.rechargeDelay,handbrake:state.handbrake,
    braking:state.braking,slipAngle:state.slipAngle,contacts:state.contacts,speed:state.speed,power:state.power}:null;
}
