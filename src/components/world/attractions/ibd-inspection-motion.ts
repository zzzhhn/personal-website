import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import type { Vec3 } from '../types.ts';

export type IbdInspectionActionKind = 'pickup' | 'measure' | 'return' | 'empty' | 'coil-check' | 'crane-control';
/** Ownership and stock identity belong to the yard controller. This is only the held silhouette. */
export type IbdInspectionCarried = { spec: 'M6' | 'M8' } | null;
export interface IbdInspectionAnchor { stand: Vec3; yaw: number; leftTarget: Vec3; rightTarget: Vec3; focus?: Vec3 }
export interface IbdInspectionAction {
  id: number; kind: IbdInspectionActionKind; phase: 'approach' | 'perform'; elapsed: number;
  duration: number; contactAt: number; reachStartAt: number; recoverDuration: number;
  anchor: IbdInspectionAnchor; committed: boolean; contactWait: number;
  actorMode: string; released?: boolean;
}
export interface IbdInspectionVisualSockets {
  valid: boolean; reachable: boolean; sampledId: number | null; sampledElapsed: number;
  leftHand: Vec3; rightHand: Vec3; leftContactError: number; rightContactError: number; contactError: number;
}
export const ibdInspectionActor = { position: [0,0,0] as Vec3, yaw: 0, grounded: false, available: false, mode: 'guide' };
export const ibdInspectionBody = { action: null as IbdInspectionAction | null, carried: null as IbdInspectionCarried };
export const ibdInspectionVisualSockets: IbdInspectionVisualSockets = {
  valid: false, reachable: false, sampledId: null, sampledElapsed: 0, leftHand: [0,0,0], rightHand: [0,0,0],
  leftContactError: Infinity, rightContactError: Infinity, contactError: Infinity,
};
export const IBD_INSPECTION_CONTACT_TOLERANCE = .025;
export const IBD_INSPECTION_STAND_TOLERANCE = .02;
export const IBD_INSPECTION_YAW_TOLERANCE = .06;
/** Tray presents during 0..1.5. Return/empty tray retracts only after the hand has cleared. */
export const IBD_INSPECTION_TIMING: Readonly<Record<IbdInspectionActionKind,
  Readonly<{ duration:number; contactAt:number; reachStartAt:number; recoverDuration:number }>>> = {
  pickup: {duration:2.6,contactAt:2.05,reachStartAt:1.5,recoverDuration:.55},
  measure: {duration:1.35,contactAt:.72,reachStartAt:0,recoverDuration:.63},
  return: {duration:2.6,contactAt:.55,reachStartAt:0,recoverDuration:.35},
  empty: {duration:4.1,contactAt:2.05,reachStartAt:1.5,recoverDuration:.4},
  'coil-check': {duration:3.1,contactAt:2.5,reachStartAt:0,recoverDuration:.6},
  'crane-control': {duration:1.1,contactAt:.6,reachStartAt:0,recoverDuration:.5},
};
let sequence = 0;
let callbacks: { id: number; contact: () => boolean | void; cancel?: () => void } | null = null;
const pointValid = (point: Vec3) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
const angleDelta = (a: number,b: number) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const standDistance = (a: IbdInspectionAnchor) => Math.hypot(ibdInspectionActor.position[0]-a.stand[0],ibdInspectionActor.position[2]-a.stand[2]);
const standHeight = (a: IbdInspectionAnchor) => Math.abs(ibdInspectionActor.position[1]-PLAYER_CENTER_HEIGHT-a.stand[1]);
function clearSample() {
  Object.assign(ibdInspectionVisualSockets, { valid: false, reachable: false, sampledId: null, sampledElapsed: 0,
    leftContactError: Infinity, rightContactError: Infinity, contactError: Infinity });
}
export const ibdInspectionBodyBusy = () => ibdInspectionBody.action !== null;

/** Reserve a physical reach. The caller walks/turns the actor and owns slot, piece and jaw-gap validation. */
export function beginIbdInspectionAction(kind: IbdInspectionActionKind, anchor: IbdInspectionAnchor,
  onContact: () => boolean | void, onCancel?: () => void): boolean {
  if (ibdInspectionBodyBusy() || !ibdInspectionActor.available || !ibdInspectionActor.grounded
    || !pointValid(ibdInspectionActor.position) || !Number.isFinite(ibdInspectionActor.yaw)
    || typeof ibdInspectionActor.mode !== 'string' || !anchor || !pointValid(anchor.stand)
    || !pointValid(anchor.leftTarget) || !pointValid(anchor.rightTarget) || !Number.isFinite(anchor.yaw)
    || (kind==='coil-check' && (!anchor.focus || !pointValid(anchor.focus)))
    || !Object.hasOwn(IBD_INSPECTION_TIMING,kind) || typeof onContact !== 'function' || standDistance(anchor)>1.1 || standHeight(anchor)>.25
    || ((kind==='measure'||kind==='return') && !ibdInspectionBody.carried)
    || ((kind==='pickup'||kind==='empty'||kind==='coil-check'||kind==='crane-control') && !!ibdInspectionBody.carried)) return false;
  const timing=IBD_INSPECTION_TIMING[kind], id=++sequence;
  ibdInspectionBody.action={ id,kind,phase:'approach',elapsed:0,...timing,committed:false,contactWait:0,
    actorMode:ibdInspectionActor.mode,
    anchor:{stand:[...anchor.stand],yaw:anchor.yaw,leftTarget:[...anchor.leftTarget],rightTarget:[...anchor.rightTarget],
      ...(anchor.focus?{focus:[...anchor.focus] as Vec3}:{})} };
  callbacks={id,contact:onContact,cancel:onCancel}; clearSample(); return true;
}
/** Clear first so cancellation cannot deliver an old contact callback. Carried ownership remains with the caller. */
export function cancelIbdInspectionAction(): void {
  const action=ibdInspectionBody.action;
  if (!action) return;
  const cancel=callbacks?.id===action.id?callbacks.cancel:undefined;
  ibdInspectionBody.action=null; callbacks=null; clearSample(); cancel?.();
}
/** Fixed physics clock. A paused frame is inert, including contact waits. */
export function advanceIbdInspectionAction(dt: number, paused=false): void {
  const action=ibdInspectionBody.action;
  if (!action || paused || !Number.isFinite(dt) || dt<=0) return;
  if (!ibdInspectionActor.available || !ibdInspectionActor.grounded || ibdInspectionActor.mode!==action.actorMode
    || !pointValid(ibdInspectionActor.position) || !Number.isFinite(ibdInspectionActor.yaw)
    || standHeight(action.anchor)>.25 || standDistance(action.anchor)>1.1) { cancelIbdInspectionAction(); return; }
  const step=Math.min(dt,.05);
  const aligned=standDistance(action.anchor)<=IBD_INSPECTION_STAND_TOLERANCE
    && Math.abs(angleDelta(ibdInspectionActor.yaw,action.anchor.yaw))<=IBD_INSPECTION_YAW_TOLERANCE;
  if (action.phase==='approach') {
    action.elapsed+=step;
    if (aligned) { action.phase='perform'; action.elapsed=0; clearSample(); }
    else if (action.elapsed>=2) cancelIbdInspectionAction();
    return;
  }
  if (!aligned) { cancelIbdInspectionAction(); return; }
  const sockets=ibdInspectionVisualSockets;
  const currentSample=sockets.valid && sockets.sampledId===action.id
    && Number.isFinite(sockets.sampledElapsed) && Math.abs(sockets.sampledElapsed-action.elapsed)<1e-5;
  if (currentSample && !sockets.reachable) { cancelIbdInspectionAction(); return; }
  if (!action.committed) {
    action.elapsed=Math.min(action.contactAt,action.elapsed+step);
    if (action.elapsed<action.contactAt) return;
    const errorValid=(error:number)=>Number.isFinite(error)&&error>=0&&error<=IBD_INSPECTION_CONTACT_TOLERANCE;
    const sampled=sockets.valid && sockets.reachable && sockets.sampledId===action.id
      && Number.isFinite(sockets.sampledElapsed) && Math.abs(sockets.sampledElapsed-action.contactAt)<1e-5
      && pointValid(sockets.leftHand) && pointValid(sockets.rightHand)
      && errorValid(sockets.leftContactError) && errorValid(sockets.rightContactError)
      // Recompute from the sampled palms as well: a claimed error cannot substitute for contact.
      && errorValid(Math.hypot(...sockets.leftHand.map((v,i)=>v-action.anchor.leftTarget[i])))
      && errorValid(Math.hypot(...sockets.rightHand.map((v,i)=>v-action.anchor.rightTarget[i])));
    if (!sampled) {
      action.contactWait+=step;
      if (action.contactWait>=.45) cancelIbdInspectionAction();
      return;
    }
    action.committed=true;
    const accepted=callbacks?.id===action.id?callbacks.contact():false;
    if (accepted===false && ibdInspectionBody.action===action) cancelIbdInspectionAction();
    return;
  }
  // A crane operator keeps both palms at the controls until the cargo has landed.
  if(action.kind==='crane-control'&&!action.released)return;
  action.elapsed=Math.min(action.duration,action.elapsed+step);
  if (action.elapsed>=action.duration) { ibdInspectionBody.action=null; callbacks=null; clearSample(); }
}
