import { create } from 'zustand';
import { createExchangeRound, reduceExchangeRound, type ExchangeRound } from './alpha-exchange-round.ts';
import { beginExchangeBodyAction, cancelExchangeBodyAction, exchangeActor, exchangeBody,
  type ExchangeAnchor, type ExchangeActionKind } from './alpha-exchange-motion.ts';
import { ringExchange, releaseExchange, useAlphaExchange } from './alpha-exchange-state.ts';
import { EXCHANGE_PLAY_STATIONS } from './alpha-exchange-play-layout.ts';
import { exchangeWorld } from './alpha-exchange-layout.ts';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import type { ExchangeDay } from './alpha-exchange-data.ts';
import type { Vec3 } from './types.ts';
import { useWorldStore } from './store.ts';

export type ExchangePlayStationId = keyof typeof EXCHANGE_PLAY_STATIONS;
export type ExchangePlayNotice = 'archive' | 'loading' | 'history-ready' | 'error' | 'contact' | 'cancelled';
export interface ExchangePlayState {
  round: ExchangeRound | null; ticketReturned: boolean; loading: boolean; notice: ExchangePlayNotice;
  error: string | null; contacts: number; lastContact: ExchangeActionKind | null;
}
interface HistoryState { phase: string; history: ExchangeDay[]; error: string | null }
interface PlayDependencies {
  history: () => HistoryState; load: () => Promise<void>; release: () => void;
  begin: typeof beginExchangeBodyAction; cancel: () => void;
  busy?: () => boolean;
  reachable: (anchor: ExchangeAnchor) => boolean;
  carried: () => 'ticket' | 'receipt' | null; clearCarry: () => void;
  anchor: (station: ExchangePlayStationId, units?: number) => ExchangeAnchor;
}

/** The scene owns requests; only the motion contact callback commits a round transition. */
export function createExchangePlayController(deps: PlayDependencies) {
  const store = create<ExchangePlayState>(() => ({ round: null, ticketReturned: false, loading: false,
    notice: 'archive', error: null, contacts: 0, lastContact: null }));
  let generation = 0;
  const allowed = (station: ExchangePlayStationId) => {
    const state = store.getState(), round = state.round;
    if (state.loading || deps.busy?.()) return false;
    if (station === 'archive') return !round || round.phase === 'complete' || round.phase === 'ticket' && state.ticketReturned;
    if (!round) return false;
    if (station === 'desk') return round.phase === 'selecting' || round.phase === 'ticket' && !state.ticketReturned && deps.carried() === 'ticket';
    return station === 'bell' ? round.phase === 'sealed' : round.phase === 'clearing';
  };
  function canRequest(station: ExchangePlayStationId) {
    return allowed(station) && deps.reachable(deps.anchor(station));
  }
  function contact(kind: ExchangeActionKind, station: ExchangePlayStationId, units?: number) {
    const before = store.getState(), round = before.round, phase = round?.phase, requestGeneration = generation;
    const anchor = deps.anchor(station, units);
    if (!deps.reachable(anchor)) return false;
    return deps.begin(kind, anchor, () => {
      const live = store.getState();
      if (generation !== requestGeneration || live.round !== round || live.round?.phase !== phase
        || live.ticketReturned !== before.ticketReturned || !deps.reachable(anchor)) return false;
      let next: ExchangeRound;
      if (kind === 'pickup') {
        if (round?.phase === 'complete') next = reduceExchangeRound(round, { type: 'replay' });
        else if (round?.phase === 'ticket') next = round;
        else {
          const history = deps.history();
          if (history.phase !== 'open') return false;
          next = createExchangeRound(history.history);
        }
      } else {
        if (!round) return false;
        if (kind === 'insert' && deps.carried() !== 'ticket') return false;
        next = reduceExchangeRound(round, kind === 'adjust' ? { type: 'target', units: units! } : { type: kind });
        if (next === round) return false;
      }
      store.setState({ round: next, ticketReturned: false, notice: 'contact', error: null,
        contacts: live.contacts + 1, lastContact: kind });
      return true;
    }, () => {
      if (generation !== requestGeneration) return;
      cancel('interrupted');
    });
  }
  async function archive() {
    if (!canRequest('archive')) return false;
    const before = store.getState();
    if (before.round || deps.history().phase === 'open') return contact('pickup', 'archive');
    const requestGeneration = ++generation, round = before.round;
    store.setState({ loading: true, notice: 'loading', error: null });
    try {
      await deps.load();
      if (requestGeneration !== generation || store.getState().round !== round) return false;
      const source = deps.history();
      if (source.phase !== 'open') throw new Error(source.error ?? 'Historical SPY data unavailable.');
      store.setState({ loading: false, notice: 'history-ready', error: null });
    } catch (error) {
      if (requestGeneration !== generation || store.getState().round !== round) return false;
      store.setState({ loading: false, notice: 'error', error: error instanceof Error ? error.message : 'Historical SPY data unavailable.' });
    }
    // Loading never queues a delayed pickup. A new local request is required.
    return false;
  }
  function request(station: ExchangePlayStationId): boolean | Promise<boolean> {
    if (station === 'archive') return archive();
    if (!canRequest(station)) return false;
    return contact(station === 'desk' ? store.getState().round?.phase === 'ticket' ? 'insert' : 'seal'
      : station === 'bell' ? 'ring' : 'collect', station);
  }
  function adjust(units: number) {
    const round = store.getState().round;
    if (round?.phase !== 'selecting' || !Number.isInteger(units) || units < 0 || units > 50 || units % 10 !== 0
      || round.targetUnits === units || !canRequest('desk')) return false;
    return contact('adjust', 'desk', units);
  }
  function cancel(_reason?: string) {
    generation++;
    deps.cancel();
    const state = store.getState(), returned = state.round?.phase === 'ticket';
    deps.clearCarry();
    store.setState({ loading: false, ticketReturned: returned, notice: 'cancelled' });
  }
  function release() { cancel('unmount'); deps.release(); }
  return { store, request, adjust, canRequest, cancel, release };
}

export function exchangePlayAnchor(station: ExchangePlayStationId, units?: number): ExchangeAnchor {
  const source = EXCHANGE_PLAY_STATIONS[station];
  let target: Vec3 = [...source.contact];
  if (station === 'desk' && units !== undefined) {
    const { slideStart: a, slideEnd: b } = EXCHANGE_PLAY_STATIONS.desk;
    target = a.map((value, i) => value + (b[i] - value) * units / 50) as Vec3;
  }
  return { stand: exchangeWorld([...source.stand]), target: exchangeWorld(target), yaw: source.yaw };
}
const play = createExchangePlayController({ history: useAlphaExchange.getState, load: ringExchange, release: releaseExchange,
  begin: beginExchangeBodyAction, cancel: cancelExchangeBodyAction, anchor: exchangePlayAnchor,
  busy: () => exchangeBody.action !== null,
  carried: () => exchangeBody.carried, clearCarry: () => { exchangeBody.carried = null; },
  reachable: anchor => {
    const world = useWorldStore.getState();
    return !world.paused && !world.card && !world.shot && !world.poolInspect && !world.activeVehicle && !world.seat
      && !world.clubMode && !(typeof document !== 'undefined' && document.hidden) && exchangeActor.available && exchangeActor.grounded
      && Math.hypot(exchangeActor.position[0] - anchor.stand[0], exchangeActor.position[2] - anchor.stand[2]) <= 1.1
      && Math.abs(exchangeActor.position[1] - PLAYER_CENTER_HEIGHT - anchor.stand[1]) <= .25;
  },
});
export const useExchangePlay = play.store;
export const requestExchangePlay = play.request;
export const adjustExchangePlay = play.adjust;
export const canRequestExchangePlay = play.canRequest;
export const cancelExchangePlay = play.cancel;
export const releaseExchangePlay = play.release;
