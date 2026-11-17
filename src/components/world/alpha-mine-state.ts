import { create } from 'zustand';
import { ALPHA_FACTORS, type AlphaFactorId } from './alpha-mine-data.ts';
import { acceptAction, advanceAcceptedAction, cancelAcceptedAction, type AcceptedAction } from './accepted-action';

export type MinePoint = [number, number, number];
export type MineActionKind = 'equip' | 'scan' | 'strike' | 'pickup' | 'deposit';
export interface MineAction {
  kind: MineActionKind; elapsed: number; duration: number; target: MinePoint;
  origin: MinePoint; factorId?: AlphaFactorId; contact: boolean; bay?: 0 | 1; commitClock: AcceptedAction;
}
export interface MineVein { revealed: boolean; hits: number; collected: boolean }
interface MineState {
  equipped: boolean; carried: AlphaFactorId | null; action: MineAction | null;
  veins: Record<AlphaFactorId, MineVein>;
  dropped: { factorId: AlphaFactorId; position: MinePoint } | null;
  bays: [AlphaFactorId | null, AlphaFactorId | null];
  recovered: AlphaFactorId[];
  selectedBay: 0 | 1; cycle: number;
  notice: { zh: string; en: string; seq: number } | null;
  effect: { kind: 'strike' | 'ore' | 'splash'; at: MinePoint; factorId: AlphaFactorId; seq: number } | null;
}
const freshVeins = () => Object.fromEntries(ALPHA_FACTORS.map(f => [f.id, { revealed: false, hits: 0, collected: false }])) as MineState['veins'];
const initial = (): MineState => ({ equipped: false, carried: null, action: null, veins: freshVeins(), dropped: null, bays: [null, null], recovered: [], selectedBay: 0, cycle: 0, notice: null, effect: null });
export const useAlphaMineStore = create<MineState>(initial);
/** Physics/pose clocks are mutable and never published to React on every frame. */
export const mineActor = { position: [0, 0, 0] as MinePoint, yaw: 0, grounded: false, moving: false, available: false, restTarget: null as MinePoint | null };
export const mineVisualSockets = { leftHand: [0, 0, 0] as MinePoint, rightHand: [0, 0, 0] as MinePoint, headContact: [0, 0, 0] as MinePoint, scanOrigin: [0, 0, 0] as MinePoint, oreRelease: [0, 0, 0] as MinePoint, valid: false, assetsReady: false, contactError: Infinity, rightReachError: 0, leftReachError: 0, sampledActionKind: null as MineActionKind | null, sampledElapsed: 0 };
export const mineContactEvidence = { kind: '' as string, factor: '' as string, accepted: false, error: 0, leftError: 0, sampledElapsed: 0 };
let sequence = 0;
export const mineNotice = (zh: string, en: string) => useAlphaMineStore.setState({ notice: { zh, en, seq: ++sequence } });
export const mineBusy = () => !!useAlphaMineStore.getState().action && useAlphaMineStore.getState().action?.kind !== 'scan';
const DURATIONS: Record<MineActionKind, number> = { equip: .8, scan: 1.1, strike: 1.05, pickup: .85, deposit: 1.4 };
const CONTACT: Record<MineActionKind, number> = { equip: .48, scan: 1.05, strike: .57, pickup: .48, deposit: .48 };

/** Player reach is checked again at contact, not just when E was pressed. */
export function mineCanReach(target: MinePoint, radius = 2.2, facing = false) {
  const [x, y, z] = mineActor.position;
  const dx = target[0] - x, dz = target[2] - z;
  if (![...target, x, y, z, radius, mineActor.yaw].every(Number.isFinite) || radius < 0
    || !mineActor.available || !mineActor.grounded || Math.abs(target[1] - y) > 1.65 || Math.hypot(dx, dz) > radius) return false;
  if (!facing || Math.hypot(dx, dz) < .1) return true;
  const targetYaw = Math.atan2(-dz, dx);
  return Math.abs(Math.atan2(Math.sin(targetYaw - mineActor.yaw), Math.cos(targetYaw - mineActor.yaw))) < .48;
}
function actionStateAllows(s: MineState, kind: MineActionKind, factorId?: AlphaFactorId) {
  if (factorId && !s.veins[factorId]) return false;
  if (kind === 'equip' && (s.equipped || s.carried)) return false;
  if (kind !== 'equip' && !s.equipped) return false;
  if (kind === 'scan' && (!factorId || s.carried || s.veins[factorId].revealed)) return false;
  if (kind === 'strike' && (!factorId || s.carried || !s.veins[factorId].revealed || s.veins[factorId].hits >= 3)) return false;
  if (kind === 'pickup' && (!factorId || s.carried || (s.dropped?.factorId !== factorId && !s.recovered.includes(factorId) && (s.veins[factorId].hits < 3 || s.veins[factorId].collected)))) return false;
  if (kind === 'deposit' && (!factorId || s.carried !== factorId)) return false;
  return true;
}
/** Semantic eligibility is shared by discovery and execution; pickup stances are resolved by
 * the registry before execution, so discovery does not impose the final hand distance. */
export function mineActionAvailable(kind: MineActionKind, factorId?: AlphaFactorId) {
  const s = useAlphaMineStore.getState();
  return mineActor.available && mineActor.grounded && !mineActor.moving && !s.action && actionStateAllows(s, kind, factorId);
}
export function canBeginMineAction(kind: MineActionKind, target: MinePoint, factorId?: AlphaFactorId) {
  return mineActionAvailable(kind, factorId)
    && mineCanReach(target, kind === 'deposit' ? 4.2 : kind === 'strike' ? 1.3 : 2.4);
}
function carriedOrigin(): MinePoint {
  const [x, y, z] = mineActor.position, yaw = mineActor.yaw;
  return [x + Math.cos(yaw) * .35, y + .25, z - Math.sin(yaw) * .35];
}
export function beginMineAction(kind: MineActionKind, target: MinePoint, factorId?: AlphaFactorId, bay?: 0 | 1) {
  if (!canBeginMineAction(kind, target, factorId)) return false;
  const origin = carriedOrigin();
  useAlphaMineStore.setState({ notice: null, action: { kind, elapsed: 0, duration: DURATIONS[kind], target: [...target], origin, factorId, contact: false, bay, commitClock: acceptAction(CONTACT[kind]) } });
  return true;
}

export function cancelMineAction() {
  const s = useAlphaMineStore.getState();
  if (!s.action) return;
  // A released stone remains recoverable if navigation interrupts its flight.
  const a = s.action;
  cancelAcceptedAction(a.commitClock);
  useAlphaMineStore.setState({ action: null, ...(a.kind === 'deposit' && a.contact && a.factorId ? { carried: a.factorId } : {}) });
}
export function putDownMineOre() {
  const s = useAlphaMineStore.getState();
  if (!s.carried || s.action || s.dropped) return false;
  const target = mineActor.restTarget;
  if (!target || !mineCanReach(target, .8)) { mineNotice('靠近池边暂存台或矿脉接石台，再按 F 放下。', 'Approach a pool shelf or seam ledge, then press F to set it down.'); return false; }
  return beginMineAction('deposit', target, s.carried);
}
export function canResetMineVeins() {
  const s = useAlphaMineStore.getState();
  return !s.carried && !s.dropped && !s.action;
}
export function resetMineVeins() {
  const s = useAlphaMineStore.getState();
  if (!canResetMineVeins()) return false;
  useAlphaMineStore.setState({ veins: freshVeins(), recovered: [], cycle: s.cycle + 1 });
  mineNotice('新一轮勘探已准备好，池里的结果继续保留。', 'Fresh seams are ready. Your pool results remain.');
  return true;
}

/** Called once per physics step. Elapsed is a transient pose clock; only transitions publish. */
export function advanceMineAction(dt: number) {
  const s = useAlphaMineStore.getState(), a = s.action;
  if (!a || !Number.isFinite(dt) || dt <= 0) return;
  if (!mineActor.available || (!a.contact && mineActor.moving)) { cancelMineAction(); return; }
  const step = Math.min(dt, .05);
  a.elapsed = Math.min(a.duration, a.elapsed + step);
  if (!a.contact && advanceAcceptedAction(a.commitClock, step,
    mineActor.grounded && actionStateAllows(s, a.kind, a.factorId))) {
    const reach = mineCanReach(a.target, a.kind === 'deposit' ? 4.2 : a.kind === 'strike' ? 1.35 : 2.4, a.kind === 'strike');
    if (!reach) { cancelMineAction(); mineNotice('靠近同一层的岩面，再对准试试。', 'Move closer on this level and face the seam.'); return; }
    // Render contact is diagnostic only. A missing/stale IK sample cannot veto an accepted action.
    const sockets = mineVisualSockets;
    Object.assign(mineContactEvidence, { kind: a.kind, factor: a.factorId ?? '', accepted: true,
      error: a.kind === 'strike' ? sockets.contactError : sockets.rightReachError,
      leftError: sockets.leftReachError, sampledElapsed: sockets.sampledElapsed });
    a.contact = true;
    const id = a.factorId;
    if (a.kind === 'equip') useAlphaMineStore.setState({ equipped: true });
    if (a.kind === 'scan' && id) useAlphaMineStore.setState({ veins: { ...s.veins, [id]: { ...s.veins[id], revealed: true } } });
    if (a.kind === 'strike' && id) {
      const hits = Math.min(3, s.veins[id].hits + 1);
      useAlphaMineStore.setState({ veins: { ...s.veins, [id]: { ...s.veins[id], hits } }, effect: { kind: hits === 3 ? 'ore' : 'strike', at: [...a.target], factorId: id, seq: ++sequence } });
    }
    if (a.kind === 'pickup' && id) {
      useAlphaMineStore.setState({ carried: id, dropped: s.dropped?.factorId === id ? null : s.dropped, recovered: s.recovered.filter(v=>v!==id), veins: { ...s.veins, [id]: { ...s.veins[id], collected: true } } });
    }
    if (a.kind === 'deposit' && id) {
      a.origin = sockets.valid && sockets.sampledActionKind === a.kind
        && Math.abs(sockets.sampledElapsed - a.elapsed) <= .12 && sockets.oreRelease.every(Number.isFinite)
        ? [...sockets.oreRelease] : carriedOrigin();
      useAlphaMineStore.setState({ carried: null });
    }
  }
  if (!a.contact && a.commitClock.status === 'cancelled') { cancelMineAction(); return; }
  if (a.elapsed >= a.duration) {
    if (a.kind === 'deposit' && a.factorId) {
      if (a.bay === undefined) {
        useAlphaMineStore.setState({action:null,dropped:{factorId:a.factorId,position:[...a.target]}});
        mineNotice('矿石放在暂存台上，可以重新拾起。','The ore is on the shelf. You can pick it up again.');
        return;
      }
      const current = useAlphaMineStore.getState(), bays = [...current.bays] as MineState['bays'];
      bays[a.bay ?? 0] = a.factorId;
      useAlphaMineStore.setState({ action: null, bays, recovered: [...new Set([...current.recovered, a.factorId])], selectedBay: a.bay ?? 0, effect: { kind: 'splash', at: [...a.target], factorId: a.factorId, seq: ++sequence } });
    } else useAlphaMineStore.setState({ action: null });
  }
}

/** Used only by focused tests; normal play resets seams at the physical tool rack. */
export function resetMineSession() { useAlphaMineStore.setState(initial(), true); sequence = 0; }
