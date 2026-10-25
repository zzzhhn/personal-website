import type { DrivingTelemetry } from './vehicle-telemetry';

/** Display thresholds interpret measured motion only; they never feed the handling model. */
export function drivingReadout(state: DrivingTelemetry) {
  const slipDegrees = Math.abs(state.slipAngle) * 180 / Math.PI;
  return {
    slipDegrees: Math.round(slipDegrees),
    drifting: state.contacts >= 2 && Math.abs(state.speed) > 3 && slipDegrees >= 8,
    nitroPercent: Math.round(Math.max(0, Math.min(1, state.nitro)) * 100),
    boostSeconds: Math.max(0, Math.min(1, state.nitro)) * 3,
    cooldownSeconds: Math.max(0, state.rechargeDelay),
    boostState: state.boosting ? 'boosting' : state.boostLock ? 'locked'
      : state.rechargeDelay > 0 ? 'cooldown' : state.nitro >= .999 ? 'ready' : 'partial',
  } as const;
}
