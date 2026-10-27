import { IBD_CARGO_HOME, IBD_MOVED_COIL, IBD_TRUCK, type IbdSlot } from './ibd-yard-layout.ts';
import { yardItemId, type IbdYardGame } from './ibd-yard-game.ts';
import type { Vec3 } from '../types';
const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((n, i) => n + (b[i] - n) * smooth(t)) as Vec3;
function route(points: Vec3[], progress: number): Vec3 {
  const segment = Math.min(points.length - 2, Math.floor(Math.max(0, progress) * (points.length - 1)));
  return mix(points[segment], points[segment + 1], progress * (points.length - 1) - segment);
}
export function ibdCargoPose(game: IbdYardGame, slot: IbdSlot, progress = 0) {
  const id = yardItemId(game, slot), loaded = game.core.loaded.includes(id), moved = game.core.moved.includes(id);
  const home = slot === 'coil-front' && moved ? IBD_MOVED_COIL : IBD_CARGO_HOME[slot];
  let at: Vec3 = [...(loaded ? IBD_TRUCK[slot]! : home)];
  let yaw = game.core.turned.includes(id) ? Math.PI : 0, lid = game.core.opened.includes(id) ? -2 : 0;
  const action = game.pending?.action;
  if (action?.kind === 'crane' && slot === 'coil-front') {
    at = route([IBD_CARGO_HOME[slot], [-12, 3.9, -4], [-20, 3.9, -4], IBD_MOVED_COIL], progress);
  }
  if (action?.slot === slot) {
    if (action.kind === 'turn') yaw = Math.PI * smooth(progress);
    if (action.kind === 'open') lid = -2 * smooth(progress);
    if (action.kind === 'weigh') at[1] -= Math.sin(progress * Math.PI) * .06;
    if (action.kind === 'load' || action.kind === 'unload') {
      const truck = IBD_TRUCK[slot]!, p = action.kind === 'unload' ? 1 - progress : progress;
      const lane = slot === 'parts-b' ? 6 : 10.5;
      at = route([home, [home[0], 1.1, -2], [home[0], 1.1, 2], [lane, 1.1, 2], [lane, 1.1, truck[2]], [10.5, 1.1, truck[2]], [14, 2, truck[2]], truck], p);
      lid = game.core.opened.includes(id) ? -2 * (1 - smooth(p * 4)) : 0;
    }
    if (action.kind === 'replace') {
      const coil = slot.startsWith('coil');
      const quarantine: Vec3 = coil ? [-17, 2.35, 12] : [14, 1.1, -16.3];
      const spare: Vec3 = coil ? [-22, 2.35, 12] : [20, 1.1, -16.3];
      // Leave either coil parking bay southward before turning; a diagonal from the moved bay clips the lane guard.
      const outgoing: Vec3[] = coil ? [home, [home[0], home[1], 1], [-17, home[1], 1], quarantine]
        : [home, [home[0], home[1], -15.1], quarantine];
      const incoming: Vec3[] = coil ? [spare, [-22, home[1], 8], [-17, home[1], 1], [home[0], home[1], 1], home]
        : [spare, [home[0], home[1], -15.1], home];
      at = progress < .5 ? route(outgoing, progress * 2) : route(incoming, (progress - .5) * 2);
      if (progress >= .5) { yaw = 0; lid = 0; }
    }
  }
  // Once loaded, the lid is closed; evidence remains attached to the physical item ID.
  if (loaded && action?.kind !== 'unload') lid = 0;
  return { at, yaw, lid };
}

/** Delta-clamped local clocks never replay time spent hidden or paused. */
export function advanceIbdMotion(elapsed: number, delta: number, seconds: number, running: boolean): number {
  return running ? Math.min(seconds, elapsed + Math.max(0, Math.min(delta, .05))) : elapsed;
}
