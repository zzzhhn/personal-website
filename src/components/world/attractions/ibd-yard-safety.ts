import type * as Rapier from '@dimforge/rapier3d-compat';
import { IBD_YARD } from './attraction-layout.ts';
import { ibdMotionStops, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import type { IbdYardGame } from './ibd-yard-game.ts';
import type { Vec3 } from '../types';
import { ibdDispatchShutterAt, ibdDispatchShutterEnvelope, IBD_DISPATCH_SHUTTER_YAW } from './ibd-dispatch-shutter.ts';
import { IBD_COIL_SUPPORT_Y } from './ibd-hoist-contact.ts';
import { ibdCrateContactBounds } from './ibd-crate-contact-bounds.ts';
import { IBD_CRATE_LID_PIVOT } from './ibd-crate-visual.ts';
import { ibdPackHome, isIbdPackStation } from './ibd-yard-layout.ts';

export type IbdMotionWait = 'path-occupied' | 'player-unavailable' | null;
export const IBD_SAFETY_GAP = .18;
export interface IbdSafetyPlayer { shape: Rapier.Shape; position: Rapier.Vector; rotation: Rapier.Rotation; velocity: Rapier.Vector }
const protectedKinds = new Set(['load', 'unload', 'replace', 'select-stock', 'return-stock', 'crane', 'turn', 'weigh', 'open', 'release']);
const zero = { x: 0, y: 0, z: 0 };

/** Per-operation pair queries only. No world traversal, position-store sampling or player mutation. */
export function createIbdSafety(rapier: Pick<typeof Rapier, 'Cuboid'>, game: IbdYardGame) {
  const action = game.pending?.action, stops = ibdMotionStops(game);
  const protectedMotion = !!action && protectedKinds.has(action.kind);
  const slot = action?.kind === 'crane' ? 'coil-front' : action?.slot;
  const coil = slot?.startsWith('coil'), gate = action?.kind === 'release';
  const shutter = gate ? ibdDispatchShutterEnvelope() : null;
  const crate=protectedMotion&&!coil&&!gate?ibdCrateContactBounds():null;
  const half: Vec3 = shutter?.half ?? crate?.shell.half ?? [2, (2-IBD_COIL_SUPPORT_Y)/2, 1.4];
  const shape = new rapier.Cuboid(...half), radius = Math.hypot(half[0], half[2]);
  const lidShape=crate?new rapier.Cuboid(...crate.lid.half):null;
  const from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: 0, z: 0 }, velocity = { ...zero }, playerAt = { ...zero }, playerVelocity = { ...zero };
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  const pose = (progress:number,incoming:boolean) => {
    if(shutter)return {at:ibdDispatchShutterAt(progress,shutter.center),yaw:IBD_DISPATCH_SHUTTER_YAW,lid:0};
    if(!slot&&action?.kind==='open'&&isIbdPackStation(action.station))
      return {at:ibdPackHome(action.station),yaw:0,lid:-2*progress*progress*(3-2*progress)};
    return ibdPhysicalCargoPose(game,slot!,progress,incoming);
  };
  function query(outer:Rapier.Cuboid,a:Vec3,b:Vec3,yaw:number,pitch:number,player:IbdSafetyPlayer) {
    [from.x,from.y,from.z]=a;[to.x,to.y,to.z]=b;
    velocity.x = to.x - from.x; velocity.y = to.y - from.y; velocity.z = to.z - from.z;
    const sy=Math.sin(yaw/2),cy=Math.cos(yaw/2),sx=Math.sin(pitch/2),cx=Math.cos(pitch/2);
    rotation.x=cy*sx;rotation.y=sy*cx;rotation.z=-sy*sx;rotation.w=cy*cx;
    return !!outer.contactShape(from,rotation,player.shape,playerAt,player.rotation,IBD_SAFETY_GAP)
      || !!outer.castShape(from,rotation,velocity,player.shape,playerAt,player.rotation,playerVelocity,IBD_SAFETY_GAP,1,true);
  }
  function lidCenter(p:ReturnType<typeof pose>):Vec3 {
    const [hx,hy,hz]=IBD_CRATE_LID_PIVOT,[x,y,z]=crate!.lid.center;
    const c=Math.cos(p.lid),s=Math.sin(p.lid),localZ=hz+y*s+z*c;
    return [p.at[0]+(hx+x)*Math.cos(p.yaw)+localZ*Math.sin(p.yaw),p.at[1]+hy+y*c-z*s,
      p.at[2]-(hx+x)*Math.sin(p.yaw)+localZ*Math.cos(p.yaw)];
  }
  function segmentBlocked(a: number, b: number, player: IbdSafetyPlayer, predictSeconds: number, incoming: boolean) {
    const p=pose(a,incoming),q=pose(b,incoming),offset=gate?0:crate?.shell.center[1]??(2+IBD_COIL_SUPPORT_Y)/2;
    playerAt.x = player.position.x - IBD_YARD.center[0]; playerAt.y = player.position.y - IBD_YARD.center[1]; playerAt.z = player.position.z - IBD_YARD.center[2];
    playerVelocity.x = player.velocity.x * predictSeconds; playerVelocity.y = player.velocity.y * predictSeconds; playerVelocity.z = player.velocity.z * predictSeconds;
    const angularPadding=radius*Math.abs(q.yaw-p.yaw);
    shape.halfExtents.x=half[0]+angularPadding;shape.halfExtents.z=half[2]+angularPadding;
    if(action?.kind!=='open'&&query(shape,[p.at[0],p.at[1]+offset,p.at[2]],[q.at[0],q.at[1]+offset,q.at[2]],p.yaw,0,player))return true;
    if(!lidShape||!crate)return false;
    // A lid's orientation changes independently of the cargo. Break its arc
    // into short casts so the conservative angular margin never consumes the operator's aisle.
    const steps=Math.max(1,Math.ceil(Math.abs(q.lid-p.lid)/.09)),[hx,hy,hz]=crate.lid.half;
    let first=p;
    for(let i=1;i<=steps;i++){
      const next=pose(a+(b-a)*i/steps,incoming);
      const margin=(Math.abs(next.lid-first.lid)+Math.abs(next.yaw-first.yaw))*Math.hypot(hx,hy,hz);
      lidShape.halfExtents.x=hx+margin;lidShape.halfExtents.y=hy+margin;lidShape.halfExtents.z=hz+margin;
      if(query(lidShape,lidCenter(first),lidCenter(next),first.yaw,first.lid,player))return true;
      first=next;
    }
    return false;
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
