import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import type { Vec3 } from './types.ts';

export type ExchangeActionKind = 'pickup' | 'insert' | 'adjust' | 'seal' | 'ring' | 'collect';
export type ExchangeCarried = 'ticket' | 'receipt' | null;
export interface ExchangeAnchor { stand: Vec3; yaw: number; target: Vec3 }
export interface ExchangeBodyAction {
  id: number; kind: ExchangeActionKind; phase: 'approach' | 'perform'; elapsed: number;
  duration: number; contactAt: number; anchor: ExchangeAnchor; committed: boolean; contactWait: number;
}
export interface ExchangeVisualSockets {
  valid: boolean; contactError: number; sampledId: number | null; sampledElapsed: number;
  rightHand: Vec3; leftHand: Vec3;
}
export const exchangeActor = { position: [0, 0, 0] as Vec3, yaw: 0, grounded: false, available: false };
export const exchangeVisualSockets: ExchangeVisualSockets = {
  valid: false, contactError: Infinity, sampledId: null, sampledElapsed: 0, rightHand: [0,0,0], leftHand: [0,0,0],
};
export const exchangeBody = { action: null as ExchangeBodyAction | null, carried: null as ExchangeCarried };
export const EXCHANGE_APPROACH_TIMEOUT = 2;
export const EXCHANGE_CONTACT_TOLERANCE = .1;
export const EXCHANGE_STAND_TOLERANCE = .07;
export const EXCHANGE_YAW_TOLERANCE = .12;
const TIMING: Record<ExchangeActionKind, [number, number]> = {
  pickup: [1.05, .52], insert: [1.15, .58], adjust: [1.2, .62], seal: [.9, .42], ring: [1.1, .5], collect: [1.05, .52],
};
let sequence = 0;
let callbacks: { id: number; contact: () => boolean | void; cancel?: () => void } | null = null;
const pointValid = (point: Vec3) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function standDistance(anchor: ExchangeAnchor) {
  return Math.hypot(exchangeActor.position[0] - anchor.stand[0], exchangeActor.position[2] - anchor.stand[2]);
}
function standHeight(anchor: ExchangeAnchor) { return Math.abs(exchangeActor.position[1] - PLAYER_CENTER_HEIGHT - anchor.stand[1]); }
function clearSample() {
  exchangeVisualSockets.valid = false; exchangeVisualSockets.sampledId = null; exchangeVisualSockets.contactError = Infinity;
}

export const exchangeBodyBusy = () => exchangeBody.action !== null;

/** A request only reserves an action. The physics controller owns actual walking and heading. */
export function beginExchangeBodyAction(kind: ExchangeActionKind, anchor: ExchangeAnchor,
  onContact: () => boolean | void, onCancel?: () => void): boolean {
  if (exchangeBodyBusy() || !exchangeActor.available || !exchangeActor.grounded || !pointValid(exchangeActor.position)
    || !Number.isFinite(exchangeActor.yaw) || !anchor || !pointValid(anchor.stand) || !pointValid(anchor.target)
    || !Number.isFinite(anchor.yaw) || !TIMING[kind] || typeof onContact !== 'function'
    || standDistance(anchor) > 1.1 || standHeight(anchor) > .25) return false;
  const [duration, contactAt] = TIMING[kind], id = ++sequence;
  exchangeBody.action = { id, kind, phase: 'approach', elapsed: 0, duration, contactAt,
    anchor: { stand: [...anchor.stand], yaw: anchor.yaw, target: [...anchor.target] }, committed: false, contactWait: 0 };
  callbacks = { id, contact: onContact, cancel: onCancel }; clearSample();
  return true;
}

/** Clearing the action before its callback prevents cancelled contacts from arriving later. */
export function cancelExchangeBodyAction(): void {
  const action = exchangeBody.action;
  if (!action) return;
  const cancel = callbacks?.id === action.id ? callbacks.cancel : undefined;
  exchangeBody.action = null; callbacks = null; clearSample(); cancel?.();
}

/** One fixed physics tick; callers implement pause by not ticking this clock. */
export function advanceExchangeBodyAction(dt: number): void {
  const action = exchangeBody.action;
  if (!action || !Number.isFinite(dt) || dt <= 0) return;
  if (!exchangeActor.available || !exchangeActor.grounded || !pointValid(exchangeActor.position) || !Number.isFinite(exchangeActor.yaw)
    || standHeight(action.anchor) > .25 || standDistance(action.anchor) > 1.1) { cancelExchangeBodyAction(); return; }
  const step = Math.min(dt, .05);
  const aligned = standDistance(action.anchor) <= EXCHANGE_STAND_TOLERANCE
    && Math.abs(angleDelta(exchangeActor.yaw, action.anchor.yaw)) <= EXCHANGE_YAW_TOLERANCE;
  if (action.phase === 'approach') {
    action.elapsed += step;
    if (aligned) { action.phase = 'perform'; action.elapsed = 0; clearSample(); }
    else if (action.elapsed >= EXCHANGE_APPROACH_TIMEOUT) cancelExchangeBodyAction();
    return;
  }
  if (!aligned) { cancelExchangeBodyAction(); return; }
  if (!action.committed) {
    action.elapsed = Math.min(action.contactAt, action.elapsed + step);
    if (action.elapsed < action.contactAt) return;
    const sockets = exchangeVisualSockets;
    const sampled = sockets.valid && sockets.sampledId === action.id
      && Number.isFinite(sockets.sampledElapsed) && Math.abs(sockets.sampledElapsed - action.contactAt) < 1e-5
      && Number.isFinite(sockets.contactError) && sockets.contactError >= 0 && sockets.contactError <= EXCHANGE_CONTACT_TOLERANCE;
    if (!sampled) {
      action.contactWait += step;
      if (action.contactWait >= .45) cancelExchangeBodyAction();
      return;
    }
    // Mark before invoking user code: a thrown callback is visible and is never retried.
    action.committed = true;
    const accepted = callbacks?.id === action.id ? callbacks.contact() : false;
    if (accepted === false) { if (exchangeBody.action === action) cancelExchangeBodyAction(); return; }
    if (exchangeBody.action !== action) return;
    if (action.kind === 'pickup') exchangeBody.carried = 'ticket';
    else if (action.kind === 'insert') exchangeBody.carried = null;
    else if (action.kind === 'collect') exchangeBody.carried = 'receipt';
    return;
  }
  action.elapsed = Math.min(action.duration, action.elapsed + step);
  if (action.elapsed >= action.duration) { exchangeBody.action = null; callbacks = null; clearSample(); }
}
