import { IBD_CARGO_HOME, IBD_MOVED_COIL, IBD_TRUCK, ibdStockRoute, isIbdStockKey, type IbdSlot } from './ibd-yard-layout.ts';
import { yardItemId, type IbdYardGame } from './ibd-yard-game.ts';
import { ibdStockItem } from './ibd-stock.ts';
import type { Vec3 } from '../types';
const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((n, i) => n + (b[i] - n) * smooth(t)) as Vec3;
function route(points: Vec3[], progress: number): Vec3 {
  const segment = Math.min(points.length - 2, Math.floor(Math.max(0, progress) * (points.length - 1)));
  return mix(points[segment], points[segment + 1], progress * (points.length - 1) - segment);
}
export interface IbdCargoRoute { start: number; end: number; points: Vec3[] }
/** One source for animation and safety sweeps. Replacement is two distinct physical cargo journeys. */
export function ibdCargoRoutes(game: IbdYardGame, slot: IbdSlot): IbdCargoRoute[] {
  const action = game.pending?.action, id = yardItemId(game, slot);
  const home = slot === 'coil-front' && game.core.moved.includes(id) ? IBD_MOVED_COIL : IBD_CARGO_HOME[slot];
  if (action?.kind === 'crane' && slot === 'coil-front') return [{ start: 0, end: 1,
    points: [IBD_CARGO_HOME[slot], [-12, 3.9, -4], [-20, 3.9, -4], IBD_MOVED_COIL] }];
  if (action?.slot !== slot) return [];
  if(slot==='parts-b'&&action.kind==='select-stock'&&isIbdStockKey(action.station))
    return [{start:.16,end:1,points:ibdStockRoute(action.station)}];
  if(slot==='parts-b'&&action.kind==='return-stock'&&game.stock.assigned)
    return [{start:.16,end:1,points:ibdStockRoute(game.stock.assigned).reverse()}];
  if (action.kind === 'load' || action.kind === 'unload') {
    const truck = IBD_TRUCK[slot]!, lane = slot === 'parts-b' ? 6 : 10.5;
    const points: Vec3[] = [home, [home[0], 1.1, -2], [home[0], 1.1, 2], [lane, 1.1, 2], [lane, 1.1, truck[2]], [10.5, 1.1, truck[2]], [14, truck[1], truck[2]], truck];
    return [{ start: 0, end: 1, points: action.kind === 'unload' ? points.reverse() : points }];
  }
  if (action.kind === 'replace') {
    const coil = slot.startsWith('coil');
    const quarantine: Vec3 = coil ? [-17, 2.35, 12] : [14, 1.1, -16.3];
    const spare: Vec3 = coil ? [-22, 2.35, 12] : [20, 1.1, -16.3];
    if(slot==='parts-b')return [{start:.16,end:1,points:[home,[home[0],home[1],-15.1],quarantine]}];
    return [{ start: 0, end: .5, points: coil ? [home, [home[0], home[1], 1], [-17, home[1], 1], quarantine]
      : [home, [home[0], home[1], -15.1], quarantine] },
    { start: .5, end: 1, points: coil ? [spare, [-22, home[1], 8], [-17, home[1], 1], [home[0], home[1], 1], home]
      : [spare, [home[0], home[1], -15.1], home] }];
  }
  return [];
}
export function ibdCargoPose(game: IbdYardGame, slot: IbdSlot, progress = 0) {
  const id = yardItemId(game, slot), loaded = game.core.loaded.includes(id), moved = game.core.moved.includes(id);
  const home = slot === 'coil-front' && moved ? IBD_MOVED_COIL : IBD_CARGO_HOME[slot];
  let at: Vec3 = [...(loaded ? IBD_TRUCK[slot]! : home)];
  let yaw = game.core.turned.includes(id) ? Math.PI : 0, lid = game.core.opened.includes(id) ? -2 : 0;
  const action = game.pending?.action;
  const routes = ibdCargoRoutes(game, slot), leg = routes.find(r => progress < r.end) ?? routes.at(-1);
  if (leg) at = route(leg.points, (progress - leg.start) / (leg.end - leg.start));
  if (action?.slot === slot) {
    if (action.kind === 'turn') yaw = Math.PI * smooth(progress);
    if (action.kind === 'open') lid = -2 * smooth(progress);
    if (action.kind === 'weigh') at[1] -= Math.sin(progress * Math.PI) * .06;
    if (action.kind === 'load' || action.kind === 'unload') {
      const p = action.kind === 'unload' ? 1 - progress : progress;
      lid = game.core.opened.includes(id) ? -2 * (1 - smooth(p * 4)) : 0;
    }
    if (action.kind === 'replace') {
      if (progress >= .5) { yaw = 0; lid = 0; }
    }
    if(action.kind==='select-stock'||action.kind==='return-stock'||(action.kind==='replace'&&slot==='parts-b')){
      const sourceId=action.kind==='select-stock'&&isIbdStockKey(action.station)
        ?ibdStockItem(game.round,game.caseIndex,action.station).id:id;
      lid=game.core.opened.includes(sourceId)?-2*(1-smooth(progress/.16)):0;
    }
  }
  // Once loaded, the lid is closed; evidence remains attached to the physical item ID.
  if (loaded && action?.kind !== 'unload') lid = 0;
  return { at, yaw, lid };
}

/** Original stays in quarantine while a separate incoming body follows the second leg. */
export function ibdPhysicalCargoPose(game: IbdYardGame, slot: IbdSlot, progress: number, incoming = false) {
  if(slot==='parts-b')return ibdCargoPose(game,slot,progress);
  if (game.pending?.action.kind !== 'replace' || game.pending.action.slot !== slot) return ibdCargoPose(game, slot, progress);
  const legs = ibdCargoRoutes(game, slot), p = ibdCargoPose(game, slot, incoming ? 1 : 0);
  return { ...p, at: route(legs[incoming ? 1 : 0].points, incoming ? Math.max(0, (progress - .5) * 2) : Math.min(1, progress * 2)) };
}
export function ibdMotionStops(game: IbdYardGame): number[] {
  const action = game.pending?.action;
  if (!action) return [0, 1];
  if (action.kind === 'turn') return Array.from({ length: 19 }, (_, i) => i / 18);
  if (action.kind === 'weigh') return [0, .5, 1];
  const slot = action.kind === 'crane' ? 'coil-front' : action.slot;
  const routes = slot ? ibdCargoRoutes(game, slot) : [];
  return [...new Set([0, 1, ...routes.flatMap(r => r.points.map((_, i) => r.start + (r.end - r.start) * i / (r.points.length - 1)))])].sort((a,b) => a-b);
}

/** Delta-clamped local clocks never replay time spent hidden or paused. */
export function advanceIbdMotion(elapsed: number, delta: number, seconds: number, running: boolean): number {
  return running ? Math.min(seconds, elapsed + Math.max(0, Math.min(delta, .05))) : elapsed;
}
