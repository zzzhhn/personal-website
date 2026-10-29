import { create } from 'zustand';
import { createExchangeRound, reduceExchangeRound, type ExchangeRound, type ExchangeRoundReceipt } from './alpha-exchange-round.ts';
import { beginExchangeBodyAction, cancelExchangeBodyAction, exchangeActor, exchangeBody,
  type ExchangeAnchor, type ExchangeActionKind } from './alpha-exchange-motion.ts';
import { ringExchange, releaseExchange, useAlphaExchange } from './alpha-exchange-state.ts';
import { EXCHANGE_PLAY_STATIONS, EXCHANGE_ARCHIVE_DRAWERS } from './alpha-exchange-play-layout.ts';
import { exchangeWorld } from './alpha-exchange-layout.ts';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import { exchangeArchiveCatalog, type ExchangeDay, type ExchangeArchiveTicket } from './alpha-exchange-data.ts';
import type { Vec3 } from './types.ts';
import { useWorldStore } from './store.ts';

export type ExchangePlayStationId = keyof typeof EXCHANGE_PLAY_STATIONS;
export type ExchangePlayNotice = 'archive' | 'loading' | 'history-ready' | 'error' | 'contact' | 'cancelled';
export interface ExchangePlayState {
  round: ExchangeRound | null; ticketReturned: boolean; loading: boolean; notice: ExchangePlayNotice;
  error: string | null; contacts: number; lastContact: ExchangeActionKind | null;
  reviewIndex: number | null;
  catalog: ExchangeArchiveTicket[]; ticketId: string | null;
}
interface HistoryState { phase: string; history: ExchangeDay[]; error: string | null }
interface PlayDependencies {
  history: () => HistoryState; load: () => Promise<void>; release: () => void;
  begin: typeof beginExchangeBodyAction; cancel: () => void;
  busy?: () => boolean;
  reachable: (anchor: ExchangeAnchor) => boolean;
  carried: () => 'ticket' | 'receipt' | null; clearCarry: () => void;
  anchor: (station: ExchangePlayStationId, units?: number, archiveIndex?: number) => ExchangeAnchor;
}

/** The scene owns requests; only the motion contact callback commits a round transition. */
export function createExchangePlayController(deps: PlayDependencies) {
  const store = create<ExchangePlayState>(() => ({ round: null, ticketReturned: false, loading: false,
    notice: 'archive', error: null, contacts: 0, lastContact: null, reviewIndex: null, catalog: [], ticketId: null }));
  let generation = 0;
  let catalogSource: ExchangeDay[] | null = null, ticketIdentity: string | null = null;
  const receipts = new Map<string, ExchangeRoundReceipt>();
  function refreshCatalog() {
    const source = deps.history();
    if (source.phase !== 'open') return [];
    if (source.history !== catalogSource) {
      const catalog = exchangeArchiveCatalog(source.history);
      catalogSource = source.history;
      store.setState({ catalog });
    }
    return store.getState().catalog;
  }
  const allowed = (station: ExchangePlayStationId) => {
    const state = store.getState(), round = state.round;
    if (state.loading || deps.busy?.()) return false;
    if (station === 'archive') return !round || round.phase === 'complete' || round.phase === 'ticket' && state.ticketReturned;
    if (!round) return false;
    if (station === 'review') return round.choices.length > 0;
    if (station === 'desk') return round.phase === 'selecting' || round.phase === 'ticket' && !state.ticketReturned && deps.carried() === 'ticket';
    return station === 'bell' ? round.phase === 'sealed' : round.phase === 'clearing';
  };
  function canRequest(station: ExchangePlayStationId) {
    return allowed(station) && deps.reachable(deps.anchor(station));
  }
  function contact(kind: ExchangeActionKind, station: ExchangePlayStationId, units?: number,
    selection?: ExchangeArchiveTicket, archiveIndex?: number) {
    const before = store.getState(), round = before.round, phase = round?.phase, requestGeneration = generation;
    const anchor = deps.anchor(station, units, archiveIndex), sourceAtRequest = catalogSource;
    if (!deps.reachable(anchor)) return false;
    return deps.begin(kind, anchor, () => {
      const live = store.getState();
      if (generation !== requestGeneration || live.round !== round || live.round?.phase !== phase
        || live.contacts !== before.contacts || live.ticketReturned !== before.ticketReturned || !deps.reachable(anchor)) return false;
      if (kind === 'review') {
        if (!round?.choices.length || live.reviewIndex !== before.reviewIndex) return false;
        const index = (live.reviewIndex ?? -1) + 1;
        store.setState({ reviewIndex: index < round.choices.length ? index : null,
          contacts: live.contacts + 1, lastContact: kind, notice: 'contact' });
        return true;
      }
      let next: ExchangeRound;
      if (kind === 'pickup') {
        if (!selection || deps.history().phase !== 'open' || deps.history().history !== sourceAtRequest) return false;
        next = round?.phase === 'ticket' && ticketIdentity === selection.identity ? round
          : createExchangeRound(selection.history, receipts.get(selection.identity) ?? null);
        ticketIdentity = selection.identity;
      } else {
        if (!round) return false;
        if (kind === 'insert' && deps.carried() !== 'ticket') return false;
        next = reduceExchangeRound(round, kind === 'adjust' ? { type: 'target', units: units! } : { type: kind });
        if (next === round) return false;
      }
      if (kind === 'collect' && next.receipt && ticketIdentity) {
        receipts.delete(ticketIdentity); receipts.set(ticketIdentity, next.receipt);
        if (receipts.size > 5) receipts.delete(receipts.keys().next().value!);
      }
      store.setState({ round: next, ticketReturned: false, notice: 'contact', error: null, reviewIndex: null,
        contacts: live.contacts + 1, lastContact: kind, ticketId: selection?.id ?? live.ticketId });
      return true;
    }, () => {
      if (generation !== requestGeneration) return;
      cancel('interrupted');
    });
  }
  async function archive() {
    if (!canRequest('archive')) return false;
    const before = store.getState();
    if (deps.history().phase === 'open') {
      const catalog = refreshCatalog();
      return contact('pickup', 'archive', undefined, catalog[0]);
    }
    const requestGeneration = ++generation, round = before.round;
    store.setState({ loading: true, notice: 'loading', error: null });
    try {
      await deps.load();
      if (requestGeneration !== generation || store.getState().round !== round) return false;
      const source = deps.history();
      if (source.phase !== 'open') throw new Error(source.error ?? 'Historical SPY data unavailable.');
      refreshCatalog();
      store.setState({ loading: false, notice: 'history-ready', error: null });
    } catch (error) {
      if (requestGeneration !== generation || store.getState().round !== round) return false;
      store.setState({ loading: false, notice: 'error', error: error instanceof Error ? error.message : 'Historical SPY data unavailable.' });
    }
    // Loading never queues a delayed pickup. A new local request is required.
    return false;
  }
  function canRequestTicket(id: string) {
    const index = store.getState().catalog.findIndex(ticket => ticket.id === id);
    return index > 0 && allowed('archive') && deps.history().phase === 'open'
      && deps.reachable(deps.anchor('archive', undefined, index - 1));
  }
  function requestTicket(id: string) {
    if (!allowed('archive') || deps.history().phase !== 'open') return false;
    const catalog = refreshCatalog(), index = catalog.findIndex(ticket => ticket.id === id);
    if (index < 1 || !canRequestTicket(id)) return false;
    return contact('pickup', 'archive', undefined, catalog[index], index - 1);
  }
  function request(station: ExchangePlayStationId): boolean | Promise<boolean> {
    if (station === 'archive') return archive();
    if (!canRequest(station)) return false;
    return contact(station === 'desk' ? store.getState().round?.phase === 'ticket' ? 'insert' : 'seal'
      : station === 'bell' ? 'ring' : station === 'review' ? 'review' : 'collect', station);
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
  return { store, request, requestTicket, canRequestTicket, adjust, canRequest, cancel, release };
}

export function exchangePlayAnchor(station: ExchangePlayStationId, units?: number, archiveIndex?: number): ExchangeAnchor {
  const source = station === 'archive' && archiveIndex !== undefined
    ? EXCHANGE_ARCHIVE_DRAWERS[archiveIndex] : EXCHANGE_PLAY_STATIONS[station];
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
export const requestExchangeArchiveTicket = play.requestTicket;
export const canRequestExchangeArchiveTicket = play.canRequestTicket;
export const adjustExchangePlay = play.adjust;
export const canRequestExchangePlay = play.canRequest;
export const cancelExchangePlay = play.cancel;
export const releaseExchangePlay = play.release;
