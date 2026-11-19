import type { ActorRide } from '../rides/actor-ride';
import type { ActorSites } from '../actor-sites';
import { attractionRide, attractionActorFrame, attractionPhase, captureAttractionStart,
  completeAttractionRide, endAttractionRide, requestAttractionExit } from './attraction-ride';
import { COASTER_BOARDING } from './coaster-transition';

/** Keeps legacy coaster transitions and transport drivers behind the same actor-facing contract. */
export function createAttractionActorRide(zone: ActorSites['rideZone']): ActorRide {
  return {
    get active() { return attractionRide.active; },
    get revision() { return attractionRide.revision; },
    get lifecycle() { return `${attractionRide.revision}:${attractionPhase()}`; },
    get pose() { return attractionRide.pose; },
    get actor() { return attractionActorFrame(); },
    get seatOnly() { return !attractionRide.transition && !attractionRide.driver; },
    get complete() { return attractionPhase() === 'complete'; },
    get exit() { return attractionRide.exit; },
    get boardingPath() {
      const { driver, transition } = attractionRide;
      if (driver) return driver.boardingPath;
      if (transition?.captured && transition.phase === 'approach') return [transition.from, COASTER_BOARDING.approach];
    },
    get egressPath() {
      const driver = attractionRide.driver;
      return driver?.phase === 'stand' ? driver.egressPath : undefined;
    },
    setMovementGuard(guard) { attractionRide.driver?.setMovementGuard?.(guard); },
    capture: captureAttractionStart,
    setExitBlocked(blocked) { attractionRide.driver?.setExitBlocked?.(blocked); },
    requestExit: requestAttractionExit,
    viewBlocked() { if (attractionRide.driver) requestAttractionExit(); },
    finish: completeAttractionRide,
    cancel: endAttractionRide,
    zone: position => zone(position, !!attractionRide.driver),
  };
}
