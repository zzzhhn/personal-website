import type * as Rapier from '@dimforge/rapier3d-compat';
import { IBD_YARD } from './attraction-layout.ts';
import { ibdMotionStops, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import type { IbdYardGame } from './ibd-yard-game.ts';
import type { Vec3 } from '../types';

export type IbdMotionWait = 'path-occupied' | 'player-unavailable' | null;
export const IBD_SAFETY_GAP = .18;
export interface IbdSafetyPlayer { shape: Rapier.Shape; position: Rapier.Vector; rotation: Rapier.Rotation; velocity: Rapier.Vector }
const protectedKinds = new Set(['load', 'unload', 'replace', 'select-stock', 'return-stock', 'crane', 'turn', 'weigh', 'release']);
const zero = { x: 0, y: 0, z: 0 };

/** Per-operation pair queries only. No world traversal, position-store sampling or player mutation. */
export function createIbdSafety(rapier: Pick<typeof Rapier, 'Cuboid'>, game: IbdYardGame) {
  const action = game.pending?.action, stops = ibdMotionStops(game);
  const protectedMotion = !!action && protectedKinds.has(action.kind);
  const slot = action?.kind === 'crane' ? 'coil-front' : action?.slot;
  const coil = slot?.startsWith('coil'), gate = action?.kind === 'release';
  const half: Vec3 = gate ? [.065, 1.5, 4.4] : coil ? [2, 2, 1.4] : [1.4, .55, 1.3];
  const shape = new rapier.Cuboid(...half), radius = Math.hypot(half[0], half[2]);
  const from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: 0, z: 0 }, velocity = { ...zero }, playerAt = { ...zero }, playerVelocity = { ...zero };
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  const pose = (progress: number, incoming: boolean) => gate ? { at: [7, 1.65 + 3.7 * progress, 19.3] as Vec3, yaw: Math.PI / 2 }
    : ibdPhysicalCargoPose(game, slot!, progress, incoming);
  function segmentBlocked(a: number, b: number, player: IbdSafetyPlayer, predictSeconds: number, incoming: boolean) {
    const p = pose(a, incoming), q = pose(b, incoming), offset = gate || coil ? 0 : .45;
    from.x = p.at[0]; from.y = p.at[1] + offset; from.z = p.at[2];
    to.x = q.at[0]; to.y = q.at[1] + offset; to.z = q.at[2];
    velocity.x = to.x - from.x; velocity.y = to.y - from.y; velocity.z = to.z - from.z;
    rotation.y = Math.sin(p.yaw / 2); rotation.w = Math.cos(p.yaw / 2);
    // Linear shape casts do not rotate: this bound contains every intermediate rotated corner.
    const angularPadding = radius * Math.abs(q.yaw - p.yaw);
    shape.halfExtents.x = half[0] + angularPadding; shape.halfExtents.y = half[1]; shape.halfExtents.z = half[2] + angularPadding;
    playerAt.x = player.position.x - IBD_YARD.center[0]; playerAt.y = player.position.y - IBD_YARD.center[1]; playerAt.z = player.position.z - IBD_YARD.center[2];
    playerVelocity.x = player.velocity.x * predictSeconds; playerVelocity.y = player.velocity.y * predictSeconds; playerVelocity.z = player.velocity.z * predictSeconds;
    return !!shape.contactShape(from, rotation, player.shape, playerAt, player.rotation, IBD_SAFETY_GAP)
      || !!shape.castShape(from, rotation, velocity, player.shape, playerAt, player.rotation, playerVelocity, IBD_SAFETY_GAP, 1, true);
  }
  function blocked(a: number, b: number, player: IbdSafetyPlayer, predictSeconds = 0) {
    if (!protectedMotion) return false;
    let start = a;
    for (const stop of stops) {
      if (stop <= start + 1e-9) continue;
      const end = Math.min(stop, b);
      if (segmentBlocked(start, end, player, predictSeconds, false)) return true;
      if (action?.kind === 'replace' && slot!=='parts-b' && segmentBlocked(start, end, player, predictSeconds, true)) return true;
      if (end >= b - 1e-9) break;
      start = end;
    }
    return false;
  }
  return { protectedMotion, blocked, stops };
}

export function createIbdMotionClock() { return { elapsed: 0, started: false, retry: 0, waiting: false }; }
/** Freeze elapsed time on occupied paths. Never accumulate blocked wall-clock time or cross a route corner. */
export function stepIbdSafeMotion(clock: ReturnType<typeof createIbdMotionClock>, seconds: number, dt: number,
  safety: ReturnType<typeof createIbdSafety>, player: IbdSafetyPlayer | null, running: boolean, playerDisabled = false) {
  if (!running) return { progress: clock.elapsed / seconds, wait: null as IbdMotionWait, done: false };
  if (safety.protectedMotion && !player && !playerDisabled) return { progress: clock.elapsed / seconds, wait: 'player-unavailable' as IbdMotionWait, done: false };
  const delta = Math.max(0, Math.min(dt, .05)), progress = clock.elapsed / seconds;
  if (clock.waiting && (clock.retry -= delta) > 0) return { progress, wait: 'path-occupied' as IbdMotionWait, done: false };
  const nextStop = safety.stops.find(s => s > progress + 1e-9) ?? 1;
  const next = Math.min(1, nextStop, (clock.elapsed + delta) / seconds);
  const occupied = player && (clock.started ? safety.blocked(progress, next, player, delta * 2) : safety.blocked(progress, 1, player));
  if (occupied) { clock.waiting = true; clock.retry = .1; return { progress, wait: 'path-occupied' as IbdMotionWait, done: false }; }
  clock.waiting = false; clock.started = true; clock.elapsed = next * seconds;
  return { progress: next, wait: null as IbdMotionWait, done: next >= 1 };
}
