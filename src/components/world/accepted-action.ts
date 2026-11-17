import type { Vec3 } from './types';

/** Created only after interaction eligibility/approach succeeds. Animation output is not an
 * authorization signal. The caller owns physical eligibility and must cancel on interruption. */
export interface AcceptedAction {
  elapsed: number;
  duration: number;
  status: 'running' | 'committed' | 'cancelled';
}
export function acceptAction(duration = .36): AcceptedAction {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Action duration must be positive');
  return { elapsed: 0, duration, status: 'running' };
}
/** Returns true on exactly one commit edge. Invalid time never advances a transaction. */
export function advanceAcceptedAction(action: AcceptedAction, dt: number, eligible: boolean): boolean {
  if (action.status !== 'running') return false;
  if (!eligible) { action.status = 'cancelled'; return false; }
  if (!Number.isFinite(dt) || dt <= 0) return false;
  action.elapsed = Math.min(action.duration, action.elapsed + Math.min(.08, dt));
  if (action.elapsed + 1e-9 < action.duration) return false;
  action.status = 'committed';
  return true;
}
export function cancelAcceptedAction(action: AcceptedAction | null) {
  if (action?.status === 'running') action.status = 'cancelled';
}
/** A missing animation sample must not hide a logically held prop or extinguish its light. */
export function heldPropPoint(palm: Vec3 | null, socket: Vec3): Vec3 {
  return palm?.every(Number.isFinite) ? palm : socket;
}
